-- CreateEnum
CREATE TYPE "Source" AS ENUM ('DJINNI', 'DOU');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('NEW', 'TO_APPLY', 'APPLIED', 'DISMISSED');

-- CreateTable
CREATE TABLE "CvProfile" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileData" BYTEA NOT NULL,
    "extractedText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CvProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchConfig" (
    "id" TEXT NOT NULL,
    "keywords" TEXT NOT NULL,
    "source" "Source" NOT NULL,
    "expLevels" TEXT,
    "requireReservation" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cvProfileId" TEXT NOT NULL,

    CONSTRAINT "SearchConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vacancy" (
    "id" TEXT NOT NULL,
    "source" "Source" NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT,
    "rawText" TEXT NOT NULL,
    "foundAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vacancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VacancyDiscovery" (
    "id" TEXT NOT NULL,
    "vacancyId" TEXT NOT NULL,
    "searchConfigId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VacancyDiscovery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "vacancyId" TEXT NOT NULL,
    "cvProfileId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "coverLetter" TEXT,
    "status" "MatchStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vacancy_sourceUrl_key" ON "Vacancy"("sourceUrl");

-- CreateIndex
CREATE UNIQUE INDEX "VacancyDiscovery_vacancyId_searchConfigId_key" ON "VacancyDiscovery"("vacancyId", "searchConfigId");

-- CreateIndex
CREATE UNIQUE INDEX "Match_vacancyId_cvProfileId_key" ON "Match"("vacancyId", "cvProfileId");

-- AddForeignKey
ALTER TABLE "SearchConfig" ADD CONSTRAINT "SearchConfig_cvProfileId_fkey" FOREIGN KEY ("cvProfileId") REFERENCES "CvProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VacancyDiscovery" ADD CONSTRAINT "VacancyDiscovery_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VacancyDiscovery" ADD CONSTRAINT "VacancyDiscovery_searchConfigId_fkey" FOREIGN KEY ("searchConfigId") REFERENCES "SearchConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_cvProfileId_fkey" FOREIGN KEY ("cvProfileId") REFERENCES "CvProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
