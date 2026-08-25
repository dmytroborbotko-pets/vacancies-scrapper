/*
  Warnings:

  - Added the required column `cvProfileId` to the `SearchConfig` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "VacancyDiscovery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vacancyId" TEXT NOT NULL,
    "searchConfigId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VacancyDiscovery_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VacancyDiscovery_searchConfigId_fkey" FOREIGN KEY ("searchConfigId") REFERENCES "SearchConfig" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SearchConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "keywords" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cvProfileId" TEXT NOT NULL,
    CONSTRAINT "SearchConfig_cvProfileId_fkey" FOREIGN KEY ("cvProfileId") REFERENCES "CvProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SearchConfig" ("active", "createdAt", "id", "keywords", "source") SELECT "active", "createdAt", "id", "keywords", "source" FROM "SearchConfig";
DROP TABLE "SearchConfig";
ALTER TABLE "new_SearchConfig" RENAME TO "SearchConfig";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "VacancyDiscovery_vacancyId_searchConfigId_key" ON "VacancyDiscovery"("vacancyId", "searchConfigId");
