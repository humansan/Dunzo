-- Drop the stored start/due percentages.
--
-- A percent-of-day was only ever another reading of start_time / due_time, but it
-- was persisted alongside them - so every write path had to remember to update
-- both, and three didn't (the planner's "Set time" menu, the daily quick-editor's
-- persistEdit, and task→collection conversion). Tasks ended up showing a
-- percentage for a time they no longer had.
--
-- The UI now derives the percentage from the time on read and converts back to a
-- time on input (src/features/tasks/model/percent.ts), so these columns have no
-- readers or writers left.
--
-- Run AFTER the code that stops reading them is deployed. Rows that held a
-- percentage with no time lose it - intended, that state is being retired.
ALTER TABLE "todos" DROP COLUMN "start_percentage";--> statement-breakpoint
ALTER TABLE "todos" DROP COLUMN "due_percentage";
