import { prisma } from "@/lib/prisma";
import { scoreMatch, generateCoverLetter } from "@/lib/matching";
import type { CvProfile } from "@/generated/prisma/client";

// Matches at or above this score get a generated cover letter and move
// into the "До подачі" (to-apply) list; below it, the score is still
// visible on /vacancies but nothing further is generated.
export const APPLY_THRESHOLD = 55;

export interface ScoringResult {
  cvProfileId: string;
  scored: number;
  toApply: number;
}

export async function scoreCvProfile(
  cvProfile: CvProfile,
): Promise<ScoringResult> {
  const vacancies = await prisma.vacancy.findMany({
    where: {
      discoveries: { some: { searchConfig: { cvProfileId: cvProfile.id } } },
      matches: { none: { cvProfileId: cvProfile.id } },
    },
  });

  let scored = 0;
  let toApply = 0;
  for (const vacancy of vacancies) {
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

    scored += 1;
    if (qualifies) toApply += 1;
  }

  return { cvProfileId: cvProfile.id, scored, toApply };
}

export async function scoreAllProfiles(): Promise<ScoringResult[]> {
  const profiles = await prisma.cvProfile.findMany();
  const results: ScoringResult[] = [];
  for (const profile of profiles) {
    results.push(await scoreCvProfile(profile));
  }
  return results;
}
