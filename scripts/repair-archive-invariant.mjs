// One-off data repair for the archive invariant (see shared/domain/todoArchive):
// a live todo never sits under an archived one.
//
// A row that breaks it is in two contradictory states at once. The Planner nests a
// row only under a parent that is present in its entry set (flattenTree), and the
// archived parent isn't - so the child renders detached at the ROOT of the tree -
// while its Collection cell and its collection's header count are resolved over the
// FULL todo index, which can still see that parent and reads the collection through
// it. The row appears outside the collection it is counted in.
//
// drizzle/0008_fix_archive_invariant.sql repaired this once already, in the other
// direction: it archived the live DESCENDANTS. This script exists because that
// direction is wrong for an unattended repair, for the reason the planner-visibility
// repair beside it spells out - a repair must not make something the user can
// currently see disappear. Archiving the descendants silently removes live work
// from every view it was in; unarchiving the ancestors only ever reveals, and the
// result is reviewable (the restored parent is right there in the Planner). At
// runtime the rule still corrects the CHILD, because there the user is doing
// something and can see the result.
//
// Unlike the planner-visibility repair, collections are IN scope: a collection can
// be archived, and an archived collection holding live tasks produces exactly the
// same orphan.
//
// Idempotent - a second run finds nothing to do. Run once, per deployment:
//
//   DATABASE_URL='postgres://…' node scripts/repair-archive-invariant.mjs
//   DATABASE_URL='…' node scripts/repair-archive-invariant.mjs --dry-run
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

// Every ancestor of a live todo that is itself archived. The recursive term walks
// UP from each live row and keeps going past the rows it collects, so an archived
// grandparent above an archived parent is caught in the same pass.
const FIND = `
  WITH RECURSIVE chain AS (
    SELECT id, parent_id FROM todos WHERE archived IS NOT TRUE
    UNION
    SELECT t.id, t.parent_id FROM todos t JOIN chain c ON t.id = c.parent_id
  )
  SELECT DISTINCT t.id, t.text, t.is_collection
    FROM chain c JOIN todos t ON t.id = c.id
   WHERE t.archived IS TRUE
`;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const { rows } = await pool.query(FIND);

  if (rows.length === 0) {
    console.log('Nothing to repair - no live todo sits under an archived one.');
  } else {
    console.log(`${rows.length} archived ancestor${rows.length === 1 ? '' : 's'} of live todos:`);
    for (const r of rows) {
      console.log(`  ${r.id}  ${r.text || '(untitled)'}${r.is_collection ? '  [collection]' : ''}`);
    }

    if (dryRun) {
      console.log('\n--dry-run: nothing written.');
    } else {
      const ids = rows.map((r) => r.id);
      const res = await pool.query(
        'UPDATE todos SET archived = FALSE WHERE id = ANY($1::text[])',
        [ids]
      );
      console.log(`\nUnarchived ${res.rowCount} todo${res.rowCount === 1 ? '' : 's'}.`);
    }
  }
} finally {
  await pool.end();
}
