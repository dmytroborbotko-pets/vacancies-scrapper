-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SearchConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "keywords" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "expLevels" TEXT,
    "requireReservation" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cvProfileId" TEXT NOT NULL,
    CONSTRAINT "SearchConfig_cvProfileId_fkey" FOREIGN KEY ("cvProfileId") REFERENCES "CvProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SearchConfig" ("active", "createdAt", "cvProfileId", "expLevels", "id", "keywords", "source") SELECT "active", "createdAt", "cvProfileId", "expLevels", "id", "keywords", "source" FROM "SearchConfig";
DROP TABLE "SearchConfig";
ALTER TABLE "new_SearchConfig" RENAME TO "SearchConfig";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
