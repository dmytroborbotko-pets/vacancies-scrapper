-- CreateTable
CREATE TABLE "CvProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "extractedText" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SearchConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "keywords" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Vacancy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT,
    "rawText" TEXT NOT NULL,
    "foundAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vacancyId" TEXT NOT NULL,
    "cvProfileId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "coverLetter" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Match_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Match_cvProfileId_fkey" FOREIGN KEY ("cvProfileId") REFERENCES "CvProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Vacancy_sourceUrl_key" ON "Vacancy"("sourceUrl");

-- CreateIndex
CREATE UNIQUE INDEX "Match_vacancyId_cvProfileId_key" ON "Match"("vacancyId", "cvProfileId");
