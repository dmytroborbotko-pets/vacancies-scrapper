-- CreateEnum
CREATE TYPE "SearchScope" AS ENUM ('DOU', 'DJINNI', 'BOTH', 'EVERYWHERE');

-- CreateEnum
CREATE TYPE "ScheduleInterval" AS ENUM ('DAILY', 'EVERY_3_DAYS', 'WEEKLY', 'MONTHLY');

-- AlterTable
ALTER TABLE "CvProfile" DROP COLUMN "otherModeEnabled",
ADD COLUMN     "searchTerms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "hideScheduleSuggestion" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: add the new VacancyDiscovery columns as nullable first so we
-- can backfill them from the SearchConfig each row used to belong to,
-- before that table (and the old columns) are dropped below. This
-- preserves the 446 existing discovery rows instead of discarding them.
ALTER TABLE "VacancyDiscovery"
  ADD COLUMN "cvProfileId" TEXT,
  ADD COLUMN "foundAt" TIMESTAMP(3);

UPDATE "VacancyDiscovery" vd
SET "cvProfileId" = sc."cvProfileId",
    "foundAt" = vd."createdAt"
FROM "SearchConfig" sc
WHERE vd."searchConfigId" = sc."id";

-- A handful of vacancies were discovered more than once for the same CV
-- profile via different (now-collapsed) SearchConfigs. The new schema
-- dedupes discoveries per (vacancy, cvProfile) instead of per
-- (vacancy, searchConfig), so drop the extra rows, keeping the earliest.
DELETE FROM "VacancyDiscovery" a
USING "VacancyDiscovery" b
WHERE a."vacancyId" = b."vacancyId"
  AND a."cvProfileId" = b."cvProfileId"
  AND a."id" > b."id";

-- DropForeignKey
ALTER TABLE "VacancyDiscovery" DROP CONSTRAINT "VacancyDiscovery_searchConfigId_fkey";

-- DropIndex
DROP INDEX "VacancyDiscovery_vacancyId_searchConfigId_key";

-- AlterTable: drop the old columns now that the new ones are backfilled,
-- and enforce the new NOT NULL / default.
ALTER TABLE "VacancyDiscovery"
  DROP COLUMN "createdAt",
  DROP COLUMN "searchConfigId",
  ALTER COLUMN "cvProfileId" SET NOT NULL,
  ALTER COLUMN "foundAt" SET NOT NULL,
  ALTER COLUMN "foundAt" SET DEFAULT CURRENT_TIMESTAMP;

-- DropForeignKey
ALTER TABLE "SearchConfig" DROP CONSTRAINT "SearchConfig_cvProfileId_fkey";

-- DropTable
DROP TABLE "SearchConfig";

-- CreateTable
CREATE TABLE "ScheduledSearch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cvProfileId" TEXT,
    "scope" "SearchScope" NOT NULL,
    "requireReservation" BOOLEAN NOT NULL DEFAULT false,
    "interval" "ScheduleInterval" NOT NULL,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledSearch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VacancyDiscovery_vacancyId_cvProfileId_key" ON "VacancyDiscovery"("vacancyId", "cvProfileId");

-- AddForeignKey
ALTER TABLE "VacancyDiscovery" ADD CONSTRAINT "VacancyDiscovery_cvProfileId_fkey" FOREIGN KEY ("cvProfileId") REFERENCES "CvProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledSearch" ADD CONSTRAINT "ScheduledSearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledSearch" ADD CONSTRAINT "ScheduledSearch_cvProfileId_fkey" FOREIGN KEY ("cvProfileId") REFERENCES "CvProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
