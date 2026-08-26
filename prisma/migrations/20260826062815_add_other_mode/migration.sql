-- AlterEnum
ALTER TYPE "Source" ADD VALUE 'OTHER';

-- AlterTable
ALTER TABLE "CvProfile" ADD COLUMN     "otherModeEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SearchConfig" ADD COLUMN     "managed" BOOLEAN NOT NULL DEFAULT false;
