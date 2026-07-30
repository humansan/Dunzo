import React from 'react';
import type { Chip } from '../../content/features.data';

/** The skimmer's payload: three or four spec chips under the body copy. */
export const ChipRow: React.FC<{ chips: Chip[] }> = ({ chips }) => (
  <ul className="mt-7 flex flex-wrap gap-2">
    {chips.map(({ icon: Icon, label }) => (
      <li
        key={label}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line-subtle bg-fill-subtle px-2.5 py-1 text-xs font-semibold text-fg-faint"
      >
        <Icon className="w-3 h-3 text-gold" />
        <span>{label}</span>
      </li>
    ))}
  </ul>
);
