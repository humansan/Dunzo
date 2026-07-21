// Search-param state for the planner routes.
//
// `editCollection` holds the id of the collection whose edit modal is open. It
// lives in the URL rather than in PlannerView's local state because selecting a
// view is a *navigation*: /planner and /planner/$collectionId are two different
// route components, so switching between them unmounts PlannerView and discards
// anything it just set locally. The new-collection flow (create → select → open
// the editor) needs the selection and the editor intent to travel together, in
// one navigation - same reason the task/settings overlays are search-param state
// on the current page (see the note in routes/_authed.tsx).
export interface PlannerSearch {
  editCollection?: string;
}

export const validatePlannerSearch = (search: Record<string, unknown>): PlannerSearch => ({
  editCollection: typeof search.editCollection === 'string' ? search.editCollection : undefined,
});
