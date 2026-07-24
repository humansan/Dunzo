import React from 'react';
import { Plus, X } from 'lucide-react';
import { ColDef, ColKey, SortRule } from '@/features/planner/types';
import { btnGhost } from '@/theme/buttons';
import { PopoverMenu } from '@/common/ui';
import { ListSelect } from '@/common/ui';
import { SetForAllButton } from '@/features/planner/toolbar/SetForAllButton';

export const SortMenu: React.FC<{
  anchor: { right: number; top: number };
  sorts: SortRule[];
  allColumns: ColDef[];
  onChange: (sorts: SortRule[]) => void;
  onSetForAll?: () => void;
  onClose: () => void;
}> = ({ anchor, sorts, allColumns, onChange, onSetForAll, onClose }) => {
  const addSort = () => {
    const defaultField = allColumns[0]?.key ?? 'title';
    onChange([
      ...sorts,
      { id: Date.now().toString(36), field: defaultField, direction: 'asc' },
    ]);
  };

  const update = (id: string, patch: Partial<SortRule>) =>
    onChange(sorts.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const remove = (id: string) => onChange(sorts.filter((s) => s.id !== id));

  return (
    <PopoverMenu
      anchor={anchor}
      title="Sort"
      onClose={onClose}
      className="min-w-76 p-2 space-y-2.5"
      headerAction={onSetForAll && <SetForAllButton onConfirm={onSetForAll} what="sort rules" />}
    >
        {sorts.length === 0 ? (
          <p className="px-2 py-2.5 text-[13px] text-fg-ghost text-center">No sort applied</p>
        ) : (
          <div className="space-y-1.5 mb-1 px-0.5">
            {sorts.map((s) => (
              <div key={s.id} className="flex items-center gap-1.5">
                {/* Field */}
                <ListSelect
                  ariaLabel="Sort field"
                  className="flex-1 min-w-0"
                  value={s.field}
                  onChange={(v) => update(s.id, { field: v as ColKey })}
                  options={allColumns.map((c) => ({ value: c.key, label: c.label }))}
                />

                {/* Direction */}
                <ListSelect
                  ariaLabel="Sort direction"
                  className="w-30 shrink-0"
                  value={s.direction}
                  onChange={(v) => update(s.id, { direction: v as 'asc' | 'desc' })}
                  options={[
                    { value: 'asc', label: 'Ascending' },
                    { value: 'desc', label: 'Descending' },
                  ]}
                />

                {/* Remove */}
                <button
                  type="button"
                  onClick={() => remove(s.id)}
                  title="Remove sort"
                  className={`shrink-0 p-0.5 rounded  transition-colors ${btnGhost()}`}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={addSort}
          className={`flex items-center gap-1.5 w-full px-2 py-1.5 mt-2.5 rounded-md text-[13px] ${btnGhost()}`}
        >
          <Plus size={13} />
          Add sort
        </button>
    </PopoverMenu>
  );
};
