import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Phone, Plus, Tag } from 'lucide-react';
import { Input, Textarea } from '@/shared/ui/Field';
import { api, ErroDaApi } from '../../lib/api';
import { useCentral } from '../../store/central';
import { useDadosAtende } from '../../store/dados';
import { useSessaoAtende } from '../../store/sessao';
import { pode } from '../../../shared/papeis';
import type { Cliente, Conversa } from '../../../shared/tipos';
import { NOME_DO_ESTADO } from '../../../shared/tipos';
import { iniciais, nomeDoCliente, quando, telefoneBonito, COR_DO_ESTADO } from './util';
import { TriagemDaIa } from './TriagemDaIa';
import { Historico } from './Historico';

/**
 * A coluna da direita: quem é o cliente (editável), o que a IA decidiu na
 * triagem e o lead, etiquetas, e as conversas anteriores dele.
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
    <aside className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div className="flex items-center gap-3">
        {c.foto_url ? <img src={c.foto_url} alt="" className="h-12 w-12 rounded-full object-cover" /> : <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--brand)]/12 text-base font-extrabold text-[var(--brand)]">{iniciais(nomeDoCliente(c))}</span>}
        <div className="min-w-0">
          <p className="truncate text-base font-extrabold text-[var(--text)]">{nomeDoCliente(c)}</p>
          <a href={`https://wa.me/${c.telefone}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--brand)]">
            <Phone size={11} /> {telefoneBonito(c.telefone)}
          </a>
        </div>
      </div>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-2)] p-3 text-sm">
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Atendimento</p>
        <dl className="space-y-1 text-xs">
          <Linha rotulo="Estado">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${COR_DO_ESTADO[conversa.estado]}`}>{NOME_DO_ESTADO[conversa.estado]}</span>
          </Linha>
          <Linha rotulo="Setor">{time ?? <span className="text-[var(--text-muted)]">sem setor</span>}</Linha>
          <Linha rotulo="Atendente">{atendente ?? <span className="text-[var(--text-muted)]">ninguém ainda</span>}</Linha>
          <Linha rotulo="Aberta">{quando(conversa.aberta_em)}</Linha>
          {conversa.assunto && <Linha rotulo="Assunto">{conversa.assunto}</Linha>}
        </dl>
      </section>

      <TriagemDaIa conversa={conversa} />

      <section>
        <p className="mb-1.5 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          <Tag size={11} /> Etiquetas
        </p>
        <div className="flex flex-wrap gap-1.5">
          {etiquetas.map((e) => {
            const on = conversa.etiquetas.includes(e.id);
            return (
              <button key={e.id} type="button" onClick={() => alternarEtiqueta(e.id)} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${on ? 'text-white' : 'bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]'}`} style={on ? { backgroundColor: e.cor, borderColor: e.cor } : { borderColor: 'var(--border)' }}>
                {on && <Check size={11} />}
                {e.nome}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex gap-1.5">
          <input value={novaEtiqueta} onChange={(e) => setNovaEtiqueta(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && criarEtiqueta()} placeholder="Nova etiqueta" maxLength={40} className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--text)] outline-none focus:border-[var(--brand)]" />
          <button type="button" onClick={criarEtiqueta} disabled={!novaEtiqueta.trim()} className="rounded-lg border border-[var(--border)] px-2 text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-40" aria-label="Criar etiqueta">
            <Plus size={14} />
          </button>
        </div>
      </section>

      <section className="space-y-2.5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Ficha</p>
        <Input label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder={c.nome_whatsapp ?? 'Como a equipe chama'} maxLength={80} />
        <Input label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} />
        <Textarea label="Observações" rows={3} value={obs} onChange={(e) => setObs(e.target.value)} maxLength={2000} placeholder="O que a equipe precisa lembrar deste cliente." />
        {mudou && (
          <button type="button" onClick={salvar} disabled={salvando} className="w-full rounded-lg bg-[var(--brand)] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
            {salvando ? 'Salvando…' : 'Salvar ficha'}
          </button>
        )}
        <p className="text-[11px] text-[var(--text-muted)]">
          Cliente desde {new Date(c.primeiro_contato_em).toLocaleDateString('pt-BR')}{c.nome_whatsapp ? ` · no WhatsApp: ${c.nome_whatsapp}` : ''}
        </p>
      </section>

      <Historico conversa={conversa} />

      {pode(sessao.papel, 'empresa.gerir') && <Fundir cliente={c} conversaId={conversa.id} />}

      {anteriores.length > 0 && (
        <section>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Conversas anteriores ({anteriores.length})</p>
          <ul className="space-y-1">
            {anteriores.map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => abrir(a.id)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-left text-xs hover:border-[var(--brand)]/50">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[var(--text)]">{a.assunto ?? NOME_DO_ESTADO[a.estado]}</span>
                    <span className="text-[var(--text-muted)]">{quando(a.aberta_em)}</span>
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

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-[var(--text-muted)]">{rotulo}</dt>
      <dd className="text-right font-semibold text-[var(--text)]">{children}</dd>
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
    <section className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">Parece o mesmo contato</p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">Mesmo número em outra grafia ou mesmo nome. Fundir traz as conversas para cá e apaga o outro cadastro.</p>
      <ul className="mt-2 space-y-1.5">
        {parecidos.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-xs">
            <span className="min-w-0">
              <span className="block truncate font-semibold text-[var(--text)]">{nomeDoCliente(p)}</span>
              <span className="block text-[var(--text-muted)]">{telefoneBonito(p.telefone)}</span>
            </span>
            <button type="button" onClick={() => fundir(p)} disabled={fundindo !== null} className="shrink-0 rounded-lg bg-[var(--brand)] px-2.5 py-1 text-[11px] font-bold text-white disabled:opacity-50">
              {fundindo === p.id ? 'Fundindo…' : 'Fundir aqui'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
