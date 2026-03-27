import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  deleteDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Abastecimento, TipoFrota, TipoCombustivel } from "../types";

const COLLECTION = "abastecimentos";
const CONFIG_COLLECTION = "config_abastecimento";
const CONFIG_DOC_ID = "global";

function normalizeAbastecimento(d: Partial<Abastecimento> = {}, id = ""): Abastecimento {
  return {
    id,
    veiculoId: d.veiculoId ?? "",
    placa: d.placa ?? "",
    frotaNumero: d.frotaNumero ?? "",
    tipoFrota: (d.tipoFrota as TipoFrota | "") ?? "",
    tipoCombustivel: (d.tipoCombustivel as TipoCombustivel) ?? "",
    litros: Number(d.litros ?? 0),
    precoPorLitro: Number(d.precoPorLitro ?? 0),
    valorTotal: Number(d.valorTotal ?? 0),
    kmAtual: d.kmAtual != null ? Number(d.kmAtual) : null,
    kmPorLitro: d.kmPorLitro != null ? Number(d.kmPorLitro) : null,
    observacao: d.observacao ?? "",
    dataAbastecimento: d.dataAbastecimento ?? null,
  };
}

function toTimestamp(anyDate: unknown): Timestamp {
  if (anyDate instanceof Timestamp) return anyDate;
  if (anyDate instanceof Date) return Timestamp.fromDate(anyDate);
  if (typeof anyDate === "string") {
    const d = new Date(anyDate);
    if (!Number.isNaN(d.getTime())) return Timestamp.fromDate(d);
  }
  return serverTimestamp() as Timestamp;
}

export interface CriarAbastecimentoPayload {
  id?: string;        // opcional: se informado, usa setDoc (idempotente) em vez de addDoc
  veiculoId: string;
  placa?: string;
  frotaNumero?: string;
  tipoFrota: TipoFrota;
  tipoCombustivel: TipoCombustivel;
  litros: number;
  precoPorLitro: number;
  valorTotal?: number;
  kmAtual?: number | null;
  kmPorLitro?: number | null;
  dataAbastecimento?: unknown;
  responsavel?: string;
  observacao?: string;
}

export async function criarAbastecimento(payload: CriarAbastecimentoPayload): Promise<string> {
  const {
    id: docIdForcado,
    veiculoId,
    placa = "",
    frotaNumero = "",
    tipoFrota,
    tipoCombustivel,
    litros,
    precoPorLitro,
    valorTotal,
    kmAtual = null,
    kmPorLitro = null,
    dataAbastecimento,
    responsavel = "",
    observacao = "",
  } = payload;

  if (!veiculoId) throw new Error("veiculoId é obrigatório.");

  const tf = String(tipoFrota).toLowerCase() as TipoFrota;
  if (!["leve", "pesada"].includes(tf)) {
    throw new Error("tipoFrota inválido (use 'leve' ou 'pesada').");
  }
  const tc = String(tipoCombustivel).toLowerCase() as TipoCombustivel;
  if (!tc) throw new Error("tipoCombustivel é obrigatório.");

  const l = Number(litros);
  const ppl = Number(precoPorLitro);
  if (!l || l <= 0) throw new Error("Litros deve ser maior que 0.");
  if (!ppl || ppl <= 0) throw new Error("Preço por litro deve ser maior que 0.");

  const total = valorTotal != null ? Number(valorTotal) : Number((l * ppl).toFixed(2));

  const docData = {
    veiculoId,
    placa: String(placa || "").toUpperCase(),
    frotaNumero: String(frotaNumero || "").trim(),
    tipoFrota: tf,
    tipoCombustivel: tc,
    litros: l,
    precoPorLitro: ppl,
    valorTotal: total,
    kmAtual: kmAtual != null ? Number(kmAtual) : null,
    kmPorLitro: kmPorLitro != null ? Number(kmPorLitro) : null,
    responsavel,
    observacao,
    dataAbastecimento: toTimestamp(dataAbastecimento),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  // Escrita idempotente: se um docId foi fornecido, usa setDoc para evitar duplicatas por retry
  if (docIdForcado) {
    await setDoc(doc(db, COLLECTION, docIdForcado), docData);
    return docIdForcado;
  }
  const ref = await addDoc(collection(db, COLLECTION), docData);
  return ref.id;
}

export const addAbastecimento = criarAbastecimento;

export async function obterUltimoKmPorVeiculo(veiculoId: string): Promise<number | null> {
  if (!veiculoId) return null;

  const qRef = query(
    collection(db, COLLECTION),
    where("veiculoId", "==", veiculoId),
    orderBy("dataAbastecimento", "desc"),
    limit(1),
  );

  const snap = await getDocs(qRef);
  const doc0 = snap.docs[0];
  const r = doc0 ? normalizeAbastecimento(doc0.data() as Partial<Abastecimento>, doc0.id) : null;

  return r?.kmAtual != null ? Number(r.kmAtual) : null;
}

export interface ListarAbastecimentosParams {
  mes?: number;
  ano?: number;
  tipoFrota?: TipoFrota;
}

export async function listarAbastecimentos(
  { mes, ano, tipoFrota }: ListarAbastecimentosParams = {},
): Promise<Abastecimento[]> {
  if (!mes || !ano) {
    const base = tipoFrota
      ? query(
          collection(db, COLLECTION),
          where("tipoFrota", "==", tipoFrota),
          orderBy("dataAbastecimento", "desc"),
        )
      : query(collection(db, COLLECTION), orderBy("dataAbastecimento", "desc"));

    const snap = await getDocs(base);
    return snap.docs.map((d) =>
      normalizeAbastecimento(d.data() as Partial<Abastecimento>, d.id),
    );
  }

  const startLocal = new Date(ano, mes - 1, 1, 0, 0, 0, 0);
  const endLocal = new Date(ano, mes, 1, 0, 0, 0, 0);

  const startTs = Timestamp.fromDate(startLocal);
  const endTs = Timestamp.fromDate(endLocal);

  const base = tipoFrota
    ? query(
        collection(db, COLLECTION),
        where("tipoFrota", "==", tipoFrota),
        where("dataAbastecimento", ">=", startTs),
        where("dataAbastecimento", "<", endTs),
        orderBy("dataAbastecimento", "desc"),
      )
    : query(
        collection(db, COLLECTION),
        where("dataAbastecimento", ">=", startTs),
        where("dataAbastecimento", "<", endTs),
        orderBy("dataAbastecimento", "desc"),
      );

  const snap = await getDocs(base);
  return snap.docs.map((d) => normalizeAbastecimento(d.data() as Partial<Abastecimento>, d.id));
}

export async function deleteAbastecimento(id: string): Promise<void> {
  const ref = doc(db, COLLECTION, id);
  await deleteDoc(ref);
}

export type UpdateAbastecimentoPatch = Partial<
  Pick<
    Abastecimento,
    | "veiculoId"
    | "placa"
    | "frotaNumero"
    | "tipoFrota"
    | "tipoCombustivel"
    | "litros"
    | "precoPorLitro"
    | "valorTotal"
    | "kmAtual"
    | "kmPorLitro"
    | "observacao"
    | "dataAbastecimento"
  >
>;

export async function updateAbastecimento(
  id: string,
  patch: UpdateAbastecimentoPatch,
): Promise<boolean> {
  if (!id) throw new Error("id é obrigatório para atualizar.");

  const allowed: (keyof UpdateAbastecimentoPatch)[] = [
    "veiculoId",
    "placa",
    "frotaNumero",
    "tipoFrota",
    "tipoCombustivel",
    "litros",
    "precoPorLitro",
    "valorTotal",
    "kmAtual",
    "kmPorLitro",
    "observacao",
    "dataAbastecimento",
  ];

  const data: Record<string, unknown> = {};
  for (const k of allowed) {
    if (patch[k] !== undefined) data[k] = patch[k] as unknown;
  }

  if (
    data.valorTotal === undefined &&
    (patch.litros !== undefined || patch.precoPorLitro !== undefined)
  ) {
    const litros =
      typeof patch.litros === "number" ? patch.litros : (patch.litros as unknown as number);
    const ppl =
      typeof patch.precoPorLitro === "number"
        ? patch.precoPorLitro
        : (patch.precoPorLitro as unknown as number);
    if (typeof litros === "number" && typeof ppl === "number") {
      data.valorTotal = Number((litros * ppl).toFixed(2));
    }
  }

  data.updatedAt = serverTimestamp();

  const ref = doc(db, COLLECTION, id);
  await updateDoc(ref, data);
  return true;
}

export interface KpiValores {
  totalGasto: number;
  litrosTotais: number;
  precoMedio: number;
  consumoMedioFrota: number | null;
}

export interface KpiDelta {
  totalGasto: number;
  precoMedio: number;
  consumoMedioFrota: number | null;
}

export interface KpiComparativo {
  atual: KpiValores;
  anterior: KpiValores;
  delta: KpiDelta;
  refAnterior: { mes: number; ano: number };
  abastecimentos: Abastecimento[];
}

export interface CalcularKpisParams {
  mes: number;
  ano: number;
  tipoFrota?: TipoFrota;
  alvoPrecoLeve?: number;
  alvoPrecoPesada?: number;
}

export async function calcularKpisComComparativo(
  params: CalcularKpisParams,
): Promise<KpiComparativo> {
  const { mes, ano, tipoFrota } = params;

  const atualTodos = await listarAbastecimentos({ mes, ano, tipoFrota });
  let prevMes = mes - 1;
  let prevAno = ano;
  if (prevMes < 1) {
    prevMes = 12;
    prevAno = ano - 1;
  }
  const anteriorTodos = await listarAbastecimentos({ mes: prevMes, ano: prevAno, tipoFrota });

  const calc = (items: Abastecimento[]): KpiValores => {
    const somaValor = items.reduce((acc, i) => acc + Number(i.valorTotal || 0), 0);
    const somaLitros = items.reduce((acc, i) => acc + Number(i.litros || 0), 0);
    const precoMedio = somaLitros > 0 ? somaValor / somaLitros : 0;

    const somaKm = items.reduce((acc, i) => {
      const kml = Number(i.kmPorLitro);
      const l = Number(i.litros);
      if (Number.isFinite(kml) && kml > 0 && Number.isFinite(l) && l > 0) {
        return acc + kml * l;
      }
      return acc;
    }, 0);
    const consumoMedioFrota = somaLitros > 0 ? somaKm / somaLitros : null;

    return {
      totalGasto: Number(somaValor.toFixed(2)),
      litrosTotais: Number(somaLitros.toFixed(2)),
      precoMedio: Number(precoMedio.toFixed(4)),
      consumoMedioFrota: consumoMedioFrota != null ? Number(consumoMedioFrota.toFixed(3)) : null,
    };
  };

  const atual = calc(atualTodos);
  const anterior = calc(anteriorTodos);

  const delta: KpiDelta = {
    totalGasto: Number((atual.totalGasto - anterior.totalGasto).toFixed(2)),
    precoMedio: Number((atual.precoMedio - anterior.precoMedio).toFixed(4)),
    consumoMedioFrota:
      atual.consumoMedioFrota != null && anterior.consumoMedioFrota != null
        ? Number((atual.consumoMedioFrota - anterior.consumoMedioFrota).toFixed(3))
        : null,
  };

  return {
    atual,
    anterior,
    delta,
    refAnterior: { mes: prevMes, ano: prevAno },
    abastecimentos: atualTodos,
  };
}

export function agruparPorFrota(items: Abastecimento[] = []): {
  leve: Abastecimento[];
  pesada: Abastecimento[];
} {
  return items.reduce(
    (acc, i) => {
      if (i.tipoFrota === "leve") acc.leve.push(i);
      else if (i.tipoFrota === "pesada") acc.pesada.push(i);
      return acc;
    },
    { leve: [] as Abastecimento[], pesada: [] as Abastecimento[] },
  );
}

export interface ConfigAbastecimento {
  alvoPrecoLeve: number;
  alvoPrecoPesada: number;
  updatedAt: unknown;
}

export async function lerConfigAbastecimento(): Promise<ConfigAbastecimento> {
  const ref = doc(collection(db, CONFIG_COLLECTION), CONFIG_DOC_ID);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return {
      alvoPrecoLeve: 0,
      alvoPrecoPesada: 0,
      updatedAt: null,
    };
  }
  const d = snap.data() as Partial<ConfigAbastecimento>;
  return {
    alvoPrecoLeve: Number(d.alvoPrecoLeve ?? 0),
    alvoPrecoPesada: Number(d.alvoPrecoPesada ?? 0),
    updatedAt: d.updatedAt ?? null,
  };
}

export async function salvarThreshold({
  alvoPrecoLeve,
  alvoPrecoPesada,
}: Partial<ConfigAbastecimento>): Promise<ConfigAbastecimento> {
  const ref = doc(collection(db, CONFIG_COLLECTION), CONFIG_DOC_ID);
  const snap = await getDoc(ref);

  const patch = {
    ...(alvoPrecoLeve !== undefined ? { alvoPrecoLeve: Number(alvoPrecoLeve) } : {}),
    ...(alvoPrecoPesada !== undefined ? { alvoPrecoPesada: Number(alvoPrecoPesada) } : {}),
    updatedAt: serverTimestamp(),
  };

  if (!snap.exists()) {
    await setDoc(ref, patch);
  } else {
    await updateDoc(ref, patch);
  }

  const fresh = await getDoc(ref);
  const d = fresh.data() as Partial<ConfigAbastecimento>;
  return {
    alvoPrecoLeve: Number(d.alvoPrecoLeve ?? 0),
    alvoPrecoPesada: Number(d.alvoPrecoPesada ?? 0),
    updatedAt: d.updatedAt ?? null,
  };
}

