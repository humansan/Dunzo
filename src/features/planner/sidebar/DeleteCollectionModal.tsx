import React from 'react';
import { motion } from 'motion/react';
import { Inbox, Trash2 } from 'lucide-react';
import { modalPop, overlayBackdrop } from '@/common/ui/modalMotion';
import { btnGhost } from '@/theme/buttons';

// Confirmation modal shown when deleting a collection that still contains tasks:
// promote the tasks up one level (into `promoteTarget`) or cascade-delete the
// whole subtree.
export const DeleteCollectionModal: React.FC<{
  name: string;
  promoteTarget: string;
  onPromote: () => void;
  onCascade: () => void;
  onClose: () => void;
}> = ({ name, promoteTarget, onPromote, onCascade, onClose }) => (
  <div
    className={`fixed inset-0 z-[70] flex items-center justify-center p-4 ${overlayBackdrop}`}
    onMouseDown={onClose}
  >
    <motion.div
      {...modalPop}
      onMouseDown={(e) => e.stopPropagation()}
      className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-2xl"
    >
      <h2 className="text-base font-bold text-fg">
        Delete “{name}”
      </h2>
      <p className="mt-1.5 text-sm text-fg-subtle">
        This collection contains tasks. What should happen to them?
      </p>
      <div className="mt-4 space-y-2">
        <button
          type="button"
          onClick={onPromote}
          className="w-full flex items-start gap-3 rounded-xl border border-line p-3 text-left hover:bg-fill-subtle transition-colors"
        >
          <Inbox size={18} className="shrink-0 mt-0.5 text-[var(--accent2)]" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-fg">Move tasks up one level</span>
            <span className="block text-xs text-fg-subtle">
              Keep them — move into <span className="text-fg-muted font-medium">{promoteTarget}</span> and delete only the collection.
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={onCascade}
          className="w-full flex items-start gap-3 rounded-xl border border-red-500/20 p-3 text-left hover:bg-danger-tint transition-colors"
        >
          <Trash2 size={18} className="shrink-0 mt-0.5 text-red-400" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-red-300">Delete all tasks</span>
            <span className="block text-xs text-fg-subtle">
              Permanently remove the collection and everything nested inside it.
            </span>
          </span>
        </button>
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className={`px-3 py-1.5 rounded-lg text-sm ${btnGhost()}`}
        >
          Cancel
        </button>
      </div>
    </motion.div>
  </div>
);
