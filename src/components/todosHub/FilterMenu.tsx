import React from 'react';
import { Plus, X } from 'lucide-react';
import { ColDef, ColKey, FilterRule, FilterCondition, FILTER_CONDITIONS } from './types';
import { PopoverMenu } from './PopoverMenu';
import { selectCls } from './constants';

export const FilterMenu: React.FC<{
  anchor: { right: number; top: number };
  filters: FilterRule[];
  allColumns: ColDef[];
  uniqueValues: Map<ColKey, string[]>;
  onChange: (filters: FilterRule[]) => void;
  onClose: () => void;
}> = ({ anchor, filters, allColumns, uniqueValues, onChange, onClose }) => {
  const addFilter = () => {
    const defaultField = allColumns[0]?.key ?? 'status';
    onChange([
      ...filters,
      { id: Date.now().toString(36), field: defaultField, condition: 'is', value: '' },
    ]);
  };

  const update = (id: string, patch: Partial<FilterRule>) => {
    onChange(
      filters.map((f) => {
        if (f.id !== id) return f;
        const next = { ...f, ...patch };
        // Reset value when the field changes — old value won't be in the new list
        if (patch.field && patch.field !== f.field) next.value = '';
        return next;
      })
    );
  };

  const remove = (id: string) => onChange(filters.filter((f) => f.id !== id));

  return (
    <PopoverMenu anchor={anchor} title="Filters" onClose={onClose} className="w-[440px] p-2">
        {filters.length === 0 ? (
          <p className="px-2 py-2.5 text-[13px] text-white/30 text-center">No filters applied</p>
        ) : (
          <div className="space-y-1.5 mb-1 px-0.5">
            {filters.map((f) => {
              const vals = uniqueValues.get(f.field) ?? [];
              return (
                <div key={f.id} className="flex items-center gap-1.5">
                  {/* Field */}
                  <select
                    value={f.field}
                    onChange={(e) => update(f.id, { field: e.target.value as ColKey })}
                    className={`${selectCls} w-[110px] shrink-0`}
                  >
                    {allColumns.map((c) => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>

                  {/* Condition */}
                  <select
                    value={f.condition}
                    onChange={(e) => update(f.id, { condition: e.target.value as FilterCondition })}
                    className={`${selectCls} w-[118px] shrink-0`}
                  >
                    {FILTER_CONDITIONS.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>

                  {/* Value — dropdown of unique existing values for the field */}
                  <select
                    value={f.value}
                    onChange={(e) => update(f.id, { value: e.target.value })}
                    className={`${selectCls} flex-1 min-w-0`}
                  >
                    <option value="">—</option>
                    {vals.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>

                  {/* Remove */}
                  <button
                    type="button"
                    onClick={() => remove(f.id)}
                    title="Remove filter"
                    className="shrink-0 p-0.5 rounded text-white/35 hover:text-white hover:bg-white/10 transition-colors"
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
          className="flex items-center gap-1.5 w-full px-2 py-1.5 mt-0.5 rounded-md text-[13px] text-white/45 hover:text-white hover:bg-white/[0.06] transition-colors"
        >
          <Plus size={13} />
          Add filter
        </button>
    </PopoverMenu>
  );
};
