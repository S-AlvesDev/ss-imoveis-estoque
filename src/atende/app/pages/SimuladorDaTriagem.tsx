import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { FlaskConical } from 'lucide-react';
import { Botao } from '../ui/Botao';
import { AreaDeTexto } from '../ui/Campo';
import { BlocoIa, Confianca, PensandoIa, TituloIa } from '../ui/Ia';
import { Alerta } from '../ui/Estados';
import { Etiqueta } from '../ui/Etiqueta';
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <AreaDeTexto className="min-w-0 flex-1" value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} maxLength={2000} placeholder="Escreva como um cliente escreveria. Ex.: “Oi, quero saber se tem apartamento de 2 quartos pra alugar em Nova Cruz”" />
        <Botao type="button" onClick={simular} carregando={rodando} disabled={!texto.trim()} icone={<FlaskConical size={15} />} className="sm:mt-0">
          Simular
        </Botao>
      </div>
      {rodando && !resultado && <PensandoIa texto="IA lendo a mensagem" />}
      {resultado && c && (
        <BlocoIa>
          <TituloIa acoes={resultado.uso ? <span className="text-[10px] text-[var(--text-muted)]">{resultado.uso.modelo}</span> : undefined}>O que a IA faria</TituloIa>
          {!resultado.ia && (
            <Alerta tom="aviso" className="mt-2">
              Este servidor está sem a chave da IA: a triagem usou só as palavras-chave dos times.
            </Alerta>
          )}
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
            <Item rotulo="Assunto">{c.assunto}</Item>
            <Item rotulo="Intenção">{c.intencao}</Item>
            <Item rotulo="Setor">
              <span className="inline-flex flex-wrap items-center gap-1.5">
                {resultado.nomeDoTime ?? <span className="font-normal text-[var(--text-muted)]">nenhum se encaixou</span>}
                <Confianca valor={c.confianca} />
              </span>
            </Item>
            <Item rotulo="Prioridade">
              <span className="capitalize">{c.prioridade}</span>
            </Item>
            <Item rotulo="Lead">
              <Etiqueta tom={c.lead === 'quente' ? 'vermelho' : c.lead === 'morno' ? 'ambar' : c.lead === 'frio' ? 'azul' : 'cinza'}>{NOME_DA_SUGESTAO[c.lead]}</Etiqueta>
            </Item>
            {c.precisa_esclarecer && <Item rotulo="Ação">pede esclarecimento antes de encaminhar</Item>}
          </dl>
          <div className="mt-3 rounded-lg bg-[var(--bg)] p-3 text-xs leading-5 text-[var(--text)]">
            <span className="font-semibold">Resumo para o atendente:</span> {c.resumo}
          </div>
          {c.resposta_ao_cliente ? (
            <div className="mt-2 flex justify-end">
              <div className="max-w-[90%] rounded-2xl rounded-br-md bg-[var(--brand)] px-3.5 py-2 text-xs leading-5 text-white">
                <span className="block text-[10px] font-semibold text-white/80">Responderia ao cliente</span>
                {c.resposta_ao_cliente}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-xs text-[var(--text-muted)]">Não responderia nada ao cliente.</p>
          )}
          {resultado.uso && (
            <p className="mt-2 text-[11px] text-[var(--text-muted)]">
              {resultado.uso.tokens_entrada + resultado.uso.tokens_cache} tokens de entrada ({resultado.uso.tokens_cache} do cache) · {resultado.uso.tokens_saida} de saída
            </p>
          )}
        </BlocoIa>
      )}
    </div>
  );
}

function Item({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 sm:justify-start">
      <dt className="shrink-0 text-[var(--text-muted)]">{rotulo}</dt>
      <dd className="min-w-0 font-semibold text-[var(--text)]">{children}</dd>
    </div>
  );
}
