-- AlterTable
ALTER TABLE "ReferenceImage" ADD COLUMN "includeInGeneration" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ImageGenerationRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "imagePlanId" TEXT NOT NULL,
    "providerProfileId" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "protocol" TEXT,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "mode" TEXT NOT NULL DEFAULT 'sync',
    "externalTaskId" TEXT,
    "inputFingerprint" TEXT,
    "promptSnapshot" TEXT NOT NULL,
    "aspectRatio" TEXT,
    "resolution" TEXT,
    "requestedCount" INTEGER NOT NULL DEFAULT 1,
    "usedStaleInput" BOOLEAN NOT NULL DEFAULT false,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ImageGenerationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedImage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "imagePlanId" TEXT NOT NULL,
    "generationRunId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "byteSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImageGenerationRun_projectId_idx" ON "ImageGenerationRun"("projectId");

-- CreateIndex
CREATE INDEX "ImageGenerationRun_imagePlanId_idx" ON "ImageGenerationRun"("imagePlanId");

-- CreateIndex
CREATE INDEX "ImageGenerationRun_providerProfileId_idx" ON "ImageGenerationRun"("providerProfileId");

-- CreateIndex
CREATE INDEX "ImageGenerationRun_inputFingerprint_idx" ON "ImageGenerationRun"("inputFingerprint");

-- CreateIndex
CREATE INDEX "GeneratedImage_projectId_idx" ON "GeneratedImage"("projectId");

-- CreateIndex
CREATE INDEX "GeneratedImage_imagePlanId_idx" ON "GeneratedImage"("imagePlanId");

-- CreateIndex
CREATE INDEX "GeneratedImage_generationRunId_idx" ON "GeneratedImage"("generationRunId");

-- CreateIndex
CREATE INDEX "GeneratedImage_sha256_idx" ON "GeneratedImage"("sha256");

-- AddForeignKey
ALTER TABLE "ImageGenerationRun" ADD CONSTRAINT "ImageGenerationRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageGenerationRun" ADD CONSTRAINT "ImageGenerationRun_imagePlanId_fkey" FOREIGN KEY ("imagePlanId") REFERENCES "ImagePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedImage" ADD CONSTRAINT "GeneratedImage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedImage" ADD CONSTRAINT "GeneratedImage_imagePlanId_fkey" FOREIGN KEY ("imagePlanId") REFERENCES "ImagePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedImage" ADD CONSTRAINT "GeneratedImage_generationRunId_fkey" FOREIGN KEY ("generationRunId") REFERENCES "ImageGenerationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
