import type { TicketPrioridade, TicketStatus, TicketTipo } from '@/shared/types';

export const TICKET_TIPOS: { value: TicketTipo; label: string; hint: string; minMateriais: number }[] = [
  {
    value: 'DUPLICADO',
    label: 'Material duplicado',
    hint: 'O mesmo material aparece cadastrado mais de uma vez. Selecione todos os cadastros repetidos.',
    minMateriais: 2,
  },
  {
    value: 'NOME_INCORRETO',
    label: 'Nome incorreto',
    hint: 'O nome está escrito errado, incompleto ou não corresponde ao material real.',
    minMateriais: 1,
  },
  {
    value: 'INFO_INCORRETA',
    label: 'Informação incorreta',
    hint: 'Categoria, unidade de medida, fator multiplicador ou estoque mínimo estão errados.',
    minMateriais: 1,
  },
  {
    value: 'FALTA_CADASTRO',
    label: 'Material não cadastrado',
    hint: 'Um material usado na obra ainda não existe no sistema.',
    minMateriais: 0,
  },
  {
    value: 'OUTRO',
    label: 'Outro assunto',
    hint: 'Qualquer outra questão sobre o estoque.',
    minMateriais: 0,
  },
];

export const STATUS_META: Record<TicketStatus, { label: string; variant: 'warning' | 'info' | 'success' | 'neutral' }> = {
  ABERTO: { label: 'Aberto', variant: 'warning' },
  EM_ANALISE: { label: 'Em análise', variant: 'info' },
  RESOLVIDO: { label: 'Resolvido', variant: 'success' },
  RECUSADO: { label: 'Recusado', variant: 'neutral' },
};

export const PRIORIDADE_META: Record<TicketPrioridade, { label: string; className: string }> = {
  BAIXA: { label: 'Baixa', className: 'text-[var(--text-muted)]' },
  NORMAL: { label: 'Normal', className: 'text-sky-500' },
  ALTA: { label: 'Alta', className: 'text-rose-500' },
};

export function tipoLabel(tipo: TicketTipo): string {
  return TICKET_TIPOS.find((t) => t.value === tipo)?.label ?? tipo;
}
