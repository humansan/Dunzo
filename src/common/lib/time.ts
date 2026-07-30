import { 
  startOfDay, endOfDay, 
  startOfWeek, endOfWeek, 
  startOfMonth, endOfMonth, 
  startOfYear, endOfYear,
  differenceInSeconds,
  format,
  isAfter,
  isBefore
} from 'date-fns';
import { Tracker, ProgressData } from '@shared/types';

export function calculateProgress(tracker: Tracker, now: Date = new Date()): ProgressData {
  let start: Date;
  let end: Date;
  let label = tracker.name;
  let subLabel = '';

  switch (tracker.type) {
    case 'day':
      start = startOfDay(now);
      end = endOfDay(now);
      subLabel = format(now, 'EEEE, MMM do');
      break;
    case 'week':
      start = startOfWeek(now);
      end = endOfWeek(now);
      subLabel = `${format(start, 'MMM d')} - ${format(end, 'MMM d')}`;
      break;
    case 'month':
      start = startOfMonth(now);
      end = endOfMonth(now);
      subLabel = format(now, 'MMMM yyyy');
      break;
    case 'year':
      start = startOfYear(now);
      end = endOfYear(now);
      subLabel = format(now, 'yyyy');
      break;
    case 'custom':
      start = tracker.startDate ? new Date(tracker.startDate) : startOfDay(now);
      end = tracker.endDate ? new Date(tracker.endDate) : endOfDay(now);
      subLabel = `${format(start, 'MMM d, yyyy')} - ${format(end, 'MMM d, yyyy')}`;
      break;
    default:
      start = startOfDay(now);
      end = endOfDay(now);
  }

  const totalSeconds = differenceInSeconds(end, start);
  const elapsedSeconds = differenceInSeconds(now, start);
  
  let percentage = (elapsedSeconds / totalSeconds) * 100;
  percentage = Math.max(0, Math.min(100, percentage));

  const percentRemaining = Math.max(0, Math.min(100, 100 - percentage));

  const remainingSeconds = differenceInSeconds(end, now);
  let timeLeft = '';

  if (remainingSeconds <= 0) {
    timeLeft = 'Completed';
  } else if (remainingSeconds < 60) {
    timeLeft = `${remainingSeconds}s left`;
  } else if (remainingSeconds < (60*60)) {
    const mins = Math.floor(remainingSeconds / 60);
    const secs = remainingSeconds % 60;
    timeLeft = `${mins}m ${secs}s left`;
  } else if (remainingSeconds < (60*60*24)) {
    const hours = Math.floor(remainingSeconds / 3600);
    const mins = Math.floor((remainingSeconds % 3600) / 60);
    // const secs = remainingSeconds % 60;
    timeLeft = `${hours}h ${mins}m left`;
  } else {
    const days = Math.floor(remainingSeconds / 86400);
    timeLeft = `${days}d left`;
  }

  const clampedElapsed = Math.max(0, elapsedSeconds);
  let timeElapsed = '';
  if (clampedElapsed <= 0) {
    timeElapsed = 'Not started';
  } else if (clampedElapsed < 60) {
    timeElapsed = `${clampedElapsed}s elapsed`;
  } else if (clampedElapsed < 3600) {
    const mins = Math.floor(clampedElapsed / 60);
    const secs = clampedElapsed % 60;
    timeElapsed = `${mins}m ${secs}s elapsed`;
  } else if (clampedElapsed < 86400) {
    const hours = Math.floor(clampedElapsed / 3600);
    const mins = Math.floor((clampedElapsed % 3600) / 60);
    const secs = clampedElapsed % 60;
    timeElapsed = `${hours}h ${mins}m elapsed`;
  } else {
    const days = Math.floor(clampedElapsed / 86400);
    timeElapsed = `${days}d elapsed`;
  }

  return {
    percentage,
    percentRemaining,
    timeLeft,
    timeElapsed,
    label,
    subLabel
  };
}

export function getOrdinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function timeToPercentage(time: string): number | undefined {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return undefined;
  const hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  if (hours < 0 || minutes < 0 || minutes >= 60) return undefined;
  // "24:00" resolves to 100% rather than undefined. New writes clamp end-of-day
  // to 23:59 (see minutesToTime), but an older calendar build wrote "24:00" for a
  // block dragged to the bottom of the grid, and returning undefined for those is
  // what made the daily-list time chip silently drop the % on midnight tasks.
  if (hours > 24 || (hours === 24 && minutes > 0)) return undefined;
  return parseFloat(((hours * 60 + minutes) / (24 * 60) * 100).toFixed(2));
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function percentageToTime(percentage: number): string | undefined {
  if (percentage < 0 || percentage > 100) return undefined;
  let totalMinutes = Math.round((percentage / 100) * 24 * 60);
  if (totalMinutes >= 1440) totalMinutes = 1439;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Minutes-from-midnight → "HH:MM", clamped to 23:59.
 *
 * "24:00" is not a representable time here: hours are 0-23 everywhere else in the
 * app, so a stray "24:00" formats as "12:00 PM" and used to yield no percentage
 * at all. The calendar grid runs to minute 1440 (its bottom edge), so a block
 * dragged/resized to end at midnight lands exactly there - this is the boundary
 * that keeps that geometry from leaking into the data. Same clamp percentageToTime
 * already applies for 100%.
 */
export function minutesToTime(mins: number): string {
  const clamped = Math.max(0, Math.min(Math.round(mins), 1439));
  const hours = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

export function formatTime12h(time: string): string {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return time;
  // % 24 so a legacy "24:00" reads as midnight ("12:00 AM") instead of falling
  // into the >= 12 branch below and rendering as "12:00 PM".
  let hours = parseInt(match[1]) % 24;
  const minutes = parseInt(match[2]);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  return `${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}
