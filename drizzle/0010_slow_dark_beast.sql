-- Identity becomes `(user_id, id)` on workspaces/todos/trackers, and both todos
-- FKs become composite. See the header comment in shared/db/schema.ts for why.
--
-- HAND-EDITED after `drizzle-kit generate`. Two things the generator can't do:
--   1. It could not name the existing primary keys, and left three commented-out
--      `DROP CONSTRAINT "<constraint_name>"` placeholders. Without those drops the
--      ADD CONSTRAINT below fails with "multiple primary keys for table not
--      allowed". The names are the Postgres defaults from 0000_init.sql, where the
--      keys were declared inline: `<table>_pkey`.
--   2. The two UPDATEs in step 2, which are a data fix the generator can't infer.
--
-- Statement order is load-bearing: the self-referential FK on todos.parent_id
-- depends on todos_pkey, so neither PK can be dropped until both FKs are gone.
--
-- No table rewrite happens here - no column type changes, `user_id` is already
-- NOT NULL, and the generated `completed` column is untouched. Each ADD
-- CONSTRAINT builds one btree under an ACCESS EXCLUSIVE lock. drizzle-kit runs
-- the whole file in a transaction, so a failure at any step rolls all of it back.

-- 1. FKs first (see above).
ALTER TABLE "todos" DROP CONSTRAINT "todos_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "todos" DROP CONSTRAINT "todos_parent_id_todos_id_fk";--> statement-breakpoint

-- 2. Self-heal cross-tenant references before the composite FKs start enforcing.
-- A todo pointing at a parent or workspace owned by a DIFFERENT user satisfies the
-- old single-column FK (it only asked whether the id existed anywhere) but violates
-- the new composite one, which would make step 4 fail. Reachable today because no
-- route validates that a referenced parent/workspace belongs to the caller. Both
-- should be no-ops on clean data; nulling demotes the row to a root / uncategorized
-- task rather than deleting anything.
UPDATE "todos" c SET "parent_id" = NULL
 WHERE c."parent_id" IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM "todos" p
      WHERE p."id" = c."parent_id" AND p."user_id" <> c."user_id"
   );--> statement-breakpoint
UPDATE "todos" t SET "workspace_id" = NULL
 WHERE t."workspace_id" IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM "workspaces" w
      WHERE w."id" = t."workspace_id" AND w."user_id" <> t."user_id"
   );--> statement-breakpoint

-- 3. Swap the keys.
ALTER TABLE "todos" DROP CONSTRAINT "todos_pkey";--> statement-breakpoint
ALTER TABLE "trackers" DROP CONSTRAINT "trackers_pkey";--> statement-breakpoint
ALTER TABLE "workspaces" DROP CONSTRAINT "workspaces_pkey";--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_user_id_id_pk" PRIMARY KEY("user_id","id");--> statement-breakpoint
ALTER TABLE "trackers" ADD CONSTRAINT "trackers_user_id_id_pk" PRIMARY KEY("user_id","id");--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_user_id_id_pk" PRIMARY KEY("user_id","id");--> statement-breakpoint

-- 4. Composite FKs. MATCH SIMPLE, so a NULL parent_id/workspace_id is unconstrained.
ALTER TABLE "todos" ADD CONSTRAINT "todos_user_workspace_fk" FOREIGN KEY ("user_id","workspace_id") REFERENCES "public"."workspaces"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_user_parent_fk" FOREIGN KEY ("user_id","parent_id") REFERENCES "public"."todos"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- 5. Now-redundant indexes: the new PKs lead with user_id, which is all these were.
-- (todos keeps its three - their second column differs, and two of them are the
-- supporting indexes for the composite FKs above.)
DROP INDEX "trackers_user_idx";--> statement-breakpoint
DROP INDEX "workspaces_user_idx";
