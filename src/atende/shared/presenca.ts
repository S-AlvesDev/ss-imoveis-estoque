import type { Presenca } from './tipos';

/**
 * A presença de alguém da equipe, decidida pelo mesmo critério no servidor
 * (quem recebe conversa da triagem) e na tela (a bolinha verde).
 *
 * O `sync` da central é o batimento: quem sincronizou há menos de 2 min está
 * aqui. "Ausente" é escolha da pessoa (o botão no rodapé da barra) e vale
 * enquanto ela continuar batendo; quem parou de bater — fechou a aba, caiu
 * a rede — fica offline, diga o banco o que diga. E quem saiu pela porta
 * (Sair grava 'offline') está offline na hora, sem esperar os 2 min.
 */
export const PRESENCA_VALIDA_MS = 2 * 60_000;

export function presencaEfetiva(p: { presenca: Presenca | string; presenca_em: string | null } | null | undefined, agora = Date.now()): Presenca {
  if (!p || !p.presenca_em || p.presenca === 'offline') return 'offline';
  if (agora - Date.parse(p.presenca_em) > PRESENCA_VALIDA_MS) return 'offline';
  return p.presenca === 'ausente' ? 'ausente' : 'online';
}

export const NOME_DA_PRESENCA: Record<Presenca, string> = { online: 'Online', ausente: 'Ausente', offline: 'Offline' };
