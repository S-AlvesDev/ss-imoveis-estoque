import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy, ExternalLink, QrCode, Receipt, RefreshCw } from 'lucide-react';
import { Botao } from '../ui/Botao';
import { Entrada, Selecao } from '../ui/Campo';
import { api, ErroDaApi } from '../lib/api';
import { NOME_DO_CICLO_ATENDE, NOME_DO_PLANO_ATENDE, type CicloAtende, type PlanoAtende } from '../../shared/planos';
import type { PagamentoAvulsoDaEmpresa, SituacaoDaAssinatura } from '../../shared/tipos';

/**
 * Pix e boleto do Atende Aí — o espelho de src/features/planos/PagamentoAvulso.tsx
 * (Stok Aí) no kit do Atende. São duas peças: o formulário de quem paga
 * (o que o boleto e a nota exigem) e a espera pela confirmação, que
 * consulta o servidor até o Mercado Pago aprovar.
 *
 * Pagamento único do período: não renova sozinho. Quem quer renovação
 * automática assina no cartão.
 */

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

const brl = (v: number, moeda = 'BRL') => v.toLocaleString('pt-BR', { style: 'currency', currency: moeda });
const dataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : null);

/** "000.000.000-00" ou "00.000.000/0000-00", conforme vai digitando. */
function formatarDoc(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 11) return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
}

interface FormularioPagadorProps {
  metodo: 'pix' | 'boleto';
  plano: PlanoAtende;
  ciclo: CicloAtende;
  /** O que se paga pelo período inteiro (no anual, dez meses de uma vez). */
  valor: number;
  emailInicial?: string;
  onGerado: (pedido: PagamentoAvulsoDaEmpresa) => void;
  onCancelar: () => void;
}

/** Quem paga: nome ou razão social, CPF/CNPJ, e-mail — e o endereço, que o boleto exige. */
export function FormularioPagador({ metodo, plano, ciclo, valor, emailInicial = '', onGerado, onCancelar }: FormularioPagadorProps) {
  const [nome, setNome] = useState('');
  const [doc, setDoc] = useState('');
  const [email, setEmail] = useState(emailInicial);
  const [end, setEnd] = useState({ cep: '', rua: '', numero: '', bairro: '', cidade: '', uf: 'RN' });
  const [gerando, setGerando] = useState(false);

  async function gerar(e: React.FormEvent) {
    e.preventDefault();
    setGerando(true);
    try {
      const r = await api.post<{ pagamento: PagamentoAvulsoDaEmpresa }>('/assinatura/avulso', {
        plano,
        ciclo,
        metodo,
        pagador: { nome, doc, email, endereco: metodo === 'boleto' ? end : undefined },
      });
      onGerado(r.pagamento);
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível gerar o pagamento.');
    } finally {
      setGerando(false);
    }
  }

  return (
    <form onSubmit={gerar} className="space-y-4">
      <Entrada rotulo="Nome ou razão social" required value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} placeholder="Quem está pagando" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Entrada rotulo="CPF ou CNPJ" required value={doc} onChange={(e) => setDoc(formatarDoc(e.target.value))} inputMode="numeric" placeholder="000.000.000-00" />
        <Entrada rotulo="E-mail para o recibo" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </div>
      {metodo === 'boleto' && (
        <div className="space-y-3 rounded-xl bg-[var(--bg-2)] p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Endereço (o boleto exige)</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Entrada rotulo="CEP" required value={end.cep} onChange={(e) => setEnd({ ...end, cep: e.target.value.replace(/\D/g, '').slice(0, 8) })} inputMode="numeric" />
            <Entrada rotulo="Número" required value={end.numero} onChange={(e) => setEnd({ ...end, numero: e.target.value })} maxLength={20} />
            <Selecao rotulo="UF" required value={end.uf} onChange={(e) => setEnd({ ...end, uf: e.target.value })}>
              {UFS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Selecao>
          </div>
          <Entrada rotulo="Rua" required value={end.rua} onChange={(e) => setEnd({ ...end, rua: e.target.value })} maxLength={120} />
          <div className="grid grid-cols-2 gap-3">
            <Entrada rotulo="Bairro" required value={end.bairro} onChange={(e) => setEnd({ ...end, bairro: e.target.value })} maxLength={80} />
            <Entrada rotulo="Cidade" required value={end.cidade} onChange={(e) => setEnd({ ...end, cidade: e.target.value })} maxLength={80} />
          </div>
        </div>
      )}
      <p className="text-[11px] leading-5 text-[var(--text-muted)]">
        Pagamento único de <strong className="text-[var(--text)]">{brl(valor)}</strong> pelo plano {NOME_DO_PLANO_ATENDE[plano]} ({NOME_DO_CICLO_ATENDE[ciclo].toLowerCase()}). Não renova sozinho: perto de vencer, avisamos por e-mail e aqui no painel.
      </p>
      <div className="flex justify-end gap-2">
        <Botao type="button" variante="fantasma" onClick={onCancelar}>
          Voltar
        </Botao>
        <Botao type="submit" carregando={gerando} icone={gerando ? undefined : metodo === 'pix' ? <QrCode size={14} /> : <Receipt size={14} />}>
          {metodo === 'pix' ? 'Gerar Pix' : 'Gerar boleto'}
        </Botao>
      </div>
    </form>
  );
}

interface PagamentoPendenteProps {
  pedido: PagamentoAvulsoDaEmpresa;
  /** Aprovou: quem chama recarrega a conta com a situação que veio junto. */
  onAprovado: (dados: SituacaoDaAssinatura) => void;
  onGerarOutro: () => void;
}

/**
 * O QR Code do Pix (ou o boleto) e a espera: a tela consulta o servidor a
 * cada cinco segundos até o Mercado Pago aprovar, sem depender do webhook.
 */
export function PagamentoPendente({ pedido: inicial, onAprovado, onGerarOutro }: PagamentoPendenteProps) {
  const [pedido, setPedido] = useState(inicial);
  const [copiado, setCopiado] = useState(false);
  const pendente = pedido.status === 'pendente';
  const vencido = pedido.vence_em ? new Date(pedido.vence_em).getTime() < Date.now() : false;

  useEffect(() => setPedido(inicial), [inicial]);

  useEffect(() => {
    if (!pendente || vencido) return;
    let vivo = true;
    const consultar = async () => {
      try {
        const r = await api.get<{ pagamento: PagamentoAvulsoDaEmpresa } & SituacaoDaAssinatura>(`/assinatura/avulso/${pedido.id}`);
        if (!vivo) return;
        setPedido(r.pagamento);
        if (r.pagamento.status === 'aprovado') onAprovado(r);
      } catch {
        /* tenta de novo no próximo ciclo */
      }
    };
    const t = setInterval(consultar, 5000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido.id, pendente, vencido]);

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error('Não deu para copiar; selecione o texto e copie.');
    }
  }

  const d = pedido.dados ?? {};

  if (pedido.status === 'aprovado') {
    return (
      <div className="rounded-xl border border-emerald-500/40 bg-emerald-50 p-4 text-center">
        <Check size={28} className="mx-auto text-emerald-600" />
        <p className="mt-2 text-sm font-bold text-[var(--text)]">Pagamento confirmado</p>
        {pedido.periodo_ate && <p className="text-xs text-[var(--text-muted)]">Plano válido até {new Date(pedido.periodo_ate).toLocaleDateString('pt-BR')}.</p>}
      </div>
    );
  }

  if (!pendente || vencido) {
    return (
      <div className="space-y-3 rounded-xl border border-[var(--border)] p-4 text-center">
        <p className="text-sm font-semibold text-[var(--text)]">{vencido ? 'Este pagamento expirou.' : `Pagamento ${pedido.status}.`}</p>
        <Botao tamanho="sm" variante="secundaria" icone={<RefreshCw size={14} />} onClick={onGerarOutro}>
          Gerar outro
        </Botao>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-[var(--brand)]/40 bg-[var(--brand)]/5 px-4 py-3">
        <p className="text-sm font-bold text-[var(--text)]">{pedido.descricao ?? 'Pagamento'}</p>
        <p className="text-lg font-extrabold text-[var(--text)]">{brl(Number(pedido.valor), pedido.moeda || 'BRL')}</p>
      </div>

      {pedido.metodo === 'pix' ? (
        <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
          <div className="flex items-center justify-center rounded-xl border border-[var(--border)] bg-white p-2">
            {d.qr_code_base64 ? <img src={`data:image/png;base64,${d.qr_code_base64}`} alt="QR Code do Pix" className="h-40 w-40" /> : <QrCode size={40} className="text-slate-400" />}
          </div>
          <div className="min-w-0 space-y-2">
            <p className="text-sm text-[var(--text)]">
              Abra o app do seu banco, escolha <strong>Pix → ler QR Code</strong>, ou copie o código:
            </p>
            {d.qr_code && (
              <div className="flex items-stretch gap-2">
                <code className="min-w-0 flex-1 truncate rounded-xl border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 font-mono text-[11px] text-[var(--text)]">{d.qr_code}</code>
                <Botao tamanho="sm" variante="secundaria" icone={copiado ? <Check size={14} /> : <Copy size={14} />} onClick={() => copiar(d.qr_code as string)}>
                  {copiado ? 'Copiado' : 'Copiar'}
                </Botao>
              </div>
            )}
            <p className="text-[11px] leading-5 text-[var(--text-muted)]">
              {pedido.vence_em && <>Válido até {dataHora(pedido.vence_em)}. </>}Assim que o banco confirmar (normalmente segundos), o plano libera sozinho — pode deixar esta tela aberta.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-[var(--text)]">O boleto está pronto. Pague pelo app do banco com a linha digitável, ou abra o PDF para imprimir.</p>
          {d.linha_digitavel && (
            <div className="flex items-stretch gap-2">
              <code className="min-w-0 flex-1 truncate rounded-xl border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 font-mono text-[11px] text-[var(--text)]">{d.linha_digitavel}</code>
              <Botao tamanho="sm" variante="secundaria" icone={copiado ? <Check size={14} /> : <Copy size={14} />} onClick={() => copiar(d.linha_digitavel as string)}>
                {copiado ? 'Copiado' : 'Copiar'}
              </Botao>
            </div>
          )}
          {d.ticket_url && (
            <a href={d.ticket_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--brand)] hover:underline">
              <ExternalLink size={14} /> Abrir o boleto
            </a>
          )}
          <p className="text-[11px] leading-5 text-[var(--text-muted)]">
            {pedido.vence_em && <>Vence em {dataHora(pedido.vence_em)}. </>}Boleto compensa em até 2 dias úteis; o plano libera quando o Mercado Pago confirmar.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
          <RefreshCw size={12} className="animate-spin" /> Aguardando confirmação…
        </p>
        <Botao tamanho="sm" variante="fantasma" onClick={onGerarOutro}>
          Escolher outro plano ou meio
        </Botao>
      </div>
    </div>
  );
}
