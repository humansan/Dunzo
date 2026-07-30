import React from 'react';
import { LIMITS } from '../../content/features.data';

/**
 * What Dunzo deliberately isn't. On a conversion page this earns the other claims: the visitor
 * who'd bounce at the sign-up wall bounces here instead of resenting it later.
 */
export const LimitsStrip: React.FC = () => (
  <section className="bg-surface border-y border-line-subtle py-12">
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-fg-subtle">Worth knowing</p>
      <ul className="mt-5 flex flex-wrap justify-center items-center gap-x-3 gap-y-3 text-sm text-fg-muted">
        {LIMITS.map((limit, idx) => (
          <li key={limit} className="flex items-center gap-3">
            {idx > 0 && <span className="text-fg-ghost select-none">·</span>}
            <span>{limit}</span>
          </li>
        ))}
      </ul>
    </div>
  </section>
);
