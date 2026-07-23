// The todo domain. Sub-entries are published separately, because the planner
// consumes the model/fields/picker while the app shell consumes the overlays -
// routing both through one barrel would put a lazily-chunked route entry inside
// an import cycle (see features/planner/task-finder for the same reasoning):
//
//   '@/features/tasks/model'             pure domain logic, no React
//   '@/features/tasks/api'               query options (route loaders)
//   '@/features/tasks/fields'            field editors
//   '@/features/tasks/chips'             inline chip editors
//   '@/features/tasks/collection-picker' collection picker
export { TaskOverlay } from './TaskOverlay';
export { TodoFullView } from './TodoFullView';
export { QuickEditTodo, type QuickEditValues } from './QuickEditTodo';
export { TaskTimeChips, CountdownChip, formatCountdown, type CountdownMode } from './TaskTimeChips';
