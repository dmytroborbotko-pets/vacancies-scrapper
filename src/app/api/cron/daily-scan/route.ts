import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runSearch, type RunSearchCvResult } from "@/lib/ingest";
import { computeNextRunAt } from "@/lib/scheduling";

export const maxDuration = 300;

// Route-level time budget across all due jobs in one invocation. Kept below
// maxDuration so a job that's mid-loop when this is hit still has time to
// record a skip entry and return, rather than being killed mid-flight by
// Vercel with zero record. runSearch computes its own ~260s per-call budget
// independently and has no notion of other jobs sharing this invocation.
const CRON_BUDGET_MS = 280_000;

// Fires once/day (Vercel Hobby cron limit — see vercel.json). Evaluates
// every ScheduledSearch that's due, runs it through the exact same
// runSearch() a manual search uses (scoring included), and reschedules it.
// A failing job is caught and reported, not allowed to block the rest.
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    console.error("daily-scan: CRON_SECRET is not configured");
    return new NextResponse("Server misconfigured", { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const now = new Date();
  const deadline = Date.now() + CRON_BUDGET_MS;

  let dueJobs;
  try {
    dueJobs = await prisma.scheduledSearch.findMany({
      where: { paused: false, nextRunAt: { lte: now } },
      orderBy: { nextRunAt: "asc" },
    });
  } catch (error) {
    console.error("daily-scan: failed to load due ScheduledSearch jobs", error);
    return new NextResponse("Failed to load due jobs", { status: 500 });
  }

  const results: Array<{
    scheduledSearchId: string;
    ok: boolean;
    error?: string;
    cvResults?: RunSearchCvResult[];
  }> = [];

  for (let i = 0; i < dueJobs.length; i++) {
    const job = dueJobs[i];

    if (Date.now() >= deadline) {
      // Out of time for this invocation. Record an explicit skip for this
      // job and every job after it (rather than silently dropping them),
      // and leave nextRunAt untouched so each is picked up on the very next
      // cron tick instead of waiting a full extra interval.
      for (let j = i; j < dueJobs.length; j++) {
        results.push({
          scheduledSearchId: dueJobs[j].id,
          ok: false,
          error: "Пропущено — вичерпано ліміт часу для крону",
        });
      }
      break;
    }

    let jobResult: { scheduledSearchId: string; ok: boolean; error?: string; cvResults?: RunSearchCvResult[] };

    try {
      // job.cvProfileId (single-CV case) was already verified to belong to
      // job.userId when the ScheduledSearch was created (see
      // createScheduledSearch). The "Всі" case (null) is scoped to
      // job.userId here, so runSearch — which does not itself check
      // ownership — never sees another user's CVs. If ScheduledSearch rows
      // can ever be created another way, that ownership check must move
      // with them.
      const cvProfileIds = job.cvProfileId
        ? [job.cvProfileId]
        : (
            await prisma.cvProfile.findMany({
              where: { userId: job.userId },
              select: { id: true },
            })
          ).map((p) => p.id);

      if (cvProfileIds.length === 0) {
        // Mirrors api/search/route.ts's "Немає жодного завантаженого CV"
        // check: a resolved-empty CV set (e.g. the user deleted every CV
        // after creating an "Всі" schedule) must not be reported as a
        // silent success.
        jobResult = {
          scheduledSearchId: job.id,
          ok: false,
          error: "Немає жодного завантаженого CV",
        };
      } else {
        const cvResults = await runSearch({
          cvProfileIds,
          scope: job.scope,
          requireReservation: job.requireReservation,
        });

        // runSearch isolates failures per-CV and deliberately never throws for
        // them (see lib/ingest.ts), so a batch that failed for every CV (all
        // time-budget-skipped, or all genuinely erroring) still returns
        // normally here. Treat that case as a job-level failure too — mirrors
        // the same check in api/search/route.ts — instead of reporting
        // { ok: true } for a run that produced nothing.
        const allFailed = cvResults.length > 0 && cvResults.every((r) => r.error);
        if (allFailed) {
          const errorMessage =
            [...new Set(cvResults.map((r) => r.error).filter(Boolean))].join("; ") || "Unknown error";
          console.error(`ScheduledSearch ${job.id}: all CVs failed — ${errorMessage}`);
          jobResult = { scheduledSearchId: job.id, ok: false, error: errorMessage, cvResults };
        } else {
          jobResult = { scheduledSearchId: job.id, ok: true, cvResults };
        }
      }
    } catch (error) {
      console.error(`ScheduledSearch ${job.id}: threw — `, error);
      jobResult = {
        scheduledSearchId: job.id,
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }

    // Reschedule unconditionally — a genuinely broken job must still advance
    // on its own interval rather than being retried on every daily cron tick
    // forever. This is deliberately outside the try/catch above so it can't
    // produce a second, contradictory results entry for this job (see the
    // catch below, which only logs).
    try {
      await prisma.scheduledSearch.update({
        where: { id: job.id },
        data: { lastRunAt: now, nextRunAt: computeNextRunAt(job.interval, now) },
      });
    } catch (error) {
      // A reschedule failure (e.g. a transient DB error) is logged, not
      // thrown: this job's nextRunAt didn't advance, so it'll simply be
      // picked up again on the next cron tick — a safe failure mode
      // (retried, not lost) — and the rest of the batch still gets
      // evaluated instead of the whole run aborting on one bad update.
      console.error(`Failed to reschedule ScheduledSearch ${job.id}`, error);
    }

    results.push(jobResult);
  }

  // Non-2xx is the one free monitoring signal Vercel surfaces for an
  // unattended cron invocation — use it when every job failed.
  const allJobsFailed = results.length > 0 && results.every((r) => !r.ok);
  return NextResponse.json(
    { ranAt: now.toISOString(), jobsEvaluated: dueJobs.length, results },
    { status: allJobsFailed ? 500 : 200 },
  );
}
