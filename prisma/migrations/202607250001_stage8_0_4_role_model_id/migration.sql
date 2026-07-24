ALTER TABLE "ModelRoleAssignment" ADD COLUMN "modelId" TEXT;
ALTER TABLE "ModelRoleAssignment" ADD COLUMN "isUserForced" BOOLEAN NOT NULL DEFAULT false;
