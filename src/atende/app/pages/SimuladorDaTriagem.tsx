import { useState } from 'react';
import { toast } from 'sonner';
import { FlaskConical, Sparkles } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { api, ErroDaApi } from '../lib/api';
import { NOME_DA_SUGESTAO, type SimulacaoDaTriagem } from '../../shared/tipos';

/**
 * O administrador escreve como se fosse um cliente e vê o que a IA faria:
 * setor, prioridade, resumo, resposta. Nada é gravado nem enviado — é o
 * jeito de ajustar as descrições dos times e o contexto da empresa antes
 * de ligar o WhatsApp.
 */
export function SimuladorDaTriagem() {
  const [texto, setTexto] = useState('');
  const [rodando, setRodando] = useState(false);
  const [resultado, setResultado] = useState<SimulacaoDaTriagem | null>(null);

  async function simular() {
    const t = texto.trim();
    if (!t) return;
    setRodando(true);
    try {
      setResultado(await api.post<SimulacaoDaTriagem>('/triagem/simular', { texto: t }));
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'A simulação falhou.');
    } finally {
      setRodando(false);
    }
  }

  const c = resultado?.classificacao;
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} maxLength={2000} placeholder="Escreva como um cliente escreveria. Ex.: “Oi, quero saber se tem apartamento de 2 quartos pra alugar em Nova Cruz”" className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--brand)]" />
        <Button type="button" onClick={simular} loading={rodando} disabled={!texto.trim()} icon={<FlaskConical size={15} />} className="sm:self-start">
          Simular
        </Button>
      </div>
      {resultado && c && (
        <div className="rounded-xl border border-[var(--brand)]/25 bg-[var(--brand)]/[0.04] p-3 text-sm">
          <p className="mb-2 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-[var(--brand)]">
            <Sparkles size={11} /> O que a IA faria
          </p>
          {!resultado.ia && <p className="mb-2 rounded-lg bg-amber-100/70 px-2 py-1 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">Este servidor está sem a chave da IA: a triagem usou só as palavras-chave dos times.</p>}
          <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
            <Item rotulo="Assunto">{c.assunto}</Item>
            <Item rotulo="Intenção">{c.intencao}</Item>
            <Item rotulo="Setor">{resultado.nomeDoTime ?? <span className="text-[var(--text-muted)]">nenhum se encaixou</span>} <span className="text-[var(--text-muted)]">({Math.round(c.confianca * 100)}% de confiança)</span></Item>
            <Item rotulo="Prioridade">{c.prioridade}</Item>
            <Item rotulo="Lead">{NOME_DA_SUGESTAO[c.lead]}</Item>
            {c.precisa_esclarecer && <Item rotulo="Ação">pede esclarecimento antes de encaminhar</Item>}
          </dl>
          <p className="mt-2 rounded-lg bg-[var(--surface)] p-2 text-xs text-[var(--text)]">
            <span className="font-bold">Resumo para o atendente:</span> {c.resumo}
          </p>
          {c.resposta_ao_cliente ? (
            <p className="mt-1.5 rounded-lg bg-[var(--brand)] p-2 text-xs text-white">
              <span className="font-bold">Responderia ao cliente:</span> {c.resposta_ao_cliente}
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-[var(--text-muted)]">Não responderia nada ao cliente.</p>
          )}
          {resultado.uso && <p className="mt-2 text-[11px] text-[var(--text-muted)]">{resultado.uso.modelo} · {resultado.uso.tokens_entrada + resultado.uso.tokens_cache} tokens de entrada ({resultado.uso.tokens_cache} do cache) · {resultado.uso.tokens_saida} de saída</p>}
        </div>
      )}
    </div>
  );
}

function Item({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 sm:justify-start">
      <dt className="text-[var(--text-muted)]">{rotulo}</dt>
      <dd className="font-semibold text-[var(--text)]">{children}</dd>
    </div>
  );
}
