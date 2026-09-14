/**
 * Lembretes de vencimento — para quem paga por Pix/boleto (renovação
 * manual) e para quem está nos dias grátis. Um cron diário chama
 * `contasParaLembrar` e manda um e-mail por conta; `lembrete_enviado_em`
 * evita repetir no mesmo dia.
 */
import { supabaseServer } from '../lib/supabaseServer';
import { layoutEmail, escapeHtml, p } from './email-layout';
import { siteUrl } from './senha';
import { LEMBRETE_DIAS, NOME_DO_PLANO, situacaoDaConta, type Conta } from '../shared/planos';

export interface ContaParaLembrar {
  organizationId: string;
  nome: string;
  conta: Conta;
  emails: string[];
}

const DIA_MS = 24 * 60 * 60 * 1000;

/** Se esta conta merece lembrete hoje: renovação manual vencendo em até LEMBRETE_DIAS, ou avaliação acabando em 2 dias. */
export function precisaLembrar(conta: Conta, lembreteEnviadoEm: string | null, agora: Date = new Date()): boolean {
  if (conta.dias_restantes === null) return false;
  if (lembreteEnviadoEm && agora.getTime() - new Date(lembreteEnviadoEm).getTime() < DIA_MS) return false;
  if (conta.situacao === 'assinada' && conta.renovacao === 'manual') return conta.dias_restantes <= LEMBRETE_DIAS;
  if (conta.situacao === 'carencia') return true;
  if (conta.situacao === 'avaliacao') return conta.dias_restantes <= 2;
  return false;
}

/** As contas que devem receber lembrete agora, com os e-mails dos administradores. */
export async function contasParaLembrar(agora: Date = new Date()): Promise<ContaParaLembrar[]> {
  const { data: orgs, error } = await supabaseServer.from('organizations').select('id, nome, plano, plano_ate, avaliacao_ate, cobranca, lembrete_enviado_em, ativo').eq('ativo', true);
  if (error) throw error;
  const lista: ContaParaLembrar[] = [];
  for (const o of orgs || []) {
    const conta = situacaoDaConta(o, agora);
    if (!precisaLembrar(conta, o.lembrete_enviado_em, agora)) continue;
    const { data: pessoas } = await supabaseServer.from('estoque_users').select('email, role').eq('organization_id', o.id).in('role', ['CEO', 'ADMINISTRADOR', 'ADMINISTRATIVO']).eq('ativo', true);
    const valido = (e: unknown) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim().toLowerCase());
    // O CEO responde pela conta; só se ele não tem e-mail é que os administradores recebem.
    const doCeo = (pessoas || []).filter((p: any) => p.role === 'CEO' && valido(p.email)).map((p: any) => String(p.email).trim().toLowerCase());
    const emails = doCeo.length > 0 ? doCeo : (pessoas || []).filter((p: any) => valido(p.email)).map((p: any) => String(p.email).trim().toLowerCase());
    if (emails.length === 0) continue;
    lista.push({ organizationId: o.id, nome: o.nome, conta, emails });
  }
  return lista;
}

export async function marcarLembrete(organizationId: string, agora: Date = new Date()) {
  await supabaseServer.from('organizations').update({ lembrete_enviado_em: agora.toISOString() }).eq('id', organizationId);
}

const fmtData = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' });

/** O e-mail do lembrete, conforme a situação. */
export function emailDeLembrete(c: ContaParaLembrar, env?: Record<string, string | undefined>): { subject: string; html: string } {
  const base = siteUrl(env);
  const ate = c.conta.ate ? fmtData.format(new Date(c.conta.ate)) : '';
  const dias = c.conta.dias_restantes ?? 0;
  const quando = dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : `em ${dias} dias`;
  const empresa = escapeHtml(c.nome);

  if (c.conta.situacao === 'avaliacao') {
    return {
      subject: `Seus dias grátis no Stok Aí terminam ${quando}`,
      html: layoutEmail({
        titulo: `A avaliação da ${empresa} termina ${quando}.`,
        corpo:
          p(`Até <strong>${ate}</strong> a conta tem tudo liberado. Depois disso ela pede um plano para continuar — nada é apagado: materiais, estoques e histórico ficam guardados.`) +
          p('Dá para assinar com cartão (cobrança automática) ou pagar o período por Pix ou boleto, em Configurações → Plano e assinatura.'),
        botao: { rotulo: 'Escolher um plano', url: `${base}/` },
      }),
    };
  }
  if (c.conta.situacao === 'carencia') {
    return {
      subject: `Stok Aí: pagamento pendente — a conta da ${c.nome} trava ${quando}`,
      html: layoutEmail({
        titulo: `O pagamento do plano ${NOME_DO_PLANO[c.conta.plano]} não foi confirmado.`,
        corpo:
          p(`A conta continua funcionando até <strong>${ate}</strong>. Depois disso ela trava até o pagamento entrar — sem apagar nada.`) +
          p('Se paga por cartão, confira com o banco; se paga por Pix ou boleto, gere um novo em Configurações → Plano e assinatura.'),
        botao: { rotulo: 'Regularizar agora', url: `${base}/` },
      }),
    };
  }
  return {
    subject: `Stok Aí: o plano da ${c.nome} vence ${quando}`,
    html: layoutEmail({
      titulo: `O plano ${NOME_DO_PLANO[c.conta.plano]} vence ${quando} (${ate}).`,
      corpo:
        p('Como o pagamento é por Pix ou boleto, a renovação é manual: gere o pagamento do próximo período em Configurações → Plano e assinatura. Pagando antes de vencer, o período novo começa onde o atual termina — nada se perde.') +
        p(`Depois do vencimento a conta ainda funciona por 2 dias; então trava até o pagamento entrar.`),
      botao: { rotulo: 'Renovar o plano', url: `${base}/` },
    }),
  };
}
