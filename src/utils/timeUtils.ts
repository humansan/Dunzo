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
import { Tracker, ProgressData } from '../types';

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
      subLabel = `${format(start, 'MMM d')} — ${format(end, 'MMM d')}`;
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
      subLabel = `${format(start, 'MMM d, yyyy')} — ${format(end, 'MMM d, yyyy')}`;
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
  if (hours < 0 || hours >= 24 || minutes < 0 || minutes >= 60) return undefined;
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

export function formatTime12h(time: string): string {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return time;
  let hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  return `${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}
