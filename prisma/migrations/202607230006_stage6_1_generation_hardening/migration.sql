-- AlterTable
ALTER TABLE "ImageGenerationRun"
  ADD COLUMN "checkAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastCheckedAt" TIMESTAMP(3),
  ADD COLUMN "expiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "GeneratedImage"
  ADD COLUMN "outputIndex" INTEGER NOT NULL DEFAULT 0;

-- Deduplicate any historical duplicate index-0 rows before adding the unique constraint.
DELETE FROM "GeneratedImage" a
USING "GeneratedImage" b
WHERE a."generationRunId" = b."generationRunId"
  AND a."outputIndex" = b."outputIndex"
  AND a."createdAt" > b."createdAt";

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedImage_generationRunId_outputIndex_key"
  ON "GeneratedImage"("generationRunId", "outputIndex");
