import { useRouter } from '@tanstack/react-router';
import { PlannerView } from './PlannerView';
import { useAppData } from '@/lib/app-data';
import { useOverlayNav } from '@/common/hooks/useOverlayNav';

// Shared planner surface for both /planner (bare = 'all') and /planner/$collectionId.
// `selectedView` comes from the route; selecting a view navigates so the collection
// lives in the URL. viewMode + per-view config stay DB-synced inside PlannerView.
export function PlannerScreen({
  selectedView,
  editCollectionId,
}: {
  selectedView: string;
  editCollectionId: string | null;
}) {
  const d = useAppData();
  const router = useRouter();
  const { openTask } = useOverlayNav();
  // Selecting a view swaps the planner route, which unmounts PlannerView - so the
  // "also open this collection's editor" intent can't be local state set next to
  // the call. `opts.editCollection` rides along on the same navigation instead
  // (see features/planner/search.ts).
  const onSelectView = (view: string, opts?: { editCollection?: string }) => {
    const search = { editCollection: opts?.editCollection };
    if (view === 'all') router.navigate({ to: '/planner', search });
    else router.navigate({ to: '/planner/$collectionId', params: { collectionId: view }, search });
  };
  // Open (id) / close (null) the collection editor without changing views. Replaced
  // rather than pushed: the modal isn't somewhere you should have to press Back
  // out of, and a closed modal shouldn't reopen when you navigate back.
  const onEditCollection = (id: string | null) =>
    router.navigate({
      to: '.',
      search: (prev) => ({ ...prev, editCollection: id ?? undefined }),
      replace: true,
    });
  const onOpenTask = (id: string) => openTask(id);

  return (
    <main className="h-screen py-0">
      <div className="h-screen">
        <PlannerView
          dayTodos={d.dayTodos}
          collectionOptions={d.hubCollectionOptions}
          onSetTaskCollection={d.setTaskCollection}
          onCreateCollection={d.createCollection}
          onSaveTodo={d.handleHubSaveTodo}
          onAddTodo={d.handleHubAddTodo}
          onAddSubtask={d.handleAddSubtask}
          onAddCollection={d.addHubCollection}
          workspaces={d.workspaces}
          activeWorkspaceId={d.activeWorkspaceId}
          onSelectWorkspace={d.setActiveWorkspaceId}
          onAddWorkspace={d.addWorkspace}
          onRenameWorkspace={d.renameWorkspace}
          onDeleteTodo={d.handleDeleteTodoById}
          onDeleteCollection={d.handleDeleteCollection}
          onArchiveTodo={d.handleArchiveTodo}
          onArchiveTodos={d.handleArchiveTodos}
          onUnarchiveTodo={d.handleUnarchiveTodo}
          onReorder={d.handleReorderHubTodos}
          onToggleTodo={d.handleToggleTodo}
          selectedView={selectedView}
          onSelectView={onSelectView}
          editCollId={editCollectionId}
          onEditCollection={onEditCollection}
          dataReady={d.isDataReady}
          onOpenTask={onOpenTask}
        />
      </div>
    </main>
  );
}
