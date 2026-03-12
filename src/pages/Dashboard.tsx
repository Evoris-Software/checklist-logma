import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "../services/firebase";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

function getDateFromAny(d: any): Date | null {
  if (!d) return null;
  const dt = d?.toDate?.() ? d.toDate() : d?.seconds ? new Date(d.seconds * 1000) : new Date(d);
  return dt instanceof Date && !Number.isNaN(dt.getTime()) ? dt : null;
}

export default function Dashboard() {
  const { appUser } = useAuth();

  const roles = appUser?.roles ?? (appUser?.role ? [appUser.role] : []);
  const isAdmin = roles.map(String).includes("admin");

  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [checklists, setChecklists] = useState<any[]>([]);
  const [manutencoes, setManutencoes] = useState<any[]>([]);
  const [abastecimentos, setAbastecimentos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        const [snapU, snapC, snapM, snapA] = await Promise.all([
          getDocs(query(collection(db, "usuarios"), orderBy("nome", "asc"))),
          getDocs(query(collection(db, "checklists"), orderBy("dataHora", "desc"))),
          getDocs(query(collection(db, "manutencoes"), orderBy("dataHora", "desc"))),
          getDocs(query(collection(db, "abastecimentos"), orderBy("dataAbastecimento", "desc"))),
        ]);
        setUsuarios(snapU.docs.map((d) => ({ id: d.id, ...d.data() })));
        setChecklists(snapC.docs.map((d) => ({ id: d.id, ...d.data() })));
        setManutencoes(snapM.docs.map((d) => ({ id: d.id, ...d.data() })));
        setAbastecimentos(snapA.docs.map((d) => ({ id: d.id, ...d.data() })));
      } finally {
        setLoading(false);
      }
    })();
  }, [isAdmin]);

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  const now = new Date();
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

  const usuariosOnline = useMemo(() => {
    return usuarios.filter((u) => {
      const ls = (u as any).lastSeenAt;
      if (!ls) return false;
      const dt = ls?.toDate?.() ? ls.toDate() : ls?.seconds ? new Date(ls.seconds * 1000) : new Date(ls);
      if (!(dt instanceof Date) || Number.isNaN(dt.getTime())) return false;
      return dt >= fiveMinutesAgo;
    });
  }, [usuarios, fiveMinutesAgo]);

  const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1);

  const checklistsMes = useMemo(
    () =>
      checklists.filter((c) => {
        const dt = getDateFromAny((c as any).dataHora);
        return dt && dt >= inicioMes;
      }),
    [checklists, inicioMes],
  );

  const manutencoesMes = useMemo(
    () =>
      manutencoes.filter((m) => {
        const dt = getDateFromAny((m as any).dataHora);
        return dt && dt >= inicioMes;
      }),
    [manutencoes, inicioMes],
  );

  const abastecimentosMes = useMemo(
    () =>
      abastecimentos.filter((a) => {
        const dt =
          getDateFromAny((a as any).dataAbastecimento) ||
          getDateFromAny((a as any).criadoEm) ||
          getDateFromAny((a as any).dataHora);
        return dt && dt >= inicioMes;
      }),
    [abastecimentos, inicioMes],
  );

  const usuariosAtivosMes = useMemo(() => {
    const setIds = new Set<string>();
    checklistsMes.forEach((c: any) => {
      if (c.usuarioUid) setIds.add(String(c.usuarioUid));
    });
    manutencoesMes.forEach((m: any) => {
      if (m.criadoPorUid) setIds.add(String(m.criadoPorUid));
    });
    abastecimentosMes.forEach((a: any) => {
      if (a.userId) setIds.add(String(a.userId));
    });
    return setIds.size;
  }, [checklistsMes, manutencoesMes, abastecimentosMes]);

  const ultimasAcoes = useMemo(() => {
    const itens: { tipo: string; descricao: string; data: Date }[] = [];
    checklists.forEach((c: any) => {
      const dt = getDateFromAny(c.dataHora);
      if (!dt) return;
      itens.push({
        tipo: "Checklist",
        descricao: c.selecionadoNome || c.veiculo || "Checklist",
        data: dt,
      });
    });
    manutencoes.forEach((m: any) => {
      const dt = getDateFromAny(m.dataHora);
      if (!dt) return;
      itens.push({
        tipo: "Manutenção",
        descricao: m.veiculoNome || m.tipo || "Manutenção",
        data: dt,
      });
    });
    abastecimentos.forEach((a: any) => {
      const dt =
        getDateFromAny(a.dataAbastecimento) ||
        getDateFromAny(a.criadoEm) ||
        getDateFromAny(a.dataHora);
      if (!dt) return;
      itens.push({
        tipo: "Abastecimento",
        descricao: a.placa || a.frotaNumero || "Abastecimento",
        data: dt,
      });
    });
    return itens.sort((a, b) => b.data.getTime() - a.data.getTime()).slice(0, 8);
  }, [checklists, manutencoes]);

  return (
    <div className="flex min-h-screen flex-col items-center bg-[#0b0d12] px-4 py-6 text-slate-100">
      <div className="w-full max-w-5xl">
        <h2 className="mb-2 text-center text-2xl font-bold text-white">Dashboard Geral</h2>
        <p className="mb-6 text-center text-xs text-slate-500">
          Visão consolidada de uso do sistema e últimas atividades.
        </p>

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-[#161a24] p-4 shadow-lg ring-1 ring-white/5">
            <div className="text-xs uppercase tracking-wide text-slate-400">Usuários online agora</div>
            <div className="mt-1 text-3xl font-bold text-emerald-400">
              {loading ? "…" : usuariosOnline.length}
            </div>
            <div className="mt-2 text-xs text-slate-500">
              {loading
                ? "Carregando…"
                : usuariosOnline.length === 0
                ? "Nenhum usuário ativo nos últimos 5 minutos."
                : `${usuariosOnline
                    .slice(0, 3)
                    .map((u) => u.nome || u.email)
                    .join(", ")}${usuariosOnline.length > 3 ? " …" : ""}`}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#161a24] p-4 shadow-lg ring-1 ring-white/5">
            <div className="text-xs uppercase tracking-wide text-slate-400">
              Pessoas ativas no mês ({String(now.getMonth() + 1).padStart(2, "0")}/{now.getFullYear()})
            </div>
            <div className="mt-1 text-3xl font-bold text-sky-400">{loading ? "…" : usuariosAtivosMes}</div>
            <div className="mt-2 text-xs text-slate-500">Usuários que lançaram checklists ou manutenções.</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#161a24] p-4 shadow-lg ring-1 ring-white/5">
            <div className="text-xs uppercase tracking-wide text-slate-400">Volume operacional do mês</div>
            <div className="mt-2 flex items-baseline gap-6 text-sm">
              <div>
                <div className="text-xs text-slate-400">Checklists</div>
                <div className="text-2xl font-bold text-slate-100">
                  {loading ? "…" : checklistsMes.length}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Manutenções</div>
                <div className="text-2xl font-bold text-slate-100">
                  {loading ? "…" : manutencoesMes.length}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Abastecimentos</div>
                <div className="text-2xl font-bold text-slate-100">
                  {loading ? "…" : abastecimentosMes.length}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#161a24] p-4 shadow-lg ring-1 ring-white/5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">Últimas ações</h3>
          </div>
          {loading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-4 w-full animate-pulse rounded bg-white/5" />
              ))}
            </div>
          ) : ultimasAcoes.length === 0 ? (
            <div className="text-sm text-slate-500">Nenhuma ação recente encontrada.</div>
          ) : (
            <ul className="divide-y divide-white/5 text-sm">
              {ultimasAcoes.map((a, idx) => (
                <li key={idx} className="flex items-center justify-between py-2">
                  <div>
                    <span className="mr-2 rounded-lg bg-white/5 px-2 py-0.5 text-xs font-semibold text-slate-200">
                      {a.tipo}
                    </span>
                    <span className="text-slate-200">{a.descricao}</span>
                  </div>
                  <span className="text-xs text-slate-500">
                    {a.data.toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

