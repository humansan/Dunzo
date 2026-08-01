-- Repair rows that violate the archive invariant.
--
-- INVARIANT: a todo whose parent is archived is itself archived. Equivalently, a
-- live todo never sits under an archived one. It is enforced at the write boundary
-- now (shared/domain/todoArchive, plus the cascade in the /todos/batch route), but
-- rows written before that could break it - most easily via "Create task inside" on
-- an archived row, which made a LIVE child under an archived parent.
--
-- Such a row is in two contradictory states at once: it shows up in whatever live
-- tab it belongs to, detached at root level because the Planner's ancestry walks
-- can't see its archived parent, while its Collection cell still resolves through
-- that parent to a collection name.
--
-- Repair direction: archive the live DESCENDANTS (not unarchive the ancestors), so
-- an archived subtree stays archived as a unit. The recursive term walks down from
-- every archived todo and catches the whole chain below it, however deep, including
-- live rows sitting between two archived ones.
--
-- Idempotent: re-running matches nothing once every descendant is archived.
WITH RECURSIVE under_archived AS (
  SELECT "id"
    FROM "todos"
   WHERE "archived" IS TRUE
  UNION
  SELECT t."id"
    FROM "todos" t
    JOIN under_archived u ON t."parent_id" = u."id"
)
UPDATE "todos" AS t
   SET "archived" = TRUE
  FROM under_archived u
 WHERE t."id" = u."id"
   AND t."archived" IS DISTINCT FROM TRUE;
