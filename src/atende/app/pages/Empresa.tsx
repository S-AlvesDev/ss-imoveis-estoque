import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Bot, Building2, Clock, FlaskConical, MessageCircleQuestion, Palette, Plus, Save, Sparkles, Timer, Trash2 } from 'lucide-react';
import { Botao } from '../ui/Botao';
import { Cartao, CabecalhoDoCartao } from '../ui/Cartao';
import { Entrada, AreaDeTexto, Interruptor, ESTILO_DO_CAMPO } from '../ui/Campo';
import { Abas } from '../ui/Controles';
import { COR_PADRAO, useTema } from '../store/tema';
import { Pagina } from '../ui/Pagina';
import { Vazio } from '../ui/Estados';
import { SeloIa } from '../ui/Ia';
import { api, ErroDaApi } from '../lib/api';
import { useDadosAtende } from '../store/dados';
import { TELAS, useRotaAtende } from '../router';
import { DIAS_DA_SEMANA, NOME_DO_DIA, type Empresa as TEmpresa, type HorarioDeAtendimento, type PerguntaFrequente } from '../../shared/tipos';
import { SimuladorDaTriagem } from './SimuladorDaTriagem';

/**
 * A empresa: o que ela é e o que a IA vai saber. Tudo que a triagem usa
 * como contexto nasce desta tela — descrição, produtos e serviços,
 * informações, perguntas frequentes, horário e regras. Nada de fora.
 *
 * Duas abas do mesmo formulário: Configurações (a empresa, o horário, o
 * SLA) e IA (o contexto, as perguntas frequentes, a triagem, o simulador).
 * Salvar grava tudo de uma vez, de qualquer aba.
 */
type Aba = 'empresa' | 'ia';

export function Empresa({ aba = 'empresa' }: { aba?: Aba }) {
  const empresa = useDadosAtende((s) => s.empresa)!;
  const aplicar = useDadosAtende((s) => s.aplicar);
  const ir = useRotaAtende((s) => s.ir);
  const [form, setForm] = useState(() => paraForm(empresa));
  const [salvando, setSalvando] = useState(false);

  useEffect(() => setForm(paraForm(empresa)), [empresa]);

  const campo = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const mudou = JSON.stringify(form) !== JSON.stringify(paraForm(empresa));

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      const r = await api.patch<{ empresa: TEmpresa }>('/empresa', {
        nome: form.nome,
        segmento: form.segmento,
        descricao: form.descricao,
        produtos_servicos: form.produtos_servicos,
        informacoes_ia: form.informacoes_ia,
        regras_atendimento: form.regras_atendimento,
        mensagem_fora_do_horario: form.mensagem_fora_do_horario,
        triagem_ativa: form.triagem_ativa,
        responde_fora_do_horario: form.responde_fora_do_horario,
        sla_aviso_min: form.sla_aviso_min === '' ? null : Number(form.sla_aviso_min),
        sla_escalonar_min: form.sla_escalonar_min === '' ? null : Number(form.sla_escalonar_min),
        cor_primaria: form.cor_primaria || null,
        logo_url: form.logo_url || null,
        faq: form.faq.filter((f) => f.pergunta.trim() || f.resposta.trim()),
        horario_atendimento: form.horario,
      });
      aplicar({ empresa: r.empresa });
      useTema.getState().setCor(r.empresa.cor_primaria);
      toast.success('Empresa salva.');
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  const titulo = aba === 'ia' ? 'IA' : 'Configurações';
  const descricao = aba === 'ia' ? `O que a IA sabe sobre a ${empresa.nome} vem daqui — e só daqui.` : 'A empresa, o horário de atendimento e as regras de tempo de resposta.';

  return (
    <Pagina
      titulo={titulo}
      descricao={descricao}
      largura="md"
      acoes={
        <Botao type="submit" form="form-empresa" carregando={salvando} icone={<Save size={15} />} variante={mudou ? 'primaria' : 'secundaria'}>
          Salvar
        </Botao>
      }
    >
      <Abas
        valor={aba}
        onChange={(a) => ir(TELAS.empresa, a === 'ia' ? 'ia' : '')}
        className="mb-5"
        opcoes={[
          { valor: 'empresa', rotulo: 'Empresa', icone: <Building2 size={15} /> },
          { valor: 'ia', rotulo: 'IA e triagem', icone: <Bot size={15} /> },
        ]}
      />

      <form id="form-empresa" onSubmit={salvar} className="space-y-4">
        {aba === 'empresa' && (
          <>
            <Cartao className="space-y-4 p-4 sm:p-5">
              <CabecalhoDoCartao icone={<Building2 size={14} />} titulo="Identificação" descricao="Como a empresa aparece para a equipe e para a IA." />
              <div className="grid gap-4 sm:grid-cols-2">
                <Entrada rotulo="Nome da empresa" required value={form.nome} onChange={(e) => campo('nome', e.target.value)} maxLength={80} />
                <Entrada rotulo="Segmento" value={form.segmento} onChange={(e) => campo('segmento', e.target.value)} placeholder="Imobiliária, clínica, loja…" maxLength={60} />
              </div>
              <AreaDeTexto rotulo="Descrição" rows={3} value={form.descricao} onChange={(e) => campo('descricao', e.target.value)} placeholder="O que a empresa faz, para quem, onde atua." maxLength={2000} />
            </Cartao>

            <Cartao className="space-y-4 p-4 sm:p-5">
              <CabecalhoDoCartao icone={<Palette size={14} />} titulo="Aparência" descricao="A cor e o logo valem para todo mundo da empresa. O tema claro ou escuro cada pessoa escolhe no topo da tela." />
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 block text-xs font-semibold text-[var(--text)]">Cor da marca</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.cor_primaria || COR_PADRAO}
                      onChange={(e) => campo('cor_primaria', e.target.value)}
                      className="h-[42px] w-14 shrink-0 cursor-pointer rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1"
                      aria-label="Escolher a cor da marca"
                    />
                    <Entrada className="flex-1" value={form.cor_primaria} onChange={(e) => campo('cor_primaria', e.target.value)} placeholder={COR_PADRAO} maxLength={7} />
                    {form.cor_primaria && (
                      <Botao variante="fantasma" tamanho="sm" onClick={() => campo('cor_primaria', '')}>
                        Padrão
                      </Botao>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs text-[var(--text-muted)]">Vazio = o roxo do Atende Aí.</p>
                </div>
                <Entrada rotulo="Logo (endereço da imagem)" value={form.logo_url} onChange={(e) => campo('logo_url', e.target.value)} placeholder="https://..." maxLength={500} ajuda="Vazio = o logo do Atende Aí." />
              </div>
            </Cartao>

            <Cartao className="space-y-4 p-4 sm:p-5">
              <CabecalhoDoCartao icone={<Clock size={14} />} titulo="Horário de atendimento" descricao="Fora dele, a IA pode avisar o cliente com a mensagem abaixo." />
              <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
                {DIAS_DA_SEMANA.map((dia) => {
                  const faixa = form.horario[dia] ?? null;
                  return (
                    <div key={dia} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                      <label className="flex w-36 cursor-pointer items-center gap-2.5 font-medium text-[var(--text)]">
                        <input type="checkbox" checked={Boolean(faixa)} onChange={(e) => campo('horario', { ...form.horario, [dia]: e.target.checked ? { de: '08:00', ate: '18:00' } : null })} className="h-4 w-4 rounded accent-[var(--brand)]" />
                        {NOME_DO_DIA[dia]}
                      </label>
                      {faixa ? (
                        <span className="flex items-center gap-2">
                          <input type="time" value={faixa.de} onChange={(e) => campo('horario', { ...form.horario, [dia]: { ...faixa, de: e.target.value } })} className={`${ESTILO_DO_CAMPO} h-9 w-auto py-1`} />
                          <span className="text-[var(--text-muted)]">às</span>
                          <input type="time" value={faixa.ate} onChange={(e) => campo('horario', { ...form.horario, [dia]: { ...faixa, ate: e.target.value } })} className={`${ESTILO_DO_CAMPO} h-9 w-auto py-1`} />
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">Fechado</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <AreaDeTexto rotulo="Mensagem fora do horário" rows={2} value={form.mensagem_fora_do_horario} onChange={(e) => campo('mensagem_fora_do_horario', e.target.value)} placeholder="Ex.: Olá! Nosso atendimento é de segunda a sexta, das 8h às 18h. Deixe sua mensagem e retornamos assim que abrirmos." maxLength={500} />
            </Cartao>

            <Cartao className="space-y-4 p-4 sm:p-5">
              <CabecalhoDoCartao icone={<Timer size={14} />} titulo="SLA: tempo sem resposta" descricao="Quando um cliente fica esperando, o sistema age." />
              <p className="text-sm leading-6 text-[var(--text-muted)]">O dashboard mede o tempo de resposta; aqui o sistema age sobre ele. Quando um cliente fica esperando, quem atende e quem supervisiona recebem um aviso (push); passado mais tempo, a conversa vai para a fila geral com prioridade alta, para qualquer pessoa livre pegar. Deixe em branco para desligar.</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Entrada rotulo="Avisar após (minutos)" type="number" min={1} max={1440} inputMode="numeric" value={form.sla_aviso_min} onChange={(e) => campo('sla_aviso_min', e.target.value)} placeholder="Ex.: 10" />
                <Entrada rotulo="Escalonar para a fila geral após (minutos)" type="number" min={1} max={2880} inputMode="numeric" value={form.sla_escalonar_min} onChange={(e) => campo('sla_escalonar_min', e.target.value)} placeholder="Ex.: 30" />
              </div>
              <p className="text-xs text-[var(--text-muted)]">A verificação roda enquanto alguém da equipe está com o Atende Aí aberto (a cada minuto) e uma vez por dia pelo servidor.</p>
            </Cartao>
          </>
        )}

        {aba === 'ia' && (
          <>
            <Cartao className="space-y-4 p-4 sm:p-5">
              <CabecalhoDoCartao icone={<Sparkles size={14} />} titulo="O que a IA precisa saber" descricao="É o contexto de cada triagem. Quanto mais concreto, melhor ela encaminha." />
              <AreaDeTexto rotulo="Produtos e serviços" rows={4} value={form.produtos_servicos} onChange={(e) => campo('produtos_servicos', e.target.value)} placeholder="Ex.: venda e aluguel de imóveis residenciais e comerciais em Natal e Nova Cruz; administração de condomínios…" maxLength={4000} />
              <AreaDeTexto rotulo="Informações relevantes" rows={4} value={form.informacoes_ia} onChange={(e) => campo('informacoes_ia', e.target.value)} placeholder="Endereço, formas de pagamento, documentos necessários, prazos, o que NÃO fazemos…" maxLength={4000} />
              <AreaDeTexto rotulo="Regras de atendimento" rows={3} value={form.regras_atendimento} onChange={(e) => campo('regras_atendimento', e.target.value)} placeholder="Ex.: nunca informar valores por mensagem; urgências de manutenção têm prioridade alta; cliente de aluguel em atraso vai para o Financeiro." maxLength={2000} />
            </Cartao>

            <Cartao className="space-y-3 p-4 sm:p-5">
              <CabecalhoDoCartao icone={<MessageCircleQuestion size={14} />} titulo="Perguntas frequentes" descricao="A IA pode responder estas antes de encaminhar." acoes={<Botao type="button" tamanho="sm" variante="secundaria" icone={<Plus size={14} />} onClick={() => campo('faq', [...form.faq, { pergunta: '', resposta: '' }])}>Adicionar</Botao>} />
              {form.faq.length === 0 && <Vazio compacto icone={<MessageCircleQuestion size={18} />} titulo="Nenhuma pergunta cadastrada." texto="Perguntas que os clientes fazem sempre, com a resposta oficial." />}
              {form.faq.map((f, i) => (
                <div key={i} className="grid gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 sm:grid-cols-[1fr_1fr_auto]">
                  <Entrada placeholder="Pergunta" value={f.pergunta} onChange={(e) => campo('faq', form.faq.map((x, j) => (j === i ? { ...x, pergunta: e.target.value } : x)))} maxLength={300} />
                  <Entrada placeholder="Resposta" value={f.resposta} onChange={(e) => campo('faq', form.faq.map((x, j) => (j === i ? { ...x, resposta: e.target.value } : x)))} maxLength={1000} />
                  <Botao type="button" tamanho="md" variante="fantasma" quadrado icone={<Trash2 size={15} />} onClick={() => campo('faq', form.faq.filter((_, j) => j !== i))} aria-label="Remover" className="self-center hover:!bg-rose-50 hover:!text-rose-600" />
                </div>
              ))}
            </Cartao>

            <Cartao className="space-y-4 p-4 sm:p-5">
              <CabecalhoDoCartao icone={<Bot size={14} />} titulo="Triagem da IA" descricao="A IA lê cada conversa nova, escolhe o setor e a prioridade, resume para o atendente e dá uma primeira resposta. Ela nunca vende nem negocia — só encaminha." />
              <div className="space-y-2">
                <Interruptor ligado={form.triagem_ativa} onChange={(v) => campo('triagem_ativa', v)} titulo="Triagem ligada" descricao="Desligada, toda conversa nova cai direto na fila geral, sem setor, e a IA não fala com o cliente." />
                <Interruptor ligado={form.responde_fora_do_horario} onChange={(v) => campo('responde_fora_do_horario', v)} titulo="Responder fora do horário" descricao="Fora do horário, a IA ainda tria e manda a mensagem de fora do horário (em Configurações). Desligado, ela tria em silêncio e o cliente só ouve a equipe quando abrir." />
              </div>
            </Cartao>

            <Cartao className="space-y-4 p-4 sm:p-5">
              <CabecalhoDoCartao icone={<FlaskConical size={14} />} titulo="Testar a triagem" descricao="Escreva como um cliente e veja o que a IA faria. Nada é gravado nem enviado." acoes={<SeloIa>simulador</SeloIa>} />
              <SimuladorDaTriagem />
            </Cartao>
          </>
        )}

        <div className="flex justify-end lg:hidden">
          <Botao type="submit" carregando={salvando} icone={<Save size={15} />}>
            Salvar
          </Botao>
        </div>
      </form>
    </Pagina>
  );
}

function paraForm(e: TEmpresa) {
  const horario: HorarioDeAtendimento = {};
  for (const dia of DIAS_DA_SEMANA) horario[dia] = e.horario_atendimento?.[dia] ?? null;
  return {
    nome: e.nome,
    segmento: e.segmento ?? '',
    descricao: e.descricao ?? '',
    produtos_servicos: e.produtos_servicos ?? '',
    informacoes_ia: e.informacoes_ia ?? '',
    regras_atendimento: e.regras_atendimento ?? '',
    mensagem_fora_do_horario: e.mensagem_fora_do_horario ?? '',
    triagem_ativa: e.triagem_ativa !== false,
    responde_fora_do_horario: e.responde_fora_do_horario !== false,
    sla_aviso_min: e.sla_aviso_min === null || e.sla_aviso_min === undefined ? '' : String(e.sla_aviso_min),
    sla_escalonar_min: e.sla_escalonar_min === null || e.sla_escalonar_min === undefined ? '' : String(e.sla_escalonar_min),
    cor_primaria: e.cor_primaria ?? '',
    logo_url: e.logo_url ?? '',
    faq: (e.faq ?? []) as PerguntaFrequente[],
    horario,
  };
}
