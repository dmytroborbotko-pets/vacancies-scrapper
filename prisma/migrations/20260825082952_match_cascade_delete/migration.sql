-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Match" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vacancyId" TEXT NOT NULL,
    "cvProfileId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "coverLetter" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Match_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Match_cvProfileId_fkey" FOREIGN KEY ("cvProfileId") REFERENCES "CvProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Match" ("coverLetter", "createdAt", "cvProfileId", "id", "score", "status", "vacancyId") SELECT "coverLetter", "createdAt", "cvProfileId", "id", "score", "status", "vacancyId" FROM "Match";
DROP TABLE "Match";
ALTER TABLE "new_Match" RENAME TO "Match";
CREATE UNIQUE INDEX "Match_vacancyId_cvProfileId_key" ON "Match"("vacancyId", "cvProfileId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
