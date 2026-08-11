import { Router } from 'express';
import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { db } from '../db';
import { todos, type NewTodoRow } from '../../shared/db/schema';
import {
  asyncHandler,
  enforceArchive,
  enforceSchedule,
  enforceSchedulePatch,
  enforceVisibility,
  enforcePlannerVisibility,
  pick,
  stampCompletion,
  touchesVisibility,
  TODO_FIELDS,
  TODO_UPDATE_FIELDS,
} from '../http';
import { SCHEDULE_KEYS, touchesSchedule } from '../../shared/domain/todoSchedule';
import { touchesArchive } from '../../shared/domain/todoArchive';
import { touchesPlannerVisibility } from '../../shared/domain/todoPlannerVisibility';

export const todosRouter = Router();

// The archive invariant is checked against the DIRECT parent only (see
// shared/domain/todoArchive) - one row, not a recursive ancestor walk. Used by the
// single-row routes; the batch route preloads its parents in one query instead.
// Returns undefined for a root todo or a parent the user doesn't own.
async function parentRow(userId: string, parentId: unknown) {
  if (typeof parentId !== 'string' || !parentId) return undefined;
  const [row] = await db
    .select()
    .from(todos)
    .where(and(eq(todos.userId, userId), eq(todos.id, parentId)));
  return row;
}

// GET /api/todos - all of the user's todos (client groups by workspace/date).
todosRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await db.select().from(todos).where(eq(todos.userId, req.userId!));
    res.json(rows);
  })
);

// POST /api/todos/batch - transactional apply of { upserts, patches, deletes }.
// Defined before '/:id' routes (distinct path, but kept first for clarity).
todosRouter.post(
  '/batch',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const body = (req.body ?? {}) as {
      upserts?: unknown[];
      patches?: unknown[];
      deletes?: unknown[];
    };
    const upserts = Array.isArray(body.upserts) ? body.upserts : [];
    const patches = Array.isArray(body.patches) ? body.patches : [];
    const deletes = (Array.isArray(body.deletes) ? body.deletes : []).filter(
      (d): d is string => typeof d === 'string'
    );

    await db.transaction(async (tx) => {
      // Every parent this batch points at, preloaded in ONE query. The archive
      // check needs the parent row, and a Planner reorder patches `parentId` on
      // every row in the tree - a SELECT per row would turn one drag into hundreds
      // of round trips inside this transaction. Rows written by the batch are
      // folded back in as we go, so a child processed after its parent sees the
      // parent's new state rather than the preloaded one.
      const parentIds = new Set<string>();
      for (const r of [...upserts, ...patches]) {
        const pid = (r as { parentId?: unknown })?.parentId;
        if (typeof pid === 'string' && pid) parentIds.add(pid);
      }
      const known = new Map<string, Record<string, unknown>>();
      if (parentIds.size > 0) {
        const rows = await tx
          .select()
          .from(todos)
          .where(and(eq(todos.userId, userId), inArray(todos.id, [...parentIds])));
        for (const r of rows) known.set(r.id, r as Record<string, unknown>);
      }
      // A patch carries only the fields it changes, so a parent's archived state is
      // only known here when the patch actually sets it.
      const parentOf = (row: Record<string, unknown>) =>
        typeof row.parentId === 'string' ? known.get(row.parentId) : undefined;

      // Archive is a SUBTREE operation, and the per-row check above only ever looks
      // UP - it can correct the row being written, but archiving a parent is a
      // statement about rows nobody sent. So expand it here, authoritatively:
      // `archived: true` also archives every descendant, `archived: false` also
      // unarchives every archived ancestor. The client sends the same set, so this
      // normally adds nothing; it's what makes "a live todo under an archived one"
      // unreachable even from a client that didn't. Two recursive CTEs, and only
      // when a batch actually toggles `archived` (reorders never do).
      //
      // All four recursive CTEs below (these two and the visibility pair) carry
      // `user_id` through the CTE and join on it, rather than filtering the
      // recursive term by `t.user_id = $userId`. Same result - the anchor is
      // user-scoped, so the walk could never leave the tenant - but the tenant
      // boundary now lives in the join, which is where the tree edge actually is,
      // and it matches the `(user_id, parent_id)` FK and the composite PK index.
      const archiveIds = new Set<string>();
      const unarchiveIds = new Set<string>();
      for (const p of patches) {
        const r = p as { id?: unknown; archived?: unknown };
        if (typeof r.id !== 'string' || !('archived' in r)) continue;
        (r.archived === true ? archiveIds : unarchiveIds).add(r.id);
      }
      const idsOf = async (query: SQL) => {
        const res = await tx.execute(query);
        return ((res as unknown as { rows?: { id: string }[] }).rows ??
          (res as unknown as { id: string }[])).map((r) => r.id);
      };
      const cascade = new Map<string, boolean>();
      if (archiveIds.size > 0) {
        const ids = await idsOf(sql`
          WITH RECURSIVE subtree AS (
            SELECT ${todos.userId}, ${todos.id} FROM ${todos}
             WHERE ${and(eq(todos.userId, userId), inArray(todos.id, [...archiveIds]))}
            UNION
            SELECT t.user_id, t.id FROM ${todos} t
              JOIN subtree s ON t.parent_id = s.id AND t.user_id = s.user_id
          )
          SELECT id FROM subtree
        `);
        for (const id of ids) cascade.set(id, true);
      }
      if (unarchiveIds.size > 0) {
        const ids = await idsOf(sql`
          WITH RECURSIVE chain AS (
            SELECT ${todos.userId}, ${todos.id}, ${todos.parentId} FROM ${todos}
             WHERE ${and(eq(todos.userId, userId), inArray(todos.id, [...unarchiveIds]))}
            UNION
            SELECT t.user_id, t.id, t.parent_id FROM ${todos} t
              JOIN chain c ON t.id = c.parent_id AND t.user_id = c.user_id
          )
          SELECT id FROM chain
        `);
        // An explicit archive in the same batch wins over an inherited unarchive.
        for (const id of ids) if (!cascade.has(id)) cascade.set(id, false);
      }
      // Task Planner visibility is a subtree operation for exactly the same reason
      // (see shared/domain/todoPlannerVisibility), so it expands the same way and
      // with the same two CTEs: hiding a task also hides every descendant, showing
      // one also shows every ancestor. Without this a batch that hid a parent
      // without listing its children would leave them visible under a hidden
      // parent - orphaned at the root of the Planner tree - and the per-row check
      // below could never fix it, because nobody writes those children.
      const hideIds = new Set<string>();
      const showIds = new Set<string>();
      for (const p of patches) {
        const r = p as { id?: unknown; showInDatabase?: unknown };
        if (typeof r.id !== 'string' || !('showInDatabase' in r)) continue;
        (r.showInDatabase === true ? showIds : hideIds).add(r.id);
      }
      const visCascade = new Map<string, boolean>();
      if (hideIds.size > 0) {
        // Collections are excluded: they are database-only folders, pinned visible
        // by normalizeVisibility, so hiding one would just start a fight between
        // the two rules. The walk still passes through them.
        const ids = await idsOf(sql`
          WITH RECURSIVE subtree AS (
            SELECT ${todos.userId}, ${todos.id} FROM ${todos}
             WHERE ${and(eq(todos.userId, userId), inArray(todos.id, [...hideIds]))}
            UNION
            SELECT t.user_id, t.id FROM ${todos} t
              JOIN subtree s ON t.parent_id = s.id AND t.user_id = s.user_id
          )
          SELECT s.id FROM subtree s
            JOIN ${todos} t ON t.id = s.id AND t.user_id = s.user_id
           WHERE t.is_collection IS NOT TRUE
        `);
        for (const id of ids) visCascade.set(id, false);
      }
      if (showIds.size > 0) {
        const ids = await idsOf(sql`
          WITH RECURSIVE chain AS (
            SELECT ${todos.userId}, ${todos.id}, ${todos.parentId} FROM ${todos}
             WHERE ${and(eq(todos.userId, userId), inArray(todos.id, [...showIds]))}
            UNION
            SELECT t.user_id, t.id, t.parent_id FROM ${todos} t
              JOIN chain c ON t.id = c.parent_id AND t.user_id = c.user_id
          )
          SELECT id FROM chain
        `);
        // An explicit hide in the same batch wins over an inherited show, matching
        // how the archive cascade resolves the same collision.
        for (const id of ids) if (!visCascade.has(id)) visCascade.set(id, true);
      }

      // Rows the client already sent are patched below; the rest are written here.
      const sent = new Set(
        patches.map((p) => (p as { id?: unknown }).id).filter((id): id is string => typeof id === 'string')
      );
      for (const [id, archived] of cascade) {
        if (sent.has(id)) continue;
        await tx
          .update(todos)
          .set({ archived })
          .where(and(eq(todos.userId, userId), eq(todos.id, id)));
      }
      for (const [id, showInDatabase] of visCascade) {
        if (sent.has(id)) continue;
        await tx
          .update(todos)
          .set({ showInDatabase })
          .where(and(eq(todos.userId, userId), eq(todos.id, id)));
      }

      for (const u of upserts) {
        const insertData = pick<NewTodoRow>(u, TODO_FIELDS);
        if (!insertData.id) continue;
        const insertRow = {
          ...insertData,
          userId,
          createdAt: insertData.createdAt ?? Date.now(),
        } as NewTodoRow;
        stampCompletion(insertRow as { status?: string | null; completedAt?: number | null });
        // Upserts carry the client's full intended state, so the insert row is the
        // merged truth - enforce the invariant on it and mirror any fix to setData.
        enforceVisibility(insertRow as Record<string, unknown>, parentOf(insertRow as Record<string, unknown>));

        const setData = pick<Partial<NewTodoRow>>(u, TODO_UPDATE_FIELDS);
        stampCompletion(setData as { status?: string | null; completedAt?: number | null });
        // enforceVisibility only ever promotes to the Planner; mirror that fix so a
        // conflicting (existing) row gets rescued too, without clobbering setData.
        if (insertRow.showInDatabase === true && setData.showInDatabase !== true) {
          setData.showInDatabase = true;
        }
        // Same for the schedule backstop: reconcile the full intended row, then
        // mirror each corrected field onto the conflict-update set (null-clearing a
        // dropped one) so an existing row is fixed too.
        enforceSchedule(insertRow as Record<string, unknown>);
        const insertRec = insertRow as Record<string, unknown>;
        const setRec = setData as Record<string, unknown>;
        for (const k of SCHEDULE_KEYS) {
          const reconciled = insertRec[k] === undefined ? null : insertRec[k];
          if (reconciled !== (setRec[k] ?? null)) setRec[k] = reconciled;
        }
        // Archive invariant, mirrored onto the conflict-update set the same way.
        enforceArchive(insertRec, parentOf(insertRec));
        if (insertRec.archived !== (setRec.archived ?? null)) setRec.archived = insertRec.archived ?? null;
        // Planner visibility invariant, likewise. Runs AFTER enforceVisibility so
        // the reachability rescue can't reintroduce a visible row under a hidden
        // parent: a subtask is reachable inside its parent, so it never needed the
        // rescue in the first place.
        enforcePlannerVisibility(insertRec, parentOf(insertRec));
        if (insertRec.showInDatabase !== (setRec.showInDatabase ?? null)) {
          setRec.showInDatabase = insertRec.showInDatabase ?? null;
        }
        // This row may itself be some later row's parent.
        known.set(insertRow.id, insertRec);

        // The PK is `(user_id, id)`, so the arbiter can only ever match a row this
        // user owns - the key IS the cross-user guard. This used to be `target:
        // todos.id` plus `where: eq(todos.userId, userId)`, and that `where` did more
        // than guard: on another user's id it filtered the update out, leaving the
        // insert already swallowed by the conflict. No row written, no error raised.
        // That is what made importing another account's backup report success and
        // write nothing.
        if (Object.keys(setData).length > 0) {
          await tx
            .insert(todos)
            .values(insertRow)
            .onConflictDoUpdate({ target: [todos.userId, todos.id], set: setData });
        } else {
          await tx
            .insert(todos)
            .values(insertRow)
            .onConflictDoNothing({ target: [todos.userId, todos.id] });
        }
      }

      for (const p of patches) {
        const id = (p as { id?: unknown })?.id;
        if (typeof id !== 'string') continue;
        const patch = pick<Partial<NewTodoRow>>(p, TODO_UPDATE_FIELDS);
        // Status stamping and the visibility/schedule/archive backstops all need the existing row.
        if ('status' in patch || touchesVisibility(patch) || touchesSchedule(patch) || touchesArchive(patch) || touchesPlannerVisibility(patch)) {
          const [existing] = await tx
            .select()
            .from(todos)
            .where(and(eq(todos.userId, userId), eq(todos.id, id)));
          if ('status' in patch) {
            stampCompletion(
              patch as { status?: string | null; completedAt?: number | null },
              existing?.completedAt
            );
          }
          if (existing && touchesVisibility(patch)) {
            const intended = { ...existing, ...patch } as Record<string, unknown>;
            const merged = enforceVisibility(intended, parentOf(intended));
            if (merged.showInDatabase === true && patch.showInDatabase !== true) {
              patch.showInDatabase = true;
            }
          }
          if (existing && touchesSchedule(patch)) {
            enforceSchedulePatch(patch as Record<string, unknown>, existing as Record<string, unknown>);
          }
          if (existing && touchesArchive(patch)) {
            const merged = { ...existing, ...patch } as Record<string, unknown>;
            enforceArchive(merged, parentOf(merged));
            if (merged.archived !== ((patch as Record<string, unknown>).archived ?? existing.archived)) {
              (patch as Record<string, unknown>).archived = merged.archived;
            }
            known.set(id, merged);
          }
          // Re-parenting under a hidden todo, or showing a row whose parent is
          // still hidden, both have to fold `showInDatabase: false` back into the
          // patch. The subtree cascade above already handled the other direction
          // (this row's own descendants).
          if (existing && touchesPlannerVisibility(patch)) {
            const rec = patch as Record<string, unknown>;
            const merged = { ...existing, ...patch } as Record<string, unknown>;
            enforcePlannerVisibility(merged, parentOf(merged));
            if (merged.showInDatabase !== (rec.showInDatabase ?? existing.showInDatabase)) {
              rec.showInDatabase = merged.showInDatabase;
            }
            known.set(id, merged);
          }
        }
        if (Object.keys(patch).length === 0) continue;
        await tx.update(todos).set(patch).where(and(eq(todos.userId, userId), eq(todos.id, id)));
      }

      if (deletes.length > 0) {
        await tx.delete(todos).where(and(eq(todos.userId, userId), inArray(todos.id, deletes)));
      }
    });

    res.json({ ok: true });
  })
);

// POST /api/todos - create one (client-generated id).
todosRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = pick<NewTodoRow>(req.body, TODO_FIELDS);
    if (!data.id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const row = {
      ...data,
      userId: req.userId!,
      createdAt: data.createdAt ?? Date.now(),
    } as NewTodoRow;
    stampCompletion(row as { status?: string | null; completedAt?: number | null });
    // One parent lookup serves the visibility, archive and Planner-visibility
    // backstops below.
    const parent = await parentRow(req.userId!, row.parentId);
    enforceVisibility(row as Record<string, unknown>, parent);
    enforceSchedule(row as Record<string, unknown>);
    // A todo created inside an archived parent is archived with it, rather than
    // becoming a live child of an archived row (see shared/domain/todoArchive) -
    // and one created inside a Planner-hidden parent is hidden with it, rather
    // than becoming an orphan at the root of the Planner tree.
    enforceArchive(row as Record<string, unknown>, parent);
    enforcePlannerVisibility(row as Record<string, unknown>, parent);
    const [inserted] = await db.insert(todos).values(row).returning();
    res.status(201).json(inserted);
  })
);

// PATCH /api/todos/:id - partial update.
todosRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.userId!;
    const patch = pick<Partial<NewTodoRow>>(req.body, TODO_UPDATE_FIELDS);
    // Status stamping and the visibility/schedule/archive backstops all need the existing row.
    if ('status' in patch || touchesVisibility(patch) || touchesSchedule(patch) || touchesArchive(patch) || touchesPlannerVisibility(patch)) {
      const [existing] = await db
        .select()
        .from(todos)
        .where(and(eq(todos.userId, userId), eq(todos.id, id)));
      if ('status' in patch) {
        stampCompletion(
          patch as { status?: string | null; completedAt?: number | null },
          existing?.completedAt
        );
      }
      // The three parent-aware backstops share one lookup of the row's INTENDED
      // parent (the patch's, when it re-parents; otherwise the current one).
      const intended = existing ? ({ ...existing, ...patch } as Record<string, unknown>) : undefined;
      const parent =
        intended &&
        (touchesVisibility(patch) || touchesArchive(patch) || touchesPlannerVisibility(patch))
          ? await parentRow(userId, intended.parentId)
          : undefined;
      if (intended && touchesVisibility(patch)) {
        const merged = enforceVisibility({ ...intended }, parent);
        if (merged.showInDatabase === true && patch.showInDatabase !== true) {
          patch.showInDatabase = true;
        }
      }
      if (existing && touchesSchedule(patch)) {
        enforceSchedulePatch(patch as Record<string, unknown>, existing as Record<string, unknown>);
      }
      // Re-parenting under an archived todo, or un-archiving a row whose parent is
      // still archived, both have to fold `archived: true` back into the patch.
      if (existing && intended && touchesArchive(patch)) {
        const merged = { ...intended };
        enforceArchive(merged, parent);
        if (merged.archived !== ((patch as Record<string, unknown>).archived ?? existing.archived)) {
          (patch as Record<string, unknown>).archived = merged.archived;
        }
      }
      // Same shape for Planner visibility: re-parenting under a hidden todo, or
      // showing a row whose parent is still hidden, fold `showInDatabase: false`
      // back into the patch. The DOWNWARD direction (hiding a parent hides its
      // subtree) can't be done from a single-row patch and is the batch route's
      // job - which is where the client sends it from.
      if (existing && intended && touchesPlannerVisibility(patch)) {
        const rec = patch as Record<string, unknown>;
        // Re-read the merged row: enforceVisibility above may have folded a
        // promotion into the patch, and this rule gets the last word on it.
        const merged = { ...intended, ...patch } as Record<string, unknown>;
        enforcePlannerVisibility(merged, parent);
        if (merged.showInDatabase !== (rec.showInDatabase ?? existing.showInDatabase)) {
          rec.showInDatabase = merged.showInDatabase;
        }
      }
    }
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: 'no updatable fields' });
      return;
    }
    const [updated] = await db
      .update(todos)
      .set(patch)
      .where(and(eq(todos.userId, userId), eq(todos.id, id)))
      .returning();
    if (!updated) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.json(updated);
  })
);

// DELETE /api/todos/:id - hard delete (FK cascade removes the subtree).
todosRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const [deleted] = await db
      .delete(todos)
      .where(and(eq(todos.userId, req.userId!), eq(todos.id, req.params.id)))
      .returning({ id: todos.id });
    if (!deleted) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.status(204).end();
  })
);
