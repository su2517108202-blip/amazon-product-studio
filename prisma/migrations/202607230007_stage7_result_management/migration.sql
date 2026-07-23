-- Stage 7: generated image history, preferred image, and safe result exports.
ALTER TABLE "ImagePlan" ADD COLUMN "preferredGeneratedImageId" TEXT;

ALTER TABLE "ImageGenerationRun" ADD COLUMN "isForcedVersion" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "GeneratedImage" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "ImagePlan_preferredGeneratedImageId_key" ON "ImagePlan"("preferredGeneratedImageId");

CREATE INDEX "GeneratedImage_projectId_imagePlanId_deletedAt_idx" ON "GeneratedImage"("projectId", "imagePlanId", "deletedAt");

ALTER TABLE "ImagePlan"
  ADD CONSTRAINT "ImagePlan_preferredGeneratedImageId_fkey"
  FOREIGN KEY ("preferredGeneratedImageId")
  REFERENCES "GeneratedImage"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
