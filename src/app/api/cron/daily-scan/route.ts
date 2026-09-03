import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runSearch, type RunSearchCvResult } from "@/lib/ingest";
import { computeNextRunAt } from "@/lib/scheduling";

export const maxDuration = 300;

// Fires once/day (Vercel Hobby cron limit — see vercel.json). Evaluates
// every ScheduledSearch that's due, runs it through the exact same
// runSearch() a manual search uses (scoring included), and reschedules it.
// A failing job is caught and reported, not allowed to block the rest.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const now = new Date();
  const dueJobs = await prisma.scheduledSearch.findMany({
    where: { paused: false, nextRunAt: { lte: now } },
  });

  const results: Array<{
    scheduledSearchId: string;
    ok: boolean;
    error?: string;
    cvResults?: RunSearchCvResult[];
  }> = [];

  for (const job of dueJobs) {
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

      let cvResults: RunSearchCvResult[] = [];
      if (cvProfileIds.length > 0) {
        cvResults = await runSearch({
          cvProfileIds,
          scope: job.scope,
          requireReservation: job.requireReservation,
        });
      }

      // runSearch isolates failures per-CV and deliberately never throws for
      // them (see lib/ingest.ts), so a batch that failed for every CV (all
      // time-budget-skipped, or all genuinely erroring) still returns
      // normally here. Treat that case as a job-level failure too — mirrors
      // the same check in api/search/route.ts — instead of reporting
      // { ok: true } for a run that produced nothing.
      const allFailed = cvResults.length > 0 && cvResults.every((r) => r.error);
      jobResult = allFailed
        ? {
            scheduledSearchId: job.id,
            ok: false,
            error:
              [...new Set(cvResults.map((r) => r.error).filter(Boolean))].join("; ") || "Unknown error",
            cvResults,
          }
        : { scheduledSearchId: job.id, ok: true, cvResults };
    } catch (error) {
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

  return NextResponse.json({ ranAt: now.toISOString(), jobsEvaluated: dueJobs.length, results });
}
