import { prisma } from "../src/lib/prisma";
import { extractSearchTerms } from "../src/lib/cv";

async function main() {
  const profiles = await prisma.cvProfile.findMany({
    where: { searchTerms: { isEmpty: true } },
  });
  console.log(`Backfilling searchTerms for ${profiles.length} CV profile(s)…`);

  for (const profile of profiles) {
    const terms = await extractSearchTerms(profile.extractedText);
    await prisma.cvProfile.update({
      where: { id: profile.id },
      data: { searchTerms: terms },
    });
    console.log(`  ${profile.id} (${profile.label}): ${terms.join(", ")}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
