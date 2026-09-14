import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy, ExternalLink, QrCode, Receipt, RefreshCw } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Input, Select } from '@/shared/ui/Field';
import { api } from '@/lib/api';
import { formatarPreco, type Ciclo, type Conta, type Metodo, type Plano } from '@/shared/planos';
import { formatDateTime } from '@/features/estoque/utils';

/** O pedido avulso como o servidor devolve (só o que a tela usa). */
export interface PedidoAvulso {
  id: string;
  status: 'agendado' | 'aprovado' | 'recusado' | 'cancelado' | 'reembolsado' | 'pendente';
  metodo: Metodo;
  plano: Plano | null;
  ciclo: Ciclo | null;
  valor: number;
  vence_em: string | null;
  periodo_ate: string | null;
  dados: { qr_code?: string | null; qr_code_base64?: string | null; ticket_url?: string | null; linha_digitavel?: string | null } | null;
  descricao: string | null;
}

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

function formatarDoc(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 11) return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
}

interface FormularioPagadorProps {
  metodo: 'pix' | 'boleto';
  plano: Plano;
  ciclo: Ciclo;
  valor: number;
  emailInicial?: string;
  /** O pedido gerado (com QR Code / boleto). */
  onGerado: (pedido: PedidoAvulso) => void;
  onCancelar?: () => void;
}

/**
 * Quem paga: nome ou razão social, CPF/CNPJ, e-mail — e o endereço, que o
 * boleto exige. É também o que vai na nota fiscal.
 */
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
      const r = await api.post<{ pagamento: PedidoAvulso }>('/api/assinatura/avulso', {
        plano,
        ciclo,
        metodo,
        pagador: { nome, doc, email, endereco: metodo === 'boleto' ? end : undefined },
      });
      onGerado(r.pagamento);
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível gerar o pagamento.');
    } finally {
      setGerando(false);
    }
  }

  return (
    <form onSubmit={gerar} className="space-y-4">
      <Input label="Nome ou razão social" required value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} placeholder="Como vai na nota fiscal" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label="CPF ou CNPJ" required value={doc} onChange={(e) => setDoc(formatarDoc(e.target.value))} inputMode="numeric" placeholder="000.000.000-00" />
        <Input label="E-mail para o recibo e a nota" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </div>
      {metodo === 'boleto' && (
        <div className="space-y-3 rounded-lg bg-[var(--bg-2)] p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Endereço (o boleto exige)</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Input label="CEP" required value={end.cep} onChange={(e) => setEnd({ ...end, cep: e.target.value.replace(/\D/g, '').slice(0, 8) })} inputMode="numeric" />
            <Input label="Número" required value={end.numero} onChange={(e) => setEnd({ ...end, numero: e.target.value })} maxLength={20} />
            <Select label="UF" required value={end.uf} onChange={(e) => setEnd({ ...end, uf: e.target.value })}>
              {UFS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
          </div>
          <Input label="Rua" required value={end.rua} onChange={(e) => setEnd({ ...end, rua: e.target.value })} maxLength={120} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Bairro" required value={end.bairro} onChange={(e) => setEnd({ ...end, bairro: e.target.value })} maxLength={80} />
            <Input label="Cidade" required value={end.cidade} onChange={(e) => setEnd({ ...end, cidade: e.target.value })} maxLength={80} />
          </div>
        </div>
      )}
      <p className="text-[11px] text-[var(--text-muted)]">
        Pagamento único de <strong className="text-[var(--text)]">{formatarPreco(valor)}</strong> pelo período. Não renova sozinho: perto de vencer, avisamos por e-mail e aqui no painel.
      </p>
      <div className="flex justify-end gap-2">
        {onCancelar && (
          <Button type="button" variant="ghost" onClick={onCancelar}>
            Voltar
          </Button>
        )}
        <Button type="submit" loading={gerando} icon={gerando ? undefined : metodo === 'pix' ? <QrCode size={14} /> : <Receipt size={14} />}>
          {metodo === 'pix' ? 'Gerar Pix' : 'Gerar boleto'}
        </Button>
      </div>
    </form>
  );
}

interface PagamentoPendenteProps {
  pedido: PedidoAvulso;
  /** Aprovou: quem chama recarrega a conta. */
  onAprovado: (pedido: PedidoAvulso, conta: Conta | null) => void;
  onGerarOutro?: () => void;
}

/**
 * O QR Code do Pix (ou o boleto) e a espera pela confirmação: a tela
 * consulta o servidor a cada poucos segundos até o Mercado Pago aprovar.
 */
export function PagamentoPendente({ pedido: inicial, onAprovado, onGerarOutro }: PagamentoPendenteProps) {
  const [pedido, setPedido] = useState(inicial);
  const [copiado, setCopiado] = useState(false);
  const pendente = pedido.status === 'pendente';
  const vencido = pedido.vence_em ? new Date(pedido.vence_em).getTime() < Date.now() : false;

  useEffect(() => {
    if (!pendente || vencido) return;
    let vivo = true;
    const consultar = async () => {
      try {
        const r = await api.get<{ pagamento: PedidoAvulso; conta: Conta | null }>(`/api/assinatura/avulso/${pedido.id}`);
        if (!vivo) return;
        setPedido(r.pagamento);
        if (r.pagamento.status === 'aprovado') onAprovado(r.pagamento, r.conta);
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
      <div className="rounded-xl border border-[var(--verde)]/40 bg-[var(--verde)]/10 p-4 text-center">
        <Check size={28} className="mx-auto text-[var(--verde)]" />
        <p className="mt-2 text-sm font-bold text-[var(--text)]">Pagamento confirmado</p>
        {pedido.periodo_ate && <p className="text-xs text-[var(--text-muted)]">Plano válido até {formatDateTime(pedido.periodo_ate)}.</p>}
      </div>
    );
  }

  if (!pendente || vencido) {
    return (
      <div className="space-y-3 rounded-xl border border-[var(--border)] p-4 text-center">
        <p className="text-sm font-semibold text-[var(--text)]">{vencido ? 'Este pagamento expirou.' : `Pagamento ${pedido.status}.`}</p>
        {onGerarOutro && (
          <Button size="sm" variant="outline" icon={<RefreshCw size={14} />} onClick={onGerarOutro}>
            Gerar outro
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-[var(--brand)]/40 bg-[var(--brand)]/5 px-4 py-3">
        <p className="text-sm font-bold text-[var(--text)]">{pedido.descricao ?? 'Pagamento'}</p>
        <p className="text-lg font-extrabold text-[var(--text)]">{formatarPreco(Number(pedido.valor))}</p>
      </div>

      {pedido.metodo === 'pix' ? (
        <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
          <div className="flex items-center justify-center rounded-xl border border-[var(--border)] bg-white p-2">
            {d.qr_code_base64 ? <img src={`data:image/png;base64,${d.qr_code_base64}`} alt="QR Code do Pix" className="h-40 w-40" /> : <QrCode size={40} className="text-slate-400" />}
          </div>
          <div className="min-w-0 space-y-2">
            <p className="text-sm text-[var(--text)]">Abra o app do seu banco, escolha <strong>Pix → ler QR Code</strong>, ou copie o código:</p>
            {d.qr_code && (
              <div className="flex items-stretch gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 font-mono text-[11px] text-[var(--text)]">{d.qr_code}</code>
                <Button size="sm" variant="outline" icon={copiado ? <Check size={14} /> : <Copy size={14} />} onClick={() => copiar(d.qr_code as string)}>
                  {copiado ? 'Copiado' : 'Copiar'}
                </Button>
              </div>
            )}
            <p className="text-[11px] text-[var(--text-muted)]">
              {pedido.vence_em && <>Válido até {formatDateTime(pedido.vence_em)}. </>}Assim que o banco confirmar (normalmente segundos), a conta libera sozinha — pode deixar esta tela aberta.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-[var(--text)]">O boleto está pronto. Pague pelo app do banco com a linha digitável, ou abra o PDF para imprimir.</p>
          {d.linha_digitavel && (
            <div className="flex items-stretch gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 font-mono text-[11px] text-[var(--text)]">{d.linha_digitavel}</code>
              <Button size="sm" variant="outline" icon={copiado ? <Check size={14} /> : <Copy size={14} />} onClick={() => copiar(d.linha_digitavel as string)}>
                {copiado ? 'Copiado' : 'Copiar'}
              </Button>
            </div>
          )}
          {d.ticket_url && (
            <a href={d.ticket_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--brand)] hover:underline">
              <ExternalLink size={14} /> Abrir o boleto
            </a>
          )}
          <p className="text-[11px] text-[var(--text-muted)]">
            {pedido.vence_em && <>Vence em {formatDateTime(pedido.vence_em)}. </>}Boleto compensa em até 2 dias úteis; a conta libera quando o Mercado Pago confirmar.
          </p>
        </div>
      )}

      <p className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
        <RefreshCw size={12} className="animate-spin" /> Aguardando confirmação…
      </p>
    </div>
  );
}
