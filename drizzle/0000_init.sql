CREATE TABLE "todos" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"parent_id" text,
	"is_collection" boolean DEFAULT false NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'todo',
	"completed" boolean GENERATED ALWAYS AS (status is not distinct from 'completed') STORED,
	"priority" text,
	"urgency" text,
	"start_date" date,
	"due_date" date,
	"start_time" text,
	"due_time" text,
	"start_percentage" real,
	"due_percentage" real,
	"estimated_time" integer,
	"count_completion" integer,
	"repeat_interval" integer,
	"notes" text,
	"xp" integer,
	"color" text,
	"show_in_database" boolean,
	"show_in_daily_list" boolean,
	"archived" boolean DEFAULT false NOT NULL,
	"hub_order" double precision,
	"daily_order" double precision,
	"created_at" bigint NOT NULL,
	"completed_at" bigint,
	"deleted_at" bigint,
	"tracking_started_at" bigint,
	CONSTRAINT "todos_status_check" CHECK ("todos"."status" is null or "todos"."status" in ('todo','in_progress','completed'))
);
--> statement-breakpoint
CREATE TABLE "trackers" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"start_date" text,
	"end_date" text,
	"color" text NOT NULL,
	"precision" integer NOT NULL,
	"display_mode" text,
	"secondary_display_mode" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"theme" jsonb,
	"week_starts_on" integer,
	"countdown_mode" text,
	"xp_enabled" boolean,
	"active_workspace_id" text,
	"hub_views" jsonb,
	"hub_col_widths" jsonb,
	"hub_collapsed" jsonb,
	"hub_layout" jsonb,
	"updated_at" bigint
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" bigint
);
--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_parent_id_todos_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."todos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "todos_user_workspace_idx" ON "todos" USING btree ("user_id","workspace_id");--> statement-breakpoint
CREATE INDEX "todos_user_due_idx" ON "todos" USING btree ("user_id","due_date");--> statement-breakpoint
CREATE INDEX "todos_user_parent_idx" ON "todos" USING btree ("user_id","parent_id");--> statement-breakpoint
CREATE INDEX "trackers_user_idx" ON "trackers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "workspaces_user_idx" ON "workspaces" USING btree ("user_id");