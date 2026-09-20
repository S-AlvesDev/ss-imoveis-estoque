import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Check, GitMerge, MessageSquare, Phone, Plus, Tag } from 'lucide-react';
import { Entrada, AreaDeTexto } from '../../ui/Campo';
import { Botao } from '../../ui/Botao';
import { Avatar } from '../../ui/Avatar';
import { Etiqueta } from '../../ui/Etiqueta';
import { Rotulo } from '../../ui/Cartao';
import { api, ErroDaApi } from '../../lib/api';
import { useCentral } from '../../store/central';
import { useDadosAtende } from '../../store/dados';
import { useSessaoAtende } from '../../store/sessao';
import { pode } from '../../../shared/papeis';
import type { Cliente, Conversa } from '../../../shared/tipos';
import { NOME_DO_ESTADO } from '../../../shared/tipos';
import { nomeDoCliente, quando, telefoneBonito, TOM_DO_ESTADO } from './util';
import { TriagemDaIa } from './TriagemDaIa';
import { Historico } from './Historico';

/**
 * A coluna da direita: quem é o cliente (editável), o atendimento, o que a
 * IA decidiu na triagem e o lead, etiquetas, e as conversas anteriores.
 */
export function PainelDoCliente({ conversa }: { conversa: Conversa }) {
  const c = conversa.cliente;
  const sessao = useSessaoAtende((s) => s.sessao)!;
  const anteriores = useCentral((s) => s.anteriores);
  const etiquetas = useCentral((s) => s.etiquetas);
  const carregarEtiquetas = useCentral((s) => s.carregarEtiquetas);
  const aplicarConversa = useCentral((s) => s.aplicarConversa);
  const abrir = useCentral((s) => s.abrir);
  const times = useDadosAtende((s) => s.times);
  const equipe = useDadosAtende((s) => s.equipe);
  const [nome, setNome] = useState(c.nome ?? '');
  const [email, setEmail] = useState(c.email ?? '');
  const [obs, setObs] = useState(c.observacoes ?? '');
  const [salvando, setSalvando] = useState(false);
  const [novaEtiqueta, setNovaEtiqueta] = useState('');

  useEffect(() => {
    setNome(c.nome ?? '');
    setEmail(c.email ?? '');
    setObs(c.observacoes ?? '');
  }, [c.id, c.nome, c.email, c.observacoes]);
  useEffect(() => {
    if (etiquetas.length === 0) void carregarEtiquetas();
  }, [etiquetas.length, carregarEtiquetas]);

  const mudou = nome !== (c.nome ?? '') || email !== (c.email ?? '') || obs !== (c.observacoes ?? '');

  async function salvar() {
    setSalvando(true);
    try {
      const r = await api.patch<{ cliente: Cliente }>(`/clientes/${c.id}`, { nome, email, observacoes: obs });
      aplicarConversa({ ...conversa, cliente: r.cliente });
      toast.success('Cliente salvo.');
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  async function alternarEtiqueta(id: string) {
    const lista = conversa.etiquetas.includes(id) ? conversa.etiquetas.filter((x) => x !== id) : [...conversa.etiquetas, id];
    try {
      const r = await api.put<{ conversa: Conversa }>(`/conversas/${conversa.id}/etiquetas`, { etiquetas: lista });
      aplicarConversa(r.conversa);
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível salvar.');
    }
  }

  async function criarEtiqueta() {
    const n = novaEtiqueta.trim();
    if (!n) return;
    try {
      const r = await api.post<{ etiquetas: typeof etiquetas }>('/etiquetas', { nome: n, cor: CORES[etiquetas.length % CORES.length] });
      useCentral.setState({ etiquetas: r.etiquetas });
      setNovaEtiqueta('');
      const criada = r.etiquetas.find((e) => e.nome === n);
      if (criada) await alternarEtiqueta(criada.id);
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível criar a etiqueta.');
    }
  }

  const time = conversa.time_id ? times.find((t) => t.id === conversa.time_id)?.nome : null;
  const atendente = conversa.atendente_id ? equipe.find((f) => f.id === conversa.atendente_id)?.nome : null;

  return (
    <aside className="rolagem-fina flex h-full flex-col gap-5 overflow-y-auto p-4">
      {/* Quem é */}
      <div className="flex items-center gap-3">
        <Avatar nome={nomeDoCliente(c)} foto={c.foto_url} tamanho={52} marca />
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-[var(--text)]">{nomeDoCliente(c)}</p>
          <a href={`https://wa.me/${c.telefone}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--brand)]">
            <Phone size={11} /> {telefoneBonito(c.telefone)}
          </a>
          <p className="text-[11px] text-[var(--text-muted)]">Cliente desde {new Date(c.primeiro_contato_em).toLocaleDateString('pt-BR')}</p>
        </div>
      </div>

      {/* O atendimento */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
        <Rotulo className="mb-2">Atendimento</Rotulo>
        <dl className="space-y-1.5 text-xs">
          <Linha rotulo="Estado">
            <Etiqueta tom={TOM_DO_ESTADO[conversa.estado]} ponto>
              {NOME_DO_ESTADO[conversa.estado]}
            </Etiqueta>
          </Linha>
          <Linha rotulo="Setor">{time ?? <span className="font-normal text-[var(--text-muted)]">sem setor</span>}</Linha>
          <Linha rotulo="Responsável">{atendente ? <span className="inline-flex items-center gap-1.5"><Avatar nome={atendente} tamanho={16} />{atendente}</span> : <span className="font-normal text-[var(--text-muted)]">ninguém ainda</span>}</Linha>
          <Linha rotulo="Prioridade">
            {conversa.prioridade === 'alta' || conversa.prioridade === 'urgente' ? <Etiqueta tom="vermelho">{conversa.prioridade}</Etiqueta> : <span className="capitalize">{conversa.prioridade}</span>}
          </Linha>
          <Linha rotulo="Aberta">{quando(conversa.aberta_em)}</Linha>
          {conversa.assunto && <Linha rotulo="Assunto">{conversa.assunto}</Linha>}
        </dl>
      </section>

      <TriagemDaIa conversa={conversa} />

      {/* Etiquetas */}
      <section>
        <Rotulo className="mb-2 flex items-center gap-1">
          <Tag size={11} /> Etiquetas
        </Rotulo>
        <div className="flex flex-wrap gap-1.5">
          {etiquetas.length === 0 && <p className="text-xs text-[var(--text-muted)]">Nenhuma etiqueta ainda — crie a primeira abaixo.</p>}
          {etiquetas.map((e) => {
            const on = conversa.etiquetas.includes(e.id);
            return (
              <button key={e.id} type="button" onClick={() => alternarEtiqueta(e.id)} aria-pressed={on} className={`inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[11px] font-semibold transition-colors ${on ? 'text-white' : 'bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]'}`} style={on ? { backgroundColor: e.cor, borderColor: e.cor } : { borderColor: 'var(--border)' }}>
                {on ? <Check size={11} /> : <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: e.cor }} />}
                {e.nome}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex gap-1.5">
          <input value={novaEtiqueta} onChange={(e) => setNovaEtiqueta(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && criarEtiqueta()} placeholder="Nova etiqueta" maxLength={40} className="h-8 min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs text-[var(--text)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--text-disable)] focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--brand)]/10" />
          <Botao tamanho="sm" variante="secundaria" quadrado icone={<Plus size={14} />} onClick={criarEtiqueta} disabled={!novaEtiqueta.trim()} aria-label="Criar etiqueta" />
        </div>
      </section>

      {/* A ficha */}
      <section className="space-y-3">
        <Rotulo>Ficha</Rotulo>
        <Entrada rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder={c.nome_whatsapp ?? 'Como a equipe chama'} maxLength={80} />
        <Entrada rotulo="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} placeholder="cliente@email.com" />
        <AreaDeTexto rotulo="Observações" rows={3} value={obs} onChange={(e) => setObs(e.target.value)} maxLength={2000} placeholder="O que a equipe precisa lembrar deste cliente." />
        {mudou && (
          <Botao largo tamanho="sm" carregando={salvando} onClick={salvar}>
            Salvar ficha
          </Botao>
        )}
        {c.nome_whatsapp && <p className="text-[11px] text-[var(--text-muted)]">No WhatsApp: {c.nome_whatsapp}</p>}
      </section>

      <Historico conversa={conversa} />

      {pode(sessao.papel, 'empresa.gerir') && <Fundir cliente={c} conversaId={conversa.id} />}

      {anteriores.length > 0 && (
        <section>
          <Rotulo className="mb-2 flex items-center gap-1">
            <MessageSquare size={11} /> Conversas anteriores ({anteriores.length})
          </Rotulo>
          <ul className="space-y-1.5">
            {anteriores.map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => abrir(a.id)} className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left text-xs transition-colors hover:border-[var(--brand)]/40 hover:bg-[var(--bg)]">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold text-[var(--text)]">{a.assunto ?? NOME_DO_ESTADO[a.estado]}</span>
                    <span className="shrink-0 text-[var(--text-muted)]">{quando(a.aberta_em)}</span>
                  </span>
                  {a.ultima_mensagem_texto && <span className="mt-0.5 block truncate text-[var(--text-muted)]">{a.ultima_mensagem_texto}</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}

const CORES = ['#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626', '#db2777', '#0891b2', '#4f46e5'];

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-[var(--text-muted)]">{rotulo}</dt>
      <dd className="min-w-0 text-right font-semibold text-[var(--text)]">{children}</dd>
    </div>
  );
}

/**
 * Fundir contatos (administrador): o mesmo número com e sem o nono dígito,
 * ou um cliente que trocou de número, aparece como dois cadastros. Aqui
 * os parecidos são listados e um pode ser fundido NESTE contato — as
 * conversas e os leads vêm para cá, o outro cadastro é apagado.
 */
function Fundir({ cliente, conversaId }: { cliente: Cliente; conversaId: string }) {
  const abrir = useCentral((s) => s.abrir);
  const [parecidos, setParecidos] = useState<Cliente[] | null>(null);
  const [fundindo, setFundindo] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setParecidos(null);
    api
      .get<{ clientes: Cliente[] }>(`/clientes/${cliente.id}/parecidos`)
      .then((r) => vivo && setParecidos(r.clientes))
      .catch(() => vivo && setParecidos([]));
    return () => {
      vivo = false;
    };
  }, [cliente.id]);

  async function fundir(de: Cliente) {
    if (!window.confirm(`Fundir ${nomeDoCliente(de)} (${telefoneBonito(de.telefone)}) neste contato? As conversas e os leads dele vêm para cá e o cadastro dele é apagado. Não dá para desfazer.`)) return;
    setFundindo(de.id);
    try {
      await api.post(`/clientes/${cliente.id}/fundir`, { de: de.id });
      toast.success('Contatos fundidos.');
      setParecidos((lista) => (lista ?? []).filter((x) => x.id !== de.id));
      void abrir(conversaId);
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível fundir.');
    } finally {
      setFundindo(null);
    }
  }

  if (!parecidos || parecidos.length === 0) return null;
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">
        <GitMerge size={12} /> Parece o mesmo contato
      </p>
      <p className="mt-1 text-xs leading-5 text-amber-900/80">Mesmo número em outra grafia ou mesmo nome. Fundir traz as conversas para cá e apaga o outro cadastro.</p>
      <ul className="mt-2 space-y-1.5">
        {parecidos.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-amber-200/70 bg-white px-2.5 py-2 text-xs">
            <span className="min-w-0">
              <span className="block truncate font-semibold text-[var(--text)]">{nomeDoCliente(p)}</span>
              <span className="block text-[var(--text-muted)]">{telefoneBonito(p.telefone)}</span>
            </span>
            <Botao tamanho="xs" onClick={() => fundir(p)} disabled={fundindo !== null} carregando={fundindo === p.id}>
              Fundir aqui
            </Botao>
          </li>
        ))}
      </ul>
    </section>
  );
}
