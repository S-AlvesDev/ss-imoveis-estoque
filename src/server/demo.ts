/**
 * O formulário "Solicitar demonstração" da Home. Validação em função pura
 * para ser testada sem servidor; a rota em app.ts só chama isto, grava e
 * avisa por e-mail.
 */

import { TAMANHOS_DE_OPERACAO, ROTULO_DO_TAMANHO, type TamanhoDeOperacao } from '../shared/demo';
import { escapeHtml, layoutEmail, p as paragrafo, tabela } from './email-layout';

export { TAMANHOS_DE_OPERACAO, ROTULO_DO_TAMANHO, type TamanhoDeOperacao };

export interface PedidoDemo {
  nome: string;
  empresa: string;
  email: string;
  telefone: string | null;
  tamanho: TamanhoDeOperacao;
  origem: string | null;
}

export type ResultadoValidacao = { ok: true; pedido: PedidoDemo } | { ok: false; erro: string };

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function texto(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Aceita o corpo cru da requisição e devolve ou um pedido limpo ou a
 * mensagem que a pessoa deve ver. As regras espelham os checks da migração
 * 016 — o banco é a última linha, esta é a primeira, com mensagem melhor.
 */
export function validarPedidoDemo(body: unknown): ResultadoValidacao {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;

  const nome = texto(b.nome);
  if (nome.length < 2 || nome.length > 80) return { ok: false, erro: 'Informe o seu nome (2 a 80 caracteres).' };

  const empresa = texto(b.empresa);
  if (empresa.length < 2 || empresa.length > 80) return { ok: false, erro: 'Informe o nome da empresa (2 a 80 caracteres).' };

  const email = texto(b.email).toLowerCase();
  if (!EMAIL.test(email) || email.length > 120) return { ok: false, erro: 'Informe um e-mail válido.' };

  const telefoneCru = texto(b.telefone);
  if (telefoneCru.length > 30) return { ok: false, erro: 'Telefone longo demais.' };
  // Só dígitos e os sinais que um telefone escrito tem. Impede que o campo
  // vire canal de texto livre no e-mail.
  if (telefoneCru && !/^[\d\s()+\-.]+$/.test(telefoneCru)) return { ok: false, erro: 'Informe um telefone válido (só números).' };
  const telefone = telefoneCru || null;

  const tamanho = texto(b.tamanho);
  if (!(TAMANHOS_DE_OPERACAO as readonly string[]).includes(tamanho)) return { ok: false, erro: 'Escolha o tamanho da operação.' };

  const origemCrua = texto(b.origem).slice(0, 40);
  const origem = origemCrua && /^[a-z0-9-]+$/.test(origemCrua) ? origemCrua : null;

  return { ok: true, pedido: { nome, empresa, email, telefone, tamanho: tamanho as TamanhoDeOperacao, origem } };
}

/**
 * Campo-armadilha: o formulário tem um input escondido que pessoa nenhuma
 * preenche. Robô preenche tudo. Se veio algo, é robô — e a resposta é um
 * "sucesso" silencioso, para ele não aprender o que deu errado.
 */
export function ehRobo(body: unknown): boolean {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  return texto(b.site).length > 0;
}

/** O e-mail que avisa o comercial. Tudo que veio do formulário passa por escape (no layout). */
export function emailDoPedido(p: PedidoDemo): { subject: string; html: string } {
  return {
    subject: `Pedido de demonstração: ${p.empresa}`,
    html: layoutEmail({
      titulo: 'Pedido de demonstração',
      corpo:
        paragrafo(`<strong>${escapeHtml(p.nome)}</strong>, da <strong>${escapeHtml(p.empresa)}</strong>, pediu uma demonstração do Stok Aí pela Home.`) +
        tabela([
          ['E-mail', p.email],
          ['Telefone', p.telefone],
          ['Operação', ROTULO_DO_TAMANHO[p.tamanho]],
          ['Veio de', p.origem],
        ]) +
        paragrafo('Responder este e-mail já vai direto para a pessoa.'),
    }),
  };
}
