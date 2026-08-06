import React from 'react';
import { Plus } from 'lucide-react';
import { NAME_BASE_PAD, INDENT, LEADING_SLOT } from '@/features/planner/constants';
import { useTableVariant } from '@/features/planner/variant';
import { btnGhost } from '@/theme/buttons';

// The contextual "+ New" row - one per container (the view root, a collection, an
// attribute section, a task with subtasks), placed by features/planner/table/addRows
// at the spot the task it creates will actually appear.
//
// Its leading run mirrors a task row's - the collapse chevron's slot, the drag
// handle's slot, then the base pad + indent - so the label lands on the same
// column as the checkboxes of the rows it joins, and an add-row for a nested
// block reads as part of that block rather than of the table.
//
// That label is FROZEN to the left edge like a row's Name cell (HubRow's
// `sticky left-0`), so scrolling the table sideways to reach a far column doesn't
// carry the add-rows off-screen with it. Unlike a Name cell this one needs no
// opaque background and no hover overlays: a row's Name cell has other cells
// sliding under it, whereas an add-row is a single element spanning the table's
// whole width (the rows container is `w-max min-w-full`), so the only thing
// behind the label is this button's own background - which is also what lets the
// hover fill read across the entire row instead of stopping at the label.
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
      className={`group/add flex w-full items-center border-b border-line-subtle cursor-pointer transition-colors h-7 ${btnGhost()}
         ${mode === 'table' ? 'bg-canvas' : ''}`}
    >
      <div className="sticky left-0 z-20 flex items-center min-w-0">
        {/* The collapse chevron's slot, then the drag handle's - neither applies to
            an add-row, but skipping them would shift the label off the checkbox
            column that this row's siblings line up on. */}
        <span className="shrink-0 w-5.5" />
        <span className={`shrink-0 ${LEADING_SLOT}`} />
        <div
          style={{ paddingLeft: NAME_BASE_PAD + indent * INDENT }}
        >
          <div className={`flex items-center min-w-0 pl-1.25 pr-2 py-0.5 rounded-full text-fg-ghost group-hover/add:text-fg-subtle transition-all`}>
            <Plus size={14} className="shrink-0 mr-2.5" />
            <span className={mode === 'list' ? 'text-xs' : 'text-xs'}>Add task</span>
          </div>
        </div>
      </div>
    </button>
  );
};
