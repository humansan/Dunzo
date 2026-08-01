import React, { useState } from 'react';
import { motion } from 'motion/react';
import { modalPop, overlayBackdrop } from '@/common/ui/modalMotion';
import { btnGhost } from '@/theme/buttons';
import type { RoleName } from '@/theme/roles';
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
  /**
   * Any theme role (see src/theme/roles.ts) - 'danger' for destructive work,
   * 'warning', 'accent2', 'xp-tier1', … Tints the card's border, hover fill, icon
   * and label. Omit for the neutral card.
   *
   * NOTE for future edits: the class names below cannot be built by interpolating
   * this value (`text-${tone}`). Tailwind scans source files as plain text and
   * only generates utilities it finds spelled out, so an interpolated name yields
   * no CSS at all. What makes an arbitrary role work here is that the role is
   * passed as a CSS variable at runtime (`--tone`) while the classes referencing
   * that variable stay literal - dynamic value, static class.
   */
  tone?: RoleName;
  onSelect: () => void;
}

// Literal (so Tailwind emits them), parameterised by the --tone variable set inline.
const TONED_CARD =
  'border-[color-mix(in_srgb,var(--tone)_30%,transparent)] hover:bg-[color-mix(in_srgb,var(--tone)_10%,transparent)]';
const PLAIN_CARD = 'border-line hover:bg-fill-subtle';

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
              // The role becomes a local CSS variable; every class that reads it is
              // spelled out above (see ConfirmAction.tone).
              style={
                a.tone
                  ? ({ ['--tone']: `var(--color-${a.tone})` } as React.CSSProperties)
                  : undefined
              }
              className={`w-full flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                a.tone ? TONED_CARD : PLAIN_CARD
              }`}
            >
              {a.icon && (
                <span
                  className={`shrink-0 mt-0.5 ${a.tone ? 'text-(--tone)' : 'text-(--accent2)'}`}
                >
                  {a.icon}
                </span>
              )}
              <span className="min-w-0">
                <span
                  className={`block text-sm font-semibold ${a.tone ? 'text-(--tone)' : 'text-fg'}`}
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
