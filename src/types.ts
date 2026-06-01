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
  accent1: string; // Primary accent (e.g. #e9ec6a)
  accent2: string; // Secondary accent (e.g. #a2beb7)
}

export interface Todo {
  id: string;
  text: string;       // Todo name
  completed: boolean;
  percentageGoal?: number; // e.g. 50
  startTime?: string; // HH:MM format for calendar start
  endTime?: string;   // HH:MM format for calendar end
  tags?: string[];    // Category/project labels (e.g. ['work', 'errands'])
  notes?: string;     // Freeform notes text
  xp?: number;        // Points granted on completion (XP system TBD)
  createdAt: number;
  trackingStartedAt?: number; // Timestamp when tracking started
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
