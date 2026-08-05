import React from 'react';
import { Plus } from 'lucide-react';
import { NAME_BASE_PAD, INDENT, LEADING_SLOT } from '@/features/planner/constants';
import { useTableVariant } from '@/features/planner/variant';

// The contextual "+ New" row - one per container (the view root, a collection, an
// attribute section, a task with subtasks), placed by features/planner/table/addRows
// at the spot the task it creates will actually appear.
//
// Its leading run mirrors a task row's exactly - base pad, indent, the collapse
// chevron's slot, the drag handle's slot - so the "+" lands on the same column as
// the checkboxes of the rows it joins, and an add-row for a nested block reads as
// part of that block rather than of the table.
export const AddRow: React.FC<{
  indent: number;
  onClick: () => void;
  // Names the container in the tooltip ("New task in Errands"), since several of
  // these can be on screen at once and the label alone doesn't say which is which.
  containerLabel?: string;
}> = ({ indent, onClick, containerLabel }) => {
  const { mode } = useTableVariant();
  return (
    <button
      type="button"
      onClick={onClick}
      title={containerLabel ? `New task in ${containerLabel}` : 'New task'}
      className={`group/add flex w-full items-center border-b border-line-subtle text-fg/30 hover:bg-fill-subtle cursor-pointer transition-colors h-7
         ${mode === 'table' ? 'bg-canvas' : ''}`}
    >
      <span className="shrink-0 w-5.5" />
      <span className={`shrink-0 ${LEADING_SLOT}`} />
      <div
        style={{ paddingLeft: NAME_BASE_PAD + indent * INDENT }}
        className={`sticky left-0 z-10 flex items-center min-w-0`}
      >
        {/* The collapse chevron's slot, then the drag handle's - neither applies to
            an add-row, but skipping them would shift the "+" off the checkbox
            column that this row's siblings line up on. */}
        
        <Plus size={14} className="shrink-0 ml-1.5 mr-2.5" />
        <span className={mode === 'list' ? 'text-xs' : 'text-xs'}>Add task</span>
      </div>
    </button>
  );
};
