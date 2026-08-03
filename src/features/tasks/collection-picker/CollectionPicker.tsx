import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Shapes } from 'lucide-react';
import { CollectionOption } from '@/features/tasks/model';
import { CollectionBreadcrumb } from '@/features/tasks/fields';
import { ChipPopover, rowBtn } from '@/features/tasks/chips';

// ── Collection picker ────────────────────────────────────────────────────────
// One panel - search box and results list in the same box, at a fixed width, so
// the list can't size itself to the longest name and the panel's mount height is
// its real height. That last part is what lets the anchored hosts (ChipPopover,
// CellEditorPopover) decide correctly whether to flip above the trigger: they
// measure once, at mount, and a focus-gated list would still be invisible then.
// The list only ever shrinks from there (typing filters it), never grows past
// its initial full-list height.
//
// Rows are full breadcrumbs and never truncate: the list scrolls horizontally
// instead, so a deep path stays readable rather than turning into an ellipsis.

const PANEL_WIDTH = 256; // px - keep in step with the `w-64` class below.
export const COLLECTION_PANEL_WIDTH = PANEL_WIDTH;

// The rows the list renders, in order. `none` clears the assignment; `create`
// appears only when the query names something that doesn't exist yet.
type Row =
  | { kind: 'none' }
  | { kind: 'option'; opt: CollectionOption }
  | { kind: 'create'; name: string };

const rowId = (r: Row) => (r.kind === 'option' ? r.opt.id : r.kind);

// Depth-first order: sorting on the lowercased path names puts every child
// directly under its parent, since a child's path is its parent's path plus one
// segment. `path` (root→leaf, inclusive) already encodes the whole chain, so no
// tree needs building.
const pathOrder = (options: CollectionOption[]): CollectionOption[] =>
  [...options].sort((a, b) => {
    const ap = a.path.map((p) => p.name.toLowerCase());
    const bp = b.path.map((p) => p.name.toLowerCase());
    for (let i = 0; i < Math.min(ap.length, bp.length); i++) {
      if (ap[i] !== bp[i]) return ap[i] < bp[i] ? -1 : 1;
    }
    return ap.length - bp.length;
  });

export const CollectionPicker: React.FC<{
  value: string | null;
  options: CollectionOption[];
  onChange: (id: string | null) => void;
  onCreate: (name: string) => string;
  /** Label for the row that clears the assignment. Omit `allowNull` to hide it. */
  nullLabel?: string;
  allowNull?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}> = ({
  value,
  options,
  onChange,
  onCreate,
  nullLabel = 'No collection',
  allowNull = true,
  placeholder = 'Search or create collection…',
  autoFocus = true,
}) => {
  const [query, setQuery] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const q = query.trim().toLowerCase();

  useEffect(() => {
    if (autoFocus) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [autoFocus]);

  // Every row is a full breadcrumb, so it reads the same whether it arrived by
  // scrolling the list or by matching a search. Children still follow their
  // parents in the unfiltered list.
  const rows = useMemo<Row[]>(() => {
    const matches = q
      ? options.filter(
          (o) => o.name.toLowerCase().includes(q) || o.path.some((p) => p.name.toLowerCase().includes(q))
        )
      : pathOrder(options);

    const out: Row[] = [];
    if (allowNull && !q) out.push({ kind: 'none' });
    for (const opt of matches) out.push({ kind: 'option', opt });
    if (q && !options.some((o) => o.name.toLowerCase() === q)) out.push({ kind: 'create', name: query.trim() });
    return out;
  }, [options, q, query, allowNull]);

  // Highlight starts on the current selection so Enter is a no-op rather than a
  // surprise re-assignment; it follows the mouse so the two never disagree.
  const selectedIdx = rows.findIndex((r) =>
    r.kind === 'option' ? r.opt.id === value : r.kind === 'none' && value === null
  );
  const [active, setActive] = useState(Math.max(0, selectedIdx));
  const clamped = Math.min(active, Math.max(0, rows.length - 1));

  // Keep the highlighted row in view VERTICALLY only. `scrollIntoView` would also
  // act on the horizontal axis, and since a row is as wide as the widest
  // breadcrumb it can't fit - the browser would yank scrollLeft back to 0 on
  // every arrow press, undoing the user's sideways scroll.
  useEffect(() => {
    const box = listRef.current;
    const el = box?.querySelector<HTMLElement>('[data-active="true"]');
    if (!box || !el) return;
    const top = el.offsetTop;
    const bottom = top + el.offsetHeight;
    if (top < box.scrollTop) box.scrollTop = top;
    else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight;
  }, [clamped, rows.length]);

  const commit = (row: Row | undefined) => {
    if (!row) return;
    if (row.kind === 'none') onChange(null);
    else if (row.kind === 'option') onChange(row.opt.id);
    else onChange(onCreate(row.name));
  };

  // Enter/Escape must not reach the host - a keypress inside a portaled panel
  // bubbles through the React tree and would submit the quick-edit panel or
  // close the full-view modal. See ChipPopover's containKeys.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!rows.length) return;
      const d = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (Math.min(i, rows.length - 1) + d + rows.length) % rows.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      commit(rows[clamped]);
    }
  };

  return (
    <div className="w-84 bg-surface border border-line rounded-xl shadow-2xl overflow-hidden">
      <div className="p-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActive(0); }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="w-full bg-fill-subtle border border-line rounded-lg px-2.5 h-9 text-fg text-sm placeholder:text-fg-faint focus:outline-none hover:border-line-strong focus:border-line-strong transition-colors"
        />
      </div>

      {/* A long breadcrumb scrolls sideways rather than clipping. `relative` makes
          this the rows' offsetParent for the scroll-into-view math above. */}
      <div
        ref={listRef}
        className="relative max-h-56 overflow-auto border-t border-line-subtle [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-fill-strong [&::-webkit-scrollbar-thumb]:rounded-full"
      >
        {/* `w-max` widens the track to the longest row; `min-w-full` keeps it at
            least panel-wide. Rows are `w-full` of THAT, so short rows still span
            the scrollable width and their check marks stay right-aligned. */}
        <div className="min-w-full w-max p-1">
          {rows.length === 0 && (
            <div className="px-2 py-3 text-center text-xs text-fg-faint">No collections</div>
          )}

          {rows.map((row, i) => {
            const isActive = i === clamped;
            const selected =
              row.kind === 'none' ? value === null : row.kind === 'option' && row.opt.id === value;
            return (
              <button
                key={rowId(row)}
                type="button"
                data-active={isActive}
                onMouseDown={(e) => e.preventDefault()} // keep focus in the input
                onMouseEnter={() => setActive(i)}
                onClick={() => commit(row)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left whitespace-nowrap transition-colors cursor-pointer ${
                  isActive ? 'bg-fill' : ''
                }`}
              >
                {row.kind === 'none' && <span className="flex-1 text-sm text-fg-muted">{nullLabel}</span>}

                {row.kind === 'option' && (
                  <CollectionBreadcrumb path={row.opt.path} truncate={false} className="flex-1" />
                )}

                {row.kind === 'create' && (
                  <>
                    <Shapes size={13} className="text-[var(--accent2)] shrink-0" />
                    <span className="flex-1 text-sm text-fg-muted">Create “{row.name}”</span>
                  </>
                )}

                {selected && <Check size={13} className="ml-auto shrink-0 text-fg-subtle" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ── Trigger ──────────────────────────────────────────────────────────────────
// The one way to open the picker. `chip` is the hover-lit rowBtn used in the
// task panels; `field` is a full-width form control matching the edit modal's
// Color dropdown.
export const CollectionPickerButton: React.FC<{
  collectionId: string | null;
  options: CollectionOption[];
  onChange: (id: string | null) => void;
  onCreate: (name: string) => string;
  variant?: 'chip' | 'field';
  nullLabel?: string;
  placeholder?: string;
}> = ({ collectionId, options, onChange, onCreate, variant = 'chip', nullLabel, placeholder }) => {
  const current = collectionId ? options.find((o) => o.id === collectionId) ?? null : null;
  const empty = nullLabel ?? 'Collection';

  return (
    <ChipPopover
      width={PANEL_WIDTH}
      className={variant === 'field' ? 'w-full' : 'min-w-0 max-w-full'}
      panel={(close) => (
        <CollectionPicker
          value={collectionId}
          options={options}
          onChange={(id) => { onChange(id); close(); }}
          onCreate={onCreate}
          nullLabel={nullLabel}
          placeholder={placeholder}
        />
      )}
    >
      {({ open, isOpen }) =>
        variant === 'field' ? (
          <button
            type="button"
            onClick={open}
            className={`w-full flex items-center gap-2.5 bg-overlay border rounded-lg px-2.5 h-8 text-[13px] text-fg transition-colors focus:outline-none ${
              isOpen ? 'border-[var(--accent2)]' : 'border-line hover:border-line-strong'
            }`}
          >
            <Shapes size={14} className="shrink-0 text-fg-subtle" />
            {current ? (
              <CollectionBreadcrumb path={current.path} className="flex-1 min-w-0" />
            ) : (
              <span className="flex-1 text-left text-fg-faint">{empty}</span>
            )}
            <ChevronDown
              size={14}
              className={`shrink-0 text-fg-faint transition-transform ${isOpen ? 'rotate-180' : ''}`}
            />
          </button>
        ) : (
          <button type="button" onClick={open} className={rowBtn + " group"}>
            <Shapes size={16} className={"shrink-0 " + (current && 'stroke-fg-muted group-hover:stroke-fg')} />
            {current ? (
              <CollectionBreadcrumb path={current.path} className="min-w-0" />
            ) : (
              <span>{empty}</span>
            )}
          </button>
        )
      }
    </ChipPopover>
  );
};
