import { useEffect, useMemo, useState } from "react";
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";
import { db } from "../../services/firebase";
import { useNavigate } from "react-router-dom";
import Cookies from "js-cookie";

/** Render do Firestore Timestamp / Date / string */
function toDateSafe(dt) {
  if (!dt) return null;
  if (typeof dt?.toDate === "function") return dt.toDate();
  if (dt?.seconds) return new Date(dt.seconds * 1000);
  try {
    const d = new Date(dt);
    return isNaN(d) ? null : d;
  } catch {
    return null;
  }
}

function labelVeiculoAbastecimento(item) {
  const frota = (item?.frotaNumero || "").trim();
  const placa = (item?.placa || "").trim();
  if (frota || placa) return [frota, placa].filter(Boolean).join(" — ");
  return "Sem veículo";
}

const hasValue = (v) => v !== undefined && v !== null && v !== "";

export default function MyAbastecimentos({ motorista }) {
  const [abastecimentos, setAbastecimentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [page, setPage] = useState(1);

  const navigate = useNavigate();

  useEffect(() => {
    async function fetchData() {
      setLoading(true);

      // Buscar usuarioUid do cookie
      const usuarioUid = Cookies.get("usuarioUid");
      if (!usuarioUid) {
        alert("Usuário não autenticado.");
        navigate("/login");
        return;
      }

      try {
        const qRef = query(
          collection(db, "abastecimentos"),
          where("userId", "==", usuarioUid),  
          orderBy("criadoEm", "desc")
        );
        const snap = await getDocs(qRef);
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setAbastecimentos(rows);
      } catch (err) {
        console.error("Erro ao buscar abastecimentos:", err);
        alert("Erro ao buscar abastecimentos.");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [navigate]);

  const toggleExpand = (id) => {
    setExpandedId((cur) => (cur === id ? null : id));
  };

  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(abastecimentos.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const abastecimentosPaginados = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return abastecimentos.slice(start, start + pageSize);
  }, [abastecimentos, currentPage]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <div className="flex min-h-screen flex-col items-center bg-[#0b0d12] px-4 py-6 text-slate-100">
      <div className="w-full max-w-2xl">
        {/* Botão Voltar */}
        <button
          type="button"
          className="mb-4 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10"
          onClick={() => navigate("/")}
        >
          ← Voltar
        </button>

        <h2 className="mb-5 text-2xl font-bold text-white">Meus Abastecimentos</h2>

        {loading ? (
          <div className="text-slate-500">Carregando...</div>
        ) : abastecimentos.length === 0 ? (
          <div className="text-slate-500">Nenhum abastecimento encontrado.</div>
        ) : (
          abastecimentosPaginados.map((item) => {
            const data = toDateSafe(item.criadoEm);
            const label = labelVeiculoAbastecimento(item);

            return (
              <div
                key={item.id}
                className="mb-3 cursor-pointer rounded-2xl border border-white/10 bg-[#161a24] p-4 shadow-lg ring-1 ring-white/5 transition hover:bg-[#1b2030]"
                onClick={() => toggleExpand(item.id)}
              >
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-lg font-bold text-slate-100">{label}</span>
                    <span className="text-xs text-slate-500">
                      {data ? data.toLocaleString() : "--"}
                    </span>
                  </div>

                  {/* Detalhes expandido */}
                  {expandedId === item.id && (
                    <div className="mt-3 border-t border-white/10 pt-3">
                      {/* Detalhes do abastecimento */}
                      <div className="mb-1 text-sm text-slate-400">
                        <b>Combustível:</b> {item.tipoCombustivel}
                      </div>
                      <div className="mb-1 text-sm text-slate-400">
                        <b>Litros:</b> {item.litros}
                      </div>
                      <div className="mb-1 text-sm text-slate-400">
                        <b>Preço por Litro:</b> R$ {item.precoPorLitro}
                      </div>
                      <div className="mb-1 text-sm text-slate-400">
                        <b>Valor Total:</b> R$ {item.valorTotal}
                      </div>
                      <div className="mb-1 text-sm text-slate-400">
                        <b>Posto:</b> {item.posto || "Não informado"}
                      </div>

                      {/* Observação geral */}
                      {item.obs && (
                        <div className="mt-2 text-sm italic text-slate-500">
                          <b>Obs:</b> {item.obs}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        {!loading && abastecimentos.length > pageSize && (
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
    </div>
  );
}
