import React from 'react';
import { Plus, X } from 'lucide-react';
import { ColDef, ColKey, SortRule } from './types';
import { PopoverMenu } from './PopoverMenu';
import { ListSelect } from './ListSelect';

export const SortMenu: React.FC<{
  anchor: { right: number; top: number };
  sorts: SortRule[];
  allColumns: ColDef[];
  onChange: (sorts: SortRule[]) => void;
  onClose: () => void;
}> = ({ anchor, sorts, allColumns, onChange, onClose }) => {
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
    <PopoverMenu anchor={anchor} title="Sort" onClose={onClose} className="w-[300px] p-2">
        {sorts.length === 0 ? (
          <p className="px-2 py-2.5 text-[13px] text-white/30 text-center">No sort applied</p>
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
                  className="w-[110px] shrink-0"
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
                  className="shrink-0 p-0.5 rounded text-white/35 hover:text-white hover:bg-white/10 transition-colors"
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
          className="flex items-center gap-1.5 w-full px-2 py-1.5 mt-0.5 rounded-md text-[13px] text-white/45 hover:text-white hover:bg-white/[0.06] transition-colors"
        >
          <Plus size={13} />
          Add sort
        </button>
    </PopoverMenu>
  );
};
