export type Role =
  | "admin"
  | "motorista"
  | "vendedor"
  | "operador_empilhadeira"
  | "operador_gerador";

export interface UserRoles {
  role: Role;
  roles?: Role[];
}

export interface AppUser extends UserRoles {
  uid: string;
  nome: string;
  email?: string;
}

export type TipoFrota = "leve" | "pesada";

export interface Veiculo {
  id: string;
  nome: string;
  placa: string;
  frotaNumero: string;
  tipoFrota: TipoFrota;
  ativo: boolean;
}

export type TipoCombustivel = "diesel" | "gasolina" | "etanol" | "arla" | string;

export interface Abastecimento {
  id: string;
  veiculoId: string;
  placa: string;
  frotaNumero: string;
  tipoFrota: TipoFrota | "";
  tipoCombustivel: TipoCombustivel;
  isArla?: boolean;
  imagem?: string | null;
  litros: number;
  precoPorLitro: number;
  valorTotal: number;
  kmAtual: number | null;
  kmPorLitro: number | null;
  observacao: string;
  dataAbastecimento: unknown;
}

export type TipoChecklist = "veiculo" | "equipamento" | "gerador";

export interface ChecklistItemDefinition {
  id: string;
  label: string;
  tipoChecklist: TipoChecklist;
  grupo?: string;
}

export interface ChecklistRegistro {
  id: string;
  motorista: string;
  tipoChecklist: TipoChecklist;
  selecionadoId: string;
  selecionadoNome: string;
  respostas: Record<string, string>;
  obs?: string;
  dataHora: unknown;
}

export interface ManutencaoProblemaInfo {
  checklistId?: string;
  nomeItem?: string;
}

export interface ManutencaoRegistro {
  id: string;
  titulo: string;
  status: "aberta" | "em_andamento" | "concluida" | "cancelada";
  problemaVinculadoInfo?: ManutencaoProblemaInfo;
  dataHora: unknown;
}

