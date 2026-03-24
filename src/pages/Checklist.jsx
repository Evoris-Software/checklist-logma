import { useState, useEffect, useRef } from "react";
import {
  collection, addDoc, serverTimestamp, getDocs, query, orderBy, where
} from "firebase/firestore";
import { db, storage } from "../services/firebase";
import { useNavigate } from "react-router-dom";

// Storage
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

// Helpers dos veículos (somente ativos + validação de status)
import {
  getVeiculosAtivos,
  ensureVeiculoAtivoOrThrow,
} from "../services/veiculos";

// Itens centralizados
import checklistItems from "../data/checklistItems";

/* === Label estrita para veículo: FROTA — PLACA (sem descrição) === */
function labelVeiculo(item) {
  const frota = String(item.frotaNumero || "").trim();
  const placa = String(item.placa || "").trim();
  if (frota || placa) return [frota, placa].filter(Boolean).join(" — ");
  return item.nome || "(sem identificação)";
}

// Mapeia role para tipoChecklist permitido
const permissaoPorRole = {
  motorista: "veiculo",
  operador_empilhadeira: "equipamento",
  operador_gerador: "gerador"
};

export default function Checklist({ user, tipoChecklist }) {
  const [itemSelecionado, setItemSelecionado] = useState("");
  const [listaOpcoes, setListaOpcoes] = useState([]);

  // Campos numéricos
  const [kmAtual, setKmAtual] = useState("");
  const [ultimoKm, setUltimoKm] = useState(null);

  const [horimetroAtual, setHorimetroAtual] = useState("");
  const [ultimoHorimetro, setUltimoHorimetro] = useState(null);

  // Respostas/descrições/anexos
  const [respostas, setRespostas] = useState({});
  const [obs, setObs] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [descricaoNok, setDescricaoNok] = useState({});
  const [arquivoNok, setArquivoNok] = useState({});
  const [erroArquivo, setErroArquivo] = useState("");

  // Modal NOK
  const [modalAberto, setModalAberto] = useState(false);
  const [itemAtual, setItemAtual] = useState("");

  const isSubmitting = useRef(false);

  // Restrições
  const [jaEnviouHoje, setJaEnviouHoje] = useState(0);

  const navigate = useNavigate();
  const permitido = user?.role === "admin" || permissaoPorRole[user?.role] === tipoChecklist;

  /* ===== Carregar lista de opções ===== */
  useEffect(() => {
    async function fetchLista() {
      if (!permitido) return;

if (tipoChecklist === "veiculo") {
  const ativos = await getVeiculosAtivos(); 

  const apenasPesada = ativos.filter(v => String(v.tipoFrota || "")
    .trim()
    .toLowerCase() === "pesada"
  );

  setListaOpcoes(apenasPesada.map(v => ({ ...v, tipo: "veiculo" })));
  return;
}
       
      if (tipoChecklist === "equipamento") {
        const [empSnap, palSnap] = await Promise.all([
          getDocs(query(collection(db, "empilhadeiras"), orderBy("nome", "asc"))),
          getDocs(query(collection(db, "paleteiras"), orderBy("nome", "asc")))
        ]);
        const emp = empSnap.docs.map(docSnap => ({
          id: docSnap.id, ...docSnap.data(), tipo: "empilhadeira"
        }));
        const pal = palSnap.docs.map(docSnap => ({
          id: docSnap.id, ...docSnap.data(), tipo: "paleteira"
        }));
        setListaOpcoes([...emp, ...pal]);
        return;
      }

      if (tipoChecklist === "gerador") {
        const snap = await getDocs(query(collection(db, "geradores"), orderBy("nome", "asc")));
        setListaOpcoes(snap.docs.map(docSnap => ({
          id: docSnap.id, ...docSnap.data(), tipo: "gerador"
        })));
        return;
      }
    }
    fetchLista();
  }, [permitido, tipoChecklist]);

  // reset quando troca item
  useEffect(() => {
    setRespostas({});
    setKmAtual("");
    setHorimetroAtual("");
    setObs("");
    setDescricaoNok({});
    setArquivoNok({});
    setErroArquivo("");
    setUltimoKm(null);
    setUltimoHorimetro(null);
  }, [itemSelecionado]);

  // último KM / HORÍMETRO
  useEffect(() => {
    async function buscarUltimos() {
      if (!itemSelecionado) {
        setUltimoKm(null);
        setUltimoHorimetro(null);
        return;
      }

      // veiculo -> busca último KM
      if (tipoChecklist === "veiculo") {
        const qRef = query(
          collection(db, "checklists"),
          where("selecionadoId", "==", itemSelecionado),
          orderBy("dataHora", "desc")
        );
        const snap = await getDocs(qRef);
        const kms = snap.docs
          .map(doc => {
            const d = doc.data();
            const n = d.kmAtual;
            return (n !== undefined && n !== null && n !== "" && !isNaN(Number(n))) ? Number(n) : null;
          })
          .filter(v => v !== null);
        setUltimoKm(kms.length ? Math.max(...kms) : null);
        setUltimoHorimetro(null);
        return;
      }

      // equipamento -> se for empilhadeira, busca último horímetro
      if (tipoChecklist === "equipamento") {
        const selecionado = listaOpcoes.find(x => x.id === itemSelecionado);
        if (selecionado?.tipo === "empilhadeira") {
          const qRef = query(
            collection(db, "checklists"),
            where("selecionadoId", "==", itemSelecionado),
            orderBy("dataHora", "desc")
          );
          const snap = await getDocs(qRef);
          const hrs = snap.docs
            .map(doc => {
              const d = doc.data();
              const n = d.horimetroAtual;
              return (n !== undefined && n !== null && n !== "" && !isNaN(Number(n))) ? Number(n) : null;
            })
            .filter(v => v !== null);
          setUltimoHorimetro(hrs.length ? Math.max(...hrs) : null);
        } else {
          setUltimoHorimetro(null);
        }
        setUltimoKm(null);
        return;
      }

      // outros
      setUltimoKm(null);
      setUltimoHorimetro(null);
    }
    buscarUltimos();
  }, [itemSelecionado, tipoChecklist, listaOpcoes]);

  // 1 checklist por dia
  useEffect(() => {
  async function checarChecklistHoje() {
    if (!user?.uid) return;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const qRef = query(
      collection(db, "checklists"),
      where("usuarioUid", "==", user.uid),
      orderBy("dataHora", "desc")
    );
    const snap = await getDocs(qRef);
    const enviadosHoje = snap.docs.filter(doc => {
      const data = doc.data().dataHora?.toDate?.() || doc.data().dataHora;
      if (!data) return false;
      const d = new Date(data);
      d.setHours(0, 0, 0, 0);
      return d.getTime() === hoje.getTime();
    });
    setJaEnviouHoje(enviadosHoje.length);
  }
  checarChecklistHoje();
}, [user]);

  // Upload NOK
  const handleArquivoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const tiposAceitos = ["image/jpeg", "image/png", "video/mp4", "video/quicktime"];
    if (!tiposAceitos.includes(file.type)) {
      setErroArquivo("Só é permitido JPG, PNG ou MP4.");
      setArquivoNok(prev => ({ ...prev, [itemAtual]: null }));
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setErroArquivo("Arquivo deve ter até 15MB.");
      setArquivoNok(prev => ({ ...prev, [itemAtual]: null }));
      return;
    }
    setErroArquivo("");
    setArquivoNok(prev => ({ ...prev, [itemAtual]: file }));
  };

  const handleChange = (item, value) => {
    setRespostas(prev => ({ ...prev, [item]: value }));
    if (value === "ok") {
      setDescricaoNok(prev => {
        const { [item]: _, ...rest } = prev;
        return rest;
      });
      setArquivoNok(prev => {
        const { [item]: _, ...rest } = prev;
        return rest;
      });
    }
    if (value === "nok") {
      setItemAtual(item);
      setModalAberto(true);
    }
  };

  const salvarDescricao = () => {
    if (!descricaoNok[itemAtual]?.trim()) {
      alert("Descrição obrigatória para itens com NOK");
      return;
    }
    setModalAberto(false);
  };

  const handleDescricaoChange = (e) => {
    setDescricaoNok(prev => ({
      ...prev,
      [itemAtual]: e.target.value
    }));
  };

  const enviarChecklist = async (e) => {
    e.preventDefault();

    // Apenas segunda/quinta
    const hoje = new Date();
    const diaSemana = hoje.getDay();
    if (!(diaSemana === 1 || diaSemana === 4)) {
      alert("Os checklists só podem ser enviados às segundas ou quintas-feiras.");
      return;
    }
    const limite = user?.role === "operador_empilhadeira" ? 3 : 1;
    if (jaEnviouHoje >= limite) {
    alert(`Você já enviou ${jaEnviouHoje} checklist(s) hoje. Limite: ${limite}.`);
    return;
    }

    // Validações numéricas
    // - veículo: KM não pode diminuir
    if (tipoChecklist === "veiculo" && ultimoKm !== null && !isNaN(Number(kmAtual)) && Number(kmAtual) < ultimoKm) {
      alert(`A quilometragem atual deve ser maior ou igual à última registrada: ${ultimoKm}`);
      return;
    }
    // - empilhadeira: horímetro não pode diminuir
    const selecionado = listaOpcoes.find(x => x.id === itemSelecionado);
    const isEmpilhadeira = tipoChecklist === "equipamento" && selecionado?.tipo === "empilhadeira";
    if (isEmpilhadeira && ultimoHorimetro !== null && !isNaN(Number(horimetroAtual)) && Number(horimetroAtual) < ultimoHorimetro) {
      alert(`O horímetro atual deve ser maior ou igual ao último registrado: ${ultimoHorimetro}`);
      return;
    }

    if (isSubmitting.current) return;
    isSubmitting.current = true;
    setEnviando(true);

    try {
      // Uploads
      const arquivosEnviados = {};
      const uploads = [];

      for (const [item, file] of Object.entries(arquivoNok)) {
        if (!file) continue;

        const safeName = file.name.replace(/[?#\[\]]/g, "_");
        const path = `checklists/${user?.uid || "anon"}/${tipoChecklist}/${itemSelecionado || "sem-item"}/${Date.now()}_${safeName}`;
        const fileRef = ref(storage, path);

        const uploadTask = uploadBytes(fileRef, file, { contentType: file.type })
          .then(async (snapshot) => {
            const url = await getDownloadURL(snapshot.ref);
            arquivosEnviados[item] = { nome: file.name, tipo: file.type, url };
          });

        uploads.push(uploadTask);
      }
      if (uploads.length > 0) await Promise.all(uploads);

      // ===== Dados base do checklist =====
      let base = {
        tipo: tipoChecklist,
        usuarioUid: user?.uid || null,
        usuarioNome: user?.nome || "",
        selecionadoId: itemSelecionado,
        selecionadoNome: "",
        selecionadoDescricao: "",
        // snapshots
        veiculoId: null,
        placaSnapshot: "",
        frotaNumeroSnapshot: "",
        tipoSnapshot: "",
        // numéricos
        kmAtual: tipoChecklist === "veiculo" ? kmAtual : null,
        horimetroAtual: isEmpilhadeira ? horimetroAtual : null,
        // respostas
        respostas,
        descricaoNok,
        anexosNok: arquivosEnviados,
        obs,
        dataHora: serverTimestamp(),
      };

      if (tipoChecklist === "veiculo") {
        // Valida status e pega dados atuais do veículo
        const v = await ensureVeiculoAtivoOrThrow(itemSelecionado);
        const label = labelVeiculo(v); // "FROTA — PLACA"
        base = {
          ...base,
          veiculoId: v.id,
          selecionadoNome: label,
          selecionadoDescricao: "",
          placaSnapshot: v.placa || "",
          frotaNumeroSnapshot: v.frotaNumero || "",
          tipoSnapshot: v.tipo || "veiculo",
        };
      } else {
        // Equipamentos / geradores
        const sel = listaOpcoes.find(x => x.id === itemSelecionado);
        base = {
          ...base,
          selecionadoNome: sel?.nome || "",
          selecionadoDescricao: sel?.descricao || "",
          tipoSnapshot: sel?.tipo || "",
        };
      }

      await addDoc(collection(db, "checklists"), base);

      alert("Checklist enviado!");
      setItemSelecionado("");
      setKmAtual("");
      setHorimetroAtual("");
      setRespostas({});
      setObs("");
      setDescricaoNok({});
      setArquivoNok({});
      navigate("/");
    } catch (error) {
      let msg = "Erro ao enviar checklist!";
      if (error.message?.includes("invalid nested entity")) {
        msg = "Erro ao enviar checklist! O arquivo anexado é grande ou está corrompido.";
      }
      alert(msg + " " + error.message);
    } finally {
      isSubmitting.current = false;
      setEnviando(false);
    }
  };

  if (!permitido) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center py-8 text-slate-100">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#161a24] p-6 text-center shadow-xl">
          <h2 className="mb-3 text-lg font-bold text-red-400">Acesso negado</h2>
          <p className="text-slate-300">
            Você não tem permissão para preencher o checklist do tipo <b className="text-slate-100">{tipoChecklist}</b>.
          </p>
          <button
            type="button"
            className="mt-4 rounded-xl bg-sky-600 px-5 py-2 font-semibold text-white hover:bg-sky-500"
            onClick={() => navigate("/")}
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  // ----------- ITENS DO CHECKLIST (usando arquivo central) -----------
  let itensChecklist = [];
  if (tipoChecklist === "veiculo") {
    itensChecklist = checklistItems.veiculo;
  } else if (tipoChecklist === "equipamento") {
    const equipamentoSelecionado = listaOpcoes.find(e => e.id === itemSelecionado);
    if (equipamentoSelecionado?.tipo === "empilhadeira") {
      if (equipamentoSelecionado?.tipoEmpilhadeira === "gas") {
        itensChecklist = checklistItems.empilhadeiraGas;
      } else if (equipamentoSelecionado?.tipoEmpilhadeira === "eletrica") {
        itensChecklist = checklistItems.empilhadeiraEletrica;
      } else {
        itensChecklist = checklistItems.empilhadeiraPadrao;
      }
    } else if (equipamentoSelecionado?.tipo === "paleteira") {
      itensChecklist = equipamentoSelecionado?.tipoPaleteira === "galvanizada"
        ? checklistItems.paleteiraGalvanizada
        : checklistItems.paleteiraNormal;
    }
  } else if (tipoChecklist === "gerador") {
    itensChecklist = checklistItems.gerador;
  }

  const tituloChecklist =
    tipoChecklist === "veiculo"
      ? "Checklist do Veículo"
      : tipoChecklist === "equipamento"
      ? "Checklist de Equipamento"
      : tipoChecklist === "gerador"
      ? "Checklist do Gerador"
      : "";

  const placeholder =
    tipoChecklist === "veiculo"
      ? "Selecione o veículo"
      : tipoChecklist === "equipamento"
      ? "Selecione o equipamento"
      : tipoChecklist === "gerador"
      ? "Selecione o gerador"
      : "";

  const podeEnviar =
    !enviando &&
    itemSelecionado &&
    Object.keys(respostas).length === itensChecklist.length &&
    Object.entries(respostas).every(
      ([key, val]) => val === "ok" || (val === "nok" && descricaoNok[key]?.trim())
    );

  const selecionadoObj = listaOpcoes.find(x => x.id === itemSelecionado);
  const isEmpilhadeiraSelecionada = tipoChecklist === "equipamento" && selecionadoObj?.tipo === "empilhadeira";

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-4 text-slate-100">
      <form
        onSubmit={enviarChecklist}
        className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#161a24] p-5 shadow-xl ring-1 ring-white/5"
        autoComplete="off"
      >
        <button
          type="button"
          className="mb-4 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 shadow transition hover:bg-white/10"
          onClick={() => navigate("/")}
        >
          ← Voltar
        </button>

        <h2 className="mb-4 text-center text-xl font-bold text-sky-400">{tituloChecklist}</h2>

        <div className="mb-4">
          <select
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-slate-100 shadow-inner outline-none focus:ring-2 focus:ring-sky-500"
            value={itemSelecionado}
            onChange={(e) => setItemSelecionado(e.target.value)}
            required
          >
            <option value="">{placeholder}</option>
            {listaOpcoes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.tipo === "veiculo"
                  ? labelVeiculo(item)
                  : `${item.nome}${
                      item.tipo === "empilhadeira" && item.tipoEmpilhadeira
                        ? ` — ${item.tipoEmpilhadeira === "gas" ? "GÁS" : item.tipoEmpilhadeira === "eletrica" ? "ELÉTRICA" : ""}`
                        : ""
                    }${
                      item.tipo === "paleteira" && item.tipoPaleteira
                        ? ` — ${item.tipoPaleteira === "galvanizada" ? "GALVANIZADA" : "NORMAL"}`
                        : ""
                    }${item.descricao ? ` — ${item.descricao}` : ""}`
                }
              </option>
            ))}
          </select>
        </div>

        {tipoChecklist === "veiculo" && itemSelecionado && (
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center">
            <input
              placeholder="KM atual"
              type="number"
              className="flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-sky-500"
              value={kmAtual}
              onChange={(e) => setKmAtual(e.target.value)}
              required
              min={ultimoKm !== null ? ultimoKm : undefined}
            />
            <span className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-400" title="Último KM registrado">
              Último: {ultimoKm !== null ? ultimoKm : "--"}
            </span>
          </div>
        )}

        {isEmpilhadeiraSelecionada && (
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center">
            <input
              placeholder="Horímetro atual (h)"
              type="number"
              className="flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-sky-500"
              value={horimetroAtual}
              onChange={(e) => setHorimetroAtual(e.target.value)}
              required
              min={ultimoHorimetro !== null ? ultimoHorimetro : undefined}
            />
            <span className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-400" title="Último horímetro">
              Último: {ultimoHorimetro !== null ? ultimoHorimetro : "--"}
            </span>
          </div>
        )}

        {itemSelecionado && (
          <div className="mb-4 max-h-[350px] overflow-y-auto space-y-4 pr-1">
            {itensChecklist.map((item) => (
              <div key={item} className="border-b border-white/10 pb-3">
                <label className="mb-2 block font-semibold text-slate-200">{item}</label>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleChange(item, "ok")}
                    className={`rounded-xl px-4 py-2 font-semibold transition ${
                      respostas[item] === "ok"
                        ? "bg-emerald-600 text-white"
                        : "border border-white/20 bg-white/5 text-slate-300 hover:bg-white/10"
                    }`}
                  >
                    ✅ OK
                  </button>
                  <button
                    type="button"
                    onClick={() => handleChange(item, "nok")}
                    className={`rounded-xl px-4 py-2 font-semibold transition ${
                      respostas[item] === "nok"
                        ? "bg-red-600 text-white"
                        : "border border-white/20 bg-white/5 text-slate-300 hover:bg-white/10"
                    }`}
                  >
                    ❌ NOK
                  </button>
                  {respostas[item] === "nok" && (
                    <button
                      type="button"
                      className="text-sm font-semibold text-sky-400 underline hover:text-sky-300"
                      onClick={() => { setItemAtual(item); setModalAberto(true); }}
                    >
                      {descricaoNok[item]?.trim() ? "Editar descrição do problema" : "Adicionar descrição do problema"}
                    </button>
                  )}
                </div>
                {respostas[item] === "nok" && !descricaoNok[item]?.trim() && enviando && (
                  <div className="mt-1 text-sm font-semibold text-red-400">
                    Informe a descrição do problema
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mb-4">
          <textarea
            placeholder="Observações (opcional)"
            className="min-h-[70px] w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-sky-500"
            value={obs}
            onChange={(e) => setObs(e.target.value)}
          />
        </div>

        <button
          type="submit"
          className="w-full rounded-xl bg-sky-600 py-3 font-bold text-white shadow-lg transition hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!podeEnviar}
        >
          {enviando ? "Enviando..." : "Enviar Checklist"}
        </button>
      </form>

      {modalAberto && (
        <div
          className="fixed inset-0 z-[1050] flex items-center justify-center bg-black/55 p-4"
          aria-modal="true"
          role="dialog"
        >
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#161a24] shadow-xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <h5 className="font-bold text-sky-400">Descreva o problema</h5>
              <button
                type="button"
                className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"
                aria-label="Fechar"
                onClick={() => setModalAberto(false)}
              >
                ×
              </button>
            </div>
            <div className="p-4">
              <textarea
                className="mb-3 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-sky-500"
                rows={4}
                placeholder={`Descrição para "${itemAtual}"`}
                value={descricaoNok[itemAtual] || ""}
                onChange={handleDescricaoChange}
                autoFocus
              />
              <div className="mb-3">
                <label className="mb-1 block font-semibold text-slate-200">
                  Anexar foto/vídeo (opcional, até 15MB)
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,video/mp4,video/quicktime"
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-300 file:mr-2 file:rounded-lg file:border-0 file:bg-sky-600 file:px-3 file:py-1 file:text-white"
                  onChange={handleArquivoChange}
                />
                {erroArquivo && <div className="mt-1 text-sm text-red-400">{erroArquivo}</div>}
                {arquivoNok[itemAtual] && (
                  <div className="mt-2">
                    {arquivoNok[itemAtual].type?.startsWith("image/") ? (
                      <img
                        src={URL.createObjectURL(arquivoNok[itemAtual])}
                        alt="preview"
                        className="max-h-[120px] rounded-lg"
                      />
                    ) : arquivoNok[itemAtual].type?.startsWith("video/") ? (
                      <div className="flex items-center gap-2 text-sm text-slate-400">
                        <span className="rounded bg-sky-500/20 px-2 py-0.5 text-sky-300">Vídeo selecionado</span>
                        <span>{arquivoNok[itemAtual].name}</span>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-white/10 px-4 py-3">
              <button
                type="button"
                className="rounded-xl bg-slate-600 px-4 py-2 font-medium text-white hover:bg-slate-500"
                onClick={() => setModalAberto(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-xl bg-sky-600 px-4 py-2 font-bold text-white hover:bg-sky-500"
                onClick={salvarDescricao}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
