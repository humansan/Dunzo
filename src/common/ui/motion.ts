// Shared easing curves. Exponential ease-out: snappy start, soft landing.
// Used by the XP bar, the tracker cards and the active-todo tracker; it lived in
// XpProgressBar.tsx, which made two unrelated features import the XP feature just
// to get a cubic-bezier.
export const EXPO_OUT: [number, number, number, number] = [0.15, 0, 0, 1];

interface JitterOptions {
  // Peak offset in px, before the envelope scales it down.
  amplitude?: number;
  // How many discrete jolts. This is the texture knob: fewer reads chunkier and
  // heavier, more reads buzzier. 16 over 0.4s is ~25ms (1.5 frames) per jolt.
  steps?: number;
  // Envelope exponent - 1 is a linear fade, 2 a quadratic ease-out. Higher decays
  // the shake away faster and front-loads the violence.
  decay?: number;
  // Peak rotation jitter in degrees. Small values add a lot; 0 disables it.
  rotate?: number;
}

export interface JitterKeyframes {
  x: number[];
  y: number[];
  rotate: number[];
  times: number[];
}

// Random-offset shake keyframes with an eased falloff, for impact hits.
//
// Three things make this read as a shake rather than a wobble:
//   - consecutive steps alternate sign per axis. Unconstrained Math.random()
//     offsets drift, which feels like floating; the flip is what sells "jitter",
//     while the magnitude stays random so it isn't a metronome.
//   - the (1 - t)^decay envelope does the easing, so the shake dies out instead
//     of stopping dead.
//   - feed the result with `ease: 'linear'`. Each step should land as a hard
//     jolt; interpolating between random offsets smooths the jitter back out.
//
// Starts and ends at rest. Generate once per fire (useMemo) - regenerating
// mid-animation restarts it.
export function jitterKeyframes({
  amplitude = 40,
  steps = 8,
  decay = 6,
  rotate = 0.6,
}: JitterOptions = {}): JitterKeyframes {
  const x: number[] = [0];
  const y: number[] = [0];
  const r: number[] = [0];
  const times: number[] = [0];

  // Random magnitude in [0.4, 1] so no jolt is so small it reads as a pause.
  const mag = () => 0.4 + Math.random() * 0.6;

  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const envelope = (1 - t) ** decay;
    const flip = i % 2 === 0 ? 1 : -1;
    x.push(flip * mag() * amplitude * envelope);
    y.push(-flip * mag() * amplitude * envelope);
    r.push(flip * mag() * rotate * envelope);
    times.push(t);
  }

  x.push(0);
  y.push(0);
  r.push(0);
  times.push(1);

  return { x, y, rotate: r, times };
}
