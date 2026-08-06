/**
 * All Features-page copy lives here, separate from layout.
 *
 * Every claim is grounded in `dunzo features markdown/Dunzo 3a3f11e9….md`, which is the
 * authoritative description of the app. Do not add a capability to this file that the doc
 * doesn't state — and if the app changes, this file changes with it.
 */
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  CalendarDays,
  CalendarRange,
  Circle,
  Clock,
  Cloud,
  Columns3,
  Command,
  Download,
  Eye,
  Filter,
  Flag,
  Flame,
  Gauge,
  GripVertical,
  KeyRound,
  Keyboard,
  Layers,
  Maximize2,
  MousePointer2,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Star,
  SunMoon,
  Table2,
  Timer,
  Type,
} from 'lucide-react';

export type Spec = { term: string; def: string };
export type SpecGroup = { title: string; specs: Spec[] };
export type Chip = { icon: LucideIcon; label: string };

/** Left rail: order must match DOM order of the sections on the page. */
export const RAIL = [
  { id: 'tasks', label: 'Tasks' },
  { id: 'daily-lists', label: 'Daily list' },
  { id: 'planner', label: 'Planner' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'xp-streaks', label: 'XP & streaks' },
  { id: 'time-widgets', label: 'Focus' },
  { id: 'search', label: 'Search' },
  { id: 'extras', label: 'Extras' },
] as const;

/* ------------------------------------------------------------------ 1. Tasks */

export const TASKS = {
  id: 'tasks',
  eyebrow: 'Tasks',
  heading: 'One task, many fields',
  body:
    'A task is a title and a checkbox until you need more from it. Then it’s a start date, a due time, a priority, an XP value, a collection, a parent, and notes as long as you like — all in one window you can link straight to.',
  chips: [
    { icon: Circle, label: 'Status' },
    { icon: Flag, label: 'Priority' },
    { icon: Clock, label: 'Start & due' },
    { icon: Sparkles, label: 'XP 1–10' },
  ] as Chip[],
  details: [
    {
      title: 'All the fields',
      specs: [
        {
          term: 'Status',
          def: 'Todo, In Progress, or Completed — or cleared. Checking the circle sets Completed; new tasks start as Todo.',
        },
        { term: 'Priority', def: 'Low, Medium, High, or none. None by default.' },
        {
          term: 'Start & due dates',
          def: 'Each takes a date, and once dated, a time. No date means the time chip is grayed out.',
        },
        {
          term: 'Move forward if overdue',
          def: 'Per task: an overdue task rolls its due date to today and keeps appearing in the daily list until it’s done.',
        },
        { term: 'XP', def: '1 to 10, or none. New tasks are 3 XP — change that default in settings.' },
        { term: 'Notes', def: 'Free text, as long as you want.' },
        {
          term: 'Collection',
          def: 'Folders for tasks, nestable. Give a task a parent and it inherits the parent’s collection.',
        },
        {
          term: 'Parent task',
          def: 'Any task can be a subtask of any other. The picker is the same search as Ctrl+K.',
        },
        {
          term: 'Show in',
          def: 'Two switches — Task Planner and Daily Tasks — controlling which pages a task appears on. Both on by default.',
        },
        {
          term: 'Archive',
          def: 'Pulls it out of the planner views and out of search, and takes its subtasks with it. Not a delete.',
        },
        { term: 'Dates you can type', def: '07/12/26, july 12, or july 14, 2026.' },
        {
          term: 'Times you can type',
          def: '3p, 2:45 am, 9:21 — or a percentage of the day, where 33% is 8 AM.',
        },
      ],
    },
  ] as SpecGroup[],
};

/* ------------------------------------------------------------ 2. Daily lists */

export const DAILY = {
  id: 'daily-lists',
  eyebrow: 'Daily list',
  heading: 'Conquer the day',
  headingGold: 'the day',
  body:
    'One day, one list, nothing else competing for the space. Time trackers count down the left, a live one-day calendar runs down the right, and your XP for the day sits at the bottom.',
  chips: [
    { icon: CalendarDays, label: 'Week strip' },
    { icon: Plus, label: 'Quick-add panel' },
    { icon: GripVertical, label: 'Drag to reorder' },
    { icon: Columns3, label: 'Live day calendar' },
  ] as Chip[],
  details: [
    {
      title: 'Working the day',
      specs: [
        {
          term: 'Move between days',
          def: 'Week strip to pick a day, ‹ and › for previous and next week, Today to jump back, and a month picker for anything further out. First day of the week is your choice.',
        },
        {
          term: 'Add a todo',
          def: 'Opens a quick-edit panel on a new untitled task: title, notes, due date and time, XP, status, priority, collection, parent. Clicking an existing task opens the same panel to edit it.',
        },
        {
          term: 'Right-click a row',
          def: 'The same actions as the quick-edit chips: set date, set time, set parent, open in full view, delete.',
        },
        {
          term: 'Hover a row',
          def: 'Grab handle to drag-reorder, maximize to open full view, … for the context menu, delete on the right.',
        },
        {
          term: 'Check it off',
          def: 'Click the circle. The row grays out and its status becomes Completed.',
        },
        {
          term: 'The one-day calendar',
          def: 'A one-day slice of the main calendar. Tasks created here get the daily-list defaults, and every task is colored by its collection.',
        },
        {
          term: 'Archived tasks still show here',
          def: 'As long as the Daily Tasks flag is on. Archiving changes where a task sits in the planner and hides it from search, not from your day.',
        },
      ],
    },
  ] as SpecGroup[],
};

/* ---------------------------------------------------------------- 3. Planner */

export const PLANNER = {
  id: 'planner',
  eyebrow: 'Task planner',
  heading: 'The whole plan, in a table.',
  body:
    'The planner is where work gets shaped: nested tasks inside nested collections, in a table you configure per view. Give a planner task a due date and it shows up in that day’s list — same task, two places.',
  chips: [
    { icon: Table2, label: 'Table & list views' },
    { icon: Layers, label: 'Nested collections' },
    { icon: Filter, label: 'Filters & sort' },
    { icon: Columns3, label: 'Pick your columns' },
  ] as Chip[],
  details: [
    {
      title: 'Views and configuration',
      specs: [
        {
          term: 'Built-in views',
          def: 'All Planner Tasks, Archived, Also In Daily List, Uncategorized, Categorized — plus every collection you make. Table mode by default, or List mode to strip it back to names. Timeline is in the works, not available yet.',
        },
        {
          term: 'Group by',
          def: 'Collections (the default, nested and indented), or Status, Priority, or Due Date, each ascending or descending. Grouping follows the parent-most task that has a value, so a subtree stays together.',
        },
        {
          term: 'Sections',
          def: 'Hide empty sections, hide subcollections, and where ungrouped tasks go — top by default. Plus one-click archiving of every completed task the view is showing, so filters decide exactly what gets cleared.',
        },
        {
          term: 'Fields',
          def: 'Choose which columns show, drag to reorder them, and toggle word wrap per column. Includes Start % and End % — the time as a percentage of the day elapsed.',
        },
        {
          term: 'Filter',
          def: 'Stack filters, each one and/or + field + condition (is, is not, contains, greater than, less than) + a value picked from what’s actually in the table.',
        },
        {
          term: 'Sort',
          def: 'Applied within a section; section order comes from the Sections menu.',
        },
        {
          term: 'Saved per view',
          def: 'Every view remembers its own sections, fields, filter, and sort.',
        },
        {
          term: 'Collections',
          def: 'Nest them, drag to reorder in the sidebar, right-click to edit, add a task or subcollection inside, recolor from 8 colors, archive, or delete. Archiving a collection or a parent task archives the whole subtree.',
        },
        {
          term: 'Edit in place',
          def: 'Click any cell for a popover editor; click a name or a collection header chip to rename inline. Created and completed timestamps are read-only.',
        },
      ],
    },
  ] as SpecGroup[],
};

/* --------------------------------------------------------------- 4. Calendar */

export const CALENDAR = {
  id: 'calendar',
  eyebrow: 'Calendar',
  heading: 'Drag it onto the day.',
  body:
    'The same tasks, on a grid. Drag out a block to create one, drag its edges to change how long it takes, drag the card itself to move it. Overlaps fan out into lanes instead of hiding each other.',
  chips: [
    { icon: CalendarRange, label: '1, 3, 5 or 7 days' },
    { icon: MousePointer2, label: 'Drag to create' },
    { icon: Eye, label: 'Per-collection visibility' },
  ] as Chip[],
  details: [
    {
      title: 'On the grid',
      specs: [
        {
          term: 'Create and edit',
          def: 'Click and drag empty space to create an untitled task and open it in full view. Click an existing card to open it. Drag the top or bottom edge to change its times; drag the card to change time or day.',
        },
        {
          term: 'Range',
          def: 'Show 1, 3, 5, or 7 days, jump to today, or step forward and back a set at a time.',
        },
        {
          term: 'Overlaps',
          def: 'Overlapping tasks get their own indent lanes; hovering brings a card to the front.',
        },
        {
          term: 'What shows',
          def: 'Toggle daily tasks, planner tasks, uncategorized tasks, and archived tasks. Archived is off by default here; the rest are on.',
        },
        {
          term: 'Collections',
          def: 'Click a collection in the sidebar to show or hide its tasks, with hide-all and show-all in the corner. Toggling a collection with subcollections asks whether to include them. New collections start visible.',
        },
      ],
    },
  ] as SpecGroup[],
};

/* ------------------------------------------------------------- 5. XP the rest */

export const XP = {
  id: 'xp-streaks',
  eyebrow: 'XP & streaks',
  heading: 'Momentum you can see.',
  body:
    'Every task is worth XP, and the day’s target is simply yesterday. Beat it and the bar turns gold. Beat your best week and it turns violet. Two stars holds your streak; three grows it.',
  chips: [
    { icon: Sparkles, label: 'XP per task' },
    { icon: Star, label: '3 stars a day' },
    { icon: Flame, label: 'Streaks' },
    { icon: BarChart3, label: 'Stats & CSV export' },
  ] as Chip[],
  details: [
    {
      title: 'How the numbers work',
      specs: [
        {
          term: 'XP bar',
          def: 'Completing a task earns its XP. The bar fills toward the day’s first target: match or beat yesterday’s XP. Hit it and the section turns gold; beat your 7-day best and it turns violet.',
        },
        {
          term: 'The label follows you up',
          def: 'First “_ to beat yesterday”, then “Ahead of yesterday — _ to 7 day best”, then “_ to all time best”.',
        },
        {
          term: 'Three stars',
          def: 'One for completing any task, one for matching or beating yesterday, one for matching or beating your 7/30-day average. Zero-XP days don’t count.',
        },
        { term: 'Streaks', def: 'Two stars holds your streak. Three stars grows it.' },
        {
          term: 'Stats page',
          def: 'Current streak, best streak, best day, total XP, XP for the week, month and year against the previous period, an XP history chart, and a 30-day breakdown by collection.',
        },
        { term: 'The log', def: 'Every task worth more than 0 XP, exportable as CSV.' },
        {
          term: 'Only daily-list tasks count',
          def: 'A task that lives only in the planner earns no XP.',
        },
      ],
    },
  ] as SpecGroup[],
};

/* ------------------------------------------------- 6. Time widgets and focus */

export const FOCUS = {
  id: 'time-widgets',
  eyebrow: 'Time widgets & focus',
  heading: 'Time you can feel.',
  body:
    'Widgets that show how much of the day, the week, or the project is actually left — and a focus tool with a stopwatch, a timer, and a full Pomodoro that keeps running through a page reload.',
  chips: [
    { icon: Gauge, label: 'Day / week / month / year' },
    { icon: Timer, label: 'Timer & Pomodoro' },
    { icon: Maximize2, label: 'Fullscreen focus' },
    { icon: Keyboard, label: 'Space / R / Esc' },
  ] as Chip[],
  details: [
    {
      title: 'Widgets',
      specs: [
        {
          term: 'Interval',
          def: 'Day, week, month, and year repeat automatically. Custom doesn’t: it fills to 100% and stays there.',
        },
        {
          term: 'Values',
          def: 'Pick what the big number shows and what the small line above it shows. Time left and time elapsed rescale themselves: days above 24 hours, hours and minutes under that, minutes and seconds under an hour.',
        },
        { term: 'Color', def: 'Per widget; the title, bar, and primary value all take it.' },
        {
          term: 'Where they live',
          def: 'A dedicated page with list, grid, and fullscreen modes, and the same widgets as a list down the left of the daily page. Hover any card to edit or delete it.',
        },
      ],
    },
    {
      title: 'Focus: stopwatch, timer, Pomodoro',
      specs: [
        {
          term: 'Two presentations',
          def: 'A card that floats over the app while you work, or fullscreen. The card shows just the clock, a progress bar, start/pause, and reset; everything configurable lives in fullscreen.',
        },
        { term: 'Stopwatch', def: 'Counts up from zero.' },
        {
          term: 'Timer',
          def: 'Presets at 5, 10, 15, 30 and 60 minutes, or type your own: 25, 90m, 1h30, 1:30, 1:30:00, 90 minutes. At zero it doesn’t stop — it flips to an accent color and counts up into overtime, so a long session tells you by how much. +5 min extends a running countdown.',
        },
        {
          term: 'Pomodoro',
          def: 'Focus, short break and long break, jumpable at any time; a manual jump resets that block and leaves it paused so nothing starts behind your back. Cycle dots track the set. Skip advances and counts the current block. Reset restarts the block; press it again on a full block to clear the set.',
        },
        {
          term: 'Pomodoro config',
          def: 'Block lengths, how many focus blocks make a set, and independent auto-start for breaks and for the next focus block. Breaks auto-start; the next focus block doesn’t, so restarting work stays a choice.',
        },
        {
          term: 'It keeps running',
          def: 'Refresh mid-session and it resumes at the right time. The tab title shows a live countdown, and an optional notification fires when a block ends while the app is in the background.',
        },
        {
          term: 'Backgrounds & keys',
          def: 'Set your own background image, dim and blur it. Space starts and pauses, R resets, Esc leaves fullscreen.',
        },
      ],
    },
  ] as SpecGroup[],
};

/* ----------------------------------------------------------- 7. Task finder */

export const FINDER = {
  id: 'search',
  eyebrow: 'Task finder',
  heading: 'Every task, one keystroke away.',
  body:
    'Ctrl+K from anywhere. It’s a fuzzy search — the VS Code kind — across names, notes, collections, and fields, not just titles. It’s also the picker you use to set a parent task.',
  chips: [
    { icon: Command, label: 'Ctrl+K / Cmd+K' },
    { icon: Search, label: 'Fuzzy matching' },
    { icon: Table2, label: 'List or table mode' },
  ] as Chip[],
};

/* -------------------------------------------------------------- 8. Extras */

export type Extra = {
  icon: LucideIcon;
  title: string;
  body: string;
  shots?: { src: string; alt: string }[];
};

export const EXTRAS: Extra[] = [
  {
    icon: SunMoon,
    title: 'Light and dark',
    body:
      'Switch in settings.',
    shots: [
      { src: '/media/s20_dark.png', alt: 'Dunzo in dark mode' },
      { src: '/media/s20_light.png', alt: 'Dunzo in light mode' },
    ],
  },
  {
    icon: Settings2,
    title: 'Settings that set defaults',
    body:
      'First day of the week, default XP for new tasks, whether new tasks show in the planner, the daily list, or both, and whether they auto-move when overdue.',
    shots: [{ src: '/media/s18.png', alt: 'The Dunzo settings modal' }],
  },
  {
    icon: Cloud,
    title: 'Synced to your account',
    body:
      'Sign in and your tasks, collections, and per-view configuration follow you.',
  },
  {
    icon: Download,
    title: 'Your data, exportable',
    body:
      'Export everything to JSON for backup and import it back. Plus CSV export of the XP log.',
  },
  {
    icon: Type,
    title: 'Inputs that read English',
    body:
      'Date and time fields take july 14, 2026, 3p, 9:21, or 33% of the day. Every picker in the app, same parser.',
    shots: [{ src: '/media/s19b.png', alt: 'The Dunzo time picker parsing typed input' }],
  },
  {
    icon: KeyRound,
    title: 'Sign in and go',
    body: 'Email and password, and a password you can reset from settings.',
    shots: [{ src: '/media/s21.png', alt: 'The Dunzo sign-in screen' }],
  },
];

/* ------------------------------------------------------------- 9. The limits */

export const LIMITS = [
  'Cloud-synced, so it needs an account — there’s no offline mode.',
  'Built for desktop.',
  'One light theme and one dark theme.',
  'Timeline view is in the works, not shipped.',
];
