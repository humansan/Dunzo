import React from 'react';
import type { Spec } from '../../content/features.data';

/** Term/definition rows — the researcher's payload, inside the details accordion. */
export const SpecList: React.FC<{ specs: Spec[] }> = ({ specs }) => (
  <dl className="divide-y divide-line-subtle">
    {specs.map((spec) => (
      <div
        key={spec.term}
        className="py-3 sm:grid sm:grid-cols-3 sm:gap-6 first:pt-0 last:pb-0"
      >
        <dt className="text-sm font-semibold text-fg">{spec.term}</dt>
        <dd className="mt-1 sm:mt-0 sm:col-span-2 text-sm text-fg-muted leading-relaxed">
          {spec.def}
        </dd>
      </div>
    ))}
  </dl>
);
