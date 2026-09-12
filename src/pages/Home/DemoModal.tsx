import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CheckCircle2, ChevronDown, X } from 'lucide-react';
import { TAMANHOS_DE_OPERACAO, ROTULO_DO_TAMANHO } from '@/shared/demo';
import { linkWhatsApp } from '@/shared/produto';
import { track } from '@/lib/analytics';
import { Botao } from './ui';

interface DemoModalProps {
  open: boolean;
  /** De onde veio o clique — vai junto no pedido, para saber qual botão converte. */
  origem: string;
  onClose: () => void;
}

const campo =
  'w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 transition-colors focus:border-[var(--laranja)] focus:bg-white/[0.06] focus:outline-none';

function Campo({ id, rotulo, opcional, children }: { id: string; rotulo: string; opcional?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
        {rotulo}
        {opcional && <span className="ml-1 font-normal normal-case tracking-normal text-slate-500">(opcional)</span>}
      </label>
      {children}
    </div>
  );
}

/**
 * O formulário curto de demonstração: cinco campos e nada mais. Envia para
 * /api/demo, que grava e avisa o comercial. Tem um campo escondido que só
 * robô preenche (ver server/demo.ts).
 */
export function DemoModal({ open, origem, onClose }: DemoModalProps) {
  const [nome, setNome] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [tamanho, setTamanho] = useState('');
  const [site, setSite] = useState(''); // armadilha
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const primeiroCampo = useRef<HTMLInputElement>(null);
  const reduzido = useReducedMotion();
  const uid = useId();

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => primeiroCampo.current?.focus(), 50);
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', tecla);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', tecla);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const res = await fetch('/api/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, empresa, email, telefone, tamanho, origem, site }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Não foi possível enviar agora.');
      setEnviado(true);
      track('home_demo_submit', { origem, tamanho });
    } catch (err: any) {
      setErro(err.message || 'Não foi possível enviar agora.');
    } finally {
      setEnviando(false);
    }
  }

  function fechar() {
    onClose();
    // Se enviou, a próxima abertura começa limpa.
    if (enviado) {
      setTimeout(() => {
        setEnviado(false);
        setNome('');
        setEmpresa('');
        setEmail('');
        setTelefone('');
        setTamanho('');
      }, 300);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[80] flex items-end justify-center bg-[#02050c]/80 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={fechar}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${uid}-titulo`}
            initial={reduzido ? false : { opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduzido ? undefined : { opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md overflow-hidden rounded-t-2xl border border-white/10 bg-[var(--navy-2)] shadow-2xl sm:rounded-2xl"
          >
            <span className="absolute inset-x-0 top-0 h-1 bg-[var(--laranja)]" aria-hidden />
            <button
              type="button"
              onClick={fechar}
              aria-label="Fechar"
              className="absolute right-3 top-3 rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"
            >
              <X size={18} />
            </button>

            {enviado ? (
              <div className="px-6 py-10 text-center sm:px-8">
                <CheckCircle2 size={44} className="mx-auto text-[var(--verde)]" />
                <h3 id={`${uid}-titulo`} className="mt-4 text-2xl font-extrabold tracking-tight text-white">
                  Pedido recebido.
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  Vamos entrar em contato pelo e-mail <span className="font-medium text-slate-200">{email}</span> para marcar a demonstração.
                </p>
                <p className="mt-3 text-sm text-slate-400">
                  Prefere falar agora?{' '}
                  <a href={linkWhatsApp(`Olá! Sou ${nome}, da ${empresa}. Acabei de pedir uma demonstração do Stok Aí.`)} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--verde)] hover:underline">
                    Chame no WhatsApp
                  </a>
                </p>
                <Botao variante="secundario" className="mt-6" onClick={fechar}>
                  Voltar para a página
                </Botao>
              </div>
            ) : (
              <form onSubmit={enviar} className="px-6 pb-6 pt-7 sm:px-8" noValidate>
                <h3 id={`${uid}-titulo`} className="pr-8 text-2xl font-extrabold tracking-tight text-white">
                  Solicitar demonstração
                </h3>
                <p className="mt-1.5 text-sm text-slate-400">Cinco campos. A gente mostra o Stok Aí funcionando com a sua operação.</p>

                <div className="mt-6 space-y-4">
                  <Campo id={`${uid}-nome`} rotulo="Seu nome">
                    <input ref={primeiroCampo} id={`${uid}-nome`} className={campo} value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" required maxLength={80} />
                  </Campo>
                  <Campo id={`${uid}-empresa`} rotulo="Empresa">
                    <input id={`${uid}-empresa`} className={campo} value={empresa} onChange={(e) => setEmpresa(e.target.value)} autoComplete="organization" required maxLength={80} />
                  </Campo>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Campo id={`${uid}-email`} rotulo="E-mail">
                      <input id={`${uid}-email`} type="email" className={campo} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required maxLength={120} />
                    </Campo>
                    <Campo id={`${uid}-telefone`} rotulo="Telefone" opcional>
                      <input id={`${uid}-telefone`} type="tel" className={campo} value={telefone} onChange={(e) => setTelefone(e.target.value)} autoComplete="tel" placeholder="(00) 00000-0000" maxLength={30} />
                    </Campo>
                  </div>
                  <Campo id={`${uid}-tamanho`} rotulo="Tamanho da operação">
                    <div className="relative">
                      <select
                        id={`${uid}-tamanho`}
                        className={`${campo} appearance-none bg-[var(--navy-2)] pr-10 ${tamanho ? '' : 'text-slate-500'}`}
                        value={tamanho}
                        onChange={(e) => setTamanho(e.target.value)}
                        required
                      >
                      <option value="" disabled>
                        Quantas unidades a empresa opera?
                      </option>
                        {TAMANHOS_DE_OPERACAO.map((t) => (
                          <option key={t} value={t} className="text-white">
                            {ROTULO_DO_TAMANHO[t]}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden />
                    </div>
                  </Campo>
                  {/* Armadilha para robôs: fora da tela, fora da ordem de tabulação, ignorado por leitores de tela. */}
                  <div className="absolute -left-[9999px] top-0 h-px w-px overflow-hidden" aria-hidden>
                    <label htmlFor={`${uid}-site`}>Site</label>
                    <input id={`${uid}-site`} tabIndex={-1} autoComplete="off" value={site} onChange={(e) => setSite(e.target.value)} />
                  </div>
                </div>

                {erro && (
                  <p role="alert" className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                    {erro}
                  </p>
                )}

                <Botao type="submit" tamanho="lg" className="mt-6 w-full" disabled={enviando}>
                  {enviando ? 'Enviando…' : 'Pedir demonstração'}
                </Botao>
                <p className="mt-3 text-center text-[11px] text-slate-500">
                  Sem compromisso. Usamos seus dados só para responder este pedido.
                  <br />
                  Ou{' '}
                  <a href={linkWhatsApp()} target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-300 hover:text-white hover:underline">
                    fale direto pelo WhatsApp
                  </a>
                  .
                </p>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
