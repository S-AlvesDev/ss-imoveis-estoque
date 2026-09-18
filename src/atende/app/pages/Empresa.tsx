import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Plus, Save, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Card, CardHeader } from '@/shared/ui/Card';
import { Input, Textarea } from '@/shared/ui/Field';
import { api, ErroDaApi } from '../lib/api';
import { useDadosAtende } from '../store/dados';
import { DIAS_DA_SEMANA, NOME_DO_DIA, type Empresa as TEmpresa, type HorarioDeAtendimento, type PerguntaFrequente } from '../../shared/tipos';
import { SimuladorDaTriagem } from './SimuladorDaTriagem';

/**
 * A empresa: o que ela é e o que a IA vai saber. Tudo que a triagem usa
 * como contexto nasce desta tela — descrição, produtos e serviços,
 * informações, perguntas frequentes, horário e regras. Nada de fora.
 */
export function Empresa() {
  const empresa = useDadosAtende((s) => s.empresa)!;
  const aplicar = useDadosAtende((s) => s.aplicar);
  const [form, setForm] = useState(() => paraForm(empresa));
  const [salvando, setSalvando] = useState(false);

  useEffect(() => setForm(paraForm(empresa)), [empresa]);

  const campo = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

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
        faq: form.faq.filter((f) => f.pergunta.trim() || f.resposta.trim()),
        horario_atendimento: form.horario,
      });
      aplicar({ empresa: r.empresa });
      toast.success('Empresa salva.');
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">Empresa</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">O que a IA sabe sobre a {empresa.nome} vem daqui — e só daqui.</p>
        </div>
        <Button type="submit" loading={salvando} icon={<Save size={15} />}>
          Salvar
        </Button>
      </div>

      <Card className="space-y-4 p-5">
        <CardHeader title="Identificação" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Nome da empresa" required value={form.nome} onChange={(e) => campo('nome', e.target.value)} maxLength={80} />
          <Input label="Segmento" value={form.segmento} onChange={(e) => campo('segmento', e.target.value)} placeholder="Imobiliária, clínica, loja…" maxLength={60} />
        </div>
        <Textarea label="Descrição" rows={3} value={form.descricao} onChange={(e) => campo('descricao', e.target.value)} placeholder="O que a empresa faz, para quem, onde atua." maxLength={2000} />
      </Card>

      <Card className="space-y-4 p-5">
        <CardHeader title="O que a IA precisa saber" />
        <Textarea label="Produtos e serviços" rows={4} value={form.produtos_servicos} onChange={(e) => campo('produtos_servicos', e.target.value)} placeholder="Ex.: venda e aluguel de imóveis residenciais e comerciais em Natal e Nova Cruz; administração de condomínios…" maxLength={4000} />
        <Textarea label="Informações relevantes" rows={4} value={form.informacoes_ia} onChange={(e) => campo('informacoes_ia', e.target.value)} placeholder="Endereço, formas de pagamento, documentos necessários, prazos, o que NÃO fazemos…" maxLength={4000} />
        <Textarea label="Regras de atendimento" rows={3} value={form.regras_atendimento} onChange={(e) => campo('regras_atendimento', e.target.value)} placeholder="Ex.: nunca informar valores por mensagem; urgências de manutenção têm prioridade alta; cliente de aluguel em atraso vai para o Financeiro." maxLength={2000} />
      </Card>

      <Card className="space-y-3 p-5">
        <CardHeader title="Perguntas frequentes" actions={<Button type="button" size="sm" variant="outline" icon={<Plus size={14} />} onClick={() => campo('faq', [...form.faq, { pergunta: '', resposta: '' }])}>Adicionar</Button>} />
        {form.faq.length === 0 && <p className="text-sm text-[var(--text-muted)]">Perguntas que os clientes fazem sempre, com a resposta oficial. A IA pode responder essas antes de encaminhar.</p>}
        {form.faq.map((f, i) => (
          <div key={i} className="grid gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-2)] p-3 sm:grid-cols-[1fr_1fr_auto]">
            <Input placeholder="Pergunta" value={f.pergunta} onChange={(e) => campo('faq', form.faq.map((x, j) => (j === i ? { ...x, pergunta: e.target.value } : x)))} maxLength={300} />
            <Input placeholder="Resposta" value={f.resposta} onChange={(e) => campo('faq', form.faq.map((x, j) => (j === i ? { ...x, resposta: e.target.value } : x)))} maxLength={1000} />
            <button type="button" onClick={() => campo('faq', form.faq.filter((_, j) => j !== i))} className="self-center rounded-lg p-2 text-[var(--text-muted)] hover:bg-rose-500/10 hover:text-rose-600" aria-label="Remover">
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </Card>

      <Card className="space-y-4 p-5">
        <CardHeader title="Horário de atendimento" />
        <div className="space-y-2">
          {DIAS_DA_SEMANA.map((dia) => {
            const faixa = form.horario[dia] ?? null;
            return (
              <div key={dia} className="flex flex-wrap items-center gap-3 text-sm">
                <label className="flex w-32 items-center gap-2 font-semibold text-[var(--text)]">
                  <input type="checkbox" checked={Boolean(faixa)} onChange={(e) => campo('horario', { ...form.horario, [dia]: e.target.checked ? { de: '08:00', ate: '18:00' } : null })} />
                  {NOME_DO_DIA[dia]}
                </label>
                {faixa ? (
                  <>
                    <input type="time" value={faixa.de} onChange={(e) => campo('horario', { ...form.horario, [dia]: { ...faixa, de: e.target.value } })} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[var(--text)]" />
                    <span className="text-[var(--text-muted)]">às</span>
                    <input type="time" value={faixa.ate} onChange={(e) => campo('horario', { ...form.horario, [dia]: { ...faixa, ate: e.target.value } })} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[var(--text)]" />
                  </>
                ) : (
                  <span className="text-[var(--text-muted)]">Fechado</span>
                )}
              </div>
            );
          })}
        </div>
        <Textarea label="Mensagem fora do horário" rows={2} value={form.mensagem_fora_do_horario} onChange={(e) => campo('mensagem_fora_do_horario', e.target.value)} placeholder="Ex.: Olá! Nosso atendimento é de segunda a sexta, das 8h às 18h. Deixe sua mensagem e retornamos assim que abrirmos." maxLength={500} />
      </Card>

      <Card className="space-y-4 p-5">
        <CardHeader icon={<Sparkles size={14} />} title="Triagem da IA" />
        <p className="text-sm text-[var(--text-muted)]">A IA lê cada conversa nova, escolhe o setor e a prioridade, resume para o atendente e dá uma primeira resposta. Ela nunca vende nem negocia — só encaminha.</p>
        <div className="space-y-2">
          <Interruptor ligado={form.triagem_ativa} onChange={(v) => campo('triagem_ativa', v)} titulo="Triagem ligada" descricao="Desligada, toda conversa nova cai direto na fila geral, sem setor, e a IA não fala com o cliente." />
          <Interruptor ligado={form.responde_fora_do_horario} onChange={(v) => campo('responde_fora_do_horario', v)} titulo="Responder fora do horário" descricao="Fora do horário, a IA ainda tria e manda a mensagem de fora do horário (abaixo). Desligado, ela tria em silêncio e o cliente só ouve a equipe quando abrir." />
        </div>
        <div>
          <p className="mb-1.5 flex items-center gap-1 text-xs font-bold text-[var(--text)]">
            <Sparkles size={12} className="text-[var(--brand)]" /> Testar a triagem
          </p>
          <SimuladorDaTriagem />
        </div>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" loading={salvando} icon={<Save size={15} />}>
          Salvar
        </Button>
      </div>
    </form>
  );
}

function Interruptor({ ligado, onChange, titulo, descricao }: { ligado: boolean; onChange: (v: boolean) => void; titulo: string; descricao: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-2)] p-3">
      <button type="button" role="switch" aria-checked={ligado} onClick={() => onChange(!ligado)} className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${ligado ? 'bg-[var(--brand)]' : 'bg-[var(--border)]'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${ligado ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[var(--text)]">{titulo}</span>
        <span className="block text-xs text-[var(--text-muted)]">{descricao}</span>
      </span>
    </label>
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
    faq: (e.faq ?? []) as PerguntaFrequente[],
    horario,
  };
}
