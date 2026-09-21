/**
 * Quem pode o quê no Atende Aí.
 *
 * Três papéis hoje, pensados para crescer: cada permissão é um nome, e um
 * papel é um conjunto delas. Uma tela pergunta `pode(papel, 'equipe.gerir')`,
 * o servidor pergunta a mesma coisa — a regra mora aqui, uma vez.
 *
 * O que NÃO está aqui: "esta conversa é minha?" — isso depende do dado
 * (time, atendente) e é conferido conversa a conversa no servidor.
 */

export type Papel = 'admin' | 'supervisor' | 'atendente';
export const PAPEIS: readonly Papel[] = ['admin', 'supervisor', 'atendente'];

export const NOME_DO_PAPEL: Record<Papel, string> = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  atendente: 'Atendente',
};

export const DESCRICAO_DO_PAPEL: Record<Papel, string> = {
  admin: 'Cuida da empresa: cadastro, times, equipe, WhatsApp. Vê e faz tudo.',
  supervisor: 'Acompanha os atendimentos dos seus times: orienta, assume, transfere, corrige a triagem, vê o painel.',
  atendente: 'Atende as próprias conversas e a fila dos seus times.',
};

export type Permissao =
  /** Editar dados da empresa e o contexto da IA. */
  | 'empresa.gerir'
  /** Criar, editar e desativar times. */
  | 'times.gerir'
  /** Criar, editar e desativar funcionários; definir papéis e senhas. */
  | 'equipe.gerir'
  /** Ver a lista da equipe (nome, papel, times, presença). */
  | 'equipe.ver'
  /** Conectar/desconectar o WhatsApp da empresa. */
  | 'whatsapp.gerir'
  /** Atender: abrir e responder conversas próprias e da fila dos seus times. */
  | 'conversas.atender'
  /** Ver conversas de outros atendentes (dos times que supervisiona, ou todas se admin). */
  | 'conversas.supervisionar'
  /** Ver o painel gerencial. */
  | 'dashboard.ver'
  /** Criar, editar e desativar itens do inventário (ver e consultar é 'conversas.atender'). */
  | 'inventario.gerir'
  /** Criar, editar e desativar modelos de mensagem (usar ao responder é 'conversas.atender'). */
  | 'modelos.gerir';

const PERMISSOES: Record<Papel, readonly Permissao[]> = {
  admin: ['empresa.gerir', 'times.gerir', 'equipe.gerir', 'equipe.ver', 'whatsapp.gerir', 'conversas.atender', 'conversas.supervisionar', 'dashboard.ver', 'inventario.gerir', 'modelos.gerir'],
  supervisor: ['equipe.ver', 'conversas.atender', 'conversas.supervisionar', 'dashboard.ver', 'inventario.gerir', 'modelos.gerir'],
  atendente: ['equipe.ver', 'conversas.atender'],
};

export function ehPapel(s: unknown): s is Papel {
  return typeof s === 'string' && (PAPEIS as readonly string[]).includes(s);
}

export function pode(papel: string, permissao: Permissao): boolean {
  return ehPapel(papel) && PERMISSOES[papel].includes(permissao);
}

/** Papéis que alguém pode atribuir a outra pessoa. Só o admin gere equipe, e ele pode criar outro admin. */
export const PAPEIS_ATRIBUIVEIS: readonly Papel[] = ['admin', 'supervisor', 'atendente'];
