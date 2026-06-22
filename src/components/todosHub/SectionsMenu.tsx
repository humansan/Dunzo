import React from 'react';
import { COLUMNS } from './types';
import { SectionsConfig } from './types';
import { PopoverMenu } from './PopoverMenu';
import { ListSelect } from './ListSelect';

// Minimal inline toggle switch (no external dep).
const Toggle: React.FC<{ value: boolean; onChange: (v: boolean) => void }> = ({ value, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={value}
    onClick={() => onChange(!value)}
    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
      value ? 'bg-[var(--accent2)]' : 'bg-white/15'
    }`}
  >
    <span
      className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
        value ? 'translate-x-[18px]' : 'translate-x-[3px]'
      }`}
    />
  </button>
);

// Three-way segmented control for showLeafTasks.
const Segment: React.FC<{
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}> = ({ options, value, onChange }) => (
  <div className="flex gap-0.5 rounded-lg bg-white/[0.06] p-0.5">
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        onClick={() => onChange(o.value)}
        className={`flex-1 px-2 py-0.5 rounded-md text-[12px] font-medium transition-colors ${
          value === o.value ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/70'
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

const labelCls = 'text-[13px] text-white/65';
const rowCls = 'flex items-center justify-between gap-4';
const sectionCls = 'space-y-3 pb-3 border-b border-white/8 last:border-0 last:pb-0';

export const SectionsMenu: React.FC<{
  anchor: { right: number; top: number };
  config: SectionsConfig;
  onChange: (config: SectionsConfig) => void;
  onClose: () => void;
}> = ({ anchor, config, onChange, onClose }) => {
  const set = <K extends keyof SectionsConfig>(key: K, val: SectionsConfig[K]) =>
    onChange({ ...config, [key]: val });

  return (
    <PopoverMenu
      anchor={anchor}
      title="Sections"
      onClose={onClose}
      className="w-[280px] p-3 space-y-3"
      headerClassName="px-0.5 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-white/30"
    >
        <div className={sectionCls}>
          {/* Auto-archive */}
          <div className={rowCls}>
            <span className={labelCls}>Auto-archive completed</span>
            <Toggle value={config.autoArchive} onChange={(v) => set('autoArchive', v)} />
          </div>

          {/* Hide empty collections */}
          <div className={rowCls}>
            <span className={labelCls}>Hide empty sections</span>
            <Toggle value={config.hideEmptyCollections} onChange={(v) => set('hideEmptyCollections', v)} />
          </div>
        </div>

        <div className={sectionCls}>
          {/* Show leaf tasks */}
          <div className="space-y-1.5">
            <span className={labelCls}>Show ungrouped tasks</span>
            <Segment
              options={[
                { value: 'top', label: 'Top' },
                { value: 'none', label: 'Mixed' },
                { value: 'bottom', label: 'Bottom' },
              ]}
              value={config.showLeafTasks}
              onChange={(v) => set('showLeafTasks', v as SectionsConfig['showLeafTasks'])}
            />
          </div>
        </div>

        <div className={sectionCls}>
          {/* Group by */}
          <div className="space-y-1.5">
            <span className={labelCls}>Group by</span>
            <ListSelect
              ariaLabel="Group by"
              className="w-full"
              value={config.groupBy}
              onChange={(v) => set('groupBy', v as SectionsConfig['groupBy'])}
              options={(['collection', 'status', 'priority', 'date'] as const).map((key) => {
                const col = COLUMNS.find((c) => c.key === key)!;
                return {
                  value: key,
                  label: key === 'collection' ? 'Collection (default)' : col.label,
                };
              })}
            />
          </div>

          {/* Section order — only meaningful for attribute groupings. Collections
              keep their own manual (drag) ordering, so this is hidden there. */}
          {config.groupBy !== 'collection' && (
            <div className="space-y-1.5 mt-3">
              <span className={labelCls}>Section order</span>
              <Segment
                options={[
                  { value: 'asc', label: 'Ascending' },
                  { value: 'desc', label: 'Descending' },
                ]}
                value={config.groupSortDirection}
                onChange={(v) => set('groupSortDirection', v as SectionsConfig['groupSortDirection'])}
              />
            </div>
          )}
        </div>
    </PopoverMenu>
  );
};
