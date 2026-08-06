import React from 'react';
import { Archive } from 'lucide-react';
import { COLUMNS } from '@/features/planner/types';
import { SectionsConfig } from '@/features/planner/types';
import { PopoverMenu } from '@/common/ui';
import { ListSelect } from '@/common/ui';
import { Switch } from '@/common/ui';
import { SetForAllButton } from '@/features/planner/toolbar/SetForAllButton';
import { btnNeutral } from '@/theme/buttons';


// Three-way segmented control for showLeafTasks.
const Segment: React.FC<{
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}> = ({ options, value, onChange }) => (
  <div className="flex gap-0.5 rounded-lg bg-fill-subtle p-0.5">
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        onClick={() => onChange(o.value)}
        className={`flex-1 px-2 py-0.5 rounded-md text-[12px] font-medium transition-colors ${
          value === o.value ? 'bg-fill-strong text-fg' : 'text-fg-faint hover:text-fg-muted'
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

const labelCls = 'text-[13px] text-fg-muted';
const rowCls = 'flex items-center justify-between gap-4';
const sectionCls = 'space-y-3 pb-3 border-b border-line-subtle last:border-0 last:pb-0';

export const SectionsMenu: React.FC<{
  anchor: { right: number; top: number };
  config: SectionsConfig;
  onChange: (config: SectionsConfig) => void;
  // How many completed tasks the view is currently showing (see
  // useArchiveCompleted), and why there are none when that is 0.
  completedCount: number;
  disabledReason?: string;
  onArchiveCompleted: () => void;
  onSetForAll?: () => void;
  onClose: () => void;
}> = ({ anchor, config, onChange, completedCount, disabledReason, onArchiveCompleted, onSetForAll, onClose }) => {
  const set = <K extends keyof SectionsConfig>(key: K, val: SectionsConfig[K]) =>
    onChange({ ...config, [key]: val });

  return (
    <PopoverMenu
      anchor={anchor}
      title="Settings"
      onClose={onClose}
      className="w-[280px] p-3 space-y-2"
      headerClassName="pb-1 text-xs font-bold text-fg"
      headerAction={onSetForAll && <SetForAllButton onConfirm={onSetForAll} what="section settings" />}
    >
        <div className={sectionCls}>
          
          {/* Hide empty collections */}
          <div className={rowCls}>
            <span className={labelCls}>Hide empty sections</span>
            <Switch checked={config.hideEmptyCollections} onChange={(v) => set('hideEmptyCollections', v)} />
          </div>

          {/* Hide sub-collections - flatten to leaf tasks only */}
          <div className={rowCls}>
            <span className={labelCls}>Hide subcollections</span>
            <Switch checked={config.hideSubcollections} onChange={(v) => set('hideSubcollections', v)} />
          </div>

          {/* Archive completed tasks - the one ACTION among the toggles. Scoped to
              what the view is showing, hence "in view" in the label: the count next
              to it moves as the settings above (and the Filter menu) change. */}
          <div className={rowCls}>
            <span className={labelCls}>Archive completed tasks in view</span>
            <button
              type="button"
              onClick={onArchiveCompleted}
              disabled={!completedCount}
              title={
                disabledReason ??
                `Archive the ${completedCount} completed ${
                  completedCount === 1 ? 'task' : 'tasks'
                } shown in this view.`
              }
              className={`shrink-0 flex items-center gap-1.5 rounded-lg pl-2 pr-1.75 h-6.5 text-xs font-semibold disabled:cursor-not-allowed font-mono  ${btnNeutral}`}
            >
              {completedCount}
              <Archive size={13} />
            </button>
          </div>
        </div>




        {/* <div className={sectionCls}>
          { Show leaf tasks (comment this out)}
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
        </div> */}

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

          {/* Section order - only meaningful for attribute groupings. Collections
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
