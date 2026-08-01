// The embeddable task table, published separately from the planner's own barrel.
//
// Same reasoning as '@/features/planner/task-finder': the barrel exports
// PlannerScreen, which pulls the whole planner (and, through it, features/tasks)
// into anything that only wants to render rows - an import cycle for a task-side
// surface like the full view's Subtasks section. Nothing under this folder imports
// back into features/tasks' overlays, so entering here is cycle-free.
export {
  TaskTable,
  buildTreeModel,
  buildFlatModel,
  type TableModel,
  type TableInteraction,
  type TableRowHandlers,
  type RowDnD,
} from './TaskTable';
export { VARIANTS, type TableVariant } from '@/features/planner/variant';
export { useRowDnD } from '@/features/planner/hooks/useRowDnD';
// The few table types/constants an embedder has to name to build the model.
export {
  DEFAULT_SECTIONS_CONFIG,
  NAME_COL_KEY,
  type EditState,
  type ColKey,
} from '@/features/planner/types';
