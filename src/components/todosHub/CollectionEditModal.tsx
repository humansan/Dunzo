import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, ChevronDown, Check } from 'lucide-react';
import { Todo } from '../../types';
import { OrganizerEntry, CollectionOption, collectionPath } from '../../utils/todoFilters';
import { CollectionSearchField } from '../todoFields';
import { modalPop } from '../modalMotion';
import { textInputCls } from './TextInput';
import { COLLECTION_COLORS, DEFAULT_COLLECTION_COLOR, colorName } from './constants';

// ── Collection Edit modal ────────────────────────────────────────────────────
// Rename, recolor, and re-parent a collection. The parent picker reuses the
// table column's CollectionSearchField (search + select), with the collection
// itself and its descendants filtered out so it can't become its own ancestor.
export const CollectionEditModal: React.FC<{
  entry: OrganizerEntry;
  options: CollectionOption[];
  todoById: Map<string, Todo>;
  onCreateCollection: (name: string) => string;
  onSave: (patch: { text: string; color: string; parentId: string | null }) => void;
  onClose: () => void;
}> = ({ entry, options, todoById, onCreateCollection, onSave, onClose }) => {
  const [name, setName] = useState(entry.todo.text || '');
  const [color, setColor] = useState(entry.todo.color || DEFAULT_COLLECTION_COLOR);
  const [parentId, setParentId] = useState<string | null>(entry.todo.parentId ?? null);
  const [colorOpen, setColorOpen] = useState(false);

  // A collection can't be parented to itself or to one of its own descendants.
  const parentOptions = options.filter(
    (o) => o.id !== entry.todo.id && !o.path.some((p) => p.id === entry.todo.id)
  );
  const parentPath = collectionPath(parentId, todoById).map((c) => ({
    id: c.id,
    name: c.text || 'Untitled',
    color: c.color,
  }));

  const labelCls = 'block text-sm font-semibold text-white mb-1.5';

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
      onMouseDown={onClose}
    >
      <motion.div
        {...modalPop}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1c1c1c] shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
          <h2 className="text-base font-bold text-white">Edit</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-white/40 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Name */}
          <div>
            <label className={labelCls}>Name</label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Collection name"
              className={`${textInputCls} w-full`}
            />
          </div>

          {/* Color */}
          <div>
            <label className={labelCls}>Color</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setColorOpen((v) => !v)}
                className={`w-full flex items-center gap-2.5 bg-[#2a2a2a] border rounded-lg px-2.5 h-8 text-[13px] text-white transition-colors focus:outline-none ${
                  colorOpen ? 'border-[var(--accent2)]' : 'border-white/10 hover:border-white/20'
                }`}
              >
                <span className="shrink-0 w-3.5 h-3.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="flex-1 text-left">{colorName(color)}</span>
                <ChevronDown
                  size={14}
                  className={`shrink-0 text-white/40 transition-transform ${colorOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {colorOpen && (
                <div className="absolute z-10 top-full left-0 mt-1 w-full rounded-lg border border-white/10 bg-[#222222] shadow-2xl p-1 max-h-56 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-thumb]:rounded-full">
                  {COLLECTION_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => { setColor(c); setColorOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left hover:bg-white/10 transition-colors"
                    >
                      <span className="shrink-0 w-3.5 h-3.5 rounded-full" style={{ backgroundColor: c }} />
                      <span className="flex-1 text-sm text-white/90">{colorName(c)}</span>
                      {c === color && <Check size={13} className="shrink-0 text-white/50" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Parent collection */}
          <div>
            <label className={labelCls}>Parent collection</label>
            <CollectionSearchField
              value={parentId}
              currentPath={parentPath}
              options={parentOptions}
              onChange={setParentId}
              onCreate={onCreateCollection}
              placeholder={parentId ? 'Change parent…' : 'No parent — search to set one…'}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave({ text: name.trim(), color, parentId })}
            className="px-3.5 py-1.5 rounded-lg text-sm font-semibold bg-[var(--accent2)] text-white hover:opacity-90 transition-opacity"
          >
            Save
          </button>
        </div>
      </motion.div>
    </div>
  );
};
