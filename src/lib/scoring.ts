import { prisma } from "@/lib/prisma";
import { scoreMatch, generateCoverLetter } from "@/lib/matching";
import type { CvProfile, Vacancy } from "@/generated/prisma/client";

// Matches at or above this score get a generated cover letter and move
// into the "До подачі" (to-apply) list; below it, the score is still
// visible on /vacancies but nothing further is generated.
export const APPLY_THRESHOLD = 55;

// Scoring is called from request handlers capped at 300s (Vercel Hobby),
// often sharing that budget with the ingest legs that ran just before it.
// A large unscored backlog run fully serially (one Claude round-trip at a
// time) can blow well past that — leaving most of a batch permanently
// stuck at "не оцінено" since the function gets killed mid-run. Bounding
// both the batch size and the concurrency keeps one invocation fast enough
// to reliably finish; any leftover backlog just gets picked up by the next
// scoring run (cron or manual), since the query below always looks for
// whatever still has no Match row.
const MAX_SCORED_PER_RUN = 40;
const SCORE_CONCURRENCY = 5;

export interface ScoringResult {
  cvProfileId: string;
  scored: number;
  toApply: number;
}

async function scoreOneVacancy(
  cvProfile: CvProfile,
  vacancy: Vacancy,
): Promise<{ qualifies: boolean }> {
  const result = await scoreMatch(cvProfile.extractedText, vacancy.rawText);
  const qualifies = result.score >= APPLY_THRESHOLD;

  const coverLetter = qualifies
    ? await generateCoverLetter(cvProfile.extractedText, vacancy.rawText)
    : null;

  await prisma.match.upsert({
    where: {
      vacancyId_cvProfileId: {
        vacancyId: vacancy.id,
        cvProfileId: cvProfile.id,
      },
    },
    create: {
      vacancyId: vacancy.id,
      cvProfileId: cvProfile.id,
      score: result.score,
      coverLetter,
      status: qualifies ? "TO_APPLY" : "NEW",
    },
    update: {
      score: result.score,
      coverLetter,
      status: qualifies ? "TO_APPLY" : "NEW",
    },
  });

  return { qualifies };
}

export async function scoreCvProfile(
  cvProfile: CvProfile,
): Promise<ScoringResult> {
  const vacancies = await prisma.vacancy.findMany({
    where: {
      discoveries: { some: { searchConfig: { cvProfileId: cvProfile.id } } },
      matches: { none: { cvProfileId: cvProfile.id } },
    },
    take: MAX_SCORED_PER_RUN,
  });

  let scored = 0;
  let toApply = 0;
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const vacancy = vacancies[nextIndex++];
      if (!vacancy) return;
      const { qualifies } = await scoreOneVacancy(cvProfile, vacancy);
      scored += 1;
      if (qualifies) toApply += 1;
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(SCORE_CONCURRENCY, vacancies.length) }, worker),
  );

  return { cvProfileId: cvProfile.id, scored, toApply };
}

// System-wide: used by the daily cron job.
export async function scoreAllProfiles(): Promise<ScoringResult[]> {
  const profiles = await prisma.cvProfile.findMany();
  const results: ScoringResult[] = [];
  for (const profile of profiles) {
    results.push(await scoreCvProfile(profile));
  }
  return results;
}

// Scoped to one user's own CV profiles — used by the manual "Порахувати %
// збігу" button.
export async function scoreProfilesForUser(
  userId: string,
): Promise<ScoringResult[]> {
  const profiles = await prisma.cvProfile.findMany({ where: { userId } });
  const results: ScoringResult[] = [];
  for (const profile of profiles) {
    results.push(await scoreCvProfile(profile));
  }
  return results;
}
