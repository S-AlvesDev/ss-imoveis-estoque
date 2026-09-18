import { create } from 'zustand';
import { api } from '../lib/api';
import type { Conversa, Mensagem, Delta, Conexao, Presenca, Etiqueta, Filtro } from '../../shared/tipos';

/**
 * O estado da central: as conversas que a pessoa vê, as mensagens das que
 * ela abriu, e o cursor do sync. A lista vem inteira uma vez por filtro; o
 * resto chega por delta (GET /sync?desde=) — conversas e mensagens que
 * mudaram — e é aplicado por id, então repetição não duplica.
 */
export type { Filtro };

interface Central {
  conversas: Record<string, Conversa>;
  mensagens: Record<string, Mensagem[]>;
  /** Conversas anteriores do cliente da conversa aberta. */
  anteriores: Conversa[];
  selecionada: string | null;
  filtro: Filtro;
  busca: string;
  cursor: string | null;
  presenca: Record<number, { presenca: Presenca; presenca_em: string | null }>;
  conexao: Conexao | null;
  etiquetas: Etiqueta[];
  carregandoLista: boolean;
  carregandoConversa: boolean;

  setFiltro: (f: Filtro) => void;
  setBusca: (b: string) => void;
  carregarLista: () => Promise<void>;
  sincronizar: () => Promise<void>;
  abrir: (id: string | null) => Promise<void>;
  carregarMaisAntigas: (id: string) => Promise<boolean>;
  aplicarConversa: (c: Conversa) => void;
  aplicarMensagem: (m: Mensagem) => void;
  carregarEtiquetas: () => Promise<void>;
  limpar: () => void;
}

function ordenar(lista: Mensagem[]): Mensagem[] {
  return [...lista].sort((a, b) => a.criado_em.localeCompare(b.criado_em));
}

function mesclar(atual: Mensagem[] | undefined, novas: Mensagem[]): Mensagem[] {
  const porId = new Map((atual ?? []).map((m) => [m.id, m]));
  for (const m of novas) porId.set(m.id, m);
  return ordenar([...porId.values()]);
}

export const useCentral = create<Central>((set, get) => ({
  conversas: {},
  mensagens: {},
  anteriores: [],
  selecionada: null,
  filtro: 'abertas',
  busca: '',
  cursor: null,
  presenca: {},
  conexao: null,
  etiquetas: [],
  carregandoLista: false,
  carregandoConversa: false,

  setFiltro: (filtro) => {
    set({ filtro });
    void get().carregarLista();
  },
  setBusca: (busca) => set({ busca }),

  carregarLista: async () => {
    const { filtro, busca } = get();
    set({ carregandoLista: true });
    try {
      const r = await api.get<{ conversas: Conversa[] }>(`/conversas?filtro=${filtro}${busca ? `&busca=${encodeURIComponent(busca)}` : ''}`);
      // A lista substitui o que se sabe deste filtro, mas não apaga conversas conhecidas de outros
      // (a que está aberta, por exemplo); só atualiza.
      const conversas = { ...get().conversas };
      for (const c of r.conversas) conversas[c.id] = c;
      set({ conversas });
    } finally {
      set({ carregandoLista: false });
    }
  },

  sincronizar: async () => {
    const { cursor } = get();
    const d = await api.get<Delta>(`/sync${cursor ? `?desde=${encodeURIComponent(cursor)}` : ''}`);
    const conversas = { ...get().conversas };
    for (const c of d.conversas) conversas[c.id] = c;
    const mensagens = { ...get().mensagens };
    const porConversa = new Map<string, Mensagem[]>();
    for (const m of d.mensagens) porConversa.set(m.conversa_id, [...(porConversa.get(m.conversa_id) ?? []), m]);
    for (const [id, lista] of porConversa) {
      // Só mescla em conversas já carregadas: as outras carregam inteiras ao abrir.
      if (mensagens[id]) mensagens[id] = mesclar(mensagens[id], lista);
    }
    const presenca = { ...get().presenca };
    for (const u of d.equipe) presenca[u.id] = { presenca: u.presenca, presenca_em: u.presenca_em };
    set({ conversas, mensagens, presenca, conexao: d.conexao, cursor: d.cursor });
  },

  abrir: async (id) => {
    set({ selecionada: id, anteriores: [] });
    if (!id) return;
    set({ carregandoConversa: true });
    try {
      const r = await api.get<{ conversa: Conversa; mensagens: Mensagem[]; anteriores: Conversa[] }>(`/conversas/${id}`);
      set((s) => ({ conversas: { ...s.conversas, [id]: r.conversa }, mensagens: { ...s.mensagens, [id]: mesclar(s.mensagens[id], r.mensagens) }, anteriores: r.anteriores }));
      if (r.conversa.nao_lidas > 0) {
        void api.post(`/conversas/${id}/lida`).then(() => set((s) => (s.conversas[id] ? { conversas: { ...s.conversas, [id]: { ...s.conversas[id], nao_lidas: 0 } } } : {})));
      }
    } finally {
      set({ carregandoConversa: false });
    }
  },

  carregarMaisAntigas: async (id) => {
    const atuais = get().mensagens[id] ?? [];
    const maisAntiga = atuais[0]?.criado_em;
    if (!maisAntiga) return false;
    const r = await api.get<{ mensagens: Mensagem[] }>(`/conversas/${id}?antes_de=${encodeURIComponent(maisAntiga)}`);
    if (r.mensagens.length === 0) return false;
    set((s) => ({ mensagens: { ...s.mensagens, [id]: mesclar(s.mensagens[id], r.mensagens) } }));
    return true;
  },

  aplicarConversa: (c) => set((s) => ({ conversas: { ...s.conversas, [c.id]: c } })),
  aplicarMensagem: (m) => set((s) => ({ mensagens: { ...s.mensagens, [m.conversa_id]: mesclar(s.mensagens[m.conversa_id], [m]) } })),

  carregarEtiquetas: async () => {
    const r = await api.get<{ etiquetas: Etiqueta[] }>('/etiquetas');
    set({ etiquetas: r.etiquetas });
  },

  limpar: () => set({ conversas: {}, mensagens: {}, anteriores: [], selecionada: null, cursor: null, presenca: {}, conexao: null, etiquetas: [] }),
}));

/** A lista, filtrada e ordenada, para a coluna da esquerda. */
export function conversasVisiveis(s: Pick<Central, 'conversas' | 'filtro' | 'busca'>, eu: number): Conversa[] {
  const q = s.busca.trim().toLowerCase();
  const digitos = q.replace(/\D/g, '');
  return Object.values(s.conversas)
    .filter((c) => {
      switch (s.filtro) {
        case 'minhas':
          return c.atendente_id === eu && c.estado !== 'encerrada';
        case 'fila':
          return c.estado === 'na_fila' || c.estado === 'nova' || c.estado === 'em_triagem';
        case 'aguardando':
          return c.estado === 'aguardando_cliente';
        case 'encerradas':
          return c.estado === 'encerrada';
        case 'todas':
          return true;
        default:
          return c.estado !== 'encerrada';
      }
    })
    .filter((c) => {
      if (!q) return true;
      const nome = `${c.cliente.nome ?? ''} ${c.cliente.nome_whatsapp ?? ''}`.toLowerCase();
      return nome.includes(q) || (digitos.length >= 3 && c.cliente.telefone.includes(digitos));
    })
    .sort((a, b) => b.ultima_mensagem_em.localeCompare(a.ultima_mensagem_em));
}
