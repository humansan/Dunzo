-- Backfill NULL hub_order values.
--
-- The Planner orders siblings by `hub_order ?? createdAt`. Those two live on
-- wildly different scales (hub_order is a small index, createdAt is epoch ms),
-- so a task with no hub_order sank to the bottom of its sibling group while the
-- "next order" calculation (MAX(hub_order) + 1) ignored it entirely - which made
-- every newly created task land ABOVE such tasks instead of at the end.
-- Tasks created from the Daily page never got a hub_order, so this affects any
-- account that used daily quick-add.
--
-- Fix the existing rows here (the client now always assigns one). Ordering by
-- created_at keeps their current relative position; starting from the user's
-- current MAX keeps them below everything that was explicitly ordered, which is
-- exactly where they already rendered.
UPDATE "todos" AS t
SET "hub_order" = m."max_order" + r."seq"
FROM (
  SELECT "id", "user_id",
         ROW_NUMBER() OVER (PARTITION BY "user_id" ORDER BY "created_at", "id") AS "seq"
  FROM "todos"
  WHERE "hub_order" IS NULL
) AS r
JOIN (
  SELECT "user_id", COALESCE(MAX("hub_order"), 0) AS "max_order"
  FROM "todos"
  GROUP BY "user_id"
) AS m ON m."user_id" = r."user_id"
WHERE t."id" = r."id";
