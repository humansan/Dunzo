export type TrackerType = 'day' | 'week' | 'month' | 'year' | 'custom';

export type TrackerDisplayMode = 'percent_elapsed' | 'percent_remaining' | 'time_elapsed' | 'time_remaining';
export type TrackerSecondaryDisplayMode = TrackerDisplayMode | 'none';

export interface Tracker {
  id: string;
  name: string;
  type: TrackerType;
  startDate?: string; // ISO string for custom
  endDate?: string;   // ISO string for custom
  color: string;      // Hex color
  precision: number;  // Number of decimal places
  displayMode?: TrackerDisplayMode;
  secondaryDisplayMode?: TrackerSecondaryDisplayMode;
  createdAt: number;
}

export interface Theme {
  accent1: string; // Primary accent (e.g. #c6dabe)
  accent2: string; // Secondary accent (e.g. #c6dabe)
}

export type TodoStatus = 'todo' | 'in_progress' | 'completed';
export type TodoPriority = 'low' | 'medium' | 'high';
export type TodoUrgency = 'low' | 'medium' | 'high';

// A Workspace is an independent database of Task Planner todos + collections.
// Todos are scoped to a workspace via Todo.workspaceId ('personal' is the
// default workspace; todos without an id are treated as belonging to it).
export interface Workspace {
  id: string;
  name: string;
}

export interface Todo {
  id: string;
  text: string;       // Todo name
  status?: TodoStatus;     // Workflow state + completion. Optional/clearable; only
                           // 'completed' counts as done (see isDone in
                           // utils/todoStatus.ts). Rendered as a solid pill.
  priority?: TodoPriority; // Importance (Task Planner). Rendered as a solid pill.
  urgency?: TodoUrgency;   // How soon it needs to be done.
  startDate?: string;      // YYYY-MM-DD start date
  startTime?: string;      // HH:MM format for calendar/start time
  startPercentage?: number; // Derived from startTime (percent of day elapsed)
  dueDate?: string;        // YYYY-MM-DD due date
  dueTime?: string;        // HH:MM format for due time (was endTime)
  duePercentage?: number;  // Derived from dueTime (was percentageGoal)
  estimatedTime?: number;  // Estimated minutes to complete
  countCompletion?: number; // How many times this must be done to count complete (default 1)
  repeatInterval?: number; // Days between repeats (0 = no repeat)
  notes?: string;          // Freeform notes text
  xp?: number;             // Points granted on completion (XP system TBD)
  createdAt: number;       // Timestamp (ms) when todo was created
  completedAt?: number;    // Timestamp (ms) when status was set to 'completed'
  deletedAt?: number;      // Timestamp (ms) when the todo was deleted
  trackingStartedAt?: number; // Timestamp when tracking started
  showInDatabase?: boolean;   // When true, the todo appears in the Task Planner.
  showInDailyList?: boolean;  // When true, the todo appears in the daily checklist
                              // for the date it is filed under. Independent of
                              // showInDatabase — a task can be in the Task Planner
                              // only, daily list only, or both.
  archived?: boolean;         // When true, hidden from the Task Planner (shown in a
                              // future archived view). Distinct from a daily-only
                              // todo (showInDatabase false) — an archived todo is
                              // still a database todo, just put away.
  hubOrder?: number;          // Manual ordering within the Task Planner. The hub
                              // spans many dates, so it needs its own order
                              // independent of per-day position.
  dailyOrder?: number;        // Manual ordering within a single day's daily-list.
                              // Independent of hubOrder (a task has a position in
                              // the Planner and a position within its day).
  parentId?: string | null;   // Task Planner nesting: id of the parent todo, or
                              // null/undefined for a top-level todo. Subtasks can
                              // nest to any depth.
  isCollection?: boolean;     // When true, this node is a Task Planner "collection"
                              // — a top-level section that groups child tasks. It
                              // renders as a colored pill header and ignores the
                              // task fields (date/time/percent/xp/notes).
  color?: string;             // Collection pill color (hex). Only meaningful when
                              // isCollection is true.
  workspaceId?: string;       // Task Planner workspace this todo/collection belongs
                              // to. Undefined is treated as the default 'personal'
                              // workspace. See Workspace above.
}

export interface DayTodos {
  date: string; // ISO date string (YYYY-MM-DD)
  todos: Todo[];
}

export interface ProgressData {
  percentage: number;
  percentRemaining: number;
  timeLeft: string;
  timeElapsed: string;
  label: string;
  subLabel: string;
}
