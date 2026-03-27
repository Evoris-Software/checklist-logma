// src/components/abastecimento/ModalLancarAbastecimento.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Timestamp, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { addAbastecimento, obterUltimoKmPorVeiculo } from "../../services/abastecimentos";
import { db, storage, auth } from "../../services/firebase";

export default function ModalLancarAbastecimento({
  open,
  onClose,
  frotaSelecionada = "todas",
  veiculos = [],
  onSaved,
}) {
  const [form, setForm] = useState({
    veiculoId: "",
    data: "",
    litros: "",
    precoPorLitro: "",
    kmAtual: "",
    kmPorLitro: "",
    posto: "",
    tipoFrota: "",
    tipoCombustivel: "",
  });

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);
  const [ultimoKm, setUltimoKm] = useState(null);
  const isSubmitting = useRef(false);
  const submitIdRef = useRef(crypto.randomUUID());

  // Upload imagem
  const [image, setImage] = useState(null);
  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return setImage(null);
    if (file.size > 10 * 1024 * 1024) {
      alert("O arquivo deve ser menor que 10MB.");
      return setImage(null);
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

  // reset ao abrir
  useEffect(() => {
    if (!open) return;
    setForm({
      veiculoId: "",
      data: "",
      litros: "",
      precoPorLitro: "",
      kmAtual: "",
      kmPorLitro: "",
      posto: "",
      tipoFrota: frotaSelecionada === "todas" ? "" : frotaSelecionada,
      tipoCombustivel: "",
    });
    setUltimoKm(null);
    setErro(null);
    setSalvando(false);
    setImage(null);
    submitIdRef.current = crypto.randomUUID(); // novo ID a cada abertura do modal
  }, [open, frotaSelecionada]);

  const veiculosFiltrados = useMemo(() => {
    return frotaSelecionada === "todas"
      ? veiculos
      : veiculos.filter((v) => (v.tipoFrota || "").toLowerCase() === frotaSelecionada);
  }, [veiculos, frotaSelecionada]);

  // último KM
  useEffect(() => {
    (async () => {
      if (!form.veiculoId) {
        setUltimoKm(null);
        return;
      }
      const km = await obterUltimoKmPorVeiculo(form.veiculoId);
      setUltimoKm(km);
    })();
  }, [form.veiculoId]);

  // km/L automático
  useEffect(() => {
    const litros = Number(form.litros);
    const kmAtual = Number(form.kmAtual);
    if (litros > 0 && ultimoKm != null && isFinite(kmAtual) && kmAtual > ultimoKm) {
      const kml = (kmAtual - ultimoKm) / litros;
      setForm((f) => ({ ...f, kmPorLitro: kml.toFixed(3) }));
    } else {
      setForm((f) => ({ ...f, kmPorLitro: "" }));
    }
  }, [form.litros, form.kmAtual, ultimoKm]);

  function handleSelectVeiculo(id) {
    const v = veiculos.find((x) => x.id === id);
    setForm((f) => ({
      ...f,
      veiculoId: id,
      tipoFrota: f.tipoFrota || (v?.tipoFrota || ""),
      tipoCombustivel: f.tipoCombustivel || (v?.tipoCombustivel || ""),
    }));
  }

  async function handleSalvar(e) {
    e?.preventDefault?.();
    if (isSubmitting.current) return;
    isSubmitting.current = true;
    setErro(null);
    setSalvando(true);
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error("Você precisa estar autenticado.");

      if (!form.veiculoId) throw new Error("Selecione o veículo.");
      if (!form.data) throw new Error("Informe a data.");
      if (!form.litros || Number(form.litros) <= 0) throw new Error("Informe os litros (> 0).");
      if (!form.precoPorLitro || Number(form.precoPorLitro) <= 0)
        throw new Error("Informe o preço por litro (> 0).");

      const tf = String(form.tipoFrota).toLowerCase();
      const tc = String(form.tipoCombustivel).toLowerCase();
      if (!["leve", "pesada"].includes(tf)) throw new Error("Tipo de frota inválido: leve/pesada.");
      if (!tc) throw new Error("Informe o tipo de combustível.");

      // usar meio-dia LOCAL para evitar problemas de fuso
      const [y, m, d] = form.data.split("-").map(Number);
      const jsDate = new Date(y, m - 1, d, 12, 0, 0, 0);

      const vSel = veiculos.find((vv) => vv.id === form.veiculoId);

      // 1) cria o doc via serviço — id idempotente previne duplicatas por retry de rede
      const docId = await addAbastecimento({
        id: submitIdRef.current,
        userId: uid,
        veiculoId: form.veiculoId,
        placa: (vSel?.placa || "").toUpperCase(),
        frotaNumero: vSel?.frotaNumero || "",
        tipoFrota: tf,
        tipoCombustivel: tc,
        dataAbastecimento: Timestamp.fromDate(jsDate),
        litros: Number(form.litros),
        precoPorLitro: Number(form.precoPorLitro),
        kmAtual: form.kmAtual ? Number(form.kmAtual) : null,
        kmPorLitro: form.kmPorLitro ? Number(form.kmPorLitro) : null,
        responsavel: "",
        observacao: form.posto || "",
      });

      // 2) upload opcional da imagem e atualização do doc
      if (image && docId) {
        const url = await uploadImage(uid, docId, image);
        await updateDoc(doc(db, "abastecimentos", docId), {
          imagem: url,
          updatedAt: serverTimestamp(),
        });
      }

      onSaved?.();
      onClose?.();
    } catch (e2) {
      setErro(e2?.message || "Erro ao salvar abastecimento.");
    } finally {
      isSubmitting.current = false;
      setSalvando(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
        <div className="rounded-2xl border border-white/10 bg-[#161a24] text-slate-100 shadow-xl">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <h5 className="text-lg font-bold text-sky-400">Lançar abastecimento</h5>
            <button type="button" className="rounded-lg p-1 text-slate-400 hover:bg-white/10" onClick={onClose}>×</button>
          </div>

          <form onSubmit={handleSalvar}>
            <div className="px-5 py-4">
              {erro && <div className="mb-3 rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-400">{erro}</div>}

              <div className="grid gap-3 md:grid-cols-12">
                <div className="md:col-span-6">
                  <label className="mb-1 block text-xs text-slate-400">Veículo *</label>
                  <select
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    value={form.veiculoId}
                    onChange={(e) => handleSelectVeiculo(e.target.value)}
                    required
                  >
                    <option value="">Selecione...</option>
                    {veiculosFiltrados.map((v) => (
                      <option key={v.id} value={v.id}>
                        {(v.frotaNumero || "—")} — {(v.placa || "").toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-3">
                  <label className="mb-1 block text-xs text-slate-400">Data *</label>
                  <input
                    type="date"
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    value={form.data}
                    onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))}
                    required
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="mb-1 block text-xs text-slate-400">KM Atual</label>
                  <input
                    type="number"
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    value={form.kmAtual}
                    onChange={(e) => setForm((f) => ({ ...f, kmAtual: e.target.value }))}
                    placeholder="km"
                  />
                  {ultimoKm != null && (
                    <div className="mt-1 text-xs text-slate-500">Último KM conhecido: {ultimoKm}</div>
                  )}
                </div>

                <div className="md:col-span-3">
                  <label className="mb-1 block text-xs text-slate-400">Litros *</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    value={form.litros}
                    onChange={(e) => setForm((f) => ({ ...f, litros: e.target.value }))}
                    required
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="mb-1 block text-xs text-slate-400">Preço por litro (R$) *</label>
                  <input
                    type="number"
                    step="0.001"
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    value={form.precoPorLitro}
                    onChange={(e) => setForm((f) => ({ ...f, precoPorLitro: e.target.value }))}
                    required
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="mb-1 block text-xs text-slate-400">KM/L (auto)</label>
                  <input type="text" className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-slate-300" value={form.kmPorLitro} readOnly />
                </div>

                <div className="md:col-span-6">
                  <label className="mb-1 block text-xs text-slate-400">Posto (opcional)</label>
                  <input
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    value={form.posto}
                    onChange={(e) => setForm((f) => ({ ...f, posto: e.target.value }))}
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="mb-1 block text-xs text-slate-400">Tipo de Frota *</label>
                  <select
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    value={form.tipoFrota}
                    onChange={(e) => setForm((f) => ({ ...f, tipoFrota: e.target.value }))}
                    required
                  >
                    <option value="">Selecione...</option>
                    <option value="leve">Leve</option>
                    <option value="pesada">Pesada</option>
                  </select>
                </div>

                <div className="md:col-span-3">
                  <label className="mb-1 block text-xs text-slate-400">Combustível *</label>
                  <select
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    value={form.tipoCombustivel}
                    onChange={(e) => setForm((f) => ({ ...f, tipoCombustivel: e.target.value }))}
                    required
                  >
                    <option value="">Selecione...</option>
                    <option value="gasolina">Gasolina</option>
                    <option value="diesel">Diesel S10/S500</option>
                    <option value="arla">ARLA 32</option>
                  </select>
                </div>

                {/* Upload de imagem */}
                <div className="md:col-span-12">
                  <label className="mb-1 block text-xs text-slate-400">Upload de Imagem (até 10MB)</label>
                  <input
                    type="file"
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-slate-100 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-600 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-sky-500"
                    accept="image/*,application/pdf"
                    onChange={handleImageChange}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-4">
              <button
                type="button"
                className="rounded-xl border border-white/20 bg-white/5 px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-white/10"
                onClick={onClose}
                disabled={salvando}
              >
                Cancelar
              </button>
              <button type="submit" className="rounded-xl bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50" disabled={salvando}>
                {salvando ? "Salvando…" : "Lançar"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
