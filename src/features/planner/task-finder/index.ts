// The ⌘K task search overlay. Built on the planner's table + collection tree, so
// it belongs to this feature — but it is mounted by the app shell and the daily
// list, and the planner's own table cells reach it (via taskChips → the parent
// picker). It therefore gets its own entry point rather than being re-exported
// from '@/features/planner': that barrel also exports PlannerScreen, the route
// component, and routing the two through one module puts a lazily-chunked route
// entry inside an import cycle.
export { TaskFinder } from './TaskFinder';
