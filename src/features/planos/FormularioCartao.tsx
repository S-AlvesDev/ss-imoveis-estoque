import { useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CreditCard, Lock, ShieldCheck } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Field';
import { mercadoPago, type CampoSeguro } from './mercadoPagoSdk';

interface FormularioCartaoProps {
  publicKey: string;
  /** O que vai ser cobrado, para o botão dizer. */
  rotuloDoBotao: string;
  /** E-mail sugerido para o recibo (o do administrador). */
  emailInicial?: string;
  /** Recebe o token do cartão e o e-mail; quem chama fala com o servidor. Lança para mostrar o erro aqui. */
  onToken: (dados: { cardTokenId: string; email: string; titular: string }) => Promise<void>;
  onCancelar?: () => void;
}

/** Só dígitos, 11 deles. */
function cpfValido(v: string): boolean {
  const d = v.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

function formatarCpf(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

/**
 * O cartão digitado dentro do Stok Aí. Número, validade e CVV são campos
 * seguros do Mercado Pago (iframes): o que sai daqui é um token, nunca o
 * número. Titular, CPF e e-mail são nossos e vão junto na tokenização.
 */
export function FormularioCartao({ publicKey, rotuloDoBotao, emailInicial = '', onToken, onCancelar }: FormularioCartaoProps) {
  const id = useId().replace(/:/g, '');
  const ids = { numero: `mp-numero-${id}`, validade: `mp-validade-${id}`, cvv: `mp-cvv-${id}` };
  const campos = useRef<CampoSeguro[]>([]);
  const [pronto, setPronto] = useState(false);
  const [erroSdk, setErroSdk] = useState<string | null>(null);
  const [bandeira, setBandeira] = useState<string | null>(null);
  const [titular, setTitular] = useState('');
  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState(emailInicial);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    const estilo = () => {
      const cs = getComputedStyle(document.documentElement);
      return { color: cs.getPropertyValue('--text').trim() || '#0b1020', placeholderColor: cs.getPropertyValue('--text-muted').trim() || '#64748b', fontSize: '14px', fontFamily: 'inherit' };
    };
    mercadoPago(publicKey)
      .then((mp) => {
        if (cancelado) return;
        const style = estilo();
        const numero = mp.fields.create('cardNumber', { placeholder: '0000 0000 0000 0000', style }).mount(ids.numero);
        const validade = mp.fields.create('expirationDate', { placeholder: 'MM/AA', style }).mount(ids.validade);
        const cvv = mp.fields.create('securityCode', { placeholder: 'CVV', style }).mount(ids.cvv);
        numero.on('binChange', async (e: any) => {
          const bin = e?.bin;
          if (!bin) return setBandeira(null);
          try {
            const r = await mp.getPaymentMethods({ bin });
            setBandeira(r.results?.[0]?.name ?? null);
          } catch {
            setBandeira(null);
          }
        });
        campos.current = [numero, validade, cvv];
        setPronto(true);
      })
      .catch((e: any) => setErroSdk(e.message || 'Não foi possível carregar o formulário de cartão.'));
    return () => {
      cancelado = true;
      for (const c of campos.current) {
        try {
          c.unmount();
        } catch {
          /* já desmontado */
        }
      }
      campos.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (titular.trim().length < 3) return toast.error('Informe o nome como está no cartão.');
    if (!cpfValido(cpf)) return toast.error('CPF inválido.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return toast.error('Informe um e-mail válido para o recibo.');
    setEnviando(true);
    try {
      const mp = await mercadoPago(publicKey);
      let token: { id: string };
      try {
        token = await mp.fields.createCardToken({ cardholderName: titular.trim(), identificationType: 'CPF', identificationNumber: cpf.replace(/\D/g, '') });
      } catch (err: any) {
        const msg = Array.isArray(err) ? err.map((x: any) => x?.message).filter(Boolean).join('; ') : err?.message;
        throw new Error(msg ? `Confira os dados do cartão: ${msg}` : 'Confira os dados do cartão.');
      }
      await onToken({ cardTokenId: token.id, email: email.trim().toLowerCase(), titular: titular.trim() });
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível concluir o pagamento.');
    } finally {
      setEnviando(false);
    }
  }

  const caixa = 'h-[42px] rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 focus-within:border-[var(--brand)] focus-within:ring-2 focus-within:ring-[var(--brand)]/20';

  return (
    <form onSubmit={enviar} className="space-y-4">
      {erroSdk && <p className="rounded-lg bg-[var(--vermelho)]/10 px-3 py-2 text-xs text-[var(--text)]">{erroSdk}</p>}
      <Input label="Nome no cartão" required value={titular} onChange={(e) => setTitular(e.target.value)} maxLength={60} autoComplete="cc-name" placeholder="Como está impresso" />
      <div>
        <p className="mb-1.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
          <span>
            Número do cartão <span className="text-[var(--vermelho)]">*</span>
          </span>
          {bandeira && <span className="normal-case tracking-normal text-[var(--text)]">{bandeira}</span>}
        </p>
        <div id={ids.numero} className={caixa} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
            Validade <span className="text-[var(--vermelho)]">*</span>
          </p>
          <div id={ids.validade} className={caixa} />
        </div>
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
            CVV <span className="text-[var(--vermelho)]">*</span>
          </p>
          <div id={ids.cvv} className={caixa} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label="CPF do titular" required value={cpf} onChange={(e) => setCpf(formatarCpf(e.target.value))} inputMode="numeric" placeholder="000.000.000-00" />
        <Input label="E-mail para o recibo" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </div>
      <p className="flex items-start gap-1.5 text-[11px] text-[var(--text-muted)]">
        <ShieldCheck size={13} className="mt-0.5 shrink-0 text-[var(--verde)]" />
        Os dados do cartão vão direto para o Mercado Pago, em campos protegidos; o Stok Aí não os vê nem guarda. Cobrança automática no mesmo cartão a cada período; cancele quando quiser.
      </p>
      <div className="flex justify-end gap-2">
        {onCancelar && (
          <Button type="button" variant="ghost" onClick={onCancelar}>
            Voltar
          </Button>
        )}
        <Button type="submit" loading={enviando} disabled={!pronto || Boolean(erroSdk)} icon={enviando ? undefined : <Lock size={14} />}>
          {rotuloDoBotao}
        </Button>
      </div>
      {!pronto && !erroSdk && (
        <p className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
          <CreditCard size={12} /> Carregando o formulário seguro…
        </p>
      )}
    </form>
  );
}
