// Backfills CvProfile.searchTerms for rows where it is currently empty.
//
// Safe to re-run: it only touches profiles with an empty searchTerms array,
// so already-populated rows are left untouched. Beyond being a one-time
// migration artifact, this also serves as the standing repair tool for
// uploads where extraction failed silently (see the graceful-degradation
// change in `uploadCvProfile`, src/lib/cv.ts) — just run it again to pick
// up and fix any such rows.
//
// Loads DATABASE_URL and ANTHROPIC_API_KEY from .env itself (via
// "dotenv/config", same pattern as prisma.config.ts), so just run:
//   npx tsx scripts/backfill-search-terms.ts
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { extractSearchTerms } from "@/lib/cv";

async function main() {
  const profiles = await prisma.cvProfile.findMany({
    where: { searchTerms: { isEmpty: true } },
    select: { id: true, label: true, extractedText: true },
  });
  console.log(`Backfilling searchTerms for ${profiles.length} CV profile(s)…`);

  let succeeded = 0;
  let failed = 0;

  for (const profile of profiles) {
    try {
      const terms = await extractSearchTerms(profile.extractedText);
      await prisma.cvProfile.update({
        where: { id: profile.id },
        data: { searchTerms: terms },
      });
      console.log(`  ${profile.id} (${profile.label}): ${terms.join(", ")}`);
      succeeded++;
    } catch (error) {
      console.error(`  ${profile.id}: failed`, error);
      failed++;
      continue;
    }
  }

  console.log(`${succeeded} succeeded, ${failed} failed`);
  return failed;
}

main()
  .then((failed) => prisma.$disconnect().then(() => process.exit(failed > 0 ? 1 : 0)))
  .catch((error) => {
    console.error(error);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
