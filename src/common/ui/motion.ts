// Shared easing curves. Exponential ease-out: snappy start, soft landing.
// Used by the XP bar, the tracker cards and the active-todo tracker; it lived in
// XpProgressBar.tsx, which made two unrelated features import the XP feature just
// to get a cubic-bezier.
export const EXPO_OUT: [number, number, number, number] = [0.15, 0, 0, 1];
