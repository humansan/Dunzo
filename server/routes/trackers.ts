import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { trackers, type NewTrackerRow } from '../../src/db/schema';
import { asyncHandler, pick, TRACKER_FIELDS, TRACKER_UPDATE_FIELDS } from '../http';

export const trackersRouter = Router();

// GET /api/trackers
trackersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await db.select().from(trackers).where(eq(trackers.userId, req.userId!));
    res.json(rows);
  })
);

// POST /api/trackers — create (client-generated id).
trackersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = pick<NewTrackerRow>(req.body, TRACKER_FIELDS);
    if (!data.id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const row = {
      ...data,
      userId: req.userId!,
      createdAt: data.createdAt ?? Date.now(),
    } as NewTrackerRow;
    const [inserted] = await db.insert(trackers).values(row).returning();
    res.status(201).json(inserted);
  })
);

// PATCH /api/trackers/:id
trackersRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const patch = pick<Partial<NewTrackerRow>>(req.body, TRACKER_UPDATE_FIELDS);
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: 'no updatable fields' });
      return;
    }
    const [updated] = await db
      .update(trackers)
      .set(patch)
      .where(and(eq(trackers.userId, req.userId!), eq(trackers.id, req.params.id)))
      .returning();
    if (!updated) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.json(updated);
  })
);

// DELETE /api/trackers/:id
trackersRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const [deleted] = await db
      .delete(trackers)
      .where(and(eq(trackers.userId, req.userId!), eq(trackers.id, req.params.id)))
      .returning({ id: trackers.id });
    if (!deleted) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.status(204).end();
  })
);
