import { useRouter } from '@tanstack/react-router';
import { PlannerView } from './PlannerView';
import { useAppData } from '@/lib/app-data';
import { useOverlayNav } from '@/common/hooks/useOverlayNav';

// Shared planner surface for both /planner (bare = 'all') and /planner/$collectionId.
// `selectedView` comes from the route; selecting a view navigates so the collection
// lives in the URL. viewMode + per-view config stay DB-synced inside PlannerView.
export function PlannerScreen({ selectedView }: { selectedView: string }) {
  const d = useAppData();
  const router = useRouter();
  const { openTask } = useOverlayNav();
  const onSelectView = (view: string) =>
    router.history.push(view === 'all' ? '/planner' : `/planner/${encodeURIComponent(view)}`);
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
          onReorder={d.handleReorderHubTodos}
          onToggleTodo={d.handleToggleTodo}
          selectedView={selectedView}
          onSelectView={onSelectView}
          dataReady={d.isDataReady}
          onOpenTask={onOpenTask}
        />
      </div>
    </main>
  );
}
