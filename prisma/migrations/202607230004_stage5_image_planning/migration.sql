-- CreateTable
CREATE TABLE "ImagePlan" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "planIndex" INTEGER NOT NULL,
    "taskType" TEXT NOT NULL,
    "coreSellingPoint" TEXT NOT NULL,
    "scene" TEXT NOT NULL,
    "composition" TEXT NOT NULL,
    "mainTitle" TEXT,
    "subTitle" TEXT,
    "keyNotesJson" TEXT NOT NULL,
    "mustKeepJson" TEXT NOT NULL,
    "avoidJson" TEXT NOT NULL,
    "finalPrompt" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "isManuallyEdited" BOOLEAN NOT NULL DEFAULT false,
    "isStale" BOOLEAN NOT NULL DEFAULT false,
    "inputFingerprint" TEXT,
    "sourceProvider" TEXT,
    "sourceModel" TEXT,
    "sourceProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImagePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImagePlanningRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "providerProfileId" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "inputFingerprint" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ImagePlanningRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ImagePlan_projectId_planIndex_key" ON "ImagePlan"("projectId", "planIndex");

-- CreateIndex
CREATE INDEX "ImagePlan_projectId_idx" ON "ImagePlan"("projectId");

-- CreateIndex
CREATE INDEX "ImagePlanningRun_projectId_idx" ON "ImagePlanningRun"("projectId");

-- CreateIndex
CREATE INDEX "ImagePlanningRun_providerProfileId_idx" ON "ImagePlanningRun"("providerProfileId");

-- AddForeignKey
ALTER TABLE "ImagePlan" ADD CONSTRAINT "ImagePlan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImagePlanningRun" ADD CONSTRAINT "ImagePlanningRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
