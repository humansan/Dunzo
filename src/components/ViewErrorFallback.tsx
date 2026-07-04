import { useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { AlertTriangle } from 'lucide-react';

// Localized fallback for a single view's render/loader error. It renders inside the
// persistent shell's <Outlet/>, so the Sidebar and the other routes stay usable — a
// crash in one view no longer blanks the whole app. Retry re-runs the route.
export function ViewErrorFallback({ error }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <div className="h-full min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center px-6 text-white/60 text-sm">
      <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center text-amber-400/80">
        <AlertTriangle size={26} />
      </div>
      <div>
        <p className="text-white/80 font-semibold">This view hit an error.</p>
        {error?.message && (
          <p className="mt-1 text-white/40 max-w-md break-words">{error.message}</p>
        )}
      </div>
      <button
        onClick={() => router.invalidate()}
        className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white font-semibold"
      >
        Retry
      </button>
    </div>
  );
}
