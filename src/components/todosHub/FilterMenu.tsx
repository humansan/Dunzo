import React from 'react';
import { Plus, X } from 'lucide-react';
import { ColDef, ColKey, FilterRule, FilterCondition, FILTER_CONDITIONS } from './types';
import { PopoverMenu } from './PopoverMenu';
import { ListSelect } from './ListSelect';

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
                  <ListSelect
                    ariaLabel="Filter field"
                    className="w-[110px] shrink-0"
                    value={f.field}
                    onChange={(v) => update(f.id, { field: v as ColKey })}
                    options={allColumns.map((c) => ({ value: c.key, label: c.label }))}
                  />

                  {/* Condition */}
                  <ListSelect
                    ariaLabel="Filter condition"
                    className="w-[118px] shrink-0"
                    value={f.condition}
                    onChange={(v) => update(f.id, { condition: v as FilterCondition })}
                    options={FILTER_CONDITIONS.map((c) => ({ value: c.value, label: c.label }))}
                  />

                  {/* Value — dropdown of unique existing values for the field */}
                  <ListSelect
                    ariaLabel="Filter value"
                    className="flex-1 min-w-0"
                    value={f.value}
                    onChange={(v) => update(f.id, { value: v })}
                    options={[{ value: '', label: '—' }, ...vals.map((v) => ({ value: v, label: v }))]}
                  />

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
