import { createFileRoute } from '@tanstack/react-router';
import { TodosHubView } from '../../components/TodosHubView';
import { useAppData } from '../../data/AppDataContext';

export const Route = createFileRoute('/_authed/planner')({
  component: PlannerRoute,
});

function PlannerRoute() {
  const d = useAppData();
  return (
    <main className="h-screen py-0">
      <div className="h-screen">
        <TodosHubView
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
        />
      </div>
    </main>
  );
}
