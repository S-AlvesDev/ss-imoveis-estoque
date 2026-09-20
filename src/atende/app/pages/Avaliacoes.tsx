import { useEffect, useState } from 'react';
import { ArrowUpRight, MessageSquareQuote, RefreshCw, Star, Trophy } from 'lucide-react';
import { Botao } from '../ui/Botao';
import { Cartao, CabecalhoDoCartao, Rotulo } from '../ui/Cartao';
import { Segmentado } from '../ui/Controles';
import { Avatar } from '../ui/Avatar';
import { Etiqueta } from '../ui/Etiqueta';
import { Pagina } from '../ui/Pagina';
import { Erro, Esqueleto, Vazio } from '../ui/Estados';
import { DistribuicaoDeNotas } from '../ui/Graficos';
import { api, ErroDaApi } from '../lib/api';
import { useDadosAtende } from '../store/dados';
import { TELAS, useRotaAtende } from '../router';
import { NOME_DO_PERIODO, type PeriodoDoDashboard, type ResumoDeAvaliacoes } from '../../shared/tipos';

/**
 * As avaliações do atendimento (0 a 10): média, NPS e taxa de resposta em
 * números grandes, a distribuição das notas, a equipe ordenada pela média
 * e os atendimentos mais bem avaliados. A tela completa tem seletor de
 * período; o cartão resumido entra na Supervisão (últimos 30 dias).
 */
const PERIODOS: PeriodoDoDashboard[] = ['hoje', '7d', '30d', '90d'];

function useResumo(periodo: PeriodoDoDashboard, inicial?: ResumoDeAvaliacoes) {
  const [dados, setDados] = useState<ResumoDeAvaliacoes | null>(inicial ?? null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(!inicial);
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    if (inicial) {
      setDados(inicial);
      return;
    }
    let vivo = true;
    setCarregando(true);
    setErro(null);
    api
      .get<ResumoDeAvaliacoes>(`/avaliacoes?periodo=${periodo}`)
      .then((r) => vivo && setDados(r))
      .catch((e) => vivo && setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível carregar as avaliações.'))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [inicial, periodo, versao]);
  return { dados, erro, carregando, recarregar: () => setVersao((v) => v + 1) };
}

const tomDaNota = (nota: number): 'verde' | 'ambar' | 'vermelho' => (nota >= 9 ? 'verde' : nota >= 7 ? 'ambar' : 'vermelho');
const fmtData = (iso: string) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '');

/** A tela. */
export function Avaliacoes() {
  const [periodo, setPeriodo] = useState<PeriodoDoDashboard>('30d');
  const { dados, erro, carregando, recarregar } = useResumo(periodo);
  const acoes = (
    <>
      <Segmentado valor={periodo} onChange={setPeriodo} tamanho="sm" opcoes={PERIODOS.map((p) => ({ valor: p, rotulo: NOME_DO_PERIODO[p] }))} aria-label="Período" />
      <Botao tamanho="sm" variante="fantasma" quadrado icone={<RefreshCw size={15} className={carregando ? 'animate-spin' : ''} />} onClick={recarregar} aria-label="Atualizar" />
    </>
  );
  return (
    <Pagina titulo="Avaliações" descricao="Como os clientes avaliaram o atendimento, de 0 a 10, ao fim de cada conversa." acoes={acoes} largura="lg">
      {erro ? <Erro mensagem={erro} aoTentar={recarregar} /> : <Conteudo dados={dados} carregando={carregando} completo />}
    </Pagina>
  );
}

/** O cartão resumido (Supervisão): os números e o topo da equipe, com o caminho para a tela completa. */
export function CartaoDeAvaliacoes({ dados: iniciais, periodo = '30d' }: { dados?: ResumoDeAvaliacoes; periodo?: PeriodoDoDashboard }) {
  const ir = useRotaAtende((s) => s.ir);
  const { dados, carregando } = useResumo(periodo, iniciais);
  return (
    <Cartao className="p-4 sm:p-5">
      <CabecalhoDoCartao icone={<Star size={14} />} titulo="Avaliações do atendimento" descricao={dados && dados.pedidas > 0 ? `${dados.respondidas} de ${dados.pedidas} responderam · ${NOME_DO_PERIODO[periodo].toLowerCase()}` : `Notas de 0 a 10 pedidas ao encerrar · ${NOME_DO_PERIODO[periodo].toLowerCase()}`} acoes={<Botao variante="fantasma" tamanho="xs" iconeDepois={<ArrowUpRight size={13} />} onClick={() => ir(TELAS.avaliacoes)}>Ver tudo</Botao>} />
      <div className="mt-4">
        <Conteudo dados={dados} carregando={carregando} />
      </div>
    </Cartao>
  );
}

function Conteudo({ dados: r, carregando, completo }: { dados: ResumoDeAvaliacoes | null; carregando: boolean; completo?: boolean }) {
  const equipe = useDadosAtende((s) => s.equipe);
  const ir = useRotaAtende((s) => s.ir);
  const nome = (id: number | null) => (id === null ? 'sem atendente' : (equipe.find((f) => f.id === id)?.nome ?? `#${id}`));

  if (!r && carregando) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Esqueleto className="h-24" />
          <Esqueleto className="h-24" />
          <Esqueleto className="h-24" />
        </div>
        <Esqueleto className="h-28 w-full" />
      </div>
    );
  }
  if (!r) return null;
  if (r.pedidas === 0) {
    return (
      <Cartao className={completo ? '' : 'border-dashed shadow-none'}>
        <Vazio tom="positivo" icone={<Star size={20} />} titulo="Nenhuma avaliação pedida no período." texto="Ao encerrar uma conversa, escolha “Despedida da IA + pedir avaliação”: a IA se despede no tom da conversa e pergunta a nota. A resposta do cliente entra aqui sozinha." compacto={!completo} />
      </Cartao>
    );
  }

  const ordenados = [...r.por_pessoa].sort((a, b) => b.media - a.media || b.avaliacoes - a.avaliacoes);
  const Envelope = completo ? Cartao : 'div';

  return (
    <div className="space-y-4">
      {/* Os três números */}
      <div className="grid grid-cols-3 gap-3">
        <Numero rotulo="Média" valor={r.media === null ? '—' : r.media.toFixed(1)} sufixo={r.media === null ? '' : '/10'} tom={r.media === null ? undefined : r.media >= 9 ? 'bom' : r.media >= 7 ? 'neutro' : 'ruim'} detalhe={`${r.respondidas} ${r.respondidas === 1 ? 'nota' : 'notas'}`} grande={completo} />
        <Numero rotulo="NPS" valor={r.nps === null ? '—' : String(r.nps)} tom={r.nps === null ? undefined : r.nps >= 50 ? 'bom' : r.nps >= 0 ? 'neutro' : 'ruim'} detalhe="promotores − detratores" grande={completo} />
        <Numero rotulo="Taxa de resposta" valor={r.taxa_de_resposta === null ? '—' : `${r.taxa_de_resposta}%`} detalhe={`${r.respondidas} de ${r.pedidas} pedidas`} grande={completo} />
      </div>

      {r.respondidas > 0 && (
        <Envelope className={completo ? 'p-4 sm:p-5' : ''}>
          <div className="mb-3 flex items-center justify-between">
            <Rotulo>Distribuição das notas</Rotulo>
            <span className="hidden items-center gap-3 text-[10px] text-[var(--text-muted)] sm:flex">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[#e11d48]/85" /> 0–6 detratores</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[#d97706]/85" /> 7–8 neutros</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[#16a34a]/85" /> 9–10 promotores</span>
            </span>
          </div>
          <DistribuicaoDeNotas distribuicao={r.distribuicao} altura={completo ? 96 : 56} />
        </Envelope>
      )}

      <div className={`grid grid-cols-1 gap-4 ${completo ? 'xl:grid-cols-2' : ''}`}>
        {ordenados.length > 0 && (
          <Envelope className={completo ? 'p-4 sm:p-5' : ''}>
            <div className="mb-3 flex items-center justify-between">
              <Rotulo>Por pessoa</Rotulo>
              <span className="text-[11px] text-[var(--text-muted)]">ordenado pela média</span>
            </div>
            <ol className="divide-y divide-[var(--border)]">
              {(completo ? ordenados : ordenados.slice(0, 5)).map((p, i) => (
                <li key={p.usuario_id} className="flex items-center gap-3 py-2.5">
                  <span className={`w-5 shrink-0 text-center text-xs font-semibold tabular-nums ${i === 0 ? 'text-[var(--brand)]' : 'text-[var(--text-muted)]'}`}>{i + 1}</span>
                  <Avatar nome={nome(p.usuario_id)} tamanho={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[var(--text)]">{nome(p.usuario_id)}</span>
                    <span className="block text-[11px] text-[var(--text-muted)]">
                      {p.avaliacoes} {p.avaliacoes === 1 ? 'avaliação' : 'avaliações'}
                    </span>
                  </span>
                  <span className="hidden w-24 sm:block">
                    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-2)]">
                      <span className={`block h-full rounded-full ${p.media >= 9 ? 'bg-emerald-500' : p.media >= 7 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${(p.media / 10) * 100}%` }} />
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="text-base font-semibold tabular-nums text-[var(--text)]">{p.media.toFixed(1)}</span>
                    <span className="text-[11px] text-[var(--text-muted)]">/10</span>
                  </span>
                </li>
              ))}
            </ol>
          </Envelope>
        )}

        {r.melhores.length > 0 && (
          <Envelope className={completo ? 'p-4 sm:p-5' : ''}>
            <div className="mb-3 flex items-center gap-1.5">
              <Trophy size={13} className="text-[var(--brand)]" />
              <Rotulo>Mais bem avaliados</Rotulo>
            </div>
            <ul className="space-y-1">
              {r.melhores.map((m) => (
                <li key={m.conversa_id}>
                  <button type="button" onClick={() => ir(TELAS.central, m.conversa_id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-[var(--bg)]">
                    <Etiqueta tom={tomDaNota(m.nota)} tamanho="md" className="w-11 justify-center text-sm">
                      {m.nota}
                    </Etiqueta>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[var(--text)]">
                        {m.cliente} <span className="font-normal text-[var(--text-muted)]">· {nome(m.atendente_id)}</span>
                      </span>
                      <span className="flex items-center gap-1 truncate text-xs text-[var(--text-muted)]">
                        {m.comentario ? <MessageSquareQuote size={11} className="shrink-0" /> : null}
                        <span className="truncate">{m.comentario ? `“${m.comentario}”` : (m.assunto ?? 'sem assunto')}</span>
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-[var(--text-muted)]">{fmtData(m.avaliada_em)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Envelope>
        )}
      </div>
    </div>
  );
}

function Numero({ rotulo, valor, sufixo = '', tom, detalhe, grande }: { rotulo: string; valor: string; sufixo?: string; tom?: 'bom' | 'neutro' | 'ruim'; detalhe?: string; grande?: boolean }) {
  const cor = tom === 'bom' ? 'text-emerald-600' : tom === 'ruim' ? 'text-rose-600' : tom === 'neutro' ? 'text-amber-600' : 'text-[var(--text)]';
  return (
    <div className={`rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--sombra-cartao)] ${grande ? 'p-4 sm:p-5' : 'p-3'}`}>
      <p className="text-[11px] font-medium text-[var(--text-muted)] sm:text-xs">{rotulo}</p>
      <p className={`mt-1.5 font-semibold leading-none tracking-tight tabular-nums ${cor} ${grande ? 'text-3xl sm:text-4xl' : 'text-2xl'}`}>
        {valor}
        {sufixo && <span className="text-xs font-medium text-[var(--text-muted)] sm:text-sm">{sufixo}</span>}
      </p>
      {detalhe && <p className="mt-1.5 truncate text-[11px] text-[var(--text-muted)]">{detalhe}</p>}
    </div>
  );
}
