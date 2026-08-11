-- Manual order for the time widgets.
--
-- The list used to be "whatever the SELECT returned, with the day tracker pinned
-- first" - an unspecified order that an UPDATE could reshuffle. `sort_order` makes
-- it the user's, set by dragging in the Time Widgets → Order menu.
--
-- Nullable, like todos.hub_order: the GET orders by sort_order then created_at, and
-- NULLs sort last on ASC, so a row that somehow misses the backfill (an old backup
-- restored later) lands at the end rather than jumping to the front. The backfill
-- below seeds everyone with their current creation order, per user, so no existing
-- list visibly reshuffles on deploy - except the day tracker, which loses its pin.
ALTER TABLE "trackers" ADD COLUMN "sort_order" double precision;--> statement-breakpoint
UPDATE "trackers" AS t
   SET "sort_order" = x.rn - 1
  FROM (
    SELECT "id",
           row_number() OVER (PARTITION BY "user_id" ORDER BY "created_at", "id") AS rn
      FROM "trackers"
  ) AS x
 WHERE t."id" = x."id";
