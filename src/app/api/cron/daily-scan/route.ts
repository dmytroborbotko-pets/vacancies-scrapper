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
      if (allFailed) {
        const message =
          [...new Set(cvResults.map((r) => r.error).filter(Boolean))].join("; ") || "Unknown error";
        results.push({ scheduledSearchId: job.id, ok: false, error: message, cvResults });
      } else {
        results.push({ scheduledSearchId: job.id, ok: true, cvResults });
      }

      await prisma.scheduledSearch.update({
        where: { id: job.id },
        data: { lastRunAt: now, nextRunAt: computeNextRunAt(job.interval, now) },
      });
    } catch (error) {
      results.push({
        scheduledSearchId: job.id,
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({ ranAt: now.toISOString(), jobsEvaluated: dueJobs.length, results });
}
