import React from 'react';
import { createPortal } from 'react-dom';
import { Archive, ArchiveRestore, Trash2, Maximize2, CornerDownRight, FolderPlus, Palette, Pencil, MoveRight } from 'lucide-react';
import { OrganizerEntry } from '../../utils/todoFilters';
import { COLLECTION_SLOTS, collectionColor, collectionSlot, colorName } from './constants';

// Right-click / 3-dot row menu. Branches on whether the target row is a
// collection (Edit / nested collection / recolor) or a task (Expand / make
// collection); both share Archive + Delete. All actions are passed in as
// callbacks so the parent owns the state mutations and menu-closing.
const itemCls =
  'w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-fg-muted hover:bg-fill hover:text-fg transition-colors';

export const RowContextMenu: React.FC<{
  menu: { id: string; x: number; y: number };
  menuPos: { top: number; left: number } | null;
  menuRef: React.RefObject<HTMLDivElement | null>;
  entry: OrganizerEntry | null;
  colorPickerOpen: boolean;
  onToggleColorPicker: () => void;
  onClose: () => void;
  onEditCollection: (id: string) => void;
  onCreateTaskInside: (parentId: string) => void;
  onCreateNestedCollection: (parentId: string) => void;
  onChangeColor: (entry: OrganizerEntry, color: string) => void;
  onMakeCollection: (entry: OrganizerEntry) => void;
  onMoveTo: (id: string) => void;
  onExpand: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
}> = ({
  menu,
  menuPos,
  menuRef,
  entry,
  colorPickerOpen,
  onToggleColorPicker,
  onClose,
  onEditCollection,
  onCreateTaskInside,
  onCreateNestedCollection,
  onChangeColor,
  onMakeCollection,
  onMoveTo,
  onExpand,
  onArchive,
  onDelete,
}) =>
  createPortal(
    <>
      <div
        className="fixed inset-0 z-[65]"
        onMouseDown={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />
      <div
        ref={menuRef}
        style={{ position: 'fixed', left: menuPos?.left ?? menu.x, top: menuPos?.top ?? menu.y }}
        className="z-[66] min-w-[170px] rounded-lg border border-line bg-surface shadow-2xl p-1 text-sm"
      >
        {entry?.todo.isCollection ? (
          <>
            <button onClick={() => onEditCollection(menu.id)} className={itemCls}>
              <Pencil size={14} /> Edit
            </button>
            <button onClick={() => onCreateTaskInside(menu.id)} className={itemCls}>
              <CornerDownRight size={14} /> Create task inside
            </button>
            <button onClick={() => onCreateNestedCollection(menu.id)} className={itemCls}>
              <FolderPlus size={14} /> Create nested collection
            </button>
            <button onClick={onToggleColorPicker} className={itemCls}>
              <Palette size={14} /> Change color
            </button>
            {colorPickerOpen && (
              <div className="grid grid-cols-4 gap-1.5 px-2.5 py-2">
                {COLLECTION_SLOTS.map((slot) => {
                  const selected = collectionSlot(entry.todo.color) === slot;
                  return (
                    <button
                      key={slot}
                      title={colorName(slot)}
                      onClick={() => onChangeColor(entry, slot)}
                      className={`h-6 w-6 rounded-full transition-transform hover:scale-110 ${
                        selected ? 'ring-2 ring-fg ring-offset-2 ring-offset-surface' : 'ring-1 ring-line-strong'
                      }`}
                      style={{ backgroundColor: collectionColor(slot) }}
                    />
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
            <button onClick={() => onExpand(menu.id)} className={itemCls}>
              <Maximize2 size={14} /> Show full view
            </button>
            <button onClick={() => onCreateTaskInside(menu.id)} className={itemCls}>
              <CornerDownRight size={14} /> Create task inside
            </button>
            <button onClick={() => onMoveTo(menu.id)} className={itemCls}>
              <MoveRight size={14} /> Move to…
            </button>
            <button onClick={() => entry && onMakeCollection(entry)} className={itemCls}>
              <FolderPlus size={14} /> Create collection
            </button>
          </>
        )}
        <button onClick={() => onArchive(menu.id)} className={itemCls}>
          {entry?.todo.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
          {entry?.todo.archived ? 'Unarchive' : 'Archive'}
        </button>
        <button
          onClick={() => onDelete(menu.id)}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-red-400 hover:bg-danger-tint hover:text-red-300 transition-colors"
        >
          <Trash2 size={14} /> Delete
        </button>
      </div>
    </>,
    document.body
  );
