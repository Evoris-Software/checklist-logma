import type { ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { signOut } from "firebase/auth";
import { Sidebar } from "./Sidebar";
import { useAuth } from "../auth/AuthContext";
import { auth } from "../services/firebase";

interface ProtectedLayoutProps {
  children?: ReactNode;
}

export function ProtectedLayout({ children }: ProtectedLayoutProps) {
  const { appUser } = useAuth();

  const handleLogout = () => {
    signOut(auth);
  };

  const roles = appUser?.roles ?? (appUser?.role ? [appUser.role] : []);
  const isAdmin = Array.isArray(roles)
    ? roles.map((r) => String(r).toLowerCase()).includes("admin")
    : false;

  return (
    <div className="min-h-screen bg-[#0b0d12] text-slate-100 flex">
      {isAdmin && (
        <Sidebar
          nome={appUser?.nome}
          role={appUser?.role}
          roles={appUser?.roles}
          onLogout={handleLogout}
        />
      )}

      <div className="flex-1 flex flex-col min-h-screen">
        <header className="h-14 border-b border-white/5 bg-gradient-to-r from-[#0b0d12] via-[#101525] to-[#0b0d12] px-4 flex items-center justify-between">
          <div className="text-xs md:text-sm text-slate-300">
            <span className="font-semibold text-slate-100">Checklist Logma</span>{" "}
            <span className="hidden sm:inline text-slate-400">
              • Painel Operacional
            </span>
          </div>
        </header>

        <main className="flex-1 min-h-0 bg-[#050712]/95">
          <div className="h-full w-full max-w-6xl mx-auto px-3 sm:px-4 py-4">
            {children ?? <Outlet />}
          </div>
        </main>
      </div>
    </div>
  );
}

export default ProtectedLayout;

