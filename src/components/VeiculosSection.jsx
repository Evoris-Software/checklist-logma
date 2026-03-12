import { useEffect, useMemo, useState } from "react"; 
import {
  listenVeiculos, addVeiculo, updateVeiculo, deleteVeiculo
} from "../services/veiculos";

const STATUS_OPTIONS = [
  { value: "ativo", label: "Ativo" },
  { value: "manutencao", label: "🛠 Em manutenção" },
  { value: "inativo", label: "Inativo" },
];

function initialForm() {
  return {
    nome: "",
    placa: "",
    descricao: "",
    tipo: "",
    frotaNumero: "",
    status: "ativo",
    // 🔹 novos (obrigatórios)
    tipoFrota: "",          // "leve" | "pesada"
    tipoCombustivel: "",    // "gasolina" | "diesel" | "etanol" | ...
    kmAtual: "",
  };
}

export default function VeiculosSection({ onAfterChange, defaultTipoFrota = "" }) {
  const [veiculos, setVeiculos] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(initialForm());
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  useEffect(() => {
    const unsub = listenVeiculos((list) => {
      setVeiculos(list);
      setLoading(false);
    });
    return () => unsub && unsub();
  }, []);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    let result = veiculos;

    if (f) {
      result = result.filter((v) => {
        return (
          (v.nome || "").toLowerCase().includes(f) ||
          (v.placa || "").toLowerCase().includes(f) ||
          (v.tipo || "").toLowerCase().includes(f) ||
          (v.descricao || "").toLowerCase().includes(f) ||
          (v.frotaNumero || "").toLowerCase().includes(f) ||
          (v.tipoFrota || "").toLowerCase().includes(f) ||
          (v.tipoCombustivel || "").toLowerCase().includes(f)
        );
      });
    }

    // Ordena pelo número da frota
    return result.sort((a, b) => {
      const numA = parseInt(a.frotaNumero || "0", 10);
      const numB = parseInt(b.frotaNumero || "0", 10);
      return numA - numB;
    });
  }, [filter, veiculos]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const pageItems = filtered.slice(startIndex, startIndex + pageSize);

  useEffect(() => {
    setPage(1);
  }, [filter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function openCreate() {
    setEditingId(null);
    setForm({
      ...initialForm(),
      // Se vier um default do dashboard (quando abriu pelo botão lá)
      tipoFrota: defaultTipoFrota || "",
    });
    setShowForm(true);
  }

  function openEdit(item) {
    setEditingId(item.id);
    setForm({
      nome: item.nome || "",
      placa: (item.placa || "").toUpperCase(),
      descricao: item.descricao || "",
      tipo: item.tipo || "",
      frotaNumero: item.frotaNumero || "",
      status: item.status || "ativo",
      // 🔹 carregar obrigatórios
      tipoFrota: item.tipoFrota || "",
      tipoCombustivel: item.tipoCombustivel || "",
      kmAtual: item.kmAtual ?? "",
    });
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e?.preventDefault?.();
    const payload = { ...form };

    if (!payload.nome?.trim()) {
      alert("Informe o nome/modelo do veículo.");
      return;
    }
    if (!payload.frotaNumero?.trim()) {
      alert("Informe o número da frota.");
      return;
    }
    if (!payload.placa?.trim()) {
      alert("Informe a placa.");
      return;
    }
    if (!["leve", "pesada"].includes(String(payload.tipoFrota).toLowerCase())) {
      alert("Selecione o Tipo de Frota (leve ou pesada).");
      return;
    }
    if (!String(payload.tipoCombustivel).trim()) {
      alert("Selecione o Tipo de Combustível.");
      return;
    }

    // Normalizações
    payload.placa = payload.placa.toUpperCase();
    payload.tipoFrota = String(payload.tipoFrota).toLowerCase();
    payload.tipoCombustivel = String(payload.tipoCombustivel).toLowerCase();
    payload.kmAtual = payload.kmAtual
      ? Number(String(payload.kmAtual).replace(/\D/g, "")) || 0
      : null;

    try {
      if (editingId) {
        await updateVeiculo(editingId, payload);
        onAfterChange?.({ type: "updated" });
      } else {
        await addVeiculo(payload);
        onAfterChange?.({ type: "created" });
      }
      setShowForm(false);
      setEditingId(null);
      setForm(initialForm());
    } catch (err) {
      console.error(err);
      alert(err?.message || "Erro ao salvar veículo.");
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Deseja remover este veículo?")) return;
    try {
      await deleteVeiculo(id);
      onAfterChange?.({ type: "deleted" });
    } catch (err) {
      console.error(err);
      alert("Erro ao excluir veículo.");
    }
  }

  const statusBadgeClass = (status) => {
    if (status === "ativo") return "bg-emerald-500/20 text-emerald-400";
    if (status === "manutencao") return "bg-amber-500/20 text-amber-400";
    return "bg-slate-500/20 text-slate-300";
  };

  const statusLabel = (status) => {
    if (status === "ativo") return "Ativo";
    if (status === "manutencao") return "Em manutenção";
    return "Inativo";
  };

  return (
    <div className="mb-5 rounded-2xl border border-white/10 bg-[#161a24] shadow-lg ring-1 ring-white/5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-4">
        <h5 className="flex items-center text-lg font-bold text-sky-400">
          Veículos cadastrados
          <span className="ml-2 rounded-lg bg-sky-500/20 px-2 py-0.5 text-sm font-bold text-sky-300">{veiculos.length}</span>
        </h5>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            className="w-full min-w-[260px] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
            placeholder="Filtrar (nome/placa/tipo/frota/combustível)"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <button className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500" onClick={openCreate}>
            + Cadastrar veículo
          </button>
        </div>
      </div>

      <div className="p-0">
        {loading ? (
          <div className="p-4 text-slate-400">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-slate-400">Nenhum veículo encontrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-black/20 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2">Nome/Modelo</th>
                  <th className="px-3 py-2">Placa</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Descrição</th>
                  <th className="px-3 py-2">Frota</th>
                  <th className="px-3 py-2">KM Atual</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Frota</th>
                  <th className="px-3 py-2">Combustível</th>
                  <th className="px-3 py-2">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {pageItems.map((v) => (
                  <tr key={v.id} className="hover:bg-white/5">
                    <td className="px-3 py-2 text-slate-200">{v.nome || "-"}</td>
                    <td className="px-3 py-2 font-medium text-slate-200">{(v.placa || "").toUpperCase() || "-"}</td>
                    <td className="px-3 py-2 text-slate-300">{v.tipo || "-"}</td>
                    <td className="max-w-[240px] truncate px-3 py-2 text-slate-400">{v.descricao || "-"}</td>
                    <td className="px-3 py-2 text-slate-300">{v.frotaNumero || "-"}</td>
                    <td className="px-3 py-2 text-slate-300">
                      {v.kmAtual != null && v.kmAtual !== ""
                        ? Number(v.kmAtual).toLocaleString("pt-BR")
                        : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded-lg px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(v.status)}`}>
                        {statusLabel(v.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2 capitalize text-slate-300">{v.tipoFrota || "-"}</td>
                    <td className="px-3 py-2 capitalize text-slate-300">{v.tipoCombustivel || "-"}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-2 py-1 text-xs font-medium text-sky-400 hover:bg-sky-500/20" onClick={() => openEdit(v)}>
                          Editar
                        </button>
                        <button className="rounded-lg border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-500/20" onClick={() => handleDelete(v.id)}>
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {filtered.length > pageSize && (
        <div className="flex items-center justify-end gap-3 px-4 py-3 text-xs text-slate-400">
          <span>
            Página {currentPage} de {totalPages}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-200 disabled:opacity-40"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              Anterior
            </button>
            <button
              type="button"
              className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-200 disabled:opacity-40"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Próxima
            </button>
          </div>
        </div>
      )}

      {/* Modal com backdrop embutido + z-index garantido */}
      {showForm && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setShowForm(false)}
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4"
        >
          <div
            className="w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="rounded-2xl border border-white/10 bg-[#161a24] text-slate-100 shadow-xl"
            >
              <form onSubmit={handleSubmit}>
                <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
                  <h5 className="text-lg font-semibold text-sky-400">
                    {editingId ? "Editar veículo" : "Cadastrar veículo"}
                  </h5>
                  <button type="button" className="rounded-lg p-1 text-slate-400 hover:bg-white/10" onClick={() => setShowForm(false)}>×</button>
                </div>

                <div className="px-6 py-5">
                  <div className="grid gap-4 md:grid-cols-12">
                    <div className="md:col-span-6">
                      <label className="mb-1 block text-xs text-slate-400">Nome/Modelo *</label>
                      <input
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        value={form.nome}
                        onChange={(e) => setForm((s) => ({ ...s, nome: e.target.value }))}
                        required
                      />
                    </div>
                    <div className="md:col-span-3">
                      <label className="mb-1 block text-xs text-slate-400">Placa *</label>
                      <input
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-uppercase text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        value={form.placa}
                        onChange={(e) => setForm((s) => ({ ...s, placa: e.target.value.toUpperCase() }))}
                        required
                      />
                    </div>
                    <div className="md:col-span-3">
                      <label className="mb-1 block text-xs text-slate-400">Frota/Nº *</label>
                      <input
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        value={form.frotaNumero}
                        onChange={(e) => setForm((s) => ({ ...s, frotaNumero: e.target.value }))}
                        required
                      />
                    </div>

                    <div className="md:col-span-4">
                      <label className="mb-1 block text-xs text-slate-400">Tipo</label>
                      <input
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        placeholder="veiculo / equipamento / gerador / empilhadeira..."
                        value={form.tipo}
                        onChange={(e) => setForm((s) => ({ ...s, tipo: e.target.value }))}
                      />
                    </div>
                    <div className="md:col-span-4">
                      <label className="mb-1 block text-xs text-slate-400">Status</label>
                      <select
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        value={form.status}
                        onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))}
                      >
                        {STATUS_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* 🔹 NOVOS CAMPOS OBRIGATÓRIOS */}
                    <div className="md:col-span-4">
                      <label className="mb-1 block text-xs text-slate-400">Tipo de Frota *</label>
                      <select
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        value={form.tipoFrota}
                        onChange={(e) => setForm((s) => ({ ...s, tipoFrota: e.target.value }))}
                        required
                      >
                        <option value="">Selecione...</option>
                        <option value="leve">Leve</option>
                        <option value="pesada">Pesada</option>
                      </select>
                    </div>
                    <div className="md:col-span-4">
                      <label className="mb-1 block text-xs text-slate-400">Combustível *</label>
                      <select
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        value={form.tipoCombustivel}
                        onChange={(e) => setForm((s) => ({ ...s, tipoCombustivel: e.target.value }))}
                        required
                      >
                        <option value="">Selecione...</option>
                        <option value="gasolina">Gasolina</option>
                        <option value="diesel">Diesel S10/S500</option>
                      </select>
                    </div>

                    <div className="md:col-span-12">
                      <label className="mb-1 block text-xs text-slate-400">Descrição</label>
                      <textarea
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        rows={3}
                        value={form.descricao}
                        onChange={(e) => setForm((s) => ({ ...s, descricao: e.target.value }))}
                      />
                    </div>
                    <div className="md:col-span-4">
                      <label className="mb-1 block text-xs text-slate-400">KM Atual (opcional)</label>
                      <input
                        type="number"
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        value={form.kmAtual}
                        onChange={(e) => setForm((s) => ({ ...s, kmAtual: e.target.value }))}
                        placeholder="Ex.: 123456"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 border-t border-white/10 px-6 py-4">
                  <button type="button" className="rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/10" onClick={() => setShowForm(false)}>
                    Cancelar
                  </button>
                  <button type="submit" className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500">
                    {editingId ? "Salvar alterações" : "Cadastrar"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
