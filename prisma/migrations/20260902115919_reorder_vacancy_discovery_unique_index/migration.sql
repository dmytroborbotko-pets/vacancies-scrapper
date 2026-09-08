-- DropIndex
DROP INDEX "VacancyDiscovery_vacancyId_cvProfileId_key";

-- CreateIndex
CREATE UNIQUE INDEX "VacancyDiscovery_cvProfileId_vacancyId_key" ON "VacancyDiscovery"("cvProfileId", "vacancyId");
