# Dunzo

A full-stack productivity and task-management web app — a Notion-style task planner, a per-day checklist, live time-progress trackers, and XP/streak gamification, backed by a multi-user cloud database.

Dunzo started life as a single-user localStorage prototype and was migrated, in phases, into a multi-tenant application with a typed backend, real authentication, and per-user data scoping — without losing any data.

> **Stack:** React 19 · TypeScript · Vite · Tailwind CSS v4 · TanStack Query · Express · Drizzle ORM · Neon Postgres · Neon Auth (JWT)

---

## Table of contents

- [Dunzo](#dunzo)
  - [Table of contents](#table-of-contents)
  - [Features](#features)
  - [Screens / views](#screens--views)
  - [Architecture](#architecture)
  - [Data model](#data-model)
  - [Tech stack](#tech-stack)
  - [Getting started](#getting-started)
    - [Prerequisites](#prerequisites)
    - [Install](#install)
    - [Configure](#configure)
    - [Set up the database](#set-up-the-database)
    - [Run](#run)
  - [Environment variables](#environment-variables)
  - [Scripts](#scripts)
  - [API reference](#api-reference)
  - [Project structure](#project-structure)

---

## Features

- **Notion-style Task Planner** — a spreadsheet/table of planned tasks with configurable columns (status, priority, urgency, dates, estimated time, XP, notes, collection), inline cell editing, resizable columns, saved views, and filtering/sorting.
- **Unlimited task nesting** — subtasks nest to any depth via a self-referential tree, with cascade delete/archive of descendants.
- **Custom drag-and-drop** — a hand-built HTML5 drag-and-drop engine (not a library) that supports **reorder**, **reparent (nest)**, and **attribute-based regrouping**. Dropping a task into a status/priority/date group reassigns that attribute; dropping it onto another task nests it. Includes edge auto-scroll and precise drop indicators.
- **Collections & Workspaces** — group tasks into nestable collections (positional membership via the nearest collection ancestor), and scope the planner into independent workspaces (separate task databases).
- **Group by anything** — group the planner by collection, status, priority, or relative date buckets (Today / Tomorrow / Next 7 Days / …), with fully interactive drag-and-drop in every mode.
- **Daily checklist** — a focused per-day to-do list, independent of the planner. A task can live in the planner only, the daily list only, or both.
- **Calendar view** — tasks placed on a calendar by due date and time.
- **Time-progress trackers** — live widgets that show how much of a day / week / month / year (or a custom date range) has elapsed or remains, with configurable precision and display modes. Includes a stopwatch with a fullscreen mode.
- **XP & gamification** — tasks grant XP on completion; the app computes tiered, progressive daily goals (beat yesterday → beat your 7-day best → beat your all-time best), a 0–3 **star** rating per day, and a **streak** counter derived purely from history.
- **Stats dashboard** — charts (Recharts) of XP over time, broken down by collection.
- **Theming** — customizable accent colors and week-start preference, synced across devices.
- **Multi-user & cloud-synced** — every change persists to Postgres, scoped to the signed-in user, and syncs across devices.
- **Optimistic UI** — interactions apply instantly and reconcile with the server, with automatic rollback on failure.
- **Account backup** — export your entire account to a JSON file and re-import it (merge-by-id, no destructive deletes).

## Screens / views

| View | Description |
| --- | --- |
| **Daily** | Per-day checklist of tasks due that day. |
| **Task Planner** (`hub`) | The Notion-style table: nesting, collections, grouping, saved views. |
| **Calendar** | Month/week calendar with tasks placed by due date/time. |
| **Trackers** | Grid of time-progress widgets and the stopwatch. |
| **Stats** | XP charts and breakdowns over time. |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  React 19 SPA (Vite)                                         │
│  • TanStack Query — caching, optimistic mutations, rollback  │
│  • Neon Auth client — session + Bearer token                 │
│  • src/data/* — typed query/mutation hooks (the API seam)    │
└───────────────┬─────────────────────────────────────────────┘
                │  fetch /api/*  (Authorization: Bearer <JWT>)
                ▼
┌─────────────────────────────────────────────────────────────┐
│  Express API (server/)                                       │
│  • requireAuth — verifies the Neon Auth JWT against JWKS     │
│    and sets req.userId; every route is scoped by user_id     │
│  • routes/{todos,workspaces,trackers,settings}              │
│  • transactional batch endpoint for reorder/nest/promote     │
└───────────────┬─────────────────────────────────────────────┘
                │  Drizzle ORM
                ▼
┌─────────────────────────────────────────────────────────────┐
│  Neon Postgres                                              │
│  tables: workspaces · todos · trackers · user_settings      │
└─────────────────────────────────────────────────────────────┘
```

- **Auth.** The frontend signs in via Neon Auth and attaches a fresh session JWT as a `Bearer` token on every request (`src/data/apiClient.ts`). The backend (`server/auth.ts`) verifies the token against the auth server's JWKS endpoint and enforces `issuer`/`audience`, then stamps `req.userId`. Every data route requires auth and is filtered by `user_id`, so users can never read or write each other's rows — even the batch upsert guards against cross-user primary-key hijacking.
- **Server owns invariants.** Completion timestamps (`completedAt`) are stamped server-side from `status`; `completed` is a generated Postgres column. A visibility backstop guarantees every task stays reachable on at least one surface (planner or daily list).
- **Optimistic data layer.** `src/data/` wraps the API in TanStack Query hooks. Mutations apply optimistically with a shared snapshot → apply → rollback → invalidate helper, so the UI feels instant and self-heals on error.
- **One app, two runtimes.** `server/app.ts` exports a `listen`-less Express app used both by the local dev server (`server/index.ts`) and as a serverless function in production.

## Data model

The core entity is the `Todo` (see [`src/types.ts`](src/types.ts) and [`src/db/schema.ts`](src/db/schema.ts)). A few design notes:

- **Flat list, derived days.** Todos are stored as a flat array; each task owns its scheduled day via `dueDate`. Day-grouped views (daily list, calendar, stats) are derived in memory — there are no per-day buckets in storage.
- **Two visibility flags.** `showInDatabase` controls Task Planner visibility; `showInDailyList` (+ a `dueDate`) controls the daily checklist. They're independent, so a task can appear in one, the other, or both.
- **Self-referential tree.** `parentId` enables unlimited nesting. An `isCollection` node is a folder-like grouping header; a task's collection is its nearest collection ancestor.
- **Status is the source of truth for completion.** `status` (`todo` / `in_progress` / `completed`) drives the derived `completed` column; there is no separate boolean to drift.
- **Per-surface ordering.** `hubOrder` orders tasks in the planner; `dailyOrder` orders them within a single day.

Tables: `workspaces`, `todos`, `trackers`, `user_settings` (one row per user; core prefs as columns, hub layout/view state as JSONB blobs).

## Tech stack

**Frontend:** React 19, TypeScript, Vite 6, Tailwind CSS v4, TanStack Query, Recharts, Motion, lucide-react, date-fns.

**Backend:** Express, Drizzle ORM, `@neondatabase/serverless`, `jose` (JWT/JWKS verification).

**Database:** Neon (serverless Postgres).

**Auth:** Neon Auth.

## Getting started

### Prerequisites

- Node.js 18+
- A [Neon](https://neon.tech) Postgres database and Neon Auth project

### Install

```bash
npm install
```

### Configure

Create a `.env` file in the project root (see [Environment variables](#environment-variables)).

### Set up the database

```bash
npm run db:push      # push the Drizzle schema to your Neon database
# or, to use generated SQL migrations:
npm run db:generate
npm run db:migrate
```

### Run

```bash
npm run dev
```

This starts the Vite frontend (port **3000**) and the Express API (port **8787**) together via `concurrently`. Vite proxies `/api` to the backend, so everything is same-origin in dev. Open http://localhost:3000.

## Environment variables

Create `.env` in the project root.

**Client (must be `VITE_`-prefixed, exposed to the browser):**

| Variable | Description |
| --- | --- |
| `VITE_NEON_AUTH_URL` | Neon Auth base URL (used by the auth client). |

**Server (never sent to the browser):**

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | Neon Postgres connection string (used by Drizzle + the runtime pool). |
| `NEON_AUTH_URL` | Same value as `VITE_NEON_AUTH_URL`; used server-side for JWKS verification. |

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Run frontend + backend together (web on 3000, API on 8787). |
| `npm run dev:web` | Vite dev server only. |
| `npm run dev:server` | Express API only (`tsx watch`). |
| `npm run build` | Production build of the frontend. |
| `npm run preview` | Preview the production build. |
| `npm run lint` | Type-check with `tsc --noEmit`. |
| `npm run db:generate` | Generate Drizzle SQL migrations from the schema. |
| `npm run db:migrate` | Apply migrations. |
| `npm run db:push` | Push the schema directly to the database. |
| `npm run db:studio` | Open Drizzle Studio. |

## API reference

All routes are under `/api` and (except health) require a `Bearer` JWT; every query is scoped to the authenticated `user_id`.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness check (no auth). |
| `GET` | `/api/me` | Returns the authenticated `userId`. |
| `GET` | `/api/todos` | All of the user's todos. |
| `POST` | `/api/todos` | Create a todo (client-generated id). |
| `PATCH` | `/api/todos/:id` | Partial update. |
| `DELETE` | `/api/todos/:id` | Hard delete (FK cascade removes the subtree). |
| `POST` | `/api/todos/batch` | Transactional `{ upserts, patches, deletes }` — used for reorder, nesting, and collection promote. |
| `GET/POST/PATCH/DELETE` | `/api/workspaces[/:id]` | Workspace CRUD. |
| `GET/POST/PATCH/DELETE` | `/api/trackers[/:id]` | Tracker CRUD. |
| `GET` | `/api/settings` | The user's settings row. |
| `PUT` | `/api/settings` | Upsert settings (per-field merge; safe for partial patches). |

## Project structure

```
src/
  App.tsx               # Top-level shell, view switching, data-handler wiring
  types.ts              # Core domain types (Todo, Tracker, Workspace, …)
  auth.ts               # Neon Auth client
  components/           # Views and UI (Sidebar, TodoView, CalendarView, StatsView, …)
    todosHub/           # Task Planner: rows, grouping, DnD hooks, view config
  data/                 # TanStack Query hooks + optimistic mutations (the API seam)
  db/schema.ts          # Drizzle schema (shared with the server)
  utils/                # todoFilters, todoStatus, xpUtils, timeUtils
server/
  app.ts                # Express app (no listen — shared by dev + serverless)
  index.ts              # Local dev entry point
  auth.ts               # JWT/JWKS verification, requireAuth
  db.ts                 # Drizzle runtime (Neon serverless pool)
  http.ts               # Shared helpers (asyncHandler, pick, stampCompletion, …)
  routes/               # todos, workspaces, trackers, settings
```