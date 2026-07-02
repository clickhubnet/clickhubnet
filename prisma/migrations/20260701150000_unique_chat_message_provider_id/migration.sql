DELETE FROM "ChatMessage"
WHERE "id" IN (
  SELECT "id"
  FROM (
    SELECT
      "id",
      ROW_NUMBER() OVER (PARTITION BY "providerId" ORDER BY "createdAt", "id") AS duplicate_number
    FROM "ChatMessage"
    WHERE "providerId" IS NOT NULL
  ) AS duplicated_messages
  WHERE duplicate_number > 1
);

CREATE UNIQUE INDEX "ChatMessage_providerId_key" ON "ChatMessage"("providerId");
