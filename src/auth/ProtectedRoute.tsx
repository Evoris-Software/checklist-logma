import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import type { Role } from "../types";

function Splash() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0b0d12] text-white">
      <div className="text-center">
        <div className="inline-block h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        <div className="mt-3 text-sm text-white/80">Carregando…</div>
      </div>
    </div>
  );
}

interface ProtectedRouteProps {
  roles?: Role[];
  requireVerified?: boolean;
  redirectTo?: string;
  onlyAnonymous?: boolean;
  children: ReactNode;
}

export function ProtectedRoute({
  roles,
  requireVerified = false,
  redirectTo = "/",
  onlyAnonymous = false,
  children,
}: ProtectedRouteProps) {
  const { user, role, initializing } = useAuth();
  const location = useLocation();

  if (initializing) return <Splash />;

  if (onlyAnonymous) {
    if (user) return <Navigate to={redirectTo} replace />;
    return <>{children}</>;
  }

  if (!user) {
    return (
      <Navigate
        to="/"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  if (roles && role && !roles.includes(role)) {
    return <Navigate to={redirectTo} replace />;
  }

  if (requireVerified && !user.emailVerified) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}

export default ProtectedRoute;

