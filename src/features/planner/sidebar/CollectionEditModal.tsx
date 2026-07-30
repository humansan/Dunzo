import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, ChevronDown, Check } from 'lucide-react';
import { OrganizerEntry, CollectionOption } from '@/features/tasks/model';
import { btnAccent, btnGhost, btnNeutral } from '@/theme/buttons';
import { CollectionPickerButton } from '@/features/tasks/collection-picker';
import { modalPop, overlayBackdrop } from '@/common/ui/modalMotion';
import { textInputCls } from '@/common/ui';
import { COLLECTION_SLOTS, collectionColor, collectionSlot, colorName } from '@/theme/collectionColor';

// ── Collection Edit modal ────────────────────────────────────────────────────
// Rename, recolor, and re-parent a collection. The parent picker is the shared
// CollectionPicker, with the collection itself and its descendants filtered out
// so it can't become its own ancestor.
export const CollectionEditModal: React.FC<{
  entry: OrganizerEntry;
  options: CollectionOption[];
  onCreateCollection: (name: string) => string;
  onSave: (patch: { text: string; color: string; parentId: string | null }) => void;
  onClose: () => void;
}> = ({ entry, options, onCreateCollection, onSave, onClose }) => {
  const [name, setName] = useState(entry.todo.text || '');
  const [color, setColor] = useState(collectionSlot(entry.todo.color));
  const [parentId, setParentId] = useState<string | null>(entry.todo.parentId ?? null);
  const [colorOpen, setColorOpen] = useState(false);

  // A collection can't be parented to itself or to one of its own descendants.
  const parentOptions = options.filter(
    (o) => o.id !== entry.todo.id && !o.path.some((p) => p.id === entry.todo.id)
  );
  const labelCls = 'block text-sm font-semibold text-fg mb-1.5';

  return (
    <div
      className={`fixed inset-0 z-[70] flex items-center justify-center p-4 ${overlayBackdrop}`}
      onMouseDown={onClose}
    >
      <motion.div
        {...modalPop}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-line bg-surface shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line-subtle pl-5 pr-2.5 py-2.5">
          <h2 className="text-base font-bold text-fg">Edit</h2>
          <button
            type="button"
            onClick={onClose}
            className={`p-1.5 rounded-md ${btnGhost()}`}
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
                className={`w-full flex items-center gap-2.5 bg-overlay border rounded-lg px-2.5 h-8 text-[13px] text-fg transition-colors focus:outline-none ${
                  colorOpen ? 'border-[var(--accent2)]' : 'border-line hover:border-line-strong'
                }`}
              >
                <span className="shrink-0 w-3.5 h-3.5 rounded-full" style={{ backgroundColor: collectionColor(color) }} />
                <span className="flex-1 text-left">{colorName(color)}</span>
                <ChevronDown
                  size={14}
                  className={`shrink-0 text-fg-faint transition-transform ${colorOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {colorOpen && (
                <div className="absolute z-10 top-full left-0 mt-1 w-full rounded-lg border border-line bg-surface-raised shadow-2xl p-1 max-h-56 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-fill-strong [&::-webkit-scrollbar-thumb]:rounded-full">
                  {COLLECTION_SLOTS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => { setColor(c); setColorOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left hover:bg-fill transition-colors"
                    >
                      <span className="shrink-0 w-3.5 h-3.5 rounded-full" style={{ backgroundColor: collectionColor(c) }} />
                      <span className="flex-1 text-sm text-fg">{colorName(c)}</span>
                      {c === color && <Check size={13} className="shrink-0 text-fg-subtle" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Parent collection */}
          <div>
            <label className={labelCls}>Parent collection</label>
            <CollectionPickerButton
              variant="field"
              collectionId={parentId}
              options={parentOptions}
              onChange={setParentId}
              onCreate={onCreateCollection}
              nullLabel="No parent"
              placeholder="Search or create a parent…"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-line-subtle px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className={`px-3 h-8 rounded-lg text-xs font-bold ${btnNeutral}`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave({ text: name.trim(), color, parentId })}
            className={`px-3 h-8 rounded-lg text-xs ${btnAccent('accent2')}`}
          >
            Save
          </button>
        </div>
      </motion.div>
    </div>
  );
};
