import React, { useState } from 'react';
import { motion } from 'motion/react';
import { modalPop, overlayBackdrop } from '@/common/ui/modalMotion';
import { btnGhost } from '@/theme/buttons';
import { Checkbox } from '@/common/ui/Checkbox';

// The shared confirmation dialog: a title, a line of explanation, and one or more
// card-style choices. One action reads as "are you sure?"; two read as "which of
// these?" (the collection-delete prompt this was generalized from). Callers own
// the wording and the callbacks - this knows nothing about todos.

export interface ConfirmAction {
  label: string;
  /** Second line under the label. Optional for a plain one-line choice. */
  description?: React.ReactNode;
  icon?: React.ReactNode;
  /** 'danger' tints the card red - reserve it for destructive, unrecoverable work. */
  tone?: 'default' | 'danger';
  onSelect: () => void;
}

export const ConfirmModal: React.FC<{
  title: React.ReactNode;
  description?: React.ReactNode;
  actions: ConfirmAction[];
  onClose: () => void;
  /** Cancel button text; the escape hatch is always rendered. */
  cancelLabel?: string;
  /**
   * Renders a "Don't show this again" checkbox, whose state is handed to every
   * action via this callback when one is chosen (not when cancelling - dismissing
   * a dialog is not a decision about future dialogs). Omit to hide the checkbox.
   */
  onDontShowAgainChange?: (value: boolean) => void;
  dontShowAgainLabel?: string;
}> = ({
  title,
  description,
  actions,
  onClose,
  cancelLabel = 'Cancel',
  onDontShowAgainChange,
  dontShowAgainLabel = "Don't show this again",
}) => {
  const [dontShow, setDontShow] = useState(false);

  const select = (action: ConfirmAction) => {
    // Report the opt-out before running the action: the action usually closes the
    // dialog, and on a later render this component is already gone.
    if (onDontShowAgainChange) onDontShowAgainChange(dontShow);
    action.onSelect();
  };

  return (
    <div
      className={`fixed inset-0 z-[70] flex items-center justify-center p-4 ${overlayBackdrop}`}
      onMouseDown={onClose}
    >
      <motion.div
        {...modalPop}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-2xl"
      >
        <h2 className="text-base font-bold text-fg">{title}</h2>
        {description && <p className="mt-1.5 text-sm text-fg-subtle">{description}</p>}

        <div className="mt-4 space-y-2">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => select(a)}
              className={`w-full flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                a.tone === 'danger'
                  ? 'border-red-500/20 hover:bg-danger-tint'
                  : 'border-line hover:bg-fill-subtle'
              }`}
            >
              {a.icon && (
                <span
                  className={`shrink-0 mt-0.5 ${
                    a.tone === 'danger' ? 'text-red-400' : 'text-[var(--accent2)]'
                  }`}
                >
                  {a.icon}
                </span>
              )}
              <span className="min-w-0">
                <span
                  className={`block text-sm font-semibold ${
                    a.tone === 'danger' ? 'text-red-300' : 'text-fg'
                  }`}
                >
                  {a.label}
                </span>
                {a.description && (
                  <span className="block text-xs text-fg-subtle">{a.description}</span>
                )}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          {onDontShowAgainChange ? (
            <Checkbox checked={dontShow} onChange={setDontShow}>
              <span className="text-xs text-fg-subtle">{dontShowAgainLabel}</span>
            </Checkbox>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            className={`px-3 py-1.5 rounded-lg text-sm ${btnGhost()}`}
          >
            {cancelLabel}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
