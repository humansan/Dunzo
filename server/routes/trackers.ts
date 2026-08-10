import { Router } from 'express';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { trackers, type NewTrackerRow } from '../../shared/db/schema';
import { asyncHandler, pick, TRACKER_FIELDS, TRACKER_UPDATE_FIELDS } from '../http';

export const trackersRouter = Router();

// GET /api/trackers - in the user's manual order. A null sortOrder (a row that
// predates the ordering column) sorts last on ASC, by age.
trackersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await db
      .select()
      .from(trackers)
      .where(eq(trackers.userId, req.userId!))
      .orderBy(trackers.sortOrder, trackers.createdAt);
    res.json(rows);
  })
);

// POST /api/trackers/reorder - set the whole list's order in one shot: sortOrder
// becomes each id's index in `ids`. Renumbering everything (rather than assigning a
// midpoint to the one row that moved) keeps the scale from drifting, and the list is
// only ever a handful of widgets. Declared before '/:id' so it isn't read as an id.
trackersRouter.post(
  '/reorder',
  asyncHandler(async (req, res) => {
    const raw: unknown = req.body?.ids;
    const ids = (Array.isArray(raw) ? raw : []).filter((id): id is string => typeof id === 'string');
    if (ids.length === 0) {
      res.status(400).json({ error: 'ids is required' });
      return;
    }
    // Scoped to rows the caller owns: an id from another user matches nothing here,
    // so it can neither be renumbered nor reveal that it exists.
    const owned = await db
      .select({ id: trackers.id })
      .from(trackers)
      .where(and(eq(trackers.userId, req.userId!), inArray(trackers.id, ids)));
    const ownedIds = new Set(owned.map((r) => r.id));

    await db.transaction(async (tx) => {
      let position = 0;
      for (const id of ids) {
        if (!ownedIds.has(id)) continue;
        await tx
          .update(trackers)
          .set({ sortOrder: position++ })
          .where(and(eq(trackers.userId, req.userId!), eq(trackers.id, id)));
      }
    });
    res.status(204).end();
  })
);

// POST /api/trackers - create (client-generated id).
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
