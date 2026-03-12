import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Veiculo, TipoFrota, TipoCombustivel } from "../types";

const COLLECTION = "veiculos";

interface VeiculoFirestore {
  nome?: string;
  placa?: string;
  frotaNumero?: string;
  descricao?: string;
  tipo?: string;
  status?: string;
  tipoFrota?: TipoFrota;
  tipoCombustivel?: TipoCombustivel;
  createdAt?: unknown;
  updatedAt?: unknown;
}

function normalizeVeiculoData(data: VeiculoFirestore = {}, id = ""): Veiculo {
  return {
    id,
    nome: data.nome ?? "",
    placa: data.placa ?? "",
    frotaNumero: data.frotaNumero ?? "",
    tipoFrota: (data.tipoFrota as TipoFrota) ?? "pesada",
    ativo: (data.status ?? "ativo") === "ativo",
  };
}

export function listenVeiculos(cb: (list: Veiculo[]) => void): Unsubscribe {
  const qRef = query(collection(db, COLLECTION), orderBy("nome", "asc"));
  const unsub = onSnapshot(qRef, (snap) => {
    const list = snap.docs.map((d) =>
      normalizeVeiculoData(d.data() as VeiculoFirestore, d.id),
    );
    cb(list);
  });
  return unsub;
}

export async function getVeiculosAtivos(): Promise<Veiculo[]> {
  const qRef = query(
    collection(db, COLLECTION),
    where("status", "==", "ativo"),
    orderBy("nome", "asc"),
  );
  const snap = await getDocs(qRef);
  return snap.docs.map((d) => normalizeVeiculoData(d.data() as VeiculoFirestore, d.id));
}

export async function getVeiculoById(id: string): Promise<Veiculo | null> {
  if (!id) return null;
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists()
    ? normalizeVeiculoData(snap.data() as VeiculoFirestore, snap.id)
    : null;
}

export async function ensureVeiculoAtivoOrThrow(id: string): Promise<Veiculo> {
  const v = await getVeiculoById(id);
  if (!v) throw new Error("Veículo não encontrado.");
  if (!v.ativo) throw new Error("Veículo indisponível (não está ativo).");
  return v;
}

export interface AddVeiculoPayload {
  nome: string;
  placa: string;
  frotaNumero: string;
  descricao?: string;
  tipo?: string;
  status?: string;
  tipoFrota: TipoFrota;
  tipoCombustivel: TipoCombustivel;
}

export async function addVeiculo(payload: AddVeiculoPayload): Promise<string> {
  const nome = (payload.nome || "").trim();
  const placa = (payload.placa || "").trim().toUpperCase();
  const frotaNumero = (payload.frotaNumero || "").trim();
  const descricao = (payload.descricao || "").trim();
  const tipo = (payload.tipo || "veiculo").trim();
  const status = payload.status || "ativo";
  const tipoFrota = (payload.tipoFrota || "").toString().trim().toLowerCase() as TipoFrota;
  const tipoCombustivel = (payload.tipoCombustivel || "")
    .toString()
    .trim()
    .toLowerCase() as TipoCombustivel;

  if (!frotaNumero || !nome || !placa) {
    throw new Error("Preencha frotaNumero, nome e placa.");
  }
  if (!["leve", "pesada"].includes(tipoFrota)) {
    throw new Error("Informe corretamente o tipoFrota (leve | pesada).");
  }
  if (!tipoCombustivel) {
    throw new Error("Informe o tipoCombustivel (ex.: gasolina, diesel, etanol).");
  }

  const qRef = query(collection(db, COLLECTION), where("placa", "==", placa));
  const dup = await getDocs(qRef);
  if (!dup.empty) {
    throw new Error("Já existe um veículo com essa placa.");
  }

  const data = {
    nome,
    placa,
    frotaNumero,
    descricao,
    tipo,
    status,
    tipoFrota,
    tipoCombustivel,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const ref = await addDoc(collection(db, COLLECTION), data);
  return ref.id;
}

export type UpdateVeiculoPayload = Partial<
  Pick<
    AddVeiculoPayload,
    "nome" | "placa" | "frotaNumero" | "descricao" | "tipo" | "status" | "tipoFrota" | "tipoCombustivel"
  >
>;

export async function updateVeiculo(id: string, payload: UpdateVeiculoPayload): Promise<void> {
  const patch: Record<string, unknown> = {};

  if (payload.nome !== undefined) patch.nome = (payload.nome || "").trim();
  if (payload.placa !== undefined) patch.placa = (payload.placa || "").trim().toUpperCase();
  if (payload.frotaNumero !== undefined) patch.frotaNumero = (payload.frotaNumero || "").trim();
  if (payload.descricao !== undefined) patch.descricao = (payload.descricao || "").trim();
  if (payload.tipo !== undefined) patch.tipo = (payload.tipo || "veiculo").trim();
  if (payload.status !== undefined) patch.status = payload.status || "ativo";

  if (payload.tipoFrota !== undefined) {
    const tf = (payload.tipoFrota || "").toString().trim().toLowerCase();
    if (!["leve", "pesada"].includes(tf)) {
      throw new Error("tipoFrota inválido (use 'leve' ou 'pesada').");
    }
    patch.tipoFrota = tf;
  }
  if (payload.tipoCombustivel !== undefined) {
    const tc = (payload.tipoCombustivel || "").toString().trim().toLowerCase();
    if (!tc) throw new Error("tipoCombustivel não pode ser vazio.");
    patch.tipoCombustivel = tc;
  }

  patch.updatedAt = serverTimestamp();
  await updateDoc(doc(db, COLLECTION, id), patch);
}

export async function deleteVeiculo(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}

export async function marcarEmManutencao(id: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    status: "manutencao",
    updatedAt: serverTimestamp(),
  });
}

export async function marcarAtivo(id: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    status: "ativo",
    updatedAt: serverTimestamp(),
  });
}

