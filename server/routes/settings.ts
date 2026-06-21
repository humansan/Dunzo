import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { userSettings, type NewUserSettingsRow } from '../../src/db/schema';
import { asyncHandler, pick, SETTINGS_FIELDS } from '../http';

export const settingsRouter = Router();

// GET /api/settings — the user's settings row, or {} if none yet.
settingsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const [row] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, req.userId!));
    res.json(row ?? {});
  })
);

// PUT /api/settings — upsert (insert-or-merge) the user's prefs + hub blobs.
settingsRouter.put(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const data = pick<Partial<NewUserSettingsRow>>(req.body, SETTINGS_FIELDS);
    const now = Date.now();
    const [row] = await db
      .insert(userSettings)
      .values({ ...data, userId, updatedAt: now } as NewUserSettingsRow)
      .onConflictDoUpdate({ target: userSettings.userId, set: { ...data, updatedAt: now } })
      .returning();
    res.json(row);
  })
);
