/*
  Warnings:

  - Made the column `userId` on table `CvProfile` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "CvProfile" ALTER COLUMN "userId" SET NOT NULL;
