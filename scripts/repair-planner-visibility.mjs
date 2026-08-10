// One-off data repair for the Task Planner visibility invariant (see
// shared/domain/todoPlannerVisibility.ts): a todo that shows in the Planner must
// have a parent that shows in the Planner.
//
// Rows written before that rule existed can violate it - a subtask left visible
// under a hidden parent, which the Planner renders orphaned at the ROOT of the
// tree because its ancestor chain stops at the row it can't see. The write
// boundary refuses to create new ones, but it can only correct rows somebody
// writes; these need one pass.
//
// Direction: ancestors are pulled UP (shown), never children pushed down (hidden).
// A repair must not make something the user can currently see disappear. That is
// the opposite of what the runtime rule does to a single write, and deliberately
// so: at runtime the user is *doing* something and can see the result; here
// nobody asked, so the safe correction is the one that only reveals.
//
// Idempotent - a second run finds nothing to do. Run once, per deployment:
//
//   DATABASE_URL='postgres://…' node scripts/repair-planner-visibility.mjs
//   DATABASE_URL='…' node scripts/repair-planner-visibility.mjs --dry-run
//
// Scoped per user_id implicitly: the recursive walk follows parent_id, and a
// todo's parent always belongs to the same user.

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

const dryRun = process.argv.includes('--dry-run');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

// Every ancestor of a Planner-visible todo that is not itself Planner-visible.
// The recursive term walks UP from each visible row; collections are excluded
// from the result (they are pinned visible by normalizeVisibility and can't be
// hidden anyway), but the walk still passes through them.
// Keyed on (user_id, id) throughout - the walk joins on user_id and the UPDATE
// matches the pair. `id` alone is not unique (the PK is (user_id, id)), so an
// id-only join would follow a tree edge into another account.
const FIND = `
  WITH RECURSIVE chain AS (
    SELECT user_id, id, parent_id FROM todos WHERE show_in_database IS TRUE
    UNION
    SELECT t.user_id, t.id, t.parent_id FROM todos t
      JOIN chain c ON t.id = c.parent_id AND t.user_id = c.user_id
  )
  SELECT DISTINCT t.user_id, t.id, t.text
    FROM chain c JOIN todos t ON t.id = c.id AND t.user_id = c.user_id
   WHERE t.show_in_database IS NOT TRUE
     AND t.is_collection IS NOT TRUE
`;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const { rows } = await pool.query(FIND);

  if (rows.length === 0) {
    console.log('Nothing to repair - every Planner-visible todo already has visible parents.');
  } else {
    console.log(`${rows.length} hidden parent${rows.length === 1 ? '' : 's'} of visible tasks:`);
    for (const r of rows) console.log(`  ${r.user_id}  ${r.id}  ${r.text || '(untitled)'}`);

    if (dryRun) {
      console.log('\n--dry-run: nothing written.');
    } else {
      const userIds = rows.map((r) => r.user_id);
      const ids = rows.map((r) => r.id);
      const res = await pool.query(
        `UPDATE todos SET show_in_database = TRUE
          WHERE (user_id, id) IN (SELECT * FROM unnest($1::text[], $2::text[]))`,
        [userIds, ids]
      );
      console.log(`\nShowed ${res.rowCount} todo${res.rowCount === 1 ? '' : 's'} in the Task Planner.`);
    }
  }
} finally {
  await pool.end();
}
