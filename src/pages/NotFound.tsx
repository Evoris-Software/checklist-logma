import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function NotFound() {
  const navigate = useNavigate();
  const { appUser } = useAuth();

  const roles = appUser?.roles ?? (appUser?.role ? [appUser.role] : []);
  const isAdmin = roles.map(String).includes("admin");

  const handleBack = () => {
    navigate(isAdmin ? "/dashboard" : "/", { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#050712] px-4 text-slate-100">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-gradient-to-b from-white/10 via-white/5 to-transparent px-6 py-8 shadow-[0_24px_80px_rgba(0,0,0,0.85)] backdrop-blur-xl">
        <div className="mb-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-400">
            Erro 404
          </p>
          <h1 className="mt-2 text-2xl font-bold text-slate-50">
            Página não encontrada
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            A rota que você tentou acessar não existe ou não está disponível.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-sky-500 via-sky-400 to-emerald-400 px-4 py-2.5 text-sm font-semibold tracking-wide text-slate-950 shadow-lg shadow-sky-900/40 transition hover:brightness-110 hover:-translate-y-0.5 active:translate-y-0"
          >
            Voltar para a página inicial
          </button>
        </div>

        <p className="mt-4 text-center text-[11px] text-slate-500">
          Se o problema persistir, procure o administrador da Logma.
        </p>
      </div>
    </div>
  );
}

