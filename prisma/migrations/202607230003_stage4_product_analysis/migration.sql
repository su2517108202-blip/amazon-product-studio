-- AlterTable
ALTER TABLE "ReferenceImage" ADD COLUMN     "includeInAnalysis" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ProductIdentity" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "productName" TEXT,
    "category" TEXT,
    "color" TEXT,
    "material" TEXT,
    "structure" TEXT,
    "visibleFunctionsJson" TEXT NOT NULL,
    "sellingPointsJson" TEXT NOT NULL,
    "targetUsersJson" TEXT NOT NULL,
    "usageScenariosJson" TEXT NOT NULL,
    "mustKeepJson" TEXT NOT NULL,
    "avoidChangesJson" TEXT NOT NULL,
    "primaryReferenceDescription" TEXT,
    "sourceProvider" TEXT,
    "sourceModel" TEXT,
    "sourceProfileId" TEXT,
    "inputFingerprint" TEXT,
    "isStale" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductAnalysisRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "providerProfileId" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "inputFingerprint" TEXT,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ProductAnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductIdentity_projectId_key" ON "ProductIdentity"("projectId");

-- CreateIndex
CREATE INDEX "ProductAnalysisRun_projectId_idx" ON "ProductAnalysisRun"("projectId");

-- CreateIndex
CREATE INDEX "ProductAnalysisRun_providerProfileId_idx" ON "ProductAnalysisRun"("providerProfileId");

-- AddForeignKey
ALTER TABLE "ProductIdentity" ADD CONSTRAINT "ProductIdentity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAnalysisRun" ADD CONSTRAINT "ProductAnalysisRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
