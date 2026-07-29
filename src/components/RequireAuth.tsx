import { Navigate, Outlet, useLocation } from "react-router";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { isPublicPreview } from "@/lib/preview";

function AuthenticatedOutlet() {
  const location = useLocation();
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <main
        className="app-shell flex min-h-dvh items-center justify-center bg-[var(--bg)]"
        aria-busy="true"
        aria-label="Verifying secure session"
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="relative grid h-16 w-16 place-items-center rounded-2xl bg-white shadow-[0_16px_50px_rgba(20,184,166,0.14)]">
            <div className="absolute inset-0 animate-pulse rounded-2xl ring-1 ring-inset ring-teal-500/15" />
            <ShieldCheck className="text-teal-600" size={28} aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Securing your workspace</p>
            <p className="mt-1 text-xs text-slate-500">Verifying your encrypted session…</p>
          </div>
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

export default function RequireAuth() {
  if (isPublicPreview) {
    return <Outlet />;
  }

  return <AuthenticatedOutlet />;
}
