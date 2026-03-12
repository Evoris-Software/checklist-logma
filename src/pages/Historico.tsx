import { useEffect, useMemo, useState } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  DocumentData,
  QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "../services/firebase";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

function toDateSafe(dt: unknown): Date | null {
  if (!dt) return null;
  const d = dt as { toDate?: () => Date; seconds?: number };
  if (typeof d?.toDate === "function") return d.toDate();
  if (d?.seconds) return new Date(d.seconds * 1000);
  try {
    const date = new Date(dt as string | number);
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

function labelVeiculoHistorico(item: Record<string, unknown>): string {
  if (item?.selecionadoNome) return String(item.selecionadoNome);
  const frota = String(item?.frotaNumeroSnapshot ?? "").trim();
  const placa = String(item?.placaSnapshot ?? "").trim();
  if (frota || placa) return [frota, placa].filter(Boolean).join(" — ");
  return "Sem veículo";
}

const hasValue = (v: unknown): boolean =>
  v !== undefined && v !== null && v !== "";

interface AnexoPreview {
  url: string;
  tipo?: string;
  nome?: string;
}

interface HistoricoItem extends Record<string, unknown> {
  id: string;
  dataHora?: unknown;
  respostas?: Record<string, string>;
  descricaoNok?: Record<string, string>;
  anexosNok?: Record<string, { url?: string; tipo?: string; nome?: string }>;
  obs?: string;
  kmAtual?: unknown;
  horimetroAtual?: unknown;
  tipoSnapshot?: string;
}

export default function Historico({ motorista }: { motorista?: string }) {
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [anexoOpen, setAnexoOpen] = useState(false);
  const [anexoPreview, setAnexoPreview] = useState<AnexoPreview | null>(null);
  const [page, setPage] = useState(1);

  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.uid) {
      navigate("/");
      return;
    }

    async function fetchData() {
      setLoading(true);
      try {
        const qRef = query(
          collection(db, "checklists"),
          where("usuarioUid", "==", user.uid),
          orderBy("dataHora", "desc"),
        );
        const snap = await getDocs(qRef);
        const rows = snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({
          id: d.id,
          ...d.data(),
        })) as HistoricoItem[];
        setHistorico(rows);
      } catch (err) {
        console.error("Erro ao buscar histórico:", err);
        alert("Erro ao buscar histórico.");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [navigate, user?.uid]);

  const toggleExpand = (id: string) => {
    setExpandedId((cur) => (cur === id ? null : id));
  };

  function handleOpenAnexo(anexo: AnexoPreview) {
    if (!anexo) return;
    setAnexoPreview(anexo);
    setAnexoOpen(true);
  }

  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(historico.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const historicoPaginado = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return historico.slice(start, start + pageSize);
  }, [historico, currentPage]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <div className="flex min-h-0 flex-col items-center py-6 px-3 text-slate-100">
      <div className="w-full max-w-xl">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="mb-4 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 shadow transition hover:bg-white/10"
        >
          ← Voltar
        </button>

        <h2 className="mb-6 text-xl font-bold text-white">
          Meu Histórico {motorista ? `— ${motorista}` : ""}
        </h2>

        {loading ? (
          <div className="flex items-center gap-2 text-slate-400">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-500 border-t-sky-400" />
            Carregando...
          </div>
        ) : historico.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-[#161a24] p-6 text-center text-slate-400">
            Nenhum checklist encontrado.
          </div>
        ) : (
          <div className="space-y-3">
            {historicoPaginado.map((item) => {
              const data = toDateSafe(item.dataHora);
              const label = labelVeiculoHistorico(item);
              const isEmpilhadeira =
                item?.tipoSnapshot === "empilhadeira" ||
                (hasValue(item?.horimetroAtual) && !hasValue(item?.kmAtual));
              const nokEntries = Object.entries(item.respostas || {}).filter(
                ([, v]) => v === "nok",
              );

              return (
                <div
                  key={item.id}
                  className="cursor-pointer rounded-2xl border border-white/10 bg-[#161a24] p-4 shadow-lg ring-1 ring-white/5 transition hover:ring-white/10"
                  onClick={() => toggleExpand(item.id)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-100">{label}</span>
                    <span className="text-sm text-slate-400">
                      {data ? data.toLocaleString("pt-BR") : "--"}
                    </span>
                  </div>

                  {expandedId === item.id && (
                    <div className="mt-4 border-t border-white/10 pt-4">
                      {isEmpilhadeira && hasValue(item.horimetroAtual) ? (
                        <div className="mb-2 text-sm text-slate-400">
                          <b>Horímetro (h):</b> {String(item.horimetroAtual)}
                        </div>
                      ) : hasValue(item.kmAtual) ? (
                        <div className="mb-2 text-sm text-slate-400">
                          <b>KM:</b> {String(item.kmAtual)}
                        </div>
                      ) : null}

                      <div className="mb-3">
                        <div className="mb-1 font-semibold text-slate-200">
                          Itens verificados
                        </div>
                        <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                          {Object.entries(item.respostas || {}).map(([k, v]) => (
                            <li key={k} className="flex gap-1">
                              <span className="text-slate-300">{k}:</span>
                              <span
                                className={
                                  v === "nok"
                                    ? "font-semibold text-red-400"
                                    : "font-semibold text-emerald-400"
                                }
                              >
                                {String(v).toUpperCase()}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {nokEntries.length > 0 && (
                        <div className="mb-2">
                          <div className="mb-1 font-semibold text-slate-200">
                            Problemas (NOK)
                          </div>
                          <div className="flex flex-col gap-2">
                            {nokEntries.map(([nomeItem]) => {
                              const desc =
                                (item.descricaoNok?.[nomeItem] as string)?.trim() ||
                                "(sem descrição)";
                              const anexo = item.anexosNok?.[nomeItem];
                              return (
                                <div
                                  key={nomeItem}
                                  className="rounded-lg border-l-4 border-red-500/80 bg-red-500/10 p-3"
                                >
                                  <div className="font-semibold text-slate-100">
                                    {nomeItem}
                                  </div>
                                  <div className="text-sm text-slate-400">
                                    {desc}
                                  </div>
                                  {anexo?.url && (
                                    <button
                                      type="button"
                                      className="mt-2 rounded-lg border border-sky-500/50 bg-sky-500/20 px-3 py-1.5 text-xs font-medium text-sky-200 hover:bg-sky-500/30"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenAnexo({
                                          url: anexo.url!,
                                          tipo: anexo.tipo,
                                          nome: anexo.nome || "anexo",
                                        });
                                      }}
                                    >
                                      {anexo.tipo?.startsWith("image/")
                                        ? "Ver imagem"
                                        : anexo.tipo?.startsWith("video/")
                                          ? "Ver vídeo"
                                          : "Abrir anexo"}
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {item.obs && (
                        <div className="mt-2 text-sm italic text-slate-400">
                          <b>Obs:</b> {String(item.obs)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {!loading && historico.length > pageSize && (
          <div className="mt-4 flex items-center justify-end gap-2 text-xs text-slate-400">
            <span>
              Página {currentPage} de {totalPages}
            </span>
            <button
              type="button"
              className="rounded-lg border border-white/10 px-2 py-1 text-slate-200 disabled:opacity-40"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              Anterior
            </button>
            <button
              type="button"
              className="rounded-lg border border-white/10 px-2 py-1 text-slate-200 disabled:opacity-40"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Próxima
            </button>
          </div>
        )}
      </div>

      {anexoOpen && anexoPreview && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setAnexoOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#161a24] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <h5 className="font-bold text-sky-400">Visualizar anexo</h5>
              <button
                type="button"
                className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"
                onClick={() => setAnexoOpen(false)}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            <div className="p-4 text-center">
              {anexoPreview.tipo?.startsWith("image/") ? (
                <img
                  src={anexoPreview.url}
                  alt={anexoPreview.nome ?? "Anexo"}
                  className="mx-auto max-h-[380px] max-w-full rounded-xl"
                />
              ) : anexoPreview.tipo?.startsWith("video/") ? (
                <video
                  src={anexoPreview.url}
                  controls
                  className="mx-auto max-h-[400px] max-w-full rounded-xl"
                />
              ) : (
                <div className="text-sm text-slate-400">
                  Tipo de anexo não suportado.
                </div>
              )}
              <div className="mt-2 text-sm text-slate-500">
                {anexoPreview.nome}
              </div>
            </div>
            <div className="border-t border-white/10 px-4 py-3">
              <button
                type="button"
                className="rounded-xl bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-500"
                onClick={() => setAnexoOpen(false)}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
