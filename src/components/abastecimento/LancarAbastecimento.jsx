import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  collection,
  addDoc,
  setDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

import { db, storage, auth } from "../../services/firebase";
import { obterUltimoKmPorVeiculo } from "../../services/abastecimentos";

export default function LancarAbastecimento({
  publicMode = false,
  allowedFrotas: allowedFrotasProp = ["leve", "pesada"],
  lockFrota: lockFrotaProp = false,
  defaultFrota: defaultFrotaProp = "",
  hideSearch = false,
}) {
  const navigate = useNavigate();

  // ===== Role / Frota =====
  const [role, setRole] = useState("admin");
  const [tipoFrota, setTipoFrota] = useState(defaultFrotaProp || "");
  const [lockFrota, setLockFrota] = useState(lockFrotaProp);
  const [allowedFrotas, setAllowedFrotas] = useState(allowedFrotasProp);

  useEffect(() => {
    (async () => {
      try {
        const user = auth.currentUser;
        if (!user) return;
        const token = await user.getIdTokenResult();
        const r = token.claims?.role || token.claims?.perfil || "admin";
        setRole(r);

        // Aplica regra por role
        if (r === "vendedor") {
          setAllowedFrotas(["leve"]);
          setTipoFrota("leve");
          setLockFrota(true);
        } else if (r === "motorista") {
          setAllowedFrotas(["pesada"]);
          setTipoFrota("pesada");
          setLockFrota(true);
        } else {
          // admin
          setAllowedFrotas(["leve", "pesada"]);
          setLockFrota(lockFrotaProp);
          if (!defaultFrotaProp) setTipoFrota("");
        }
      } catch {
        // fallback admin
        setRole("admin");
        setAllowedFrotas(["leve", "pesada"]);
        setLockFrota(lockFrotaProp);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== Veículos / Busca =====
  const [veiculos, setVeiculos] = useState([]);
  const [busca, setBusca] = useState("");
  const [veiculoId, setVeiculoId] = useState("");
  const [veiculoSel, setVeiculoSel] = useState(null);

  useEffect(() => {
    (async () => {
      if (!tipoFrota) {
        setVeiculos([]);
        return;
      }
      try {
        const qv = query(
          collection(db, "veiculos"),
          where("status", "==", "ativo"),
          where("tipoFrota", "==", tipoFrota),
          orderBy("placa")
        );
        const snap = await getDocs(qv);
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setVeiculos(list);
      } catch {
        // fallback sem orderBy
        const qv2 = query(
          collection(db, "veiculos"),
          where("status", "==", "ativo"),
          where("tipoFrota", "==", tipoFrota)
        );
        const snap2 = await getDocs(qv2);
        const list2 = snap2.docs.map((d) => ({ id: d.id, ...d.data() }));
        setVeiculos(list2);
      }
    })();
  }, [tipoFrota]);

  useEffect(() => {
    setVeiculoSel(veiculos.find((v) => v.id === veiculoId) || null);
  }, [veiculoId, veiculos]);

  const veiculosFiltrados = useMemo(() => {
    const b = (busca || "").trim().toLowerCase();
    if (hideSearch || !b) return veiculos;
    return veiculos.filter(
      (v) =>
        (v.placa || "").toLowerCase().includes(b) ||
        String(v.frotaNumero || "").toLowerCase().includes(b)
    );
  }, [veiculos, busca, hideSearch]);

  // ===== Abastecimento: campos =====
  const [tipoCombustivel, setTipoCombustivel] = useState("");
  const [litros, setLitros] = useState("");
  const [precoPorLitro, setPrecoPorLitro] = useState("");
  const [posto, setPosto] = useState("");
  const [data, setData] = useState(""); // input type="date"

  // KM/L automático
  const [kmAtual, setKmAtual] = useState("");
  const [kmPorLitro, setKmPorLitro] = useState("");
  const [ultimoKm, setUltimoKm] = useState(null);

  useEffect(() => {
    (async () => {
      if (!veiculoId) {
        setUltimoKm(null);
        return;
      }
      const km = await obterUltimoKmPorVeiculo(veiculoId);
      setUltimoKm(km);
    })();
  }, [veiculoId]);

  useEffect(() => {
    const l = Number(litros);
    const kmA = Number(kmAtual);
    if (l > 0 && ultimoKm != null && isFinite(kmA) && kmA > ultimoKm) {
      const kml = (kmA - ultimoKm) / l;
      setKmPorLitro(kml.toFixed(3));
    } else {
      setKmPorLitro("");
    }
  }, [litros, kmAtual, ultimoKm]);

  // ===== Upload imagem =====
  const [image, setImage] = useState(null);

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) {
      setImage(null);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert("O arquivo deve ser menor que 10MB.");
      setImage(null);
      return;
    }
    setImage(file);
  };

  async function uploadImage(uid, docId, file) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    const fallback = ext === "pdf" ? "application/pdf" : "image/jpeg";
    const metadata = { contentType: file.type || fallback };
    const nomeArq = `${Date.now()}_${file.name}`;
    const caminho = `abastecimentos/${uid}/${docId}/${nomeArq}`;
    const imageRef = ref(storage, caminho);
    await uploadBytes(imageRef, file, metadata);
    return await getDownloadURL(imageRef);
  }

  // ===== Submit =====
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const isSubmitting = useRef(false);
  const submitIdRef = useRef(crypto.randomUUID());

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg("");

    const uid = auth.currentUser?.uid;
    if (!uid) return setMsg("Você precisa estar autenticado.");
    if (!veiculoSel) return setMsg("Selecione um veículo.");
    if (!tipoCombustivel || !litros || !precoPorLitro || !data) {
      return setMsg("Preencha todos os campos obrigatórios.");
    }

    // 🔒 Bloqueio de KM: não permite kmAtual menor/igual ao último KM conhecido
    if (ultimoKm != null) {
      const kmA = Number(kmAtual);
      if (!isFinite(kmA) || kmA <= ultimoKm) {
        return setMsg(`KM Atual deve ser maior que o último KM conhecido (${ultimoKm}).`);
      }
    }

    // Restrições em modo público
    const tipoFrotaDoVeiculo = String(veiculoSel.tipoFrota || "").toLowerCase();
    if (publicMode && !allowedFrotas.includes(tipoFrotaDoVeiculo)) {
      return setMsg("Você não tem permissão para lançar nessa frota.");
    }

    if (isSubmitting.current) return;
    isSubmitting.current = true;

    try {
      setSaving(true);

      const litrosNum = Number(litros);
      const pplNum = Number(precoPorLitro);
      const valorTotal = Number((litrosNum * pplNum).toFixed(2));

      // usar meio-dia LOCAL para evitar problemas de fuso caindo no dia anterior
      const [y, m, d] = String(data).split("-").map(Number);
      const jsDate = new Date(y, m - 1, d, 12, 0, 0, 0);

      // 1) escrita idempotente — mesmo submitId em retry de rede gera o mesmo doc (sem duplicata)
      const submitId = submitIdRef.current;
      await setDoc(doc(db, "abastecimentos", submitId), {
        userId: uid,
        tipoFrota: tipoFrotaDoVeiculo,
        veiculoId: veiculoSel.id,
        placa: veiculoSel.placa || "",
        frotaNumero: veiculoSel.frotaNumero || "",
        tipoCombustivel,
        litros: litrosNum,
        precoPorLitro: pplNum,
        valorTotal,
        posto: posto || "",
        dataAbastecimento: Timestamp.fromDate(jsDate),
        kmAtual: kmAtual ? Number(kmAtual) : null,
        kmPorLitro: kmPorLitro ? Number(kmPorLitro) : null,
        criadoEm: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 2) upload opcional da imagem
      if (image) {
        const url = await uploadImage(uid, submitId, image);
        await updateDoc(doc(db, "abastecimentos", submitId), {
          imagem: url,
          updatedAt: serverTimestamp(),
        });
      }

      submitIdRef.current = crypto.randomUUID(); // novo ID para o próximo lançamento
      setMsg("Abastecimento lançado com sucesso!");
      setVeiculoId("");
      setVeiculoSel(null);
      if (!lockFrota) setTipoFrota("");
      setTipoCombustivel("");
      setLitros("");
      setPrecoPorLitro("");
      setPosto("");
      setData("");
      setKmAtual("");
      setKmPorLitro("");
      setBusca("");
      setImage(null);
    } catch (err) {
      console.error(err);
      setMsg("Erro ao salvar. Verifique os dados e tente novamente.");
    } finally {
      isSubmitting.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[#161a24] p-5 shadow-lg ring-1 ring-white/5">
      <div>
        <button type="button" className="mb-4 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10" onClick={() => navigate("/")}>
          ← Voltar
        </button>

        <h5 className="mb-4 text-xl font-bold text-sky-400">
          {publicMode ? "Lançar Abastecimento" : "Novo Abastecimento"}
        </h5>

        <form onSubmit={handleSubmit}>
          {/* Frota */}
          {!lockFrota ? (
            <div className="mb-3">
              <label className="mb-1 block text-xs text-slate-400">Frota</label>
              <select
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                value={tipoFrota}
                onChange={(e) => setTipoFrota(e.target.value)}
              >
                <option value="">Selecione...</option>
                {allowedFrotas.includes("leve") && <option value="leve">Leve</option>}
                {allowedFrotas.includes("pesada") && <option value="pesada">Pesada</option>}
              </select>
            </div>
          ) : (
            <div className="mb-3">
              <label className="mb-1 block text-xs text-slate-400">Frota</label>
              <span className="rounded-lg bg-slate-500/20 px-2 py-0.5 text-xs font-semibold uppercase text-slate-300">
                {tipoFrota || defaultFrotaProp}
              </span>
            </div>
          )}

          {/* Busca veículo */}
          {!hideSearch && (
            <div className="mb-2">
              <label className="mb-1 block text-xs text-slate-400">Pesquisar veículo (placa ou Nº frota)</label>
              <input
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder="Ex.: ABC1D23 ou 016"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                disabled={!tipoFrota}
              />
            </div>
          )}

          {/* Veículo */}
          <div className="mb-3">
            <label className="mb-1 block text-xs text-slate-400">Veículo</label>
            <select
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
              value={veiculoId}
              onChange={(e) => setVeiculoId(e.target.value)}
              disabled={!tipoFrota}
            >
              <option value="">Selecione...</option>
              {veiculosFiltrados.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.placa} — Frota {v.frotaNumero} — {v.nome || ""}
                </option>
              ))}
            </select>
          </div>

          {/* Campos abastecimento */}
          <div className="grid gap-3 md:grid-cols-12">
            <div className="md:col-span-4">
              <label className="mb-1 block text-xs text-slate-400">Combustível</label>
              <select
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                value={tipoCombustivel}
                onChange={(e) => setTipoCombustivel(e.target.value)}
              >
                <option value="">Selecione...</option>
                <option value="diesel">Diesel S10/S500</option>
                <option value="gasolina">Gasolina</option>
                <option value="arla">ARLA 32</option>
              </select>
            </div>

            <div className="md:col-span-4">
              <label className="mb-1 block text-xs text-slate-400">Litros</label>
              <input
                type="number"
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                value={litros}
                onChange={(e) => setLitros(e.target.value)}
                min="0"
                step="0.01"
              />
            </div>

            <div className="md:col-span-4">
              <label className="mb-1 block text-xs text-slate-400">Preço por litro</label>
              <input
                type="number"
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                value={precoPorLitro}
                onChange={(e) => setPrecoPorLitro(e.target.value)}
                min="0"
                step="0.01"
              />
            </div>

            <div className="md:col-span-4">
              <label className="mb-1 block text-xs text-slate-400">KM Atual</label>
              <input
                type="number"
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                value={kmAtual}
                onChange={(e) => setKmAtual(e.target.value)}
                placeholder="km"
              />
              {ultimoKm != null && (
                <div className="mt-1 text-xs text-slate-500">Último KM conhecido: {ultimoKm}</div>
              )}
            </div>

            <div className="md:col-span-4">
              <label className="mb-1 block text-xs text-slate-400">KM/L (auto)</label>
              <input type="text" className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-slate-300" value={kmPorLitro} readOnly />
            </div>

            <div className="md:col-span-4">
              <label className="mb-1 block text-xs text-slate-400">Data do abastecimento</label>
              <input
                type="date"
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </div>

            <div className="md:col-span-6">
              <label className="mb-1 block text-xs text-slate-400">Posto</label>
              <input
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                value={posto}
                onChange={(e) => setPosto(e.target.value)}
              />
            </div>
          </div>

          {/* Upload de imagem */}
          <div className="mb-3 mt-3">
            <label className="mb-1 block text-xs text-slate-400">Upload de Imagem (até 10MB)</label>
            <input
              type="file"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-slate-100 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-600 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-sky-500"
              accept="image/*,application/pdf"
              onChange={handleImageChange}
            />
          </div>

          <button className="mt-3 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50" type="submit" disabled={saving}>
            {saving ? "Salvando..." : "Lançar"}
          </button>
          {msg && <div className="mt-3 text-sm text-slate-300">{msg}</div>}
        </form>
      </div>
    </div>
  );
}
