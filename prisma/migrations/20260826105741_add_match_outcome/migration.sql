-- CreateEnum
CREATE TYPE "MatchOutcome" AS ENUM ('INTERVIEW', 'HIRED', 'REJECTED');

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "outcome" "MatchOutcome";
