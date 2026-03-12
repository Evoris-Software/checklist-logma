import { useEffect, useMemo, useState } from "react";
import {
  collection, getDocs, orderBy, query,
  deleteDoc, doc, setDoc, serverTimestamp
} from "firebase/firestore";
import { db, auth } from "../services/firebase";
import { useNavigate } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { createUserWithEmailAndPassword } from "firebase/auth";

import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logo from "../assets/logo.png";

// seção isolada de veículos e Usuários
import VeiculosSection from "../components/VeiculosSection";
import UsuariosSection from "../components/UsuariosSection";

/* ================= Helpers ================= */
async function excluirChecklist(id, setChecklists) {
  if (!window.confirm("Tem certeza que deseja excluir este checklist?")) return;
  try {
    await deleteDoc(doc(db, "checklists", id));
    setChecklists(prev => prev.filter(c => c.id !== id));
    alert("Checklist excluído com sucesso!");
  } catch (err) {
    alert("Erro ao excluir checklist: " + err.message);
  }
}
function getAnexoPreview(anexo) {
  if (!anexo) return null;
  if (anexo.url) return { url: anexo.url, tipo: anexo.tipo, nome: anexo.nome || "anexo" };
  if (anexo.base64) return { url: anexo.base64, tipo: anexo.tipo, nome: anexo.nome || "anexo" };
  return null;
}
const anoAtualStr = () => String(new Date().getFullYear());
const hojeYYYYMM = () => new Date().toISOString().slice(0, 7);
function getDateFromAny(d) {
  if (!d) return null;
  const dt = d?.toDate?.() ? d.toDate() : d;
  return dt instanceof Date ? dt : new Date(dt);
}
// mesmíssima sanitização usada em manutenção
function sanitizeFieldPath(str) {
  return String(str || "").replace(/[~*/\[\].]/g, "_");
}

/* ================= Componente ================= */
export default function AdminPanel({ role }) {
  const navigate = useNavigate();

  // dados
  const [checklists, setChecklists] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [manutencoes, setManutencoes] = useState([]);

  // visibilidade
  const [showChecklists, setShowChecklists] = useState(false);
  const [showUsuarios, setShowUsuarios] = useState(false);
  const [showVeiculos, setShowVeiculos] = useState(false);

  // filtros lista
  const [usuarioFiltro, setUsuarioFiltro] = useState("");
  const [veiculoFiltro, setVeiculoFiltro] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [pageChecklists, setPageChecklists] = useState(1);
  const [pagePendencias, setPagePendencias] = useState(1);
  const [baseLoaded, setBaseLoaded] = useState(false);

  // gráficos
  const [graficoSelecionado, setGraficoSelecionado] = useState("porVeiculo");
  const [formatoRelatorio, setFormatoRelatorio] = useState("xlsx");
  const [filtroPendenciasAvisos, setFiltroPendenciasAvisos] = useState("");

  // período gráfico
  const [rangeTipo, setRangeTipo] = useState("mensal"); // mensal | trimestral | semestral | anual
  const [mesGraf, setMesGraf] = useState(hojeYYYYMM()); // YYYY-MM
  const [anoGraf, setAnoGraf] = useState(anoAtualStr());
  const [trimGraf, setTrimGraf] = useState("1"); // 1..4
  const [semGraf, setSemGraf] = useState("1");  // 1..2

  // pendências (segunda/quinta)
  const [filtroPendente, setFiltroPendente] = useState("");
  const [expandirPendenciaChecklist, setExpandirPendenciaChecklist] = useState(false);

  // expand de checklist
  const [expanded, setExpanded] = useState({});

  // modal anexo
  const [anexoPreview, setAnexoPreview] = useState(null);
  const [anexoModalOpen, setAnexoModalOpen] = useState(false);

  // modal cadastro usuário
  const [cadModalOpen, setCadModalOpen] = useState(false);
  const [cadNome, setCadNome] = useState("");
  const [cadEmail, setCadEmail] = useState("");
  const [cadSenha, setCadSenha] = useState("");
  const [cadTipo, setCadTipo] = useState("motorista");
  const [cadErro, setCadErro] = useState(null);
  const [cadSucesso, setCadSucesso] = useState(null);

  /* ===== segurança ===== */
  useEffect(() => {
    if (role !== "admin") {
      alert("Acesso restrito. Você não é admin.");
      navigate("/");
    }
  }, [role, navigate]);

  /* ===== util p/ reload ===== */
  async function reloadColecao(nomeCol, setter, orderField, orderDir = "asc") {
    const q = query(collection(db, nomeCol), orderBy(orderField, orderDir));
    const snap = await getDocs(q);
    setter(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }

  /* ===== carregar dados ===== */
  useEffect(() => {
  (async () => {
    try {
      const [snapC, snapU, snapM] = await Promise.all([
        getDocs(query(collection(db, "checklists"), orderBy("dataHora", "desc"))),
        getDocs(query(collection(db, "usuarios"), orderBy("nome", "asc"))),
        getDocs(query(collection(db, "manutencoes"), orderBy("dataHora", "desc"))),
      ]);

      setChecklists(snapC.docs.map(d => ({ id: d.id, ...d.data() })));
      setUsuarios(snapU.docs.map(d => ({ id: d.id, ...d.data() })));
      setManutencoes(snapM.docs.map(d => ({ id: d.id, ...d.data() })));
    } finally {
      setBaseLoaded(true);
    }
  })();
}, []);

  // nomes de veículos/equipamentos/geradores (derivado dos checklists) para filtros
  const veiculoNomes = useMemo(() => {
    return [...new Set(checklists.map(item => item.selecionadoNome).filter(Boolean))].sort();
  }, [checklists]);

  // pendências que já possuem manutenção vinculada (qualquer status)
  const manutencoesVinculadasSet = useMemo(() => {
   const s = new Set();
   manutencoes.forEach(m => {
     const info = m.problemaVinculadoInfo;
     if (info?.checklistId && info?.nomeItem) {
      s.add(`${info.checklistId}:${info.nomeItem}`);
    }
  });
  return s;
  }, [manutencoes]);

  /* ===== pendências segunda/quinta ===== */
  function getUltimoDiaAlvo() {
    const hoje = new Date();
    const dia = hoje.getDay(); // 0..6 (0=dom)
    if (dia === 1 || dia === 4) {
      return new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    }
    const ref = new Date(hoje);
    ref.setDate(hoje.getDate() - (dia >= 4 ? dia - 4 : dia - 1));
    return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  }
  function mesmoDia(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
  const diaAlvo = getUltimoDiaAlvo();
  const usuariosObrigados = usuarios.filter(u =>
    ["motorista", "operador_empilhadeira", "operador_gerador"].includes(u.role)
  );
  function ultimoChecklistUsuario(nomeUsuario) {
    const cs = checklists.filter(c => c.usuarioNome === nomeUsuario);
    if (cs.length === 0) return null;
    const c = cs[0];
    let data = c.dataHora?.toDate?.() || c.dataHora;
    if (typeof data === "string") data = new Date(data);
    else if (data && data.seconds) data = new Date(data.seconds * 1000);
    return data;
  }
  const usuariosPendentes = usuariosObrigados
    .filter(u => {
      const fezChecklist = checklists.some(c => {
        if (c.usuarioNome !== u.nome) return false;
        let data = c.dataHora?.toDate?.() || c.dataHora;
        if (typeof data === "string") data = new Date(data);
        else if (data && data.seconds) data = new Date(data.seconds * 1000);
        if (!data) return false;
        return mesmoDia(data, diaAlvo);
      });
      return !fezChecklist;
    })
    .map(u => ({ ...u, ultimoChecklist: ultimoChecklistUsuario(u.nome) }))
    .filter(u => !filtroPendente || u.nome === filtroPendente);

  /* ===== filtros da LISTA de checklists ===== */
  const filteredChecklists = checklists.filter(item => {
    const matchesUsuario = usuarioFiltro ? item.usuarioNome === usuarioFiltro : true;
    const matchesVeiculo = veiculoFiltro ? item.selecionadoNome === veiculoFiltro : true;
    let matchesData = true;
    if (dataInicio) {
      const data = getDateFromAny(item.dataHora);
      matchesData = data && data >= new Date(dataInicio);
    }
    if (matchesData && dataFim) {
      const data = getDateFromAny(item.dataHora);
      matchesData = data && data <= new Date(dataFim + "T23:59:59");
    }
    return matchesUsuario && matchesVeiculo && matchesData;
  });

  /* ===== dados p/ gráficos (obedecem período selecionado) ===== */
  const checklistsPeriodo = useMemo(() => {
    const arr = Array.isArray(checklists) ? checklists : [];
    const now = new Date();
    const y = parseInt(anoGraf || String(now.getFullYear()), 10);

    if (rangeTipo === "mensal") {
      const [yy, mm] = mesGraf.split("-").map(Number);
      return arr.filter(r => {
        const dt = getDateFromAny(r.dataHora);
        return dt && dt.getFullYear() === yy && (dt.getMonth() + 1) === mm;
      });
    }
    if (rangeTipo === "trimestral") {
      const q = parseInt(trimGraf, 10); // 1..4
      const startMonth = (q - 1) * 3; // 0,3,6,9
      const endMonth = startMonth + 2; // 2,5,8,11
      return arr.filter(r => {
        const dt = getDateFromAny(r.dataHora);
        return dt && dt.getFullYear() === y && dt.getMonth() >= startMonth && dt.getMonth() <= endMonth;
      });
    }
    if (rangeTipo === "semestral") {
      const s = parseInt(semGraf, 10); // 1..2
      const startMonth = s === 1 ? 0 : 6;
      const endMonth = s === 1 ? 5 : 11;
      return arr.filter(r => {
        const dt = getDateFromAny(r.dataHora);
        return dt && dt.getFullYear() === y && dt.getMonth() >= startMonth && dt.getMonth() <= endMonth;
      });
    }
    // anual
    return arr.filter(r => {
      const dt = getDateFromAny(r.dataHora);
      return dt && dt.getFullYear() === y;
    });
  }, [checklists, rangeTipo, mesGraf, anoGraf, trimGraf, semGraf]);

  const checklistsPorVeiculo = useMemo(() => {
    const acc = {};
    checklistsPeriodo.forEach(item => {
      const nome = item.selecionadoNome || "Outros";
      acc[nome] = (acc[nome] || 0) + 1;
    });
    return acc;
  }, [checklistsPeriodo]);

  const problemasPorItem = useMemo(() => {
    const acc = {};
    checklistsPeriodo.forEach(item => {
      if (item.respostas) {
        Object.entries(item.respostas).forEach(([nomeItem, valor]) => {
          if (valor === "nok") {
            if (!filtroPendenciasAvisos || item.selecionadoNome === filtroPendenciasAvisos) {
              acc[nomeItem] = (acc[nomeItem] || 0) + 1;
            }
          }
        });
      }
    });
    return acc;
  }, [checklistsPeriodo, filtroPendenciasAvisos]);

  const barChartDataPorVeiculo = useMemo(() => {
    return Object.entries(checklistsPorVeiculo).map(([name, qtd]) => ({ name: name.length > 12 ? name.slice(0, 12) + "…" : name, fullName: name, qtd }));
  }, [checklistsPorVeiculo]);
  const barChartDataProblemas = useMemo(() => {
    return Object.entries(problemasPorItem).map(([name, qtd]) => ({ name: name.length > 14 ? name.slice(0, 14) + "…" : name, fullName: name, qtd }));
  }, [problemasPorItem]);
  const manutKeys = useMemo(() => {
    const s = new Set();
    manutencoes.forEach(m => {
      const info = m.problemaVinculadoInfo;
      if (info && info.checklistId && info.nomeItem) {
        s.add(`${info.checklistId}:${info.nomeItem}`);
      }
    });
    return s;
  }, [manutencoes]);

  const now = new Date();
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

  const usuariosOnline = useMemo(() => {
    return usuarios.filter((u) => {
      const ls = u.lastSeenAt;
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
        const dt = getDateFromAny(c.dataHora);
        return dt && dt >= inicioMes;
      }),
    [checklists, inicioMes],
  );

  const manutencoesMes = useMemo(
    () =>
      manutencoes.filter((m) => {
        const dt = getDateFromAny(m.dataHora);
        return dt && dt >= inicioMes;
      }),
    [manutencoes, inicioMes],
  );

  const usuariosAtivosMes = useMemo(() => {
    const setIds = new Set();
    checklistsMes.forEach((c) => {
      if (c.usuarioUid) setIds.add(c.usuarioUid);
    });
    manutencoesMes.forEach((m) => {
      if (m.criadoPorUid) setIds.add(m.criadoPorUid);
    });
    return setIds.size;
  }, [checklistsMes, manutencoesMes]);

  const ultimasAcoes = useMemo(() => {
    const itens = [];
    checklists.forEach((c) => {
      const dt = getDateFromAny(c.dataHora);
      if (!dt) return;
      itens.push({
        tipo: "Checklist",
        descricao: c.selecionadoNome || c.veiculo || "Checklist",
        data: dt,
      });
    });
    manutencoes.forEach((m) => {
      const dt = getDateFromAny(m.dataHora);
      if (!dt) return;
      itens.push({
        tipo: "Manutenção",
        descricao: m.veiculoNome || m.tipo || "Manutenção",
        data: dt,
      });
    });
    return itens.sort((a, b) => b.data - a.data).slice(0, 6);
  }, [checklists, manutencoes]);

  /* ===== pendências painel lateral (com filtro por manutenção vinculada) ===== */
  let problemasChecklist = [];
checklists.forEach(item => {
  if (item.descricaoNok && typeof item.descricaoNok === "object") {
    Object.entries(item.descricaoNok).forEach(([nomeItem, desc]) => {
      const jaVinculada = manutencoesVinculadasSet.has(`${item.id}:${nomeItem}`);
      const marcadoNoChecklist = Boolean(item.problemasVinculados?.[nomeItem]);
      if (
        desc && desc.trim() &&
        item.respostas?.[nomeItem] === "nok" &&
        !marcadoNoChecklist &&          
        !jaVinculada &&                 
        (!filtroPendenciasAvisos || item.selecionadoNome === filtroPendenciasAvisos)
      ) {
        problemasChecklist.push({
          checklistId: item.id,
          item: nomeItem,
          desc,
          veiculo: item.selecionadoNome || "-",
          dataHora: (item.dataHora && typeof item.dataHora.toDate === "function")
            ? item.dataHora.toDate().toLocaleString()
            : "-",
          anexo: item.anexosNok?.[nomeItem] ? getAnexoPreview(item.anexosNok[nomeItem]) : null
        });
      }
    });
  }
});
const problemasUnicos = problemasChecklist;

  const pageSize = 25;
  const totalPagesChecklists = Math.max(1, Math.ceil(filteredChecklists.length / pageSize));
  const currentPageChecklists = Math.min(pageChecklists, totalPagesChecklists);
  const checklistsPaginados = useMemo(() => {
    const start = (currentPageChecklists - 1) * pageSize;
    return filteredChecklists.slice(start, start + pageSize);
  }, [filteredChecklists, currentPageChecklists]);

  const totalPagesPendencias = Math.max(1, Math.ceil(problemasUnicos.length / pageSize));
  const currentPagePendencias = Math.min(pagePendencias, totalPagesPendencias);
  const pendenciasPaginadas = useMemo(() => {
    const start = (currentPagePendencias - 1) * pageSize;
    return problemasUnicos.slice(start, start + pageSize);
  }, [problemasUnicos, currentPagePendencias]);

  useEffect(() => {
    setPageChecklists(1);
  }, [usuarioFiltro, veiculoFiltro, dataInicio, dataFim, showChecklists]);

  useEffect(() => {
    if (pageChecklists > totalPagesChecklists) setPageChecklists(totalPagesChecklists);
  }, [pageChecklists, totalPagesChecklists]);

  useEffect(() => {
    setPagePendencias(1);
  }, [filtroPendenciasAvisos]);

  useEffect(() => {
    if (pagePendencias > totalPagesPendencias) setPagePendencias(totalPagesPendencias);
  }, [pagePendencias, totalPagesPendencias]);

  function gerarRelatorio() {
    let data;
    if (graficoSelecionado === "porVeiculo") {
      data = Object.entries(checklistsPorVeiculo).map(([nome, qtd]) => ({ Veiculo: nome, "Qtd. Checklists": qtd }));
    } else {
      data = Object.entries(problemasPorItem).map(([item, qtd]) => ({ Item: item, "Qtd. de Problemas (NOK)": qtd }));
    }
    if (formatoRelatorio === "xlsx") {
      const ws = XLSX.utils.json_to_sheet(data);
      ws["!cols"] = [{ wch: 30 }, { wch: 18 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Relatório");
      XLSX.writeFile(wb, graficoSelecionado === "porVeiculo" ? "relatorio_checklists.xlsx" : "relatorio_itens_problematicos.xlsx");
    } else {
      const pdf = new jsPDF();
      pdf.text(graficoSelecionado === "porVeiculo" ? "Relatório - Checklists por Veículo" : "Relatório - Itens Problemáticos", 14, 14);
      autoTable(pdf, {
        startY: 20,
        head: [graficoSelecionado === "porVeiculo" ? ["Veículo", "Qtd. Checklists"] : ["Item", "Qtd. de Problemas (NOK)"]],
        body: data.map(d => graficoSelecionado === "porVeiculo" ? [d.Veiculo, d["Qtd. Checklists"]] : [d.Item, d["Qtd. de Problemas (NOK)"]]),
        styles: { fontSize: 12 }, headStyles: { fillColor: [13, 110, 253] }
      });
      pdf.save(graficoSelecionado === "porVeiculo" ? "relatorio_checklists.pdf" : "relatorio_itens_problematicos.pdf");
    }
  }

  function renderDataHora(dataHora) {
    return (dataHora && typeof dataHora.toDate === "function") ? dataHora.toDate().toLocaleString() : "-";
  }
  function renderResposta(v) { return typeof v === "string" ? v.toUpperCase() : "-"; }
  const toggleExpand = (id) => setExpanded(exp => ({ ...exp, [id]: !exp[id] }));

  /* =================== RENDER =================== */
  return (
    <div className="flex min-h-screen flex-col items-center bg-[#0b0d12] py-6 px-4 text-slate-100">
      {anexoModalOpen && anexoPreview && (
        <div className="fixed inset-0 z-[1060] flex items-center justify-center bg-black/60 p-4" onClick={() => setAnexoModalOpen(false)}>
          <div className="max-w-md rounded-2xl border border-white/10 bg-[#161a24] p-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <h5 className="font-bold text-sky-400">Visualizar Anexo</h5>
              <button type="button" className="rounded-lg p-1 text-slate-400 hover:bg-white/10" onClick={() => setAnexoModalOpen(false)}>×</button>
            </div>
            <div className="text-center">
              {anexoPreview.tipo?.startsWith("image/") ? (
                <img src={anexoPreview.url} alt={anexoPreview.nome} className="mx-auto max-h-[350px] max-w-full rounded-xl" />
              ) : anexoPreview.tipo?.startsWith("video/") ? (
                <video src={anexoPreview.url} controls className="mx-auto max-h-[350px] max-w-full rounded-xl" />
              ) : (<span className="text-slate-400">Tipo de anexo não suportado.</span>)}
              <div className="mt-2 text-sm text-slate-400">{anexoPreview.nome}</div>
            </div>
            <div className="mt-3 text-right">
              <button className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/10" onClick={() => setAnexoModalOpen(false)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {cadModalOpen && (
        <div className="fixed inset-0 z-[1070] flex items-center justify-center bg-black/60 p-4" onClick={() => setCadModalOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#161a24] p-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <h5 className="font-bold text-sky-400">Cadastrar Usuário</h5>
              <button type="button" className="rounded-lg p-1 text-slate-400 hover:bg-white/10" onClick={() => setCadModalOpen(false)}>×</button>
            </div>
            <div className="p-2">
              <div className="mb-3 flex justify-center">
                <img src={logo} alt="Logma Transportes" className="h-[70px] w-[70px] object-contain drop-shadow-md" />
              </div>
              {cadErro && <div className="mb-2 rounded-lg bg-red-500/20 py-2 text-center text-sm text-red-400">{cadErro}</div>}
              {cadSucesso && <div className="mb-2 rounded-lg bg-emerald-500/20 py-2 text-center text-sm text-emerald-400">{cadSucesso}</div>}
              <form onSubmit={async (e) => {
                e.preventDefault(); setCadErro(null); setCadSucesso(null);
                try {
                  const cred = await createUserWithEmailAndPassword(auth, cadEmail, cadSenha);
                  await setDoc(doc(db, "usuarios", cred.user.uid), { nome: cadNome, email: cadEmail, role: cadTipo, criadoEm: serverTimestamp() });
                  setCadSucesso("Usuário cadastrado com sucesso!");
                  setCadNome(""); setCadEmail(""); setCadSenha(""); setCadTipo("motorista");
                  await reloadColecao("usuarios", setUsuarios, "nome", "asc");
                  setTimeout(() => setCadModalOpen(false), 1200);
                } catch (error) {
                  if (error.code === "auth/email-already-in-use") setCadErro("E-mail já cadastrado.");
                  else if (error.code === "auth/weak-password") setCadErro("Senha muito fraca. Use pelo menos 6 caracteres.");
                  else setCadErro("Erro ao criar conta. Verifique os campos e tente novamente.");
                }
              }}>
                <div className="mb-3">
                  <input type="text" placeholder="Nome" value={cadNome} onChange={e => setCadNome(e.target.value)}
                         className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-sky-500" required autoFocus />
                </div>
                <div className="mb-3">
                  <input type="email" placeholder="E-mail" value={cadEmail} onChange={e => setCadEmail(e.target.value)}
                         className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-sky-500" required />
                </div>
                <div className="mb-3">
                  <input type="password" placeholder="Senha" value={cadSenha} onChange={e => setCadSenha(e.target.value)}
                         className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-sky-500" required />
                </div>
                <div className="mb-4">
                  <select value={cadTipo} onChange={e => setCadTipo(e.target.value)} className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-slate-100 focus:ring-2 focus:ring-sky-500" required>
                    <option value="motorista">Motorista</option>
                    <option value="operador_empilhadeira">Operador de Empilhadeira</option>
                    <option value="operador_gerador">Operador de Gerador</option>
                  </select>
                </div>
                <button type="submit" className="w-full rounded-xl bg-sky-600 py-2.5 font-bold text-white hover:bg-sky-500 disabled:opacity-50" disabled={!!cadSucesso}>Registrar</button>
              </form>
            </div>
          </div>
        </div>
      )}

      <div className="w-full max-w-5xl">
        <button type="button" className="mb-4 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10" onClick={() => navigate("/")}>← Voltar</button>
        <h2 className="mb-6 text-center text-2xl font-bold text-white">Painel de Admin</h2>

        <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h5 className="font-bold text-red-200">Pendência de Checklist</h5>
            <select className="min-w-[160px] rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-sm text-slate-100" value={filtroPendente} onChange={e => setFiltroPendente(e.target.value)}>
              <option value="">Todos os usuários</option>
              {usuariosPendentes.map(u => (<option key={u.nome} value={u.nome}>{u.nome}</option>))}
            </select>
          </div>
          {usuariosPendentes.length === 0 ? (
            <p className="text-red-100/90">Todos os usuários obrigatórios realizaram o checklist na última segunda ou quinta.</p>
          ) : (
            <>
              <ul className="mb-0 list-none space-y-1">
                {(expandirPendenciaChecklist ? usuariosPendentes : usuariosPendentes.slice(0, 5)).map((u, idx) => (
                  <li key={idx} className="text-red-100">
                    <strong>{u.nome}</strong> ({u.role})<br />
                    <span className="text-sm">
                      Último checklist:{" "}
                      {u.ultimoChecklist
                        ? u.ultimoChecklist.toLocaleString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
                        : <span className="text-amber-300">Nunca fez</span>}
                    </span>
                  </li>
                ))}
              </ul>
              {usuariosPendentes.length > 5 && (
                <div className="mt-2 text-center">
                  <button className="rounded-lg border border-white/30 bg-white/10 px-3 py-1 text-sm text-red-100 hover:bg-white/20" onClick={() => setExpandirPendenciaChecklist(e => !e)}>
                    {expandirPendenciaChecklist ? "Mostrar menos" : `Mostrar todos (${usuariosPendentes.length})`}
                  </button>
                </div>
              )}
            </>
          )}
          <div className="mt-2 text-xs text-red-200/80">* Apenas motoristas e operadores. Dia referência: {diaAlvo.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}</div>
        </div>

        <div className="mb-8 grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="flex flex-col rounded-2xl border border-white/10 bg-[#161a24] p-4 shadow-lg ring-1 ring-white/5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h5 className="font-bold text-slate-200">
                {graficoSelecionado === "porVeiculo" ? "Checklists Realizados por Veículo" : "Itens do Checklist Mais Problemáticos"}
              </h5>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <select className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-slate-100" value={rangeTipo} onChange={e => setRangeTipo(e.target.value)} title="Período">
                  <option value="mensal">Mensal</option>
                  <option value="trimestral">Trimestral</option>
                  <option value="semestral">Semestral</option>
                  <option value="anual">Anual</option>
                </select>
                {rangeTipo === "mensal" && (
                  <input type="month" className="max-w-[180px] rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-slate-100" value={mesGraf} onChange={(e) => setMesGraf(e.target.value)} title="Mês" />
                )}
                {rangeTipo === "trimestral" && (
                  <>
                    <select className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-slate-100" value={trimGraf} onChange={(e) => setTrimGraf(e.target.value)} title="Trimestre">
                      <option value="1">1º Tri</option><option value="2">2º Tri</option><option value="3">3º Tri</option><option value="4">4º Tri</option>
                    </select>
                    <input type="number" className="w-24 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-slate-100" value={anoGraf} onChange={(e) => setAnoGraf(e.target.value)} title="Ano" />
                  </>
                )}
                {rangeTipo === "semestral" && (
                  <>
                    <select className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-slate-100" value={semGraf} onChange={(e) => setSemGraf(e.target.value)} title="Semestre">
                      <option value="1">1º Sem</option><option value="2">2º Sem</option>
                    </select>
                    <input type="number" className="w-24 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-slate-100" value={anoGraf} onChange={(e) => setAnoGraf(e.target.value)} title="Ano" />
                  </>
                )}
                {rangeTipo === "anual" && (
                  <input type="number" className="w-24 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-slate-100" value={anoGraf} onChange={(e) => setAnoGraf(e.target.value)} title="Ano" />
                )}
                <select className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-slate-100" value={graficoSelecionado} onChange={e => setGraficoSelecionado(e.target.value)}>
                  <option value="porVeiculo">Por Veículo</option>
                  <option value="problemas">Itens Problemáticos</option>
                </select>
                <select className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-slate-100" value={formatoRelatorio} onChange={e => setFormatoRelatorio(e.target.value)}>
                  <option value="xlsx">Excel (XLSX)</option>
                  <option value="pdf">PDF</option>
                </select>
                <button className="rounded-xl bg-emerald-600 px-3 py-1.5 font-bold text-white hover:bg-emerald-500" onClick={gerarRelatorio} type="button">Gerar Relatório</button>
              </div>
            </div>
            <div className="min-h-[320px] flex-1">
              {graficoSelecionado === "porVeiculo" ? (
                barChartDataPorVeiculo.length === 0
                  ? <div className="flex h-64 items-center justify-center text-slate-500">Sem dados no período selecionado</div>
                  : (
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={barChartDataPorVeiculo} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                        <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
                        <Tooltip contentStyle={{ backgroundColor: "#161a24", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} labelStyle={{ color: "#e2e8f0" }} formatter={(val, name, props) => [val, props.payload?.fullName || props.payload?.name]} />
                        <Bar dataKey="qtd" fill="#0ea5e9" radius={[4, 4, 0, 0]} name="Qtd. Checklists" />
                      </BarChart>
                    </ResponsiveContainer>
                  )
              ) : (
                barChartDataProblemas.length === 0
                  ? <div className="flex h-64 items-center justify-center text-slate-500">Nenhum problema no período selecionado</div>
                  : (
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={barChartDataProblemas} margin={{ top: 8, right: 8, left: 0, bottom: 24 }} layout="vertical" className="[&_.recharts-cartesian-grid-horizontal]:hidden">
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
                        <YAxis type="category" dataKey="name" width={100} tick={{ fill: "#94a3b8", fontSize: 10 }} />
                        <Tooltip contentStyle={{ backgroundColor: "#161a24", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} formatter={(val, name, props) => [val, props.payload?.fullName || props.payload?.name]} />
                        <Bar dataKey="qtd" fill="#ec4899" radius={[0, 4, 4, 0]} name="Qtd. Problemas (NOK)" />
                      </BarChart>
                    </ResponsiveContainer>
                  )
              )}
            </div>
          </div>

          <div className="flex flex-col rounded-2xl border border-white/10 bg-[#161a24] p-3 shadow-lg ring-1 ring-white/5">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-9 min-w-[36px] items-center justify-center rounded-lg bg-red-500/20 text-lg font-bold text-red-400">{problemasUnicos.length}</span>
              <span className="font-bold text-slate-200">Pendências</span>
              <select className="ml-auto min-w-[140px] rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-sm text-slate-100" value={filtroPendenciasAvisos} onChange={e => setFiltroPendenciasAvisos(e.target.value)}>
                <option value="">Todos</option>
                {veiculoNomes.map(nome => (<option key={nome} value={nome}>{nome}</option>))}
              </select>
            </div>
            <div className="min-h-[200px] max-h-[400px] flex-1 overflow-y-auto">
              {!baseLoaded ? (
                <div className="text-slate-500">Carregando pendências…</div>
              ) : problemasUnicos.length === 0 ? (
                <div className="text-slate-500">Nenhum problema pendente</div>
              ) : (
                pendenciasPaginadas.map((p, idx) => (
                  <div key={idx} className="mb-2 border-l-2 border-red-500/50 pl-2">
                    <span className="font-semibold text-slate-200">{p.item}</span>: <span className="text-red-400">{p.desc}</span>
                    <div className="text-xs text-slate-500"><span className="font-semibold">{p.veiculo}</span> {p.dataHora}</div>
                    {p.anexo?.url && (
                      <button className="mt-1 rounded-lg border border-sky-500/50 bg-sky-500/10 px-2 py-0.5 text-xs text-sky-400 hover:bg-sky-500/20" onClick={() => { setAnexoPreview(p.anexo); setAnexoModalOpen(true); }}>
                        {p.anexo.tipo?.startsWith("image/") ? "Abrir imagem" : p.anexo.tipo?.startsWith("video/") ? "Ver vídeo" : "Abrir anexo"}
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
            {problemasUnicos.length > pageSize && (
              <div className="mt-2 flex items-center justify-end gap-2 border-t border-white/10 pt-2 text-xs text-slate-400">
                <span>
                  Página {currentPagePendencias} de {totalPagesPendencias}
                </span>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 px-2 py-1 text-slate-200 disabled:opacity-40"
                  onClick={() => setPagePendencias((p) => Math.max(1, p - 1))}
                  disabled={currentPagePendencias === 1}
                >
                  Anterior
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 px-2 py-1 text-slate-200 disabled:opacity-40"
                  onClick={() => setPagePendencias((p) => Math.min(totalPagesPendencias, p + 1))}
                  disabled={currentPagePendencias === totalPagesPendencias}
                >
                  Próxima
                </button>
              </div>
            )}
            <div className="mt-1 text-center text-xs text-slate-500">* Resolva no painel de manutenções</div>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap justify-center gap-2">
          <button className="rounded-xl border border-sky-500/50 bg-sky-600 px-4 py-2 font-bold text-white hover:bg-sky-500" onClick={() => setShowChecklists(v => !v)}>
            {showChecklists ? "Ocultar Checklists" : "Todos os Checklists"}
          </button>
          <button className="rounded-xl border border-sky-500/50 bg-sky-600 px-4 py-2 font-bold text-white hover:bg-sky-500" onClick={() => setShowUsuarios(v => !v)}>
            {showUsuarios ? "Ocultar Usuários" : "Usuários Cadastrados"}
          </button>
          <button className="rounded-xl border border-sky-500/50 bg-sky-600 px-4 py-2 font-bold text-white hover:bg-sky-500" onClick={() => setShowVeiculos(v => !v)}>
            {showVeiculos ? "Ocultar Veículos" : "Veículos Cadastrados"}
          </button>
        </div>

        {showChecklists && (
          <div className="mb-8 rounded-2xl border border-white/10 bg-[#161a24] p-4 shadow-lg">
            <h5 className="mb-3 flex items-center font-bold text-sky-400">
              Checklists
              <span className="ml-2 rounded-lg bg-sky-500/20 px-2 py-0.5 text-sm font-bold text-sky-300">{filteredChecklists.length}</span>
            </h5>
            <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-0.5 block text-xs text-slate-400">Data Início</label>
                <input type="date" className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-slate-100" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
              </div>
              <div>
                <label className="mb-0.5 block text-xs text-slate-400">Data Fim</label>
                <input type="date" className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-slate-100" value={dataFim} onChange={e => setDataFim(e.target.value)} />
              </div>
              <div>
                <label className="mb-0.5 block text-xs text-slate-400 sm:invisible">Usuário</label>
                <select className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-slate-100" value={usuarioFiltro} onChange={e => setUsuarioFiltro(e.target.value)}>
                  <option value="">Selecione um usuário</option>
                  {usuarios.map((u) => (<option key={u.id} value={u.nome}>{u.nome}</option>))}
                </select>
              </div>
              <div>
                <label className="mb-0.5 block text-xs text-slate-400 sm:invisible">Veículo</label>
                <select className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-slate-100" value={veiculoFiltro} onChange={e => setVeiculoFiltro(e.target.value)}>
                  <option value="">Selecione um veículo/equipamento</option>
                  {veiculoNomes.map((nome) => (<option key={nome} value={nome}>{nome}</option>))}
                </select>
              </div>
            </div>

            {filteredChecklists.length === 0 ? (
              <div className="py-6 text-center text-slate-500">Nenhum checklist encontrado.</div>
            ) : (
              <div className="space-y-2">
                {checklistsPaginados.map((item) => (
                  <div key={item.id}>
                    <div
                      className="flex cursor-pointer flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/20 p-3 hover:bg-white/5"
                      onClick={() => setExpanded(exp => ({ ...exp, [item.id]: !exp[item.id] }))}
                    >
                      <div>
                        <span className="font-bold text-slate-200">{item.usuarioNome || item.motorista}</span>
                        <span className="text-slate-400"> - </span>
                        <span className="font-bold text-slate-200">{item.selecionadoNome || item.veiculo || item.empilhadeira || item.gerador}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        {(item?.tipoSnapshot === "empilhadeira" || (item?.horimetroAtual ?? null) !== null) ? (
                          <>H: {item.horimetroAtual ?? "-"} | {renderDataHora(item.dataHora)}</>
                        ) : (
                          <>KM: {item.kmAtual ?? "-"} | {renderDataHora(item.dataHora)}</>
                        )}
                        <button
                          className="rounded-lg border border-red-500/50 bg-red-500/10 px-2 py-1 text-xs text-red-400 hover:bg-red-500/20"
                          title="Excluir checklist"
                          onClick={e => { e.stopPropagation(); excluirChecklist(item.id, setChecklists); }}
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                    {expanded[item.id] && (
                      <div className="mt-1 border-l-2 border-sky-500/50 bg-black/20 px-3 py-2">
                        <ul className="mb-0 list-none space-y-0.5 text-sm">
                          {item.respostas && Object.entries(item.respostas).map(([k, v]) => (
                            <li key={k}>
                              <span className="font-semibold text-slate-300">{k}</span>:{" "}
                              <span className={v === "ok" ? "text-emerald-400" : v === "nok" ? "text-red-400" : "text-slate-500"}>{renderResposta(v)}</span>
                              {item.anexosNok?.[k] && (
                                <button
                                  className="ml-2 rounded-lg border border-sky-500/50 bg-sky-500/10 px-2 py-0.5 text-xs text-sky-400 hover:bg-sky-500/20"
                                  onClick={() => { setAnexoPreview(getAnexoPreview(item.anexosNok[k])); setAnexoModalOpen(true); }}
                                >
                                  {item.anexosNok[k].tipo?.startsWith("image/") ? "Abrir imagem" : item.anexosNok[k].tipo?.startsWith("video/") ? "Ver vídeo" : "Abrir anexo"}
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                        {item.obs && <div className="mt-2 italic text-slate-400"><b>Obs:</b> {item.obs}</div>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {filteredChecklists.length > pageSize && (
              <div className="mt-3 flex items-center justify-end gap-2 border-t border-white/10 pt-3 text-xs text-slate-400">
                <span>
                  Página {currentPageChecklists} de {totalPagesChecklists}
                </span>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 px-2 py-1 text-slate-200 disabled:opacity-40"
                  onClick={() => setPageChecklists((p) => Math.max(1, p - 1))}
                  disabled={currentPageChecklists === 1}
                >
                  Anterior
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 px-2 py-1 text-slate-200 disabled:opacity-40"
                  onClick={() => setPageChecklists((p) => Math.min(totalPagesChecklists, p + 1))}
                  disabled={currentPageChecklists === totalPagesChecklists}
                >
                  Próxima
                </button>
              </div>
            )}
          </div>
        )}

        {showUsuarios && (
          <UsuariosSection
            usuariosExternos={usuarios}
            onReload={() => reloadColecao("usuarios", setUsuarios, "nome", "asc")}
          />
        )}

        {showVeiculos && (
          <VeiculosSection />
        )}
      </div>
    </div>
  );
}
