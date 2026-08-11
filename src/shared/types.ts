export interface Material {
  id: number;
  nome: string;
  unidade_medida: string;
  qtd_volumes: number;
  fator_multiplicador: number;
  saldo_central: number;
  saldo_obra: number;
  estoque_minimo: number;
  categoria: string;
  created_at: string;
  updated_at: string;
}

export interface MaterialMovement {
  id: number;
  material_id: number | null;
  tipo_operacao: string;
  quantidade: number;
  funcionario_matricula: string;
  justificativa: string | null;
  created_at: string;
  materials?: { nome: string } | null;
}

export interface StaffUser {
  id: number;
  nome: string;
  matricula: string;
  role: string;
}

export interface AuthUser {
  id: number;
  nome: string;
  matricula: string;
  role: string;
}
