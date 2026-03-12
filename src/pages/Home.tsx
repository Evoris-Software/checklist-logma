import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaTruck,
  FaCogs,
  FaBatteryFull,
  FaGasPump,
  FaHistory,
  FaWrench,
  FaUserShield,
  FaChevronDown,
} from "react-icons/fa";
import { useAuth } from "../auth/AuthContext";
import logo from "../assets/logo-branco.png";
import { signOut } from "firebase/auth";
import { auth } from "../services/firebase";

const checklistPorRole: Record<
  string,
  { label: string; rota: string; icon: React.ReactNode }
> = {
  motorista: {
    label: "Novo Checklist Veículo",
    rota: "/checklist/veiculo",
    icon: <FaTruck size={20} />,
  },
  operador_empilhadeira: {
    label: "Novo Checklist Equipamento",
    rota: "/checklist/equipamento",
    icon: <FaCogs size={20} />,
  },
  operador_gerador: {
    label: "Novo Checklist Gerador",
    rota: "/checklist/gerador",
    icon: <FaBatteryFull size={20} />,
  },
};

export default function Home() {
  const navigate = useNavigate();
  const { appUser } = useAuth();
  const [openChecklistMenu, setOpenChecklistMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const motorista =
    appUser?.nome ||
    (appUser?.email ? String(appUser.email).split("@")[0] : "Usuário");
  const role = appUser?.role ?? null;
  const roles = appUser?.roles ?? (role ? [role] : []);

  const rolesArr = Array.isArray(roles) ? roles : role ? [role] : [];
  const has = (r: string) => rolesArr.map(String).includes(r);
  const isAdmin = has("admin");
  const isMotorista = has("motorista");
  const isVendedor = has("vendedor");
  const vendorOnly = isVendedor && !isAdmin && !isMotorista;

  const hoje = new Date();
  const diaSemana = hoje.getDay();
  const podeAcessarChecklist = diaSemana === 1 || diaSemana === 4;
  const checklistDesabilitado = !isAdmin && !podeAcessarChecklist;

  const handleChecklistClick = (rota: string) => {
    if (checklistDesabilitado) return;
    navigate(rota);
  };

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!openChecklistMenu) return;
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenChecklistMenu(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [openChecklistMenu]);

  const availableChecklistRoles = Object.keys(checklistPorRole);
  const primaryChecklistRole = rolesArr.find((r) =>
    availableChecklistRoles.includes(String(r)),
  ) ?? (availableChecklistRoles.includes(String(role)) ? role : null);

  const canAbastecerPublic = isAdmin || isMotorista || isVendedor;

  const cardBase =
    "w-full flex items-center justify-center gap-3 rounded-2xl border border-white/10 bg-[#161a24] px-6 py-4 text-left font-semibold text-slate-100 shadow-lg ring-1 ring-white/10 transition hover:-translate-y-0.5 hover:ring-white/20 focus:outline-none focus:ring-2 focus:ring-sky-500";

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/");
    } catch {
      // noop
    }
  };

  return (
    <div className="flex flex-col items-center justify-center py-8 text-white">
      <div className="w-full max-w-2xl px-4">
        <div className="mb-6 flex justify-center">
          <img
            src={logo}
            alt="Logma Transportes"
            className="h-24 w-auto object-contain drop-shadow-lg"
          />
        </div>
        <h1 className="text-center text-2xl font-bold tracking-tight text-slate-50 sm:text-3xl">
          Bem-vindo, <span className="text-white">{motorista}</span>
        </h1>
        <p className="mt-2 text-center text-sm text-slate-400">
          Selecione uma ação para continuar
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {!vendorOnly &&
            (isAdmin ? (
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setOpenChecklistMenu((s) => !s)}
                  aria-expanded={openChecklistMenu}
                  aria-controls="checklist-submenu"
                  className={`${cardBase} bg-gradient-to-br from-slate-600 to-slate-700`}
                >
                  <FaTruck className="text-slate-200" />
                  Checklists
                  <FaChevronDown className="ml-auto text-slate-300" />
                </button>
                {openChecklistMenu && (
                  <div
                    id="checklist-submenu"
                    className="absolute left-0 right-0 top-full z-50 mt-2 space-y-1 rounded-xl border border-white/10 bg-[#111420] p-2 shadow-xl"
                    role="menu"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setOpenChecklistMenu(false);
                        navigate("/checklist/veiculo");
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-slate-200 hover:bg-white/10"
                    >
                      <FaTruck className="text-emerald-400" />
                      Checklist Veículo
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setOpenChecklistMenu(false);
                        navigate("/checklist/equipamento");
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-slate-200 hover:bg-white/10"
                    >
                      <FaCogs className="text-amber-400" />
                      Checklist Equipamento
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setOpenChecklistMenu(false);
                        navigate("/checklist/gerador");
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-slate-200 hover:bg-white/10"
                    >
                      <FaBatteryFull className="text-purple-400" />
                      Checklist Gerador
                    </button>
                  </div>
                )}
              </div>
            ) : (
              primaryChecklistRole &&
              checklistPorRole[primaryChecklistRole] && (
                <button
                  type="button"
                  onClick={() =>
                    handleChecklistClick(
                      checklistPorRole[primaryChecklistRole].rota,
                    )
                  }
                  disabled={checklistDesabilitado}
                  title={
                    checklistDesabilitado
                      ? "Disponível apenas nas segundas e quintas-feiras"
                      : undefined
                  }
                  className={`${cardBase} bg-gradient-to-br from-slate-600 to-slate-700 ${checklistDesabilitado ? "cursor-not-allowed opacity-70" : ""}`}
                >
                  {checklistPorRole[primaryChecklistRole].icon}
                  {checklistPorRole[primaryChecklistRole].label}
                </button>
              )
            ))}

          {!vendorOnly && (
            <button
              type="button"
              onClick={() => navigate("/historico")}
              className={`${cardBase} bg-gradient-to-br from-slate-100 to-slate-200 text-slate-800 hover:from-slate-200 hover:to-slate-300`}
            >
              <FaHistory className="text-slate-600" />
              Meu Histórico de Checklists
            </button>
          )}

          {canAbastecerPublic && (
            <>
              <button
                type="button"
                onClick={() => navigate("/abastecimento/lancar")}
                className={`${cardBase} bg-gradient-to-br from-emerald-600 to-emerald-700`}
              >
                <FaGasPump />
                Lançar Abastecimento
              </button>
              <button
                type="button"
                onClick={() => navigate("/meus-abastecimentos")}
                className={`${cardBase} bg-gradient-to-br from-slate-100 to-slate-200 text-slate-800`}
              >
                <FaHistory className="text-slate-600" />
                Meu Histórico de Abastecimentos
              </button>
            </>
          )}

          {/* Card de sair para não-admins (mobile-friendly) */}
          {!isAdmin && (
            <button
              type="button"
              onClick={handleLogout}
              className={`${cardBase} bg-gradient-to-br from-red-600 to-red-700`}
            >
              <FaHistory className="text-red-100" />
              Sair da Conta
            </button>
          )}

          {isAdmin && (
            <>
              <button
                type="button"
                onClick={() => navigate("/abastecimento")}
                className={`${cardBase} bg-gradient-to-br from-emerald-600 to-emerald-700`}
              >
                <FaGasPump />
                Abastecimento
              </button>
              <button
                type="button"
                onClick={() => navigate("/manutencao")}
                className={`${cardBase} bg-gradient-to-br from-amber-500 to-amber-600 text-slate-900`}
              >
                <FaWrench />
                Manutenções
              </button>
              <button
                type="button"
                onClick={() => navigate("/admin")}
                className={`${cardBase} bg-gradient-to-br from-blue-600 to-blue-700`}
              >
                <FaUserShield />
                Painel Admin
              </button>
            </>
          )}
        </div>

        {!vendorOnly && !podeAcessarChecklist && !isAdmin && (
          <p className="mt-4 text-center text-sm text-amber-400">
            Você só pode acessar os checklists nas segundas e quintas-feiras.
          </p>
        )}

        <footer className="mt-10 border-t border-white/10 pt-6 text-center text-xs text-slate-500">
          Powered by{" "}
          <a
            href="https://evoris.vip"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-sky-400 hover:text-sky-300"
          >
            Evoris
          </a>{" "}
          • {new Date().getFullYear()}
        </footer>
      </div>
    </div>
  );
}
