import React, { useMemo } from 'react';
import {
  ColKey,
  ColDef,
  COLUMNS,
  NAME_COL_KEY,
  FilterRule,
  FilterMatch,
  SortRule,
  SectionsConfig,
  DEFAULT_SECTIONS_CONFIG,
  DEFAULT_HIDDEN_COLS,
  DEFAULT_WRAP_COLS,
  MENU_SLICES,
  ToolbarMenuKey,
} from '@/features/planner/types';
import { MIN_COL_WIDTH } from '@/features/planner/constants';
import { resolveView } from '@/features/planner/views';
import { broadcastMenuConfig, defaultKeyFor } from '@/features/planner/model/viewConfigStore';
import { useSyncedSetting } from '@/lib/query/settings';

// Owns the table's per-view layout: column widths (persisted globally) and the
// per-view config (field order/visibility, filters, sorts, section settings)
// keyed by workspaceId:viewId so every sidebar tab keeps its own independent
// layout. Returns the reconciled current view state plus the mutators the table,
// fields menu, and toolbar menus need.
export function useHubViewConfig(activeWorkspaceId: string, selectedView: string) {
  // ── Column widths (DB-synced) ──────────────────────────────────────────────
  // Only overrides are stored; missing columns fall back to their default width.
  const defaultWidths = Object.fromEntries(COLUMNS.map((c) => [c.key, c.defaultWidth]));
  const [storedWidths, setWidths] = useSyncedSetting('hubColWidths', {} as Record<string, number>);
  const widths = { ...defaultWidths, ...storedWidths };

  // ── Per-view config (field order, visibility, filters, sorts) - DB-synced ────
  const [viewsConfig, setViewsConfig] = useSyncedSetting('hubViews', {} as Record<string, any>);

  // The config key for the currently-visible view, and the workspace's defaults.
  const viewConfigKey = `${activeWorkspaceId}:${selectedView}`;
  const defaultConfigKey = defaultKeyFor(activeWorkspaceId);

  // Derive and reconcile the current view's config (field order may drift if
  // new columns are added; unknown keys are dropped, missing ones are appended).
  const allColKeys = COLUMNS.map((c) => c.key);
  const currentViewState = useMemo(() => {
    // Two layers: the workspace defaults written by "Set for all", with this
    // view's own record on top. A field absent from the view record falls
    // through to the default, which is what lets one broadcast reach views that
    // have never been visited (they have no record at all).
    const defRaw = viewsConfig[defaultConfigKey] ?? {};
    const viewRaw = viewsConfig[viewConfigKey] ?? {};
    const raw = { ...defRaw, ...viewRaw };
    let fieldOrder: ColKey[] = Array.isArray(raw.fieldOrder)
      ? raw.fieldOrder.filter((k: string): k is ColKey => allColKeys.includes(k as ColKey))
      : [];
    fieldOrder = [
      NAME_COL_KEY,
      ...[...fieldOrder, ...allColKeys.filter((k) => !fieldOrder.includes(k))].filter(
        (k) => k !== NAME_COL_KEY
      ),
    ];
    // A view with no saved field config starts on DEFAULT_HIDDEN_COLS rather than
    // showing every column. A stored array wins even when it's empty - that means
    // the user has explicitly unhidden everything, which must not be overwritten.
    const hiddenFields = new Set<ColKey>(
      (Array.isArray(raw.hiddenFields) ? raw.hiddenFields : DEFAULT_HIDDEN_COLS).filter(
        (k: string): k is ColKey => k !== NAME_COL_KEY && allColKeys.includes(k as ColKey)
      )
    );
    const wrappedFields = new Set<ColKey>(
      (Array.isArray(raw.wrappedFields) ? raw.wrappedFields : DEFAULT_WRAP_COLS).filter(
        (k: string): k is ColKey => allColKeys.includes(k as ColKey)
      )
    );
    // `sections` is an object, so it merges one level deeper than the rest: a
    // per-view record may hold only `{ groupBy }` (see applyToAllViews' guard),
    // and a blanket spread would drop the other five fields back to the hardcoded
    // defaults instead of the workspace ones.
    const raw_sections = { ...(defRaw.sections ?? {}), ...(viewRaw.sections ?? {}) };
    // A view may declare its own default grouping (e.g. In Daily List is a daily
    // lens, so it defaults to date grouping). Precedence, highest first:
    //   1. an explicit choice made while on this view
    //   2. the view's intrinsic default - it describes what the view IS, so it
    //      outranks a broadcast (In Daily List grouped by Collection is useless)
    //   3. the workspace default from "Set for all"
    //   4. the hardcoded default
    const viewDefaultGroupBy = resolveView(selectedView).defaultGroupBy;
    const groupBy =
      viewRaw.sections?.groupBy ??
      viewDefaultGroupBy ??
      defRaw.sections?.groupBy ??
      DEFAULT_SECTIONS_CONFIG.groupBy;
    const sections: SectionsConfig = {
      autoArchive:          raw_sections.autoArchive          ?? DEFAULT_SECTIONS_CONFIG.autoArchive,
      showLeafTasks:        raw_sections.showLeafTasks        ?? DEFAULT_SECTIONS_CONFIG.showLeafTasks,
      hideEmptyCollections: raw_sections.hideEmptyCollections ?? DEFAULT_SECTIONS_CONFIG.hideEmptyCollections,
      hideSubcollections:   raw_sections.hideSubcollections   ?? DEFAULT_SECTIONS_CONFIG.hideSubcollections,
      groupBy,
      groupSortDirection:   raw_sections.groupSortDirection   ?? DEFAULT_SECTIONS_CONFIG.groupSortDirection,
    };
    return {
      fieldOrder,
      hiddenFields,
      wrappedFields,
      filters: (Array.isArray(raw.filters) ? raw.filters : []) as FilterRule[],
      filterMatch: (raw.filterMatch === 'or' ? 'or' : 'and') as FilterMatch,
      sorts:   (Array.isArray(raw.sorts)   ? raw.sorts   : []) as SortRule[],
      sections,
    };
  }, [viewsConfig, viewConfigKey, defaultConfigKey, selectedView]);

  const { fieldOrder, hiddenFields, wrappedFields, filters: activeFilters, filterMatch, sorts: activeSorts, sections: sectionsConfig } = currentViewState;

  // Persist a view-state update, writing ONLY the fields the patch actually
  // touched. Materializing all seven on every edit (what this used to do) would
  // re-pin every slice on this view, permanently detaching it from the workspace
  // defaults - so a later tweak to one menu would silently opt the view out of
  // the other three. Presence checks are safe: every legal value ([], new Set(),
  // 'and', {}) is truthy.
  const updateViewState = (patch: {
    fieldOrder?: ColKey[];
    hiddenFields?: Set<ColKey>;
    wrappedFields?: Set<ColKey>;
    filters?: FilterRule[];
    filterMatch?: FilterMatch;
    sorts?: SortRule[];
    sections?: SectionsConfig;
  }) => {
    const slice: Record<string, unknown> = {};
    if (patch.fieldOrder)    slice.fieldOrder    = patch.fieldOrder;
    if (patch.hiddenFields)  slice.hiddenFields  = [...patch.hiddenFields];
    if (patch.wrappedFields) slice.wrappedFields = [...patch.wrappedFields];
    if (patch.filters)       slice.filters       = patch.filters;
    if (patch.filterMatch)   slice.filterMatch   = patch.filterMatch;
    if (patch.sorts)         slice.sorts         = patch.sorts;
    if (patch.sections)      slice.sections      = patch.sections;

    setViewsConfig((prev) => ({
      ...prev,
      [viewConfigKey]: { ...(prev[viewConfigKey] ?? {}), ...slice },
    }));
  };

  // "Set for all": make one menu's current settings the workspace default and
  // drop that slice from every per-view record, so nothing shadows it. Every
  // view then resolves to it - including ones never visited and ones not yet
  // created - without having to enumerate collections or write N records.
  const applyToAllViews = (menu: ToolbarMenuKey) => {
    const fields = MENU_SLICES[menu];
    // Broadcast what's on screen: these come from the RESOLVED state, so it
    // works even when the current view has no stored record of its own.
    const slice: Record<string, unknown> = {
      sections: { sections: sectionsConfig },
      fields: {
        fieldOrder,
        hiddenFields: [...hiddenFields],
        wrappedFields: [...wrappedFields],
      },
      filter: { filters: activeFilters, filterMatch },
      sort: { sorts: activeSorts },
    }[menu];

    // The current view may declare its own grouping (only In Daily List does).
    // That intrinsic default outranks the broadcast, so without an explicit
    // override the page under the user's cursor would snap back to it the
    // instant they click. Keep their choice as a partial per-view record.
    const viewDefaultGroupBy = resolveView(selectedView).defaultGroupBy;
    const keepGroupByOn =
      menu === 'sections' && viewDefaultGroupBy && sectionsConfig.groupBy !== viewDefaultGroupBy
        ? { viewKey: viewConfigKey, groupBy: sectionsConfig.groupBy }
        : undefined;

    setViewsConfig((prev) =>
      broadcastMenuConfig(prev, { workspaceId: activeWorkspaceId, menu, slice, keepGroupByOn })
    );
  };

  const colByKey = useMemo(() => new Map(COLUMNS.map((c) => [c.key, c])), []);

  const toggleField = (key: ColKey) => {
    if (key === NAME_COL_KEY) return;
    const n = new Set(hiddenFields);
    if (n.has(key)) n.delete(key); else n.add(key);
    updateViewState({ hiddenFields: n });
  };
  const toggleWrap = (key: ColKey) => {
    const n = new Set(wrappedFields);
    if (n.has(key)) n.delete(key); else n.add(key);
    updateViewState({ wrappedFields: n });
  };
  const moveField = (dragKey: ColKey, targetKey: ColKey, pos: 'before' | 'after') => {
    if (dragKey === NAME_COL_KEY || targetKey === NAME_COL_KEY) return;
    const order = fieldOrder.filter((k) => k !== dragKey);
    const ti = order.indexOf(targetKey);
    if (ti === -1) return;
    order.splice(pos === 'before' ? ti : ti + 1, 0, dragKey);
    updateViewState({ fieldOrder: [NAME_COL_KEY, ...order.filter((k) => k !== NAME_COL_KEY)] });
  };

  // Columns the table renders: ordered, with hidden ones removed (Name always first).
  const visibleColumns = useMemo(
    () =>
      fieldOrder
        .map((k) => colByKey.get(k)!)
        .filter((c): c is ColDef => !!c && (c.key === NAME_COL_KEY || !hiddenFields.has(c.key))),
    [fieldOrder, hiddenFields, colByKey]
  );
  const lastColKey = visibleColumns[visibleColumns.length - 1]?.key ?? NAME_COL_KEY;

  const gridTemplateColumns = visibleColumns.map((c) => `${widths[c.key]}px`).join(' ') + ' minmax(80px, 1fr)';

  const startResize = (key: ColKey, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widths[key];
    const onMove = (ev: MouseEvent) => {
      const w = Math.max(MIN_COL_WIDTH, startW + (ev.clientX - startX));
      setWidths((prev) => ({ ...prev, [key]: w }));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return {
    viewConfigKey,
    fieldOrder,
    hiddenFields,
    wrappedFields,
    activeFilters,
    filterMatch,
    activeSorts,
    sectionsConfig,
    updateViewState,
    applyToAllViews,
    colByKey,
    toggleField,
    toggleWrap,
    moveField,
    visibleColumns,
    lastColKey,
    gridTemplateColumns,
    startResize,
  };
}

