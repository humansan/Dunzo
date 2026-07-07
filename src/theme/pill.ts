// Unified tinted-pill/chip recipe (replaces the several ad-hoc ones that used to
// live in todoFields.tsx and todosHub/constants.ts). A pill is a hue rendered as a
// faint tint of the surface plus the hue as (foreground-biased) text. It's legible
// on both light and dark themes because:
//   • the background is the hue over `transparent`, so the surface shows through and
//     the tint reads correctly whatever the surface is;
//   • the text mixes the hue toward --color-fg (white in dark, near-black in light).
// Accepts any CSS color string: a stored hex (e.g. a collection color) OR a role var
// like `var(--color-status-active)`. Because it's color-mix-based it never does hex
// string concatenation (`${c}70`), which breaks on var() colors.

export const pillBg = (color: string) => `color-mix(in srgb, ${color} 25%, transparent)`;
export const pillText = (color: string) => `color-mix(in srgb, ${color} 30%, var(--color-fg))`;
export const pillBorder = (color: string) => `color-mix(in srgb, ${color} 35%, transparent)`;

// Background + text for a tinted chip. Spread into a `style` prop.
export const pill = (color: string): { backgroundColor: string; color: string } => ({
  backgroundColor: pillBg(color),
  color: pillText(color),
});
