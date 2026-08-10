import React from 'react';
import { Plus, X } from 'lucide-react';
import { ColDef, ColKey, FilterRule, FilterCondition, FilterMatch, FILTER_CONDITIONS } from '@/features/planner/types';
import { btnGhost } from '@/theme/buttons';
import { PopoverMenu } from '@/common/ui';
import { ListSelect } from '@/common/ui';
import { Switch } from '@/common/ui';
import { newId } from '@/common/lib/newId';
import { SetForAllButton } from '@/features/planner/toolbar/SetForAllButton';

// A rule cell that can't be edited: same shape and rhythm as the ListSelects
// beside it, minus the affordance. Muted rather than disabled-grey, so the row
// reads as "fixed", not "broken".
const LockedCell: React.FC<{ className?: string; children: React.ReactNode }> = ({
  className = '',
  children,
}) => (
  <span
    className={`shrink-0 flex items-center h-8 px-2.5 rounded-lg border border-line-subtle bg-fill-subtle text-[13px] text-fg-faint truncate ${className}`}
  >
    {children}
  </span>
);

export const FilterMenu: React.FC<{
  anchor: { right: number; top: number };
  filters: FilterRule[];
  // How the rules combine (a single per-view choice, shown as the conjunction cell).
  match: FilterMatch;
  allColumns: ColDef[];
  uniqueValues: Map<ColKey, string[]>;
  onChange: (filters: FilterRule[]) => void;
  onChangeMatch: (match: FilterMatch) => void;
  // The view's "Hide completed tasks" setting. Shown here as a locked rule because
  // that is what it does, but stored as a flag and applied ON TOP of the rules
  // below - never joined into them, or switching Match to Or would quietly let
  // completed tasks back in (see applyFilters).
  hideCompleted: boolean;
  onChangeHideCompleted: (value: boolean) => void;
  onSetForAll?: () => void;
  onClose: () => void;
}> = ({ anchor, filters, match, allColumns, uniqueValues, onChange, onChangeMatch, hideCompleted, onChangeHideCompleted, onSetForAll, onClose }) => {
  const addFilter = () => {
    const defaultField = allColumns[0]?.key ?? 'status';
    // Unique for the same reason as the sort rules (see SortMenu): the id is the row's
    // React key and what `update`/`remove` match on, and `Date.now().toString(36)`
    // collided for two rules added inside one millisecond.
    onChange([
      ...filters,
      { id: newId(), field: defaultField, condition: 'is', value: '' },
    ]);
  };

  const update = (id: string, patch: Partial<FilterRule>) => {
    onChange(
      filters.map((f) => {
        if (f.id !== id) return f;
        const next = { ...f, ...patch };
        // Reset value when the field changes - old value won't be in the new list
        if (patch.field && patch.field !== f.field) next.value = '';
        return next;
      })
    );
  };

  const remove = (id: string) => onChange(filters.filter((f) => f.id !== id));

  return (
    <PopoverMenu
      anchor={anchor}
      title="Filters"
      onClose={onClose}
      className="w-130 p-2 space-y-2"
      headerAction={onSetForAll && <SetForAllButton onConfirm={onSetForAll} what="filters" />}
    >
        {/* The setting, drawn as the rule it stands for. Deliberately ABOVE the
            editable list rather than as its first row: inside the list the user's
            first rule would need an And/Or cell, which would imply this one takes
            part in Match. It doesn't - it always applies. */}
        <div className="px-6.5 pt-0.5">
          <div className="flex items-center gap-1.5 opacity-90">
            <span className="shrink-0 pl-2 pr-1 text-[13px] text-fg-faint">Hide completed tasks</span>
            <Switch checked={hideCompleted} onChange={onChangeHideCompleted} />
            <LockedCell className="flex-1 ml-1 min-w-0">Status is not Completed</LockedCell>
            {/* <LockedCell className="w-20">is not</LockedCell>
            <LockedCell className="flex-1 min-w-0">Completed</LockedCell> */}
            {/* <div className="w-4.5"></div> */}
          </div>
        </div>

        {filters.length === 0 ? (
          <p className="px-2 pt-2.5 pb-1.5 text-[13px] text-fg-ghost text-center">No custom filters applied</p>
        ) : (
          <div className="space-y-1 px-0.5">
            <p className=" pt-1 px-2 text-[13px] text-fg-subtle text-center font-medium">Custom Filters</p>
            {filters.map((f, i) => {
              const vals = uniqueValues.get(f.field) ?? [];
              return (
                <div key={f.id} className="flex items-center gap-1.5">
                  {/* Conjunction: the first row is a static "Where"; every later row picks
                      And/Or. It's one per-view choice, so changing any row flips them all. */}
                  {i === 0 ? (
                    <span className="shrink-0 px-2 text-[13px] text-fg-faint">Where</span>
                  ) : (
                    <ListSelect
                      ariaLabel="Match"
                      className="w-20 shrink-0"
                      value={match}
                      onChange={(v) => onChangeMatch(v as FilterMatch)}
                      options={[
                        { value: 'and', label: 'And' },
                        { value: 'or', label: 'Or' },
                      ]}
                    />
                  )}

                  {/* Field */}
                  <ListSelect
                    ariaLabel="Filter field"
                    className="w-32 shrink-0"
                    value={f.field}
                    onChange={(v) => update(f.id, { field: v as ColKey })}
                    options={allColumns.map((c) => ({ value: c.key, label: c.label }))}
                  />

                  {/* Condition */}
                  <ListSelect
                    ariaLabel="Filter condition"
                    className="w-30 shrink-0"
                    value={f.condition}
                    onChange={(v) => update(f.id, { condition: v as FilterCondition })}
                    options={FILTER_CONDITIONS.map((c) => ({ value: c.value, label: c.label }))}
                  />

                  {/* Value - dropdown of unique existing values for the field */}
                  <ListSelect
                    ariaLabel="Filter value"
                    className="flex-1 min-w-0"
                    value={f.value}
                    onChange={(v) => update(f.id, { value: v })}
                    options={[{ value: '', label: '-' }, ...vals.map((v) => ({ value: v, label: v }))]}
                  />

                  {/* Remove */}
                  <button
                    type="button"
                    onClick={() => remove(f.id)}
                    title="Remove filter"
                    className={`shrink-0 p-0.5 rounded transition-colors ${btnGhost()}`}
                  >
                    <X size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <button
          type="button"
          onClick={addFilter}
          className={`flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-[13px] ${btnGhost()}`}
        >
          <Plus size={13} />
          Add filter
        </button>
    </PopoverMenu>
  );
};
