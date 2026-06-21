import React, { useMemo } from 'react';
import {
  ColKey,
  ColDef,
  COLUMNS,
  NAME_COL_KEY,
  FilterRule,
  SortRule,
  SectionsConfig,
  DEFAULT_SECTIONS_CONFIG,
} from './types';
import { MIN_COL_WIDTH } from './constants';
import { useSyncedSetting } from '../../data/settings';

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

  // ── Per-view config (field order, visibility, filters, sorts) — DB-synced ────
  const [viewsConfig, setViewsConfig] = useSyncedSetting('hubViews', {} as Record<string, any>);

  // The config key for the currently-visible view.
  const viewConfigKey = `${activeWorkspaceId}:${selectedView}`;

  // Derive and reconcile the current view's config (field order may drift if
  // new columns are added; unknown keys are dropped, missing ones are appended).
  const allColKeys = COLUMNS.map((c) => c.key);
  const currentViewState = useMemo(() => {
    const raw = viewsConfig[viewConfigKey] ?? {};
    let fieldOrder: ColKey[] = Array.isArray(raw.fieldOrder)
      ? raw.fieldOrder.filter((k: string): k is ColKey => allColKeys.includes(k as ColKey))
      : [];
    fieldOrder = [
      NAME_COL_KEY,
      ...[...fieldOrder, ...allColKeys.filter((k) => !fieldOrder.includes(k))].filter(
        (k) => k !== NAME_COL_KEY
      ),
    ];
    const hiddenFields = new Set<ColKey>(
      (Array.isArray(raw.hiddenFields) ? raw.hiddenFields : []).filter(
        (k: string): k is ColKey => k !== NAME_COL_KEY && allColKeys.includes(k as ColKey)
      )
    );
    const wrappedFields = new Set<ColKey>(
      (Array.isArray(raw.wrappedFields) ? raw.wrappedFields : []).filter(
        (k: string): k is ColKey => allColKeys.includes(k as ColKey)
      )
    );
    const raw_sections = raw.sections ?? {};
    const sections: SectionsConfig = {
      autoArchive:          raw_sections.autoArchive          ?? DEFAULT_SECTIONS_CONFIG.autoArchive,
      showLeafTasks:        raw_sections.showLeafTasks        ?? DEFAULT_SECTIONS_CONFIG.showLeafTasks,
      hideEmptyCollections: raw_sections.hideEmptyCollections ?? DEFAULT_SECTIONS_CONFIG.hideEmptyCollections,
      groupBy:              raw_sections.groupBy              ?? DEFAULT_SECTIONS_CONFIG.groupBy,
      groupSortDirection:   raw_sections.groupSortDirection   ?? DEFAULT_SECTIONS_CONFIG.groupSortDirection,
    };
    return {
      fieldOrder,
      hiddenFields,
      wrappedFields,
      filters: (Array.isArray(raw.filters) ? raw.filters : []) as FilterRule[],
      sorts:   (Array.isArray(raw.sorts)   ? raw.sorts   : []) as SortRule[],
      sections,
    };
  }, [viewsConfig, viewConfigKey]);

  const { fieldOrder, hiddenFields, wrappedFields, filters: activeFilters, sorts: activeSorts, sections: sectionsConfig } = currentViewState;

  // Persist any view-state update (partial merge).
  const updateViewState = (patch: {
    fieldOrder?: ColKey[];
    hiddenFields?: Set<ColKey>;
    wrappedFields?: Set<ColKey>;
    filters?: FilterRule[];
    sorts?: SortRule[];
    sections?: SectionsConfig;
  }) => {
    setViewsConfig((prev) => ({
      ...prev,
      [viewConfigKey]: {
        fieldOrder:    patch.fieldOrder    ?? fieldOrder,
        hiddenFields:  [...(patch.hiddenFields  ?? hiddenFields)],
        wrappedFields: [...(patch.wrappedFields ?? wrappedFields)],
        filters:       patch.filters       ?? activeFilters,
        sorts:         patch.sorts         ?? activeSorts,
        sections:      patch.sections      ?? sectionsConfig,
      },
    }));
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
    activeSorts,
    sectionsConfig,
    updateViewState,
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
