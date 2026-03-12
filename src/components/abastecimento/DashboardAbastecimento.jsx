import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaGasPump,
  FaGaugeHigh,
  FaMoneyBillWave,
  FaPlus,
  FaFileExcel,
  FaImage,
} from "react-icons/fa6";
import { FaSearch, FaEdit, FaTrash } from "react-icons/fa";
import { collection, query, where, orderBy, getDocs, Timestamp } from "firebase/firestore";
import { db } from "../../services/firebase";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import {
  lerConfigAbastecimento,
  salvarThreshold,
  deleteAbastecimento,
} from "../../services/abastecimentos";
import { getVeiculosAtivos } from "../../services/veiculos";

const VeiculosSection = lazy(() => import("../VeiculosSection"));
import ModalLancarAbastecimento from "./ModalLancarAbastecimento";
import EditarAbastecimentoModal from "./EditarAbastecimentoModal";

function ymNow() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function DeltaBadge({ value, invert = false }) {
  if (value == null || Number.isNaN(value)) return null;

  const num = Number(value);
  const sign = num > 0 ? "+" : "";
  const isPositive = invert ? num < 0 : num > 0;
  const isNegative = invert ? num > 0 : num < 0;
  const cls = isPositive
    ? "ml-2 rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-400"
    : isNegative
    ? "ml-2 rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-semibold text-red-400"
    : "ml-2 rounded-full bg-slate-500/20 px-2 py-0.5 text-xs font-semibold text-slate-400";

  return <span className={cls}>{sign}{num.toFixed(2)}</span>;
}

// helpers
function getMonthBounds(ano, mes) {
  const start = new Date(ano, mes - 1, 1, 0, 0, 0, 0);
  const end = new Date(ano, mes, 1, 0, 0, 0, 0);
  return { startTs: Timestamp.fromDate(start), endTs: Timestamp.fromDate(end) };
}

function normalizeRow(raw) {
  const dateField = raw.dataAbastecimento || raw.dataHora || raw.criadoEm || raw.createdAt || null;
  const observacao = raw.observacao ?? raw.posto ?? raw.obs ?? "";
  const valorTotal =
    typeof raw.valorTotal === "number" && !isNaN(raw.valorTotal)
      ? raw.valorTotal
      : Number(((Number(raw.litros || 0) * Number(raw.precoPorLitro || 0)) || 0).toFixed(2));
  const tipoFrotaNorm = (raw.tipoFrota || "").toString().trim().toLowerCase();
  const tipoCombNorm = (raw.tipoCombustivel || "").toString().trim().toLowerCase();

  return {
    id: raw.id,
    veiculoId: raw.veiculoId || "",
    placa: (raw.placa || "").toUpperCase(),
    frotaNumero: raw.frotaNumero || "",
    tipoFrota: tipoFrotaNorm,
    tipoCombustivel: tipoCombNorm,
    isArla: tipoCombNorm === "arla",
    imagem: raw.imagem || raw.fotoUrl || null,
    litros: Number(raw.litros || 0),
    precoPorLitro: Number(raw.precoPorLitro || 0),
    valorTotal,
    kmAtual: raw.kmAtual != null ? Number(raw.kmAtual) : null,
    kmPorLitro: raw.kmPorLitro != null ? Number(raw.kmPorLitro) : null,
    observacao,
    dataAbastecimento: dateField,
  };
}

async function fetchAbastecimentosMes({ ano, mes, tipoFrota }) {
  const { startTs, endTs } = getMonthBounds(ano, mes);
  const col = collection(db, "abastecimentos");

  // cobre diferentes campos de data
  const queries = [
    query(
      col,
      where("dataAbastecimento", ">=", startTs),
      where("dataAbastecimento", "<", endTs),
      orderBy("dataAbastecimento", "desc")
    ),
    query(
      col,
      where("dataHora", ">=", startTs),
      where("dataHora", "<", endTs),
      orderBy("dataHora", "desc")
    ),
    query(
      col,
      where("createdAt", ">=", startTs),
      where("createdAt", "<", endTs),
      orderBy("createdAt", "desc")
    ),
  ];

  const results = [];
  for (const qRef of queries) {
    try {
      const snap = await getDocs(qRef);
      for (const docSnap of snap.docs) {
        results.push({ id: docSnap.id, ...docSnap.data() });
      }
    } catch (e) {
      console.warn("Consulta ignorada (provável índice ausente):", e?.message || e);
    }
  }

  // merge por id
  const byId = new Map();
  for (const r of results) byId.set(r.id, r);

  let rows = Array.from(byId.values()).map(normalizeRow);

  if (tipoFrota === "leve" || tipoFrota === "pesada") {
    rows = rows.filter((r) => (r.tipoFrota || "").toLowerCase() === tipoFrota);
  }

  rows.sort((a, b) => {
    const toMs = (x) =>
      typeof x?.toDate === "function"
        ? x.toDate().getTime()
        : x?.seconds
        ? x.seconds * 1000
        : x instanceof Date
        ? x.getTime()
        : 0;
    return toMs(b.dataAbastecimento) - toMs(a.dataAbastecimento);
  });

  return rows;
}

// ======= Cálculo de consumo km/L =======
function calcularConsumoKmL(items) {
  // ignora ARLA no cálculo
  const combustiveis = items.filter((i) => !i.isArla);

  const byVeic = new Map();
  for (const it of combustiveis) {
    if (!byVeic.has(it.veiculoId)) byVeic.set(it.veiculoId, []);
    byVeic.get(it.veiculoId).push(it);
  }

  for (const arr of byVeic.values()) {
    arr.sort((a, b) => {
      const toMs = (x) =>
        typeof x?.toDate === "function"
          ? x.toDate().getTime()
          : x?.seconds
          ? x.seconds * 1000
          : x instanceof Date
          ? x.getTime()
          : 0;
      return toMs(a.dataAbastecimento) - toMs(b.dataAbastecimento);
    });
  }

  let totalLitros = 0;
  let totalKm = 0;
  let totalValor = 0;

  for (const arr of byVeic.values()) {
    let prevKm = null;
    for (const r of arr) {
      const litros = Number(r.litros) || 0;
      const ppl = Number(r.precoPorLitro) || 0;
      totalValor += litros * ppl;

      if (isFinite(r.kmPorLitro) && r.kmPorLitro > 0) {
        totalLitros += litros;
        totalKm += r.kmPorLitro * litros;
      } else if (isFinite(r.kmAtual) && prevKm != null && r.kmAtual > prevKm && litros > 0) {
        const deltaKm = r.kmAtual - prevKm;
        totalKm += deltaKm;
        totalLitros += litros;
      }

      // Atualiza prevKm SOMENTE se NÃO for ARLA
      if (isFinite(r.kmAtual) && !r.isArla) prevKm = r.kmAtual;
    }
  }

  const precoMedio = totalLitros > 0 ? totalValor / totalLitros : 0;
  const consumoMedio = totalLitros > 0 ? totalKm / totalLitros : null;

  return {
    litrosTotais: Number(totalLitros.toFixed(2)),
    precoMedio: Number(precoMedio.toFixed(4)),
    consumoMedioFrota: consumoMedio != null ? Number(consumoMedio.toFixed(3)) : null,
    totalGasto: Number(items.reduce((acc, i) => acc + Number(i.valorTotal || 0), 0).toFixed(2)),
  };
}

export default function DashboardAbastecimento() {
  const navigate = useNavigate();

  const [{ year, month }, setYM] = useState(ymNow());
  const [frota, setFrota] = useState("todas"); // "todas" | "leve" | "pesada"
  const [loading, setLoading] = useState(false);

  const [th, setTh] = useState({
    leve: { precoMedioTarget: 6.5 },
    pesada: { precoMedioTarget: 5.5 },
  });
  const [savingTarget, setSavingTarget] = useState(false);
  const [showTargetEditor, setShowTargetEditor] = useState(false);

  const [veiculos, setVeiculos] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [filtroPlaca, setFiltroPlaca] = useState("");
  const [filtroCombustivel, setFiltroCombustivel] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const [showVeiculos, setShowVeiculos] = useState(false);
  const [showLancar, setShowLancar] = useState(false);

  // edição em modal
  const [showEditar, setShowEditar] = useState(false);
  const [registroSelecionado, setRegistroSelecionado] = useState(null);

  // visualizar imagem
  const [showImagem, setShowImagem] = useState(false);
  const [imagemUrl, setImagemUrl] = useState(null);

  // thresholds
  useEffect(() => {
    (async () => {
      try {
        const cfg = await lerConfigAbastecimento();
        setTh({
          leve: { precoMedioTarget: Number(cfg?.alvoPrecoLeve ?? 6.5) },
          pesada: { precoMedioTarget: Number(cfg?.alvoPrecoPesada ?? 5.5) },
        });
      } catch {}
    })();
  }, []);

  // veículos
  useEffect(() => {
    (async () => {
      const listaAtivos = await getVeiculosAtivos();
      setVeiculos(listaAtivos);
    })();
  }, []);

  // carregamento principal
  const loadDados = async () => {
    setLoading(true);
    try {
      const tipoFrota = frota === "todas" ? undefined : frota;

      const atuais = await fetchAbastecimentosMes({ ano: year, mes: month, tipoFrota });

      // mês anterior
      let prevMes = month - 1;
      let prevAno = year;
      if (prevMes < 1) {
        prevMes = 12;
        prevAno = year - 1;
      }
      const anteriores = await fetchAbastecimentosMes({ ano: prevAno, mes: prevMes, tipoFrota });

      setRegistros(atuais);

      const atual = calcularConsumoKmL(atuais);
      const anterior = calcularConsumoKmL(anteriores);
      const delta = {
        totalGasto: Number((atual.totalGasto - anterior.totalGasto).toFixed(2)),
        precoMedio: Number((atual.precoMedio - anterior.precoMedio).toFixed(4)),
        consumoMedioFrota:
          atual.consumoMedioFrota != null && anterior.consumoMedioFrota != null
            ? Number((atual.consumoMedioFrota - anterior.consumoMedioFrota).toFixed(3))
            : null,
      };

      setKpis({
        atual,
        anterior,
        delta,
        refAnterior: { mes: prevMes, ano: prevAno },
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, frota]);

  const mapVeic = useMemo(() => {
    const m = new Map();
    for (const v of veiculos) m.set(v.id, v);
    return m;
  }, [veiculos]);

  const precoTargetAtual =
    frota === "leve" ? th.leve.precoMedioTarget : frota === "pesada" ? th.pesada.precoMedioTarget : null;

  // filtro por placa
 const listaAbastFiltrada = useMemo(() => {
  const fragPlaca = filtroPlaca.trim().toUpperCase();
  const fragComb = filtroCombustivel.trim().toLowerCase();

  return registros.filter((a) => {
    const placaMatch = !fragPlaca || (a.placa || "").toUpperCase().includes(fragPlaca);
    const combMatch = !fragComb || (a.tipoCombustivel || "").toLowerCase() === fragComb;
    return placaMatch && combMatch;
  });
}, [registros, filtroPlaca, filtroCombustivel]);

  const totalPages = Math.max(1, Math.ceil((listaAbastFiltrada?.length || 0) / pageSize));
  const currentPage = Math.min(page, totalPages);
  const listaAbastPaginada = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return (listaAbastFiltrada || []).slice(start, start + pageSize);
  }, [listaAbastFiltrada, currentPage, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [filtroPlaca, filtroCombustivel, month, year, frota]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  // R$/L ponderado (sem ARLA)
  const precoMedioFiltrado = useMemo(() => {
    const visiveis = (listaAbastFiltrada || []).filter((r) => !r.isArla);
    if (!visiveis.length) return null;

    const { totalLitros, totalValor } = visiveis.reduce(
      (acc, r) => {
        const litros = Number(r.litros) || 0;
        const preco = Number(r.precoPorLitro) || 0;
        acc.totalLitros += litros;
        acc.totalValor += litros * preco;
        return acc;
      },
      { totalLitros: 0, totalValor: 0 }
    );
    return totalLitros > 0 ? totalValor / totalLitros : null;
  }, [listaAbastFiltrada]);

  // Dados para gráficos Recharts
  const chartLitrosPorPlaca = useMemo(() => {
    const byPlaca = new Map();
    for (const a of listaAbastFiltrada || []) {
      const placa = (a.placa || "—").toUpperCase();
      byPlaca.set(placa, (byPlaca.get(placa) || 0) + Number(a.litros || 0));
    }
    return Array.from(byPlaca.entries())
      .map(([name, litros]) => ({ name, litros: Number(litros.toFixed(2)) }))
      .sort((a, b) => b.litros - a.litros)
      .slice(0, 10);
  }, [listaAbastFiltrada]);

  const chartGastoPorDia = useMemo(() => {
    const byDay = new Map();
    for (const a of listaAbastFiltrada || []) {
      const dt = a.dataAbastecimento?.toDate?.() ?? (a.dataAbastecimento?.seconds ? new Date(a.dataAbastecimento.seconds * 1000) : null);
      const key = dt ? dt.toISOString().slice(0, 10) : "";
      if (!key) continue;
      byDay.set(key, (byDay.get(key) || 0) + Number(a.valorTotal || 0));
    }
    return Array.from(byDay.entries())
      .map(([data, gasto]) => ({ data, gasto: Number(gasto.toFixed(2)) }))
      .sort((a, b) => a.data.localeCompare(b.data));
  }, [listaAbastFiltrada]);

  async function handleSalvarTarget() {
    if (frota === "todas") return;
    setSavingTarget(true);
    try {
      if (frota === "leve") await salvarThreshold({ alvoPrecoLeve: th.leve.precoMedioTarget });
      else await salvarThreshold({ alvoPrecoPesada: th.pesada.precoMedioTarget });
      setShowTargetEditor(false);
      await loadDados();
    } finally {
      setSavingTarget(false);
    }
  }

  // ações
  const handleDelete = async (id) => {
    try {
      const confirmar = window.confirm("Excluir este abastecimento? Esta ação não pode ser desfeita.");
      if (!confirmar) return;
      await deleteAbastecimento(id);
      await loadDados();
    } catch (err) {
      console.error("Erro ao excluir abastecimento", err);
      alert("Erro ao excluir abastecimento. Tente novamente.");
    }
  };

  const handleEditOpen = (item) => {
    setRegistroSelecionado(item);
    setShowEditar(true);
  };

  // KPIs
  const consumoAtual = kpis?.atual?.consumoMedioFrota ?? null;
  const consumoAnterior = kpis?.anterior?.consumoMedioFrota ?? null;
  const consumoDelta =
    consumoAtual != null && consumoAnterior != null
      ? Number((consumoAtual - consumoAnterior).toFixed(3))
      : null;

  const atualTotal = Number(kpis?.atual?.totalGasto ?? 0);
  const anteriorTotal = Number(kpis?.anterior?.totalGasto ?? 0);
  const gastoDelta = (atualTotal || anteriorTotal) ? (atualTotal - anteriorTotal) : null;

  const litrosAtuais = Number(kpis?.atual?.litrosTotais ?? 0);
  const litrosAnteriores = Number(kpis?.anterior?.litrosTotais ?? 0);
  const litrosDelta = (litrosAtuais || litrosAnteriores) ? (litrosAtuais - litrosAnteriores) : null;

  /* ========= Exportar Excel (SheetJS) ========= */
  async function handleExportExcel(tipo = "filtro") {
    try {
      const XLSX = await import("xlsx");
      const mm = String(month).padStart(2, "0");
      const titulo = `Abastecimentos ${year}-${mm} ${frota}`;

      const rows = (tipo === "filtro" ? listaAbastFiltrada : registros).map((a) => {
        const v = mapVeic.get(a.veiculoId);
        const dtObj =
          typeof a.dataAbastecimento?.toDate === "function"
            ? a.dataAbastecimento.toDate()
            : a.dataAbastecimento?.seconds
            ? new Date(a.dataAbastecimento.seconds * 1000)
            : a.dataAbastecimento instanceof Date
            ? a.dataAbastecimento
            : null;
        return {
          Data: dtObj ? dtObj.toLocaleDateString("pt-BR") : "",
          Frota: a.tipoFrota || "",
          "Frota Nº": v?.frotaNumero || a.frotaNumero || "",
          Placa: (v?.placa || a.placa || "").toUpperCase(),
          Veículo: v?.nome || "",
          Litros: typeof a.litros === "number" ? a.litros : "",
          "Preço/L": typeof a.precoPorLitro === "number" ? a.precoPorLitro : "",
          "Valor Total": typeof a.valorTotal === "number" ? a.valorTotal : "",
          "KM Atual": a.kmAtual ?? "",
          "KM/L": a.kmPorLitro ?? "",
          Combustível: a.tipoCombustivel || "",
          "Posto/Obs.": a.observacao || "",
        };
      });
      const ws1 = XLSX.utils.json_to_sheet(rows);

      const ws2 = XLSX.utils.aoa_to_sheet([
        ["KPIs", titulo],
        [],
        ["Mês", "Total Gasto (R$)", "Litros Totais", "Preço Médio (R$/L)", "Média km/L"],
        ["Atual", kpis?.atual?.totalGasto ?? "", kpis?.atual?.litrosTotais ?? "", kpis?.atual?.precoMedio ?? "", kpis?.atual?.consumoMedioFrota ?? ""],
        ["Anterior", kpis?.anterior?.totalGasto ?? "", kpis?.anterior?.litrosTotais ?? "", kpis?.anterior?.precoMedio ?? "", kpis?.anterior?.consumoMedioFrota ?? ""],
      ]);

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws1, "Abastecimentos");
      XLSX.utils.book_append_sheet(wb, ws2, "KPIs");

      const filename = `abastecimentos_${year}-${mm}_${frota}.xlsx`;
      XLSX.writeFile(wb, filename);
    } catch (err) {
      console.error(err);
      alert("Para exportar, instale a dependência: npm i xlsx");
    }
  }

  return (
    <div className="space-y-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 shadow transition hover:bg-white/10"
            onClick={() => navigate(-1)}
          >
            Voltar
          </button>
          <h4 className="text-lg font-bold text-sky-400">Dashboard de Abastecimento</h4>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
            onClick={() => handleExportExcel("filtro")}
          >
            <FaFileExcel /> Exportar Excel
          </button>
          <button
            type="button"
            className="flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
            onClick={() => setShowLancar(true)}
          >
            <FaPlus /> Lançar abastecimento
          </button>
          <button
            type="button"
            className="flex items-center gap-2 rounded-xl border border-sky-500/50 bg-sky-500/20 px-4 py-2 text-sm font-semibold text-sky-300 hover:bg-sky-500/30"
            onClick={() => setShowVeiculos(true)}
          >
            <FaPlus /> Adicionar Veículo
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-slate-100 focus:ring-2 focus:ring-sky-500"
            value={frota}
            onChange={(e) => setFrota(e.target.value)}
          >
            <option value="todas">Todas as Frotas</option>
            <option value="leve">Frota Leve</option>
            <option value="pesada">Frota Pesada</option>
          </select>
          <input
            type="month"
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-slate-100 focus:ring-2 focus:ring-sky-500"
            value={`${year}-${String(month).padStart(2, "0")}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split("-").map(Number);
              setYM({ year: y, month: m });
            }}
          />
        </div>
        {frota !== "todas" && (
          <button
            type="button"
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300 hover:bg-white/10"
            onClick={() => setShowTargetEditor((s) => !s)}
            aria-expanded={showTargetEditor}
          >
            {showTargetEditor ? "Fechar edição do alvo" : "Editar alvo R$/L"}
          </button>
        )}
      </div>

      {frota !== "todas" && showTargetEditor && (
        <div className="rounded-2xl border border-white/10 bg-[#161a24] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-slate-300">Alvo R$/L para frota {frota}:</label>
            <input
              type="number"
              step="0.001"
              className="w-24 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-slate-100"
              value={frota === "leve" ? th.leve.precoMedioTarget : th.pesada.precoMedioTarget}
              onChange={(e) => {
                const val = Number(e.target.value);
                setTh((prev) => ({ ...prev, [frota]: { ...prev[frota], precoMedioTarget: val } }));
              }}
            />
            <button
              type="button"
              className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              onClick={handleSalvarTarget}
              disabled={savingTarget}
            >
              {savingTarget ? "Salvando..." : "Salvar alvo"}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex max-w-[380px] items-center rounded-xl border border-white/10 bg-black/30">
          <span className="px-3 text-slate-400">
            <FaSearch />
          </span>
          <input
            className="flex-1 bg-transparent py-2 pr-3 text-slate-100 placeholder:text-slate-500 focus:outline-none"
            placeholder="Filtrar por placa (ex.: IZP)"
            value={filtroPlaca}
            onChange={(e) => setFiltroPlaca(e.target.value)}
          />
        </div>
        <div className="flex flex-col">
          <label className="mb-0.5 text-xs text-slate-400">Combustível</label>
          <select
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-slate-100 focus:ring-2 focus:ring-sky-500"
            value={filtroCombustivel}
            onChange={(e) => setFiltroCombustivel(e.target.value)}
          >
            <option value="">Todos</option>
            <option value="diesel">Diesel</option>
            <option value="gasolina">Gasolina</option>
            <option value="arla">ARLA</option>
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-[#161a24] p-3 shadow-lg ring-1 ring-white/5">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs text-slate-400">Média km/L ({String(month).padStart(2, "0")}/{year})</span>
            <FaGaugeHigh className="text-slate-500" />
          </div>
          <div className={`text-2xl font-bold ${consumoDelta == null ? "text-slate-100" : consumoDelta > 0 ? "text-emerald-400" : "text-red-400"}`}>
            {loading ? "…" : (consumoAtual ?? "—")}
            {!loading && consumoDelta != null && <DeltaBadge value={consumoDelta} />}
          </div>
          {!loading && consumoAnterior != null && (
            <div className="mt-1 text-xs text-slate-500">
              Mês anterior ({String(kpis?.refAnterior?.mes).padStart(2, "0")}/{kpis?.refAnterior?.ano}): {consumoAnterior} km/L
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#161a24] p-3 shadow-lg ring-1 ring-white/5">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs text-slate-400">Preço médio (R$/L){frota !== "todas" ? ` — Frota ${frota}` : ""}</span>
            <FaGasPump className="text-slate-500" />
          </div>
          <div className={`text-xl font-bold ${
            frota !== "todas" && precoTargetAtual != null
              ? (Number(precoMedioFiltrado ?? 0) < Number(precoTargetAtual) ? "text-emerald-400" : "text-red-400")
              : "text-slate-100"
          }`}>
            {loading
              ? "…"
              : precoMedioFiltrado != null
              ? `R$ ${precoMedioFiltrado.toFixed(3)}`
              : "—"}
          </div>
          {frota !== "todas" ? (
            <div className="mt-1 text-xs text-slate-500">
              Alvo: R$ {Number(precoTargetAtual ?? 0).toFixed(3)}
            </div>
          ) : (
            <div className="mt-1 text-xs text-slate-500">
              Selecione uma frota para visualizar
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#161a24] p-3 shadow-lg ring-1 ring-white/5">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs text-slate-400">Gasto total {frota === "todas" ? "(Leve + Pesada)" : `(Frota ${frota})`}</span>
            <FaMoneyBillWave className="text-slate-500" />
          </div>
          <div className={`text-xl font-bold ${gastoDelta == null ? "text-slate-100" : gastoDelta < 0 ? "text-emerald-400" : "text-red-400"}`}>
            {loading
              ? "…"
              : kpis?.atual?.totalGasto != null
              ? `R$ ${Number(kpis.atual.totalGasto).toFixed(2)}`
              : "—"}
            {!loading && <DeltaBadge value={gastoDelta} invert />}
          </div>
          {!loading && kpis?.anterior && (
            <div className="mt-1 text-xs text-slate-500">
              Mês anterior: R$ {Number(kpis.anterior.totalGasto ?? 0).toFixed(2)}
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#161a24] p-3 shadow-lg ring-1 ring-white/5">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              Litros totais abastecidos ({String(month).padStart(2, "0")}/{year})
            </span>
            <FaGasPump className="text-emerald-400" />
          </div>
          <div className={`text-xl font-bold ${litrosDelta == null ? "text-slate-100" : litrosDelta > 0 ? "text-emerald-400" : "text-red-400"}`}>
            {loading ? "…" : litrosAtuais.toFixed(2)}
            {!loading && litrosDelta != null && <DeltaBadge value={litrosDelta} />}
          </div>
          {!loading && kpis?.anterior && (
            <div className="mt-1 text-xs text-slate-500">
              Mês anterior: {litrosAnteriores.toFixed(2)} L
            </div>
          )}
        </div>
      </div>

      {/* Gráficos Recharts */}
      {(chartLitrosPorPlaca.length > 0 || chartGastoPorDia.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {chartLitrosPorPlaca.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-[#161a24] p-4 ring-1 ring-white/5">
              <h5 className="mb-3 text-sm font-semibold text-slate-300">Litros por placa (top 10)</h5>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartLitrosPorPlaca} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <Tooltip contentStyle={{ backgroundColor: "#161a24", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} labelStyle={{ color: "#e2e8f0" }} />
                    <Bar dataKey="litros" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          {chartGastoPorDia.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-[#161a24] p-4 ring-1 ring-white/5">
              <h5 className="mb-3 text-sm font-semibold text-slate-300">Gasto por dia</h5>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartGastoPorDia} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="data" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <Tooltip contentStyle={{ backgroundColor: "#161a24", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} labelStyle={{ color: "#e2e8f0" }} />
                    <Area type="monotone" dataKey="gasto" stroke="#10b981" fill="rgba(16,185,129,0.2)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tabela */}
      <div className="rounded-2xl border border-white/10 bg-[#161a24] shadow-lg ring-1 ring-white/5 overflow-hidden">
        <div className="border-b border-white/10 bg-white/5 px-4 py-3">
          <strong className="text-slate-200">Abastecimentos do mês</strong>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5 text-slate-400">
                <th className="px-3 py-2 font-medium">Data</th>
                <th className="px-3 py-2 font-medium">Frota</th>
                <th className="px-3 py-2 font-medium">Veículo</th>
                <th className="px-3 py-2 font-medium">Frota Nº</th>
                <th className="px-3 py-2 font-medium">Placa</th>
                <th className="px-3 py-2 font-medium">Litros</th>
                <th className="px-3 py-2 font-medium">Preço/L</th>
                <th className="px-3 py-2 font-medium">Valor Total</th>
                <th className="px-3 py-2 font-medium">KM Atual</th>
                <th className="px-3 py-2 font-medium">KM/L</th>
                <th className="px-3 py-2 font-medium">Combustível</th>
                <th className="px-3 py-2 font-medium">Posto/Obs.</th>
                <th className="px-3 py-2 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading && (
                <tr>
                  <td colSpan={13} className="px-3 py-6 text-center text-slate-400">Carregando…</td>
                </tr>
              )}
              {!loading && !listaAbastFiltrada?.length && (
                <tr>
                  <td colSpan={13} className="px-3 py-6 text-center text-slate-400">Sem registros no período.</td>
                </tr>
              )}
              {!loading &&
                listaAbastPaginada?.map((a) => {
                  const v = mapVeic.get(a.veiculoId);
                  const dtObj =
                    typeof a.dataAbastecimento?.toDate === "function"
                      ? a.dataAbastecimento.toDate()
                      : a.dataAbastecimento?.seconds
                      ? new Date(a.dataAbastecimento.seconds * 1000)
                      : a.dataAbastecimento instanceof Date
                      ? a.dataAbastecimento
                      : null;
                  return (
                    <tr key={a.id} className="hover:bg-white/5">
                      <td className="px-3 py-2 text-slate-300">{dtObj ? dtObj.toLocaleDateString("pt-BR") : "—"}</td>
                      <td className="capitalize px-3 py-2 text-slate-300">{a.tipoFrota || "—"}</td>
                      <td className="px-3 py-2 text-slate-300">{v?.nome || "—"}</td>
                      <td className="px-3 py-2 text-slate-300">{v?.frotaNumero || a.frotaNumero || "—"}</td>
                      <td className="px-3 py-2 font-medium text-slate-200">{(v?.placa || a.placa || "—").toUpperCase()}</td>
                      <td className="px-3 py-2 text-slate-300">{typeof a.litros === "number" ? a.litros.toFixed(2) : "—"}</td>
                      <td className="px-3 py-2 text-slate-300">{typeof a.precoPorLitro === "number" ? a.precoPorLitro.toFixed(3) : "—"}</td>
                      <td className="px-3 py-2 text-slate-300">{typeof a.valorTotal === "number" ? a.valorTotal.toFixed(2) : "—"}</td>
                      <td className="px-3 py-2 text-slate-300">{a.kmAtual ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-300">{a.kmPorLitro != null ? Number(a.kmPorLitro).toFixed(3) : "—"}</td>
                      <td className="capitalize px-3 py-2 text-slate-300">{a.tipoCombustivel ?? "—"}</td>
                      <td className="max-w-[120px] truncate px-3 py-2 text-slate-400">{a.observacao ?? "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-slate-200 disabled:opacity-40"
                            title={a.imagem ? "Exibir imagem" : "Sem imagem"}
                            disabled={!a.imagem}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (!a.imagem) return;
                              setImagemUrl(a.imagem);
                              setShowImagem(true);
                            }}
                          >
                            <FaImage />
                          </button>
                          <button
                            type="button"
                            className="rounded-lg p-1.5 text-sky-400 hover:bg-sky-500/20"
                            title="Editar"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setRegistroSelecionado(a);
                              setShowEditar(true);
                            }}
                          >
                            <FaEdit />
                          </button>
                          <button
                            type="button"
                            className="rounded-lg p-1.5 text-red-400 hover:bg-red-500/20"
                            title="Excluir"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDelete(a.id);
                            }}
                          >
                            <FaTrash />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        {!loading && (listaAbastFiltrada?.length || 0) > pageSize && (
          <div className="flex items-center justify-end gap-3 border-t border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-400">
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
      </div>

      {/* Modal: Lançar Abastecimento */}
      <ModalLancarAbastecimento
        open={showLancar}
        onClose={() => setShowLancar(false)}
        frotaSelecionada={frota}
        veiculos={veiculos}
        onSaved={() => {
          setTimeout(() => loadDados(), 150);
        }}
      />

      {/* Modal: Editar Abastecimento */}
      <EditarAbastecimentoModal
        open={showEditar}
        onClose={() => setShowEditar(false)}
        registro={registroSelecionado}
        veiculos={veiculos}
        onSaved={() => {
          setTimeout(() => loadDados(), 150);
        }}
      />

      {showImagem && (
        <div
          className="fixed inset-0 z-[4000] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setShowImagem(false)}
        >
          <div
            className="max-h-[90vh] max-w-[90vw] rounded-2xl border border-white/10 bg-[#161a24] p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <strong className="text-slate-200">Imagem do abastecimento</strong>
              <button type="button" className="rounded-lg p-1 text-slate-400 hover:bg-white/10" onClick={() => setShowImagem(false)}>×</button>
            </div>
            {imagemUrl ? (
              <img src={imagemUrl} alt="Imagem do abastecimento" className="mx-auto max-h-[80vh] max-w-full rounded-lg" />
            ) : (
              <div className="text-slate-500">Sem imagem.</div>
            )}
            <div className="mt-2 text-right">
              <a className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10" href={imagemUrl || "#"} target="_blank" rel="noreferrer">
                Abrir em nova aba
              </a>
            </div>
          </div>
        </div>
      )}

      <Suspense fallback={null}>
        {showVeiculos && (
          <div
            className="fixed inset-0 z-[3000] overflow-y-auto bg-black/60 p-4"
            onClick={() => setShowVeiculos(false)}
          >
            <div
              className="mx-auto max-w-4xl rounded-2xl border border-white/10 bg-[#161a24] p-4 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-200">Veículos</h3>
                <button type="button" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10" onClick={() => setShowVeiculos(false)}>×</button>
              </div>
              <VeiculosSection
                defaultTipoFrota={frota === "todas" ? "pesada" : frota}
                onAfterChange={() => {
                  setShowVeiculos(false);
                  setTimeout(() => {
                    (async () => {
                      const listaAtivos = await getVeiculosAtivos();
                      setVeiculos(listaAtivos);
                      await loadDados();
                    })();
                  }, 150);
                }}
              />
            </div>
          </div>
        )}
      </Suspense>
    </div>
  );
}
