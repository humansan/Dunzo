import { format } from 'date-fns';
import type { Todo, Tracker } from '@shared/types';
import { newId } from '@/common/lib/newId';

// ── First-run seeding ────────────────────────────────────────────────────────
// A brand-new account otherwise lands on a completely empty app - no tasks, no
// widgets, nothing to react to. These seeds give it something to show AND double
// as onboarding: the two time widgets demonstrate what a tracker is and that the
// primary/secondary readouts are configurable, and the seeded Planner collections
// below walk through the app one checkable task at a time - all without any tour UI.
//
// Seeded exactly once, from the same first-run branch that creates the "Personal"
// workspace (see app-data.tsx). That branch only fires when the account has NO
// workspace at all, so deleting these widgets later never brings them back.

// The color the Add Tracker modal starts on, so a seeded widget is indistinguishable
// from one the user creates by hand and immediately accepts.
const SEED_COLOR1 = '#ffe32e';
const SEED_COLOR2 = '#2effa4';
const SEED_PRECISION = 2;

export function buildSeedTrackers(): Tracker[] {
  const createdAt = Date.now();
  return [
    {
      id: newId(),
      name: 'Day',
      type: 'day',
      color: SEED_COLOR1,
      precision: SEED_PRECISION,
      displayMode: 'time_remaining',
      secondaryDisplayMode: 'percent_elapsed',
      // The seeds share a createdAt, so their order is stated outright rather than
      // left to a tie-break (the user can drag them afterwards).
      sortOrder: 0,
      createdAt,
    },
    {
      id: newId(),
      name: 'Year',
      type: 'year',
      color: SEED_COLOR2,
      precision: SEED_PRECISION,
      displayMode: 'percent_elapsed',
      secondaryDisplayMode: 'time_remaining',
      sortOrder: 1,
      createdAt,
    },
  ];
}

// ── Onboarding tasks ─────────────────────────────────────────────────────────
// The seeded Planner content, transcribed from `docs/seo and onboarding/onboarding
// tasks new.md` - that file is the source of truth for the copy, this is its
// executable form. Keep the two in step when either changes.
//
// It is one tree: "Getting Started" holds the intro tasks and nests the other two
// collections, so the final task ("Delete the Getting Started collection when
// you're done!") retires the whole tour in a single action - a delete cascades to
// the subtree.

// Collection pill colors, as theme slot ids (see theme/collectionColor.ts), so the
// three collections read as distinct sections under any theme.
const BLUE = 'collection-7';
const GREEN = 'collection-5';
const PURPLE = 'collection-8';

// Notes bodies live up here rather than inline: they are multi-paragraph prose, and
// joining paragraphs is how the blank line between them stays out of the source
// indentation. The Notes field renders them as plain text.
const paras = (...p: string[]) => p.join('\n\n');

const NOTE_FULL_VIEW = paras(
  "On the right, see a task's status, priority, start date and time, due date and time, and XP.",
  "Tasks can be set to move forward if overdue. Whenever the due date for a task passes, it will be automatically changed to the present day and show up in today's daily tasks list until it's completed or disabled.",
  'Tasks are organized by collections (see bottom), and can be under a parent task.'
);

const NOTE_COLLECTIONS =
  'Right click on a collection to show options or edit it. Drag & drop them in the Planner sidebar or main table to reorder or nest collections.';

const NOTE_PLANNER_VIEW = paras(
  'See the top right planner toolbar for options.',
  'View menu lets you choose whether to group your tasks by collection, status, priority, or date. You can also archive all the completed tasks and hide empty collections.',
  'Change what columns you want planner to show in the Fields menu. Reorder columns, and enable/disable word wrap.',
  "Don't forget to check out the Filter menu and Sort menu!",
  'Planner view settings are saved separately for each collection or tab. To apply view settings to all tabs and make it the default for new collections, click "Set for all" on a menu.'
);

const NOTE_XP = paras(
  "Earning XP each day earns you stars. Earning 3 stars a day pushes your streak. Keep your streak up to build consistency and make progress! Here's how it works:",
  [
    '- When putting a task in your daily list, assign it XP based on the amount of effort you estimate it taking. Completing that task earns you that much XP for the day.',
    '- Completing any 1 task earns you a star.',
    '- Reaching your 7 day average or 30 day average - whichever is higher - earns you a star.',
    "- Reaching yesterday's XP earned earns you a star.",
    "- Earning 2 stars for a day will hold your streak. Your streak won't break, but it won't increase either.",
    '- Earning 3 stars increases your streak! Keep your streak up to show your progress!',
  ].join('\n')
);

const NOTE_ARCHIVE_DELETE = paras(
  'Archiving a task hides it from all Planner views and Task Finder, but keeps all XP and data.',
  'Deleting a task is permanent and cannot be undone. It clears all associated XP.'
);

// A node in the seed tree. Only the fields the content actually sets; everything
// else (the visibility flags, status, ordering) is filled in by buildSeedTodos, so
// the tree below stays readable as the list of tasks it is.
interface SeedNode {
  text: string;
  notes?: string;
  xp?: number;
  autoMoveDate?: boolean;
  dueToday?: boolean; // due on the signup day, so it opens on the first daily list
  isCollection?: true;
  color?: string; // collection slot id; only read when isCollection
  children?: SeedNode[];
}

const ONBOARDING: SeedNode[] = [
  {
    text: 'Getting Started',
    isCollection: true,
    color: BLUE,
    children: [
      { text: 'Welcome to dunzo! Check this off to complete your first task 🎯' },
      { text: 'Open me to see full view 📝', notes: NOTE_FULL_VIEW },
      {
        text: 'Break a big task into smaller ones 🌿',
        children: [
          { text: 'Drag & drop to reorder or nest tasks 🌴' },
          { text: 'Right click a task or collection to show more options ⚙️' },
        ],
      },
      { text: 'Right click on a task or collection to show options ⚙️' },
      { text: 'Collections categorize tasks, and can also be nested 🧺', notes: NOTE_COLLECTIONS },
      { text: 'Try customizing planner view (see notes) 🗃️', notes: NOTE_PLANNER_VIEW },
      {
        text: 'Daily List and Calendar',
        isCollection: true,
        color: GREEN,
        // Every task in here demonstrates the daily list, so each one carries
        // auto-move: dated and left unchecked, it rolls forward to today instead
        // of going stale in the past where the tour can't reach it. They are also
        // dated to the signup day, so the daily list has something on it the first
        // time the user opens it - all except the first, whose whole point is that
        // the user dates it themselves.
        children: [
          { text: 'Make this due today, open the Calendar tab, then drag & drop it onto the grid 📆', autoMoveDate: true },
          { text: 'Your daily list is where you focus on the day 🔭', autoMoveDate: true, dueToday: true },
          { text: 'Finish tasks with XP to earn stars (see notes) ✨', xp: 3, notes: NOTE_XP, autoMoveDate: true, dueToday: true },
          { text: 'Visit the widgets tab to add and edit time widgets. 🕰️', autoMoveDate: true, dueToday: true },
        ],
      },
      {
        text: 'Next Steps',
        isCollection: true,
        color: PURPLE,
        children: [
          { text: 'On archiving and deleting‼️', notes: NOTE_ARCHIVE_DELETE },
          { text: 'Press Ctrl/Cmd + K to bring up Task Finder. 🔍' },
          { text: 'Use the stopwatch and pomodoro timer to focus on work. ⏳' },
          { text: "Delete the Getting Started collection when you're done! ▶️" },
        ],
      },
    ],
  },
];

// Flatten the tree into rows for the todos batch endpoint.
//
// Order matters twice over: `parent_id` is a foreign key and the batch applies its
// upserts in array order, so a parent has to be written before its children; and
// the Planner sorts siblings by `hubOrder`, which is handed out here in document
// order so the tour reads top-to-bottom as written. Both fall out of one
// depth-first walk.
//
// Tasks are visible on both surfaces, exactly like a task created by hand in the
// Planner (see addHubTodo). Most are UNDATED, so they stay in the Planner until the
// user gives them a date; the `dueToday` ones are dated to the LOCAL signup day, so
// the first daily list isn't empty. Those also carry auto-move, which is what keeps
// them on the current day if the user doesn't come back until later (see the sweep
// in app-data.tsx - it only moves tasks whose date is strictly in the past, so
// today's are left alone).
export function buildSeedTodos(workspaceId: string): Todo[] {
  // Shared, like the widget seed's: these really were all created at once, and
  // every row states its order outright rather than leaning on a createdAt tie-break.
  const createdAt = Date.now();
  const today = format(new Date(), 'yyyy-MM-dd');
  const out: Todo[] = [];
  let hubOrder = 1;
  // The daily list has its own order, on its own scale (an index, not epoch ms), so
  // a dated task without one sorts by createdAt and sinks below every ordered task.
  // Handed out here in the same document order as hubOrder.
  let dailyOrder = 0;

  const walk = (nodes: SeedNode[], parentId: string | null) => {
    for (const node of nodes) {
      const id = newId();
      const base = { id, text: node.text, parentId, workspaceId, hubOrder: hubOrder++, createdAt };
      out.push(
        node.isCollection
          ? // Collections are database-only folders - no daily flag, no task fields.
            { ...base, isCollection: true, color: node.color, showInDatabase: true }
          : {
              ...base,
              status: 'todo',
              showInDatabase: true,
              showInDailyList: true,
              ...(node.notes ? { notes: node.notes } : {}),
              ...(node.xp !== undefined ? { xp: node.xp } : {}),
              ...(node.autoMoveDate ? { autoMoveDate: true } : {}),
              ...(node.dueToday ? { dueDate: today, dailyOrder: dailyOrder++ } : {}),
            }
      );
      if (node.children) walk(node.children, id);
    }
  };
  walk(ONBOARDING, null);
  return out;
}

// ── No seeded view config ────────────────────────────────────────────────────
// There used to be one, writing the planner's default record so completed tasks
// were hidden out of the box. That is a CODE default now (resolveViewFilters:
// `hideCompleted` is on unless something turns it off), because a seeded one only
// held for accounts where the write actually happened: not for accounts created
// before the setting existed, not for a second workspace (the seed only ever
// wrote the first one's record), and not if the signup-time settings PUT failed.
// Defaults belong in the resolver, where every view goes through them.
