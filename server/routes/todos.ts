import { Router } from 'express';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { todos, type NewTodoRow } from '../../src/db/schema';
import {
  asyncHandler,
  enforceVisibility,
  pick,
  stampCompletion,
  touchesVisibility,
  TODO_FIELDS,
  TODO_UPDATE_FIELDS,
} from '../http';

export const todosRouter = Router();

// GET /api/todos — all of the user's todos (client groups by workspace/date).
todosRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await db.select().from(todos).where(eq(todos.userId, req.userId!));
    res.json(rows);
  })
);

// POST /api/todos/batch — transactional apply of { upserts, patches, deletes }.
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
        // merged truth — enforce the invariant on it and mirror any fix to setData.
        enforceVisibility(insertRow as Record<string, unknown>);

        const setData = pick<Partial<NewTodoRow>>(u, TODO_UPDATE_FIELDS);
        stampCompletion(setData as { status?: string | null; completedAt?: number | null });
        // enforceVisibility only ever promotes to the Planner; mirror that fix so a
        // conflicting (existing) row gets rescued too, without clobbering setData.
        if (insertRow.showInDatabase === true && setData.showInDatabase !== true) {
          setData.showInDatabase = true;
        }

        // `where` on the conflict update prevents hijacking a row owned by
        // another user (PK `id` is global; only own rows get updated).
        if (Object.keys(setData).length > 0) {
          await tx
            .insert(todos)
            .values(insertRow)
            .onConflictDoUpdate({ target: todos.id, set: setData, where: eq(todos.userId, userId) });
        } else {
          await tx.insert(todos).values(insertRow).onConflictDoNothing();
        }
      }

      for (const p of patches) {
        const id = (p as { id?: unknown })?.id;
        if (typeof id !== 'string') continue;
        const patch = pick<Partial<NewTodoRow>>(p, TODO_UPDATE_FIELDS);
        // Status stamping and the visibility backstop both need the existing row.
        if ('status' in patch || touchesVisibility(patch)) {
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
            const merged = enforceVisibility({ ...existing, ...patch });
            if (merged.showInDatabase === true && patch.showInDatabase !== true) {
              patch.showInDatabase = true;
            }
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

// POST /api/todos — create one (client-generated id).
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
    enforceVisibility(row as Record<string, unknown>);
    const [inserted] = await db.insert(todos).values(row).returning();
    res.status(201).json(inserted);
  })
);

// PATCH /api/todos/:id — partial update.
todosRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.userId!;
    const patch = pick<Partial<NewTodoRow>>(req.body, TODO_UPDATE_FIELDS);
    // Status stamping and the visibility backstop both need the existing row.
    if ('status' in patch || touchesVisibility(patch)) {
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
      if (existing && touchesVisibility(patch)) {
        const merged = enforceVisibility({ ...existing, ...patch });
        if (merged.showInDatabase === true && patch.showInDatabase !== true) {
          patch.showInDatabase = true;
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

// DELETE /api/todos/:id — hard delete (FK cascade removes the subtree).
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
