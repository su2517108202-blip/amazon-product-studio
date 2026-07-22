-- CreateTable
CREATE TABLE "ProviderProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "baseUrl" TEXT,
    "encryptedApiKey" TEXT,
    "apiKeyIv" TEXT,
    "apiKeyAuthTag" TEXT,
    "apiKeyLast4" TEXT,
    "modelId" TEXT NOT NULL,
    "protocol" TEXT NOT NULL DEFAULT 'openai-compatible',
    "capabilitiesJson" TEXT NOT NULL,
    "timeoutMs" INTEGER NOT NULL DEFAULT 30000,
    "maxRetries" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastTestOk" BOOLEAN,
    "lastTestMessage" TEXT,
    "lastTestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelRoleAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "providerProfileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelRoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderProfile_userId_idx" ON "ProviderProfile"("userId");

-- CreateIndex
CREATE INDEX "ModelRoleAssignment_providerProfileId_idx" ON "ModelRoleAssignment"("providerProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "ModelRoleAssignment_userId_role_key" ON "ModelRoleAssignment"("userId", "role");

-- AddForeignKey
ALTER TABLE "ProviderProfile" ADD CONSTRAINT "ProviderProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelRoleAssignment" ADD CONSTRAINT "ModelRoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelRoleAssignment" ADD CONSTRAINT "ModelRoleAssignment_providerProfileId_fkey" FOREIGN KEY ("providerProfileId") REFERENCES "ProviderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
