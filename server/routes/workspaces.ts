import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { workspaces, type NewWorkspaceRow } from '../../src/db/schema';
import { asyncHandler, pick, WORKSPACE_FIELDS, WORKSPACE_UPDATE_FIELDS } from '../http';

export const workspacesRouter = Router();

// GET /api/workspaces
workspacesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await db.select().from(workspaces).where(eq(workspaces.userId, req.userId!));
    res.json(rows);
  })
);

// POST /api/workspaces — create (client-generated id).
workspacesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = pick<NewWorkspaceRow>(req.body, WORKSPACE_FIELDS);
    if (!data.id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const row = {
      ...data,
      userId: req.userId!,
      name: data.name ?? '',
      createdAt: data.createdAt ?? Date.now(),
    } as NewWorkspaceRow;
    const [inserted] = await db.insert(workspaces).values(row).returning();
    res.status(201).json(inserted);
  })
);

// PATCH /api/workspaces/:id — rename.
workspacesRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const patch = pick<Partial<NewWorkspaceRow>>(req.body, WORKSPACE_UPDATE_FIELDS);
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: 'no updatable fields' });
      return;
    }
    const [updated] = await db
      .update(workspaces)
      .set(patch)
      .where(and(eq(workspaces.userId, req.userId!), eq(workspaces.id, req.params.id)))
      .returning();
    if (!updated) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.json(updated);
  })
);

// DELETE /api/workspaces/:id — FK cascade deletes its todos.
workspacesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const [deleted] = await db
      .delete(workspaces)
      .where(and(eq(workspaces.userId, req.userId!), eq(workspaces.id, req.params.id)))
      .returning({ id: workspaces.id });
    if (!deleted) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.status(204).end();
  })
);
