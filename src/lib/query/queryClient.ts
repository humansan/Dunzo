import { QueryClient } from '@tanstack/react-query';

// Single shared client. refetchOnWindowFocus gives simple last-write-wins
// multi-device reconciliation (DATABASE_MIGRATION_NOTES §5.5).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      staleTime: 30_000,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});
