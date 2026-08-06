import React from 'react';
import { Inbox, Trash2 } from 'lucide-react';
import { ConfirmModal } from '@/common/ui';

// Confirmation modal shown when deleting a collection that still contains tasks:
// promote the tasks up one level (into `promoteTarget`) or cascade-delete the
// whole subtree. The chrome is the shared ConfirmModal - this file is only the
// wording and the two callbacks.
export const DeleteCollectionModal: React.FC<{
  name: string;
  promoteTarget: string;
  onPromote: () => void;
  onCascade: () => void;
  onClose: () => void;
}> = ({ name, promoteTarget, onPromote, onCascade, onClose }) => (
  <ConfirmModal
    title={<>Delete “{name}”</>}
    description="This collection contains items. What should happen to them?"
    onClose={onClose}
    actions={[
      {
        label: 'Move nested items up one level',
        description: (
          <>
            Keep them - move into <span className="text-fg-muted font-medium">{promoteTarget}</span>{' '}
            and delete only the collection.
          </>
        ),
        icon: <Inbox size={18} />,
        onSelect: onPromote,
      },
      {
        label: 'Delete all',
        description: 'Permanently remove the collection and all items nested inside.',
        icon: <Trash2 size={18} />,
        tone: 'danger',
        onSelect: onCascade,
      },
    ]}
  />
);
