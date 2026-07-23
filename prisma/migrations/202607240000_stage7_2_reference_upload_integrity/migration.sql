WITH ranked_primary AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "projectId"
      ORDER BY "sortOrder" ASC, "createdAt" ASC, id ASC
    ) AS rn
  FROM "ReferenceImage"
  WHERE "isPrimary" = true
)
UPDATE "ReferenceImage" AS r
SET "isPrimary" = false
FROM ranked_primary
WHERE r.id = ranked_primary.id
  AND ranked_primary.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "ReferenceImage_one_primary_per_project"
ON "ReferenceImage" ("projectId")
WHERE "isPrimary" = true;
