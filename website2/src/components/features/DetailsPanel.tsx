import React from 'react';
import { ChevronRight } from 'lucide-react';

/**
 * Native <details>/<summary>. No state, no JS, and keyboard + screen-reader correct for free —
 * which is why this isn't a hand-rolled accordion.
 */
export const DetailsPanel: React.FC<{
  label: string;
  children: React.ReactNode;
}> = ({ label, children }) => (
  <details className="group border-t border-line-subtle">
    <summary className="flex items-center gap-2 py-4 cursor-pointer list-none text-sm font-semibold text-fg-subtle hover:text-fg transition-colors marker:content-none">
      <ChevronRight className="w-4 h-4 transition-transform duration-150 group-open:rotate-90" />
      <span>{label}</span>
    </summary>
    <div className="pb-6">{children}</div>
  </details>
);
