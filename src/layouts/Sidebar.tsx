import { NavLink } from "react-router-dom";
import {
  FaTruck,
  FaGasPump,
  FaHistory,
  FaWrench,
  FaUserShield,
  FaSignOutAlt,
  FaClipboardList,
} from "react-icons/fa";
import type { Role } from "../types";

interface SidebarProps {
  nome?: string;
  role?: Role | string | null;
  roles?: (Role | string)[];
  onLogout?: () => void;
}

function isRole(roles: (Role | string)[] | undefined, r: Role): boolean {
  if (!roles) return false;
  return roles.map(String).map((x) => x.toLowerCase()).includes(r);
}

export function Sidebar({ nome, role, roles, onLogout }: SidebarProps) {
  const roleStr = role ? String(role).toLowerCase() : null;
  const allRoles = [
    ...(roles ?? []),
    ...(roleStr ? [roleStr] : []),
  ].map(String);

  const isAdmin =
    roleStr === "admin" || isRole(allRoles, "admin");
  const isMotorista =
    roleStr === "motorista" || isRole(allRoles, "motorista");
  const isVendedor =
    roleStr === "vendedor" || isRole(allRoles, "vendedor");

  const canChecklist = !isVendedor || isAdmin;
  const canAbastecimentoPublic = isAdmin || isMotorista || isVendedor;

  return (
    <aside className="hidden md:flex md:flex-col w-64 shrink-0 bg-[#111420] text-slate-100 border-r border-white/5 shadow-xl">
      <div className="h-16 flex items-center px-5 border-b border-white/10">
        <div className="flex flex-col">
          <span className="text-xs uppercase tracking-widest text-slate-500">
            Checklist Logma
          </span>
          <span className="text-sm font-semibold text-slate-50 truncate max-w-[180px]">
            {nome ?? "Bem-vindo"}
          </span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-2 text-sm">
        <NavLink
          to={isAdmin ? "/dashboard" : "/"}
          className={({ isActive }) =>
            [
              "flex items-center gap-2 rounded-lg px-3 py-2 transition-colors",
              isActive
                ? "bg-slate-800 text-slate-50"
                : "text-slate-300 hover:bg-slate-800/70 hover:text-slate-50",
            ].join(" ")
          }
        >
          <FaClipboardList className="text-sky-400" />
          <span>Dashboard</span>
        </NavLink>

        {canChecklist && (
          <div className="pt-2">
            <p className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Checklists
            </p>
            <div className="space-y-1">
              <NavLink
                to="/checklist/veiculo"
                className={({ isActive }) =>
                  [
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors",
                    isActive
                      ? "bg-slate-800 text-slate-50"
                      : "text-slate-300 hover:bg-slate-800/70 hover:text-slate-50",
                  ].join(" ")
                }
              >
                <FaTruck className="text-emerald-400" />
                <span>Veículos</span>
              </NavLink>
              <NavLink
                to="/checklist/equipamento"
                className={({ isActive }) =>
                  [
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors",
                    isActive
                      ? "bg-slate-800 text-slate-50"
                      : "text-slate-300 hover:bg-slate-800/70 hover:text-slate-50",
                  ].join(" ")
                }
              >
                <FaWrench className="text-amber-300" />
                <span>Equipamentos</span>
              </NavLink>
              <NavLink
                to="/checklist/gerador"
                className={({ isActive }) =>
                  [
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors",
                    isActive
                      ? "bg-slate-800 text-slate-50"
                      : "text-slate-300 hover:bg-slate-800/70 hover:text-slate-50",
                  ].join(" ")
                }
              >
                <FaGasPump className="text-purple-300" />
                <span>Geradores</span>
              </NavLink>
            </div>
          </div>
        )}

        {!isVendedor && (
          <NavLink
            to="/historico"
            className={({ isActive }) =>
              [
                "mt-3 flex items-center gap-2 rounded-lg px-3 py-2 transition-colors",
                isActive
                  ? "bg-slate-800 text-slate-50"
                  : "text-slate-300 hover:bg-slate-800/70 hover:text-slate-50",
              ].join(" ")
            }
          >
            <FaHistory className="text-slate-300" />
            <span>Histórico de Checklists</span>
          </NavLink>
        )}

        {canAbastecimentoPublic && (
          <div className="pt-2">
            <p className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Abastecimento
            </p>
            <div className="space-y-1">
              <NavLink
                to="/abastecimento/lancar"
                className={({ isActive }) =>
                  [
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors",
                    isActive
                      ? "bg-slate-800 text-slate-50"
                      : "text-slate-300 hover:bg-slate-800/70 hover:text-slate-50",
                  ].join(" ")
                }
              >
                <FaGasPump className="text-emerald-400" />
                <span>Lançar Abastecimento</span>
              </NavLink>
              <NavLink
                to="/meus-abastecimentos"
                className={({ isActive }) =>
                  [
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors",
                    isActive
                      ? "bg-slate-800 text-slate-50"
                      : "text-slate-300 hover:bg-slate-800/70 hover:text-slate-50",
                  ].join(" ")
                }
              >
                <FaHistory className="text-sky-300" />
                <span>Histórico de Abastecimentos</span>
              </NavLink>
            </div>
          </div>
        )}

        {isAdmin && (
          <div className="pt-2">
            <p className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Administração
            </p>
            <div className="space-y-1">
              <NavLink
                to="/abastecimento"
                className={({ isActive }) =>
                  [
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors",
                    isActive
                      ? "bg-slate-800 text-slate-50"
                      : "text-slate-300 hover:bg-slate-800/70 hover:text-slate-50",
                  ].join(" ")
                }
              >
                <FaGasPump className="text-emerald-400" />
                <span>Dashboard Abastecimento</span>
              </NavLink>
              <NavLink
                to="/manutencao"
                className={({ isActive }) =>
                  [
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors",
                    isActive
                      ? "bg-slate-800 text-slate-50"
                      : "text-slate-300 hover:bg-slate-800/70 hover:text-slate-50",
                  ].join(" ")
                }
              >
                <FaWrench className="text-amber-300" />
                <span>Manutenções</span>
              </NavLink>
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  [
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors",
                    isActive
                      ? "bg-slate-800 text-slate-50"
                      : "text-slate-300 hover:bg-slate-800/70 hover:text-slate-50",
                  ].join(" ")
                }
              >
                <FaUserShield className="text-sky-400" />
                <span>Painel Admin</span>
              </NavLink>
            </div>
          </div>
        )}
      </nav>

      <button
        type="button"
        onClick={onLogout}
        className="m-3 mb-4 flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-red-500 to-red-600 px-3 py-2 text-sm font-semibold text-white shadow-lg shadow-red-900/40 hover:from-red-400 hover:to-red-500 transition-transform hover:-translate-y-0.5"
      >
        <FaSignOutAlt />
        <span>Sair</span>
      </button>
    </aside>
  );
}

export default Sidebar;

