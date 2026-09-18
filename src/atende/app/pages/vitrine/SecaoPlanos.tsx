import { useState } from 'react';
import { Check } from 'lucide-react';
import { linkWhatsApp } from '@/shared/produto';
import { caminhoDe, TELAS } from '../../router';
import { BASE_DE_TODO_PLANO, DEFINICOES_ATENDE, MESES_GRATIS_NO_ANUAL_ATENDE, PLANOS_ATENDE, precoFormatado, type CicloAtende } from '../../../shared/planos';
import { Botao, Container, Eyebrow, Revelar, cta } from './Vitrine';

/**
 * Os planos do Atende Aí, públicos. Os preços vêm do catálogo
 * (shared/planos.ts) — enquanto não definidos, "R$ XX". Os cartões listam só
 * o que o produto faz hoje; o que todo plano tem aparece uma vez, abaixo.
 */
export function SecaoPlanos({ compacta = false }: { compacta?: boolean }) {
  const [ciclo, setCiclo] = useState<CicloAtende>('mensal');
  const semPreco = PLANOS_ATENDE.every((p) => DEFINICOES_ATENDE[p].preco === null);

  return (
    <section id="planos" className="relative py-20 sm:py-28">
      <Container>
        <Revelar className="mx-auto max-w-3xl text-center">
          <Eyebrow>Planos do Atende Aí</Eyebrow>
          <h2 className="mt-4 text-[clamp(1.75rem,4.2vw,3rem)] font-extrabold leading-[1.08] tracking-tight text-white">Um plano para cada tamanho de atendimento.</h2>
          <p className="mt-5 text-base leading-relaxed text-[#a5abcf] sm:text-lg">
            {compacta ? 'Comece com o essencial e cresça quando a equipe crescer.' : 'Escolha pelo tamanho da equipe e pelo que a IA precisa fazer por vocês. Sem fidelidade; o número de WhatsApp é o da sua empresa.'}
          </p>
          <div className="mt-7 inline-flex rounded-xl border border-white/10 bg-white/[0.04] p-1 text-xs font-bold" role="tablist" aria-label="Ciclo de cobrança">
            {(['mensal', 'anual'] as const).map((c) => (
              <button key={c} type="button" role="tab" aria-selected={ciclo === c} onClick={() => setCiclo(c)} className={`rounded-lg px-4 py-2 transition-colors ${ciclo === c ? 'bg-[var(--brand)] text-white' : 'text-slate-300 hover:text-white'}`}>
                {c === 'mensal' ? 'Mensal' : `Anual · ${MESES_GRATIS_NO_ANUAL_ATENDE} meses grátis`}
              </button>
            ))}
          </div>
          {semPreco && <p className="mt-3 text-xs text-[#6f76a0]">Valores em definição — fale com a gente para uma proposta.</p>}
        </Revelar>

        <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
          {PLANOS_ATENDE.map((id, i) => {
            const p = DEFINICOES_ATENDE[id];
            return (
              <Revelar key={id} delay={i * 0.08}>
                <article className={`relative flex h-full flex-col rounded-3xl border p-6 sm:p-7 ${p.destaque ? 'border-[var(--brand)]/60 bg-[var(--brand)]/[0.08] shadow-[0_30px_80px_-40px_rgba(124,58,237,0.7)]' : 'border-white/10 bg-white/[0.03]'}`}>
                  {p.destaque && <span className="absolute -top-3 left-6 rounded-full bg-[var(--brand)] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">Mais escolhido</span>}
                  <h3 className="text-lg font-extrabold text-white">{p.nome}</h3>
                  <p className="mt-1 text-sm text-[#a5abcf]">{p.publico}</p>
                  <p className="mt-5 flex items-baseline gap-1">
                    <span className="text-4xl font-extrabold tracking-tight text-white">{precoFormatado(id, ciclo)}</span>
                    <span className="text-sm text-[#a5abcf]">/mês</span>
                  </p>
                  <p className="text-xs text-[#6f76a0]">{ciclo === 'anual' ? 'no plano anual, cobrado por ano' : 'cobrado por mês'}</p>
                  <ul className="mt-6 flex-1 space-y-2.5">
                    {p.destaques.map((d) => (
                      <li key={d} className="flex gap-2.5 text-sm text-slate-200">
                        <Check size={16} className="mt-0.5 shrink-0 text-[var(--lilas)]" />
                        <span className="min-w-0">{d}</span>
                      </li>
                    ))}
                    <li className="flex gap-2.5 text-sm text-[#a5abcf]">
                      <Check size={16} className="mt-0.5 shrink-0 text-[#6f76a0]" />
                      <span>Suporte: {p.suporte}</span>
                    </li>
                  </ul>
                  <Botao href={caminhoDe(TELAS.criarConta)} variante={p.destaque ? 'primario' : 'contorno'} alvo={`plano-${id}`} className="mt-7 w-full">
                    Começar com o {p.nome}
                  </Botao>
                </article>
              </Revelar>
            );
          })}
        </div>

        <Revelar delay={0.1} className="mt-10 rounded-3xl border border-white/10 bg-white/[0.02] p-6 sm:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#6f76a0]">Em todos os planos</p>
          <ul className="mt-4 grid grid-cols-1 gap-x-8 gap-y-2.5 sm:grid-cols-2">
            {BASE_DE_TODO_PLANO.map((b) => (
              <li key={b} className="flex gap-2.5 text-sm text-slate-300">
                <Check size={16} className="mt-0.5 shrink-0 text-[var(--brand)]" />
                <span className="min-w-0">{b}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-xs leading-relaxed text-[#6f76a0]">
            Hoje o Atende Aí trabalha com um número de WhatsApp por empresa. A triagem por IA usa só o que a sua empresa cadastrou (descrição, setores, perguntas frequentes, regras) — ela não vende nem negocia; encaminha e resume para quem atende. Criar a conta não pede cartão.
          </p>
          <p className="mt-2 text-xs text-[#6f76a0]">
            Dúvidas sobre qual plano?{' '}
            <a href={linkWhatsApp('Olá! Quero saber mais sobre os planos do Atende Aí.')} target="_blank" rel="noreferrer" onClick={() => cta('planos-whatsapp')} className="font-semibold text-[var(--lilas)] hover:text-white">
              Fale com a gente no WhatsApp
            </a>
            .
          </p>
        </Revelar>
      </Container>
    </section>
  );
}
