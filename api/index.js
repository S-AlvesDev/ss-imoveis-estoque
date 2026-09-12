// src/server/app.ts
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import jwt2 from "jsonwebtoken";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";

// src/lib/supabaseServer.ts
import { createClient } from "@supabase/supabase-js";
var supabaseUrl = process.env.SUPABASE_URL;
var serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.warn("[Supabase] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY n\xE3o configurados no .env \u2014 as rotas de dados v\xE3o falhar at\xE9 isso ser corrigido.");
}
var supabaseServer = createClient(supabaseUrl || "", serviceRoleKey || "", {
  auth: { autoRefreshToken: false, persistSession: false }
});

// src/shared/constants.ts
var ADMIN_ROLES = ["ADMINISTRADOR", "ADMINISTRATIVO"];
var OPERADOR = "OPERADOR";
var LEGACY_OPERATOR_ROLES = ["ALMOXARIFE_GERAL", "ALMOXARIFADO", "ALMOXARIFE_OBRA"];
var ASSIGNABLE_ROLES = ["ADMINISTRADOR", "ADMINISTRATIVO", OPERADOR];
var CENTRAL_ROLES = ["ALMOXARIFE_GERAL", "ALMOXARIFADO", ...ADMIN_ROLES];
var OBRA_ROLES = ["ALMOXARIFE_OBRA", ...ADMIN_ROLES];
var ALL_INVENTORY_ROLES = Array.from(/* @__PURE__ */ new Set([...ADMIN_ROLES, OPERADOR, ...LEGACY_OPERATOR_ROLES]));

// src/features/estoque/utils.ts
var ATTENTION_FACTOR = 1.5;
function stockTotal(m) {
  return Number(m.saldo_unidade);
}
function saldoEm(m, depositoId) {
  return Number(m.saldos_unidade?.[depositoId] ?? 0);
}
function stockStatus(m, scope = "empresa") {
  const total = stockTotal(m);
  const minimo = Number(m.estoque_minimo);
  if (total <= 0) return "RUPTURA";
  if (scope !== "empresa") {
    const aqui = saldoEm(m, scope);
    if (aqui <= 0 && total - aqui > 0) return "TRANSFERIR";
  }
  if (minimo > 0) {
    if (total < minimo) return "ABAIXO";
    if (total < minimo * ATTENTION_FACTOR) return "ATENCAO";
  }
  return "OK";
}
function needsPurchase(m) {
  const s = stockStatus(m, "empresa");
  return s === "RUPTURA" || s === "ABAIXO";
}

// src/server/tenant.ts
import { createClient as createClient2 } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";
var SUPABASE_URL = process.env.SUPABASE_URL || "";
var SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
var ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
var SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || "";
var RLS_ATIVO = Boolean(SUPABASE_JWT_SECRET && ANON_KEY);
var TABELAS_DA_ORGANIZACAO = /* @__PURE__ */ new Set([
  "materials",
  "material_movements",
  "support_tickets",
  "support_ticket_materials",
  "support_ticket_comments",
  "estoque_users",
  // Fase 2: unidade, depósito e saldo por depósito.
  "units",
  "warehouses",
  "stock_balances",
  "estoque_user_warehouses",
  // Estoques configuráveis (migrações 018 e 019).
  "categories",
  "loans",
  "lots",
  "assets",
  "asset_events",
  // Assinaturas (migração 021).
  "assinaturas",
  "pagamentos"
]);
var clientesPorOrg = /* @__PURE__ */ new Map();
function clientePara(organizationId) {
  const cache2 = clientesPorOrg.get(organizationId);
  if (cache2) return cache2;
  let client;
  if (RLS_ATIVO) {
    const token = jwt.sign(
      { role: "authenticated", organization_id: organizationId, iat: Math.floor(Date.now() / 1e3) - 120 },
      SUPABASE_JWT_SECRET,
      { expiresIn: "1h" }
    );
    client = createClient2(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
  } else {
    client = createClient2(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  clientesPorOrg.set(organizationId, client);
  return client;
}
function comOrganizacao(payload, organizationId) {
  const marcar = (row) => ({ ...row, organization_id: organizationId });
  return Array.isArray(payload) ? payload.map(marcar) : marcar(payload);
}
function scopedDb(organizationId) {
  if (!organizationId) {
    throw new Error("[tenant] organiza\xE7\xE3o ausente \u2014 consulta recusada.");
  }
  const client = clientePara(organizationId);
  return {
    /** Escapatória explícita, para o que é global de verdade (ex.: organizations). */
    raw: client,
    from(table) {
      const base = client.from(table);
      const daOrg = TABELAS_DA_ORGANIZACAO.has(table);
      return {
        select: (colunas = "*", opcoes) => {
          const q = base.select(colunas, opcoes);
          return daOrg ? q.eq("organization_id", organizationId) : q;
        },
        insert: (linhas) => base.insert(daOrg ? comOrganizacao(linhas, organizationId) : linhas),
        // O saldo por depósito é gravado por upsert: a linha pode já existir
        // (material antigo) ou não (depósito recém-criado), e o caminho tem que
        // ser o mesmo nos dois casos.
        upsert: (linhas, opcoes) => base.upsert(daOrg ? comOrganizacao(linhas, organizationId) : linhas, opcoes),
        update: (patch) => {
          const q = base.update(patch);
          return daOrg ? q.eq("organization_id", organizationId) : q;
        },
        delete: () => {
          const q = base.delete();
          return daOrg ? q.eq("organization_id", organizationId) : q;
        }
      };
    }
  };
}

// src/shared/demo.ts
var TAMANHOS_DE_OPERACAO = ["1", "2-5", "6-20", "20+"];
var ROTULO_DO_TAMANHO = {
  "1": "Uma unidade",
  "2-5": "2 a 5 unidades",
  "6-20": "6 a 20 unidades",
  "20+": "Mais de 20 unidades"
};

// src/shared/produto.ts
var PRODUTO = {
  nome: "Stok A\xED",
  slogan: "Sua opera\xE7\xE3o, no controle.",
  descricao: "Controle estoques, dep\xF3sitos, unidades e movimenta\xE7\xF5es em um s\xF3 lugar. Saiba o que voc\xEA tem, onde est\xE1 e o que aconteceu.",
  /** O laranja da marca. O do sistema por dentro é `--brand`, que a organização pode trocar. */
  cor: "#FF8A24",
  /** Fundo navy da Home e da tela de login. */
  navy: "#050B18",
  navy2: "#0B1426",
  /** Só dígitos, com DDI: é o formato que o wa.me exige. */
  whatsapp: "5584991434190",
  simbolo: "/brand/symbol.webp",
  simboloGrande: "/brand/symbol-512.png",
  /** Símbolo + nome. "Stok" em branco na versão escura, em preto na clara: cada fundo tem a sua. */
  logoHorizontal: { escuro: "/brand/logo-horizontal.webp", claro: "/brand/logo-horizontal-light.webp" },
  /** Símbolo + nome + slogan, idem. */
  logoComSlogan: { escuro: "/brand/logo-tagline.webp", claro: "/brand/logo-tagline-light.webp" }
};
function linkWhatsApp(mensagem = "Ol\xE1! Quero conhecer o Stok A\xED.") {
  return `https://wa.me/${PRODUTO.whatsapp}?text=${encodeURIComponent(mensagem)}`;
}
function whatsappFormatado() {
  const d = PRODUTO.whatsapp;
  return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
}

// src/server/email-layout.ts
var ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}
function layoutEmail({ titulo, corpo, botao, observacao }) {
  const botaoHtml = botao ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0 8px"><tr><td style="background:${PRODUTO.cor};border-radius:10px"><a href="${escapeHtml(botao.url)}" style="display:inline-block;padding:12px 22px;color:#1a0c00;font-weight:700;text-decoration:none;font-family:Inter,Arial,sans-serif;font-size:15px">${escapeHtml(botao.rotulo)}</a></td></tr></table><p style="margin:8px 0 0;font-size:12px;color:#607089;font-family:Inter,Arial,sans-serif;word-break:break-all">Se o bot\xE3o n\xE3o abrir, copie este endere\xE7o: <a href="${escapeHtml(botao.url)}" style="color:#607089">${escapeHtml(botao.url)}</a></p>` : "";
  const obsHtml = observacao ? `<p style="margin:24px 0 0;font-size:13px;color:#607089;font-family:Inter,Arial,sans-serif">${observacao}</p>` : "";
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:0;background:#f3f4f7"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f7;padding:24px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px"><tr><td style="background:${PRODUTO.navy};border-radius:14px 14px 0 0;padding:20px 28px;font-family:Inter,Arial,sans-serif"><span style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px">Stok <span style="color:${PRODUTO.cor}">A\xED</span></span><span style="display:block;margin-top:2px;font-size:12px;color:#8a94a6">${escapeHtml(PRODUTO.slogan)}</span></td></tr><tr><td style="background:#ffffff;padding:28px;font-family:Inter,Arial,sans-serif;color:#050f24;font-size:15px;line-height:1.55"><h1 style="margin:0 0 14px;font-size:22px;line-height:1.2;font-weight:800;letter-spacing:-0.3px">${escapeHtml(titulo)}</h1>` + corpo + botaoHtml + obsHtml + `</td></tr><tr><td style="background:#ffffff;border-top:1px solid #e1e1e1;border-radius:0 0 14px 14px;padding:16px 28px;font-family:Inter,Arial,sans-serif;font-size:12px;color:#607089">${escapeHtml(PRODUTO.nome)} \xB7 <a href="${escapeHtml(linkWhatsApp())}" style="color:#607089">WhatsApp ${escapeHtml(whatsappFormatado())}</a></td></tr></table></td></tr></table></body></html>`;
}
function p(html) {
  return `<p style="margin:0 0 12px">${html}</p>`;
}
function tabela(linhas) {
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:12px 0;font-size:14px">` + linhas.map(
    ([rotulo, valor]) => `<tr><td style="padding:4px 14px 4px 0;color:#607089;vertical-align:top">${escapeHtml(rotulo)}</td><td style="padding:4px 0"><strong>${escapeHtml(valor ?? "\u2014")}</strong></td></tr>`
  ).join("") + `</table>`;
}

// src/server/demo.ts
var EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
function texto(v) {
  return typeof v === "string" ? v.trim() : "";
}
function validarPedidoDemo(body) {
  const b = body && typeof body === "object" ? body : {};
  const nome = texto(b.nome);
  if (nome.length < 2 || nome.length > 80) return { ok: false, erro: "Informe o seu nome (2 a 80 caracteres)." };
  const empresa = texto(b.empresa);
  if (empresa.length < 2 || empresa.length > 80) return { ok: false, erro: "Informe o nome da empresa (2 a 80 caracteres)." };
  const email = texto(b.email).toLowerCase();
  if (!EMAIL.test(email) || email.length > 120) return { ok: false, erro: "Informe um e-mail v\xE1lido." };
  const telefoneCru = texto(b.telefone);
  if (telefoneCru.length > 30) return { ok: false, erro: "Telefone longo demais." };
  if (telefoneCru && !/^[\d\s()+\-.]+$/.test(telefoneCru)) return { ok: false, erro: "Informe um telefone v\xE1lido (s\xF3 n\xFAmeros)." };
  const telefone = telefoneCru || null;
  const tamanho = texto(b.tamanho);
  if (!TAMANHOS_DE_OPERACAO.includes(tamanho)) return { ok: false, erro: "Escolha o tamanho da opera\xE7\xE3o." };
  const origemCrua = texto(b.origem).slice(0, 40);
  const origem = origemCrua && /^[a-z0-9-]+$/.test(origemCrua) ? origemCrua : null;
  return { ok: true, pedido: { nome, empresa, email, telefone, tamanho, origem } };
}
function ehRobo(body) {
  const b = body && typeof body === "object" ? body : {};
  return texto(b.site).length > 0;
}
function emailDoPedido(p2) {
  return {
    subject: `Pedido de demonstra\xE7\xE3o: ${p2.empresa}`,
    html: layoutEmail({
      titulo: "Pedido de demonstra\xE7\xE3o",
      corpo: p(`<strong>${escapeHtml(p2.nome)}</strong>, da <strong>${escapeHtml(p2.empresa)}</strong>, pediu uma demonstra\xE7\xE3o do Stok A\xED pela Home.`) + tabela([
        ["E-mail", p2.email],
        ["Telefone", p2.telefone],
        ["Opera\xE7\xE3o", ROTULO_DO_TAMANHO[p2.tamanho]],
        ["Veio de", p2.origem]
      ]) + p("Responder este e-mail j\xE1 vai direto para a pessoa.")
    })
  };
}

// src/server/emprestimos.ts
var MAX_PRAZO_HORAS = 8760;
var PRAZO_PADRAO_HORAS = 2;
function texto2(v) {
  return typeof v === "string" ? v.trim() : "";
}
function validarRetirada(body, prazoPadraoHoras) {
  const b = body && typeof body === "object" ? body : {};
  const material_id = Number(b.material_id);
  if (!Number.isInteger(material_id) || material_id <= 0) return { ok: false, erro: "Escolha o material." };
  const quantidade = Number(b.quantidade);
  if (!Number.isFinite(quantidade) || quantidade <= 0) return { ok: false, erro: "A quantidade precisa ser maior que zero." };
  const tomador_nome = texto2(b.tomador_nome);
  if (tomador_nome.length < 2 || tomador_nome.length > 80) return { ok: false, erro: "Informe quem est\xE1 retirando (2 a 80 caracteres)." };
  const referencia = texto2(b.tomador_referencia);
  if (referencia.length > 40) return { ok: false, erro: "Refer\xEAncia longa demais (at\xE9 40 caracteres)." };
  const observacao = texto2(b.observacao);
  if (observacao.length > 300) return { ok: false, erro: "Observa\xE7\xE3o longa demais (at\xE9 300 caracteres)." };
  const prazoInformado = b.prazo_horas === void 0 || b.prazo_horas === null || b.prazo_horas === "" ? null : Number(b.prazo_horas);
  const prazo_horas = prazoInformado ?? prazoPadraoHoras ?? PRAZO_PADRAO_HORAS;
  if (!Number.isFinite(prazo_horas) || prazo_horas <= 0 || prazo_horas > MAX_PRAZO_HORAS) {
    return { ok: false, erro: `O prazo deve ser de 1 a ${MAX_PRAZO_HORAS} horas.` };
  }
  return {
    ok: true,
    retirada: {
      material_id,
      quantidade: Math.round(quantidade * 100) / 100,
      tomador_nome,
      tomador_referencia: referencia || null,
      observacao: observacao || null,
      prazo_horas
    }
  };
}
function prazoEm(prazoHoras, agora = /* @__PURE__ */ new Date()) {
  return new Date(agora.getTime() + prazoHoras * 60 * 60 * 1e3);
}

// src/server/entregas.ts
var DIA_MS = 24 * 60 * 60 * 1e3;
function texto3(v) {
  return typeof v === "string" ? v.trim() : "";
}
function assinaturaValida(s) {
  return typeof s === "string" && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(s) && s.length <= 12e4;
}
function validarEntrega(body, exigeAssinatura) {
  const b = body && typeof body === "object" ? body : {};
  const material_id = Number(b.material_id);
  if (!Number.isInteger(material_id) || material_id <= 0) return { ok: false, erro: "Escolha o material." };
  const quantidade = Number(b.quantidade);
  if (!Number.isFinite(quantidade) || quantidade <= 0) return { ok: false, erro: "A quantidade precisa ser maior que zero." };
  const tomador_nome = texto3(b.tomador_nome);
  if (tomador_nome.length < 2 || tomador_nome.length > 80) return { ok: false, erro: "Informe quem est\xE1 recebendo (2 a 80 caracteres)." };
  const referencia = texto3(b.tomador_referencia);
  if (referencia.length > 40) return { ok: false, erro: "Refer\xEAncia longa demais (at\xE9 40 caracteres)." };
  const observacao = texto3(b.observacao);
  if (observacao.length > 300) return { ok: false, erro: "Observa\xE7\xE3o longa demais (at\xE9 300 caracteres)." };
  let assinatura = null;
  if (b.assinatura !== void 0 && b.assinatura !== null && b.assinatura !== "") {
    if (!assinaturaValida(b.assinatura)) return { ok: false, erro: "Assinatura inv\xE1lida." };
    assinatura = b.assinatura;
  }
  if (exigeAssinatura && !assinatura) return { ok: false, erro: "Este estoque exige a assinatura de quem recebe." };
  return {
    ok: true,
    entrega: {
      material_id,
      quantidade: Math.round(quantidade * 100) / 100,
      tomador_nome,
      tomador_referencia: referencia || null,
      observacao: observacao || null,
      assinatura
    }
  };
}
function validoAte(validadeTrocaDias, agora = /* @__PURE__ */ new Date()) {
  if (!validadeTrocaDias || validadeTrocaDias <= 0) return null;
  return new Date(agora.getTime() + validadeTrocaDias * DIA_MS);
}

// src/server/lotes.ts
var DIA_MS2 = 24 * 60 * 60 * 1e3;
function ordenarFefo(lotes) {
  return [...lotes].sort((a, b) => {
    if (a.validade === b.validade) return a.lote.localeCompare(b.lote);
    if (a.validade === null) return 1;
    if (b.validade === null) return -1;
    return a.validade < b.validade ? -1 : 1;
  });
}
function alocarSaida(lotes, quantidade, loteId) {
  const q = Math.round(Number(quantidade) * 100) / 100;
  if (!Number.isFinite(q) || q <= 0) return { ok: false, erro: "A quantidade precisa ser maior que zero." };
  const candidatos = loteId ? lotes.filter((l) => l.id === loteId) : ordenarFefo(lotes.filter((l) => Number(l.quantidade) > 0));
  if (loteId && candidatos.length === 0) return { ok: false, erro: "Lote n\xE3o encontrado neste estoque." };
  const disponivel = Math.round(candidatos.reduce((s, l) => s + Number(l.quantidade), 0) * 100) / 100;
  if (disponivel < q) {
    return { ok: false, erro: loteId ? `O lote ${candidatos[0].lote} tem s\xF3 ${disponivel}.` : `Saldo insuficiente: h\xE1 ${disponivel} somando todos os lotes.` };
  }
  const consumos = [];
  let falta = q;
  for (const l of candidatos) {
    if (falta <= 0) break;
    const tira = Math.min(Number(l.quantidade), falta);
    if (tira <= 0) continue;
    consumos.push({ id: l.id, lote: l.lote, quantidade: Math.round(tira * 100) / 100 });
    falta = Math.round((falta - tira) * 100) / 100;
  }
  return { ok: true, consumos };
}
function descreverConsumos(consumos) {
  return consumos.map((c) => `${c.lote} (${c.quantidade})`).join(", ");
}
var DATA = /^\d{4}-\d{2}-\d{2}$/;
function validarLote(body) {
  const b = body && typeof body === "object" ? body : {};
  const lote = typeof b.lote === "string" ? b.lote.trim() : "";
  if (lote.length < 1 || lote.length > 60) return { ok: false, erro: "Informe o lote (at\xE9 60 caracteres)." };
  let validade = null;
  if (b.validade !== void 0 && b.validade !== null && b.validade !== "") {
    const v = String(b.validade);
    if (!DATA.test(v) || Number.isNaN((/* @__PURE__ */ new Date(`${v}T00:00:00`)).getTime())) return { ok: false, erro: "Validade inv\xE1lida: use AAAA-MM-DD." };
    validade = v;
  }
  return { ok: true, lote: { lote, validade } };
}

// src/server/patrimonio.ts
function texto4(v) {
  return typeof v === "string" ? v.trim() : "";
}
var DATA2 = /^\d{4}-\d{2}-\d{2}$/;
function validarItem(body) {
  const b = body && typeof body === "object" ? body : {};
  const material_id = Number(b.material_id);
  if (!Number.isInteger(material_id) || material_id <= 0) return { ok: false, erro: "Escolha o modelo (material)." };
  const codigo = texto4(b.codigo);
  if (codigo.length < 1 || codigo.length > 40) return { ok: false, erro: "Informe o n\xFAmero de patrim\xF4nio (at\xE9 40 caracteres)." };
  const serie = texto4(b.serie);
  if (serie.length > 80) return { ok: false, erro: "S\xE9rie longa demais (at\xE9 80 caracteres)." };
  const local = texto4(b.local);
  if (local.length > 80) return { ok: false, erro: "Local longo demais (at\xE9 80 caracteres)." };
  const observacao = texto4(b.observacao);
  if (observacao.length > 300) return { ok: false, erro: "Observa\xE7\xE3o longa demais (at\xE9 300 caracteres)." };
  let adquirido_em = null;
  if (b.adquirido_em !== void 0 && b.adquirido_em !== null && b.adquirido_em !== "") {
    const v = String(b.adquirido_em);
    if (!DATA2.test(v)) return { ok: false, erro: "Data de aquisi\xE7\xE3o inv\xE1lida: use AAAA-MM-DD." };
    adquirido_em = v;
  }
  let valor = null;
  if (b.valor !== void 0 && b.valor !== null && b.valor !== "") {
    valor = Number(b.valor);
    if (!Number.isFinite(valor) || valor < 0) return { ok: false, erro: "Valor inv\xE1lido." };
    valor = Math.round(valor * 100) / 100;
  }
  return { ok: true, item: { material_id, codigo, serie: serie || null, local: local || null, observacao: observacao || null, adquirido_em, valor } };
}
var TRANSICOES = {
  alocacao: { de: ["disponivel"], para: "em_uso" },
  devolucao: { de: ["em_uso"], para: "disponivel" },
  manutencao: { de: ["disponivel", "em_uso"], para: "manutencao" },
  retorno: { de: ["manutencao"], para: "disponivel" },
  baixa: { de: ["disponivel", "em_uso", "manutencao"], para: "baixado" }
};
var EVENTOS = ["alocacao", "devolucao", "manutencao", "retorno", "baixa"];
function ehEvento(s) {
  return typeof s === "string" && EVENTOS.includes(s);
}
var NOME = { disponivel: "dispon\xEDvel", em_uso: "em uso", manutencao: "em manuten\xE7\xE3o", baixado: "baixado" };
function transicionar(estadoAtual, evento) {
  const t = TRANSICOES[evento];
  if (!t.de.includes(estadoAtual)) {
    if (estadoAtual === "baixado") return { ok: false, erro: "Item baixado n\xE3o muda mais de estado." };
    return { ok: false, erro: `Um item ${NOME[estadoAtual]} n\xE3o pode receber "${evento}".` };
  }
  return { ok: true, para: t.para };
}
function validarEvento(body) {
  const b = body && typeof body === "object" ? body : {};
  if (!ehEvento(b.tipo)) return { ok: false, erro: "Evento inv\xE1lido." };
  const para_nome = texto4(b.para_nome);
  const para_referencia = texto4(b.para_referencia);
  const detalhe = texto4(b.detalhe);
  if (b.tipo === "alocacao" && (para_nome.length < 2 || para_nome.length > 80)) return { ok: false, erro: "Informe para quem o item vai (2 a 80 caracteres)." };
  if (para_referencia.length > 40) return { ok: false, erro: "Refer\xEAncia longa demais (at\xE9 40 caracteres)." };
  if (detalhe.length > 300) return { ok: false, erro: "Detalhe longo demais (at\xE9 300 caracteres)." };
  return {
    ok: true,
    evento: { tipo: b.tipo, para_nome: b.tipo === "alocacao" ? para_nome : null, para_referencia: b.tipo === "alocacao" ? para_referencia || null : null, detalhe: detalhe || null }
  };
}

// src/shared/planos.ts
var PLANOS = ["essencial", "profissional", "empresarial"];
var DEFINICOES = {
  essencial: {
    id: "essencial",
    nome: "Essencial",
    preco: 199.9,
    publico: "Pequenas opera\xE7\xF5es",
    limites: { unidades: 1, depositosPorUnidade: 1, usuarios: 3 },
    recursos: [],
    niveis: { auditoria: "B\xE1sica", alertas: "B\xE1sicos", dashboard: "B\xE1sico", relatorios: "B\xE1sicos", permissoes: "B\xE1sicas", suporte: "Normal" },
    destaques: ["1 unidade, 1 dep\xF3sito", "At\xE9 3 usu\xE1rios", "Materiais, categorias e estoque m\xEDnimo", "Entradas, sa\xEDdas e hist\xF3rico", "Alertas na tela e lista de compras", "Sistema de chamados"],
    servicos: []
  },
  profissional: {
    id: "profissional",
    nome: "Profissional",
    preco: 399.9,
    publico: "Empresas em expans\xE3o",
    limites: { unidades: 2, depositosPorUnidade: 3, usuarios: 10 },
    recursos: ["transferencia", "identidade-visual", "exportacoes", "alertas-por-email"],
    niveis: { auditoria: "Completa", alertas: "Completos", dashboard: "Completo", relatorios: "Completos", permissoes: "Por dep\xF3sito", suporte: "Priorit\xE1rio" },
    destaques: ["2 unidades, 3 dep\xF3sitos em cada", "At\xE9 10 usu\xE1rios", "Transfer\xEAncia entre dep\xF3sitos", "Auditoria em PDF e exporta\xE7\xF5es", "Alertas por e-mail", "Logo e cor da sua empresa", "WhatsApp opcional"],
    servicos: ["Implanta\xE7\xE3o assistida", "Suporte priorit\xE1rio"]
  },
  empresarial: {
    id: "empresarial",
    nome: "Empresarial",
    preco: 999.9,
    publico: "Opera\xE7\xF5es maiores",
    limites: { unidades: 4, depositosPorUnidade: null, usuarios: null },
    recursos: ["transferencia", "identidade-visual", "exportacoes", "alertas-por-email", "relatorios-automaticos", "whatsapp"],
    niveis: { auditoria: "Avan\xE7ada", alertas: "Autom\xE1ticos", dashboard: "Avan\xE7ado", relatorios: "Avan\xE7ados", permissoes: "Avan\xE7adas", suporte: "Prioridade m\xE1xima" },
    destaques: ["4 unidades, dep\xF3sitos ilimitados*", "Usu\xE1rios ilimitados*", "Tudo do Profissional", "WhatsApp inclu\xEDdo", "Relat\xF3rios autom\xE1ticos", "Personaliza\xE7\xE3o completa", "Acesso antecipado a novos m\xF3dulos"],
    servicos: ["Implanta\xE7\xE3o e treinamento da equipe", "Acompanhamento dedicado", "Prioridade m\xE1xima no suporte"]
  }
};
var CICLOS = ["mensal", "anual"];
var AVALIACAO_DIAS = 7;
var CARENCIA_DIAS = 2;
var MESES_GRATIS_NO_ANUAL = 2;
function precoDo(plano, ciclo) {
  const mensal = DEFINICOES[plano].preco;
  return ciclo === "anual" ? Math.round(mensal * (12 - MESES_GRATIS_NO_ANUAL) * 100) / 100 : mensal;
}
var NOME_DO_CICLO = { mensal: "Mensal", anual: "Anual" };
var MP_PLANO_ID = {
  essencial: { mensal: "80d0a2509b3747b29c6ac81861ff32dd", anual: null },
  profissional: { mensal: "146fe762b8a6479c91eb942920b6d2ce", anual: null },
  empresarial: { mensal: "2aa62da2af554e63806660ac1aa7c145", anual: null }
};
var MP_PLANO_DE_TESTE = "d498ce9708594fec89331933d452b488";
function planoDoMpPlanId(planId, modoTeste2 = false) {
  if (!planId) return null;
  if (modoTeste2 && planId === MP_PLANO_DE_TESTE) return { plano: "essencial", ciclo: "mensal" };
  for (const plano of PLANOS) for (const ciclo of CICLOS) if (MP_PLANO_ID[plano][ciclo] === planId) return { plano, ciclo };
  return null;
}
var DIA_MS3 = 24 * 60 * 60 * 1e3;
function dias(ate, agora) {
  return Math.max(0, Math.ceil((ate.getTime() - agora.getTime()) / DIA_MS3));
}
function situacaoDaConta(c, agora = /* @__PURE__ */ new Date()) {
  if (ehPlano(c.plano)) {
    if (!c.plano_ate) return { situacao: "assinada", plano: c.plano, ate: null, dias_restantes: null };
    const vence = new Date(c.plano_ate);
    if (vence.getTime() >= agora.getTime()) return { situacao: "assinada", plano: c.plano, ate: vence.toISOString(), dias_restantes: dias(vence, agora) };
    const fimDaCarencia = new Date(vence.getTime() + CARENCIA_DIAS * DIA_MS3);
    if (fimDaCarencia.getTime() >= agora.getTime()) return { situacao: "carencia", plano: c.plano, ate: fimDaCarencia.toISOString(), dias_restantes: dias(fimDaCarencia, agora) };
    return { situacao: "bloqueada", plano: "avaliacao", ate: fimDaCarencia.toISOString(), dias_restantes: 0 };
  }
  if (c.avaliacao_ate) {
    const fim = new Date(c.avaliacao_ate);
    if (fim.getTime() >= agora.getTime()) return { situacao: "avaliacao", plano: "avaliacao", ate: fim.toISOString(), dias_restantes: dias(fim, agora) };
    return { situacao: "bloqueada", plano: "avaliacao", ate: fim.toISOString(), dias_restantes: 0 };
  }
  return { situacao: "avaliacao", plano: "avaliacao", ate: null, dias_restantes: null };
}
var NOME_DO_PLANO = { essencial: "Essencial", profissional: "Profissional", empresarial: "Empresarial", avaliacao: "Avalia\xE7\xE3o" };
function ehPlano(s) {
  return typeof s === "string" && PLANOS.includes(s);
}
function definicaoDe(plano) {
  return DEFINICOES[plano === "avaliacao" ? "empresarial" : plano];
}
function planoLibera(plano, recurso) {
  return definicaoDe(plano).recursos.includes(recurso);
}
function limiteDo(plano, limite) {
  return definicaoDe(plano).limites[limite];
}
function cabeMaisUm(plano, limite, atual) {
  const max = limiteDo(plano, limite);
  return max === null || atual < max;
}
function planoMinimoPara(recurso) {
  return PLANOS.find((p2) => DEFINICOES[p2].recursos.includes(recurso)) ?? "empresarial";
}
function planoMinimoParaLimite(limite, necessario) {
  return PLANOS.find((p2) => cabeMaisUm(p2, limite, necessario - 1)) ?? null;
}
var ROTULO_DO_LIMITE = {
  unidades: ["unidade", "unidades"],
  depositosPorUnidade: ["dep\xF3sito por unidade", "dep\xF3sitos por unidade"],
  usuarios: ["usu\xE1rio", "usu\xE1rios"]
};
function descreverLimite(limite, valor) {
  const [um, varios] = ROTULO_DO_LIMITE[limite];
  if (valor === null) return `${varios} ilimitados`;
  return `${valor} ${valor === 1 ? um : varios}`;
}
function mensagemDeRecurso(recurso) {
  const nome = NOME_DO_PLANO[planoMinimoPara(recurso)];
  const oque = {
    transferencia: "Transfer\xEAncia entre dep\xF3sitos",
    "identidade-visual": "Logo e cor da empresa",
    exportacoes: "Exporta\xE7\xE3o de relat\xF3rios",
    "alertas-por-email": "Alertas por e-mail",
    "relatorios-automaticos": "Relat\xF3rios autom\xE1ticos",
    whatsapp: "Avisos por WhatsApp"
  };
  return `${oque[recurso]}: dispon\xEDvel a partir do plano ${nome}.`;
}
function mensagemDeLimite(plano, limite) {
  const max = limiteDo(plano, limite);
  const proximo = max === null ? null : planoMinimoParaLimite(limite, max + 1);
  const sufixo = proximo ? ` Para mais, o plano ${NOME_DO_PLANO[proximo]}.` : " Para mais, fale com a gente (Enterprise).";
  return `O plano ${NOME_DO_PLANO[plano]} inclui ${descreverLimite(limite, max)}.${sufixo}`;
}

// src/server/planos.ts
var CACHE_MS = 6e4;
var cache = /* @__PURE__ */ new Map();
async function contaDaOrg(organizationId, agora = Date.now()) {
  const c = cache.get(organizationId);
  if (c && c.ate > agora) return c.conta;
  const { data, error } = await supabaseServer.from("organizations").select("plano, plano_ate, avaliacao_ate").eq("id", organizationId).maybeSingle();
  if (error) throw error;
  const conta = situacaoDaConta({ plano: data?.plano ?? null, plano_ate: data?.plano_ate ?? null, avaliacao_ate: data?.avaliacao_ate ?? null }, new Date(agora));
  cache.set(organizationId, { conta, ate: agora + CACHE_MS });
  return conta;
}
function esquecerPlano(organizationId) {
  cache.delete(organizationId);
}
function negarRecurso(plano, recurso) {
  if (planoLibera(plano, recurso)) return null;
  return { status: 402, body: { error: mensagemDeRecurso(recurso), plano, plano_minimo: planoMinimoPara(recurso) } };
}
function negarLimite(plano, limite, atual) {
  if (cabeMaisUm(plano, limite, atual)) return null;
  return { status: 402, body: { error: mensagemDeLimite(plano, limite), plano, plano_minimo: null } };
}

// src/server/mercadopago.ts
import { createHmac, timingSafeEqual } from "node:crypto";
var API = "https://api.mercadopago.com";
var CHECKOUT_DE_PLANO = "https://www.mercadopago.com.br/subscriptions/checkout";
function modoTeste(env = process.env) {
  return env.MP_MODO_TESTE === "1";
}
function mpConfigurado(env = process.env) {
  return Boolean(env.MP_ACCESS_TOKEN);
}
function siteUrl(env) {
  return (env.SITE_URL || env.VITE_SITE_URL || "https://stokai.app").replace(/\/+$/, "");
}
function urlDeRetorno(env = process.env) {
  return `${siteUrl(env)}/assinatura/retorno`;
}
function mpPlanId(plano, ciclo, env = process.env) {
  if (modoTeste(env) && plano === "essencial" && ciclo === "mensal") return MP_PLANO_DE_TESTE;
  return MP_PLANO_ID[plano][ciclo];
}
function urlDoCheckoutDoPlano(planId, organizationId) {
  const q = new URLSearchParams({ preapproval_plan_id: planId, external_reference: organizationId });
  return `${CHECKOUT_DE_PLANO}?${q.toString()}`;
}
function motivo(plano, ciclo) {
  return `Stok A\xED \u2014 ${DEFINICOES[plano].nome} (${NOME_DO_CICLO[ciclo].toLowerCase()})`;
}
function corpoDaAssinatura(args) {
  const env = args.env ?? process.env;
  return {
    reason: motivo(args.plano, args.ciclo),
    external_reference: args.organizationId,
    payer_email: args.payerEmail,
    auto_recurring: {
      frequency: args.ciclo === "anual" ? 12 : 1,
      frequency_type: "months",
      transaction_amount: precoDo(args.plano, args.ciclo),
      currency_id: "BRL"
    },
    back_url: urlDeRetorno(env),
    status: "pending"
  };
}
async function mp(caminho, init = {}, env = process.env) {
  if (!env.MP_ACCESS_TOKEN) throw new Error("MP_ACCESS_TOKEN n\xE3o configurado.");
  const r = await fetch(`${API}${caminho}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`, "Content-Type": "application/json", ...init.headers }
  });
  const texto5 = await r.text();
  let corpo = null;
  try {
    corpo = texto5 ? JSON.parse(texto5) : null;
  } catch {
    corpo = { raw: texto5 };
  }
  if (!r.ok) {
    const msg = corpo?.message || corpo?.error || `HTTP ${r.status}`;
    throw new Error(`Mercado Pago ${init.method ?? "GET"} ${caminho}: ${msg}`);
  }
  return corpo;
}
function criarAssinaturaSemPlano(args) {
  return mp("/preapproval", { method: "POST", body: JSON.stringify(corpoDaAssinatura(args)) });
}
function buscarAssinatura(id) {
  return mp(`/preapproval/${encodeURIComponent(id)}`);
}
function cancelarAssinatura(id) {
  return mp(`/preapproval/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) });
}
function buscarPagamentoAutorizado(id) {
  return mp(`/authorized_payments/${encodeURIComponent(id)}`);
}
function assinaturaDoWebhookValida(args) {
  if (!args.secret) return null;
  if (!args.xSignature || !args.dataId) return false;
  const partes = Object.fromEntries(
    args.xSignature.split(",").map((p2) => {
      const i = p2.indexOf("=");
      return [p2.slice(0, i).trim(), p2.slice(i + 1).trim()];
    })
  );
  const ts = partes.ts;
  const v1 = partes.v1;
  if (!ts || !v1) return false;
  const id = /^[a-zA-Z0-9]+$/.test(args.dataId) ? args.dataId.toLowerCase() : args.dataId;
  const manifesto = `id:${id};${args.xRequestId ? `request-id:${args.xRequestId};` : ""}ts:${ts};`;
  const esperado = createHmac("sha256", args.secret).update(manifesto).digest("hex");
  const a = Buffer.from(esperado);
  const b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}
function idDoEvento(body, query) {
  const q = query["data.id"] ?? query["id"];
  const v = body?.data?.id ?? q;
  return v === void 0 || v === null || v === "" ? null : String(v);
}
function tipoDoEvento(body, query) {
  return String(body?.type ?? query["type"] ?? query["topic"] ?? "");
}

// src/server/assinaturas.ts
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function traduzirStatus(s) {
  switch (s) {
    case "authorized":
      return "autorizada";
    case "paused":
      return "pausada";
    case "cancelled":
      return "cancelada";
    default:
      return "pendente";
  }
}
function traduzirPagamento(ap) {
  const p2 = ap.payment?.status;
  const detalhe = ap.payment?.status_detail ?? null;
  if (ap.status === "scheduled") return { status: "agendado", detalhe };
  if (ap.status === "cancelled") return { status: "cancelado", detalhe };
  if (ap.status === "recycling") return { status: "pendente", detalhe: detalhe ?? "nova tentativa agendada" };
  switch (p2) {
    case "approved":
      return { status: "aprovado", detalhe };
    case "rejected":
      return { status: "recusado", detalhe };
    case "refunded":
    case "charged_back":
      return { status: "reembolsado", detalhe };
    case "cancelled":
      return { status: "cancelado", detalhe };
    default:
      return { status: "pendente", detalhe };
  }
}
function planoAteDe(pre, ciclo, agora = /* @__PURE__ */ new Date()) {
  if (pre.next_payment_date) return new Date(pre.next_payment_date).toISOString();
  const d = new Date(agora);
  d.setMonth(d.getMonth() + (ciclo === "anual" ? 12 : 1));
  return d.toISOString();
}
async function contaDe(organizationId) {
  const { data, error } = await supabaseServer.from("organizations").select("id, nome, slug, plano, plano_desde, plano_ate, avaliacao_ate").eq("id", organizationId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { organizacao: data, conta: situacaoDaConta(data) };
}
async function assinaturaAtual(organizationId) {
  const { data, error } = await supabaseServer.from("assinaturas").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(20);
  if (error) throw error;
  const lista = data || [];
  return lista.find((a) => a.status === "autorizada") ?? lista.find((a) => a.status === "pausada") ?? lista[0] ?? null;
}
async function pagamentosDe(organizationId, limite = 24) {
  const { data, error } = await supabaseServer.from("pagamentos").select("*").eq("organization_id", organizationId).order("data", { ascending: false }).limit(limite);
  if (error) throw error;
  return data || [];
}
async function iniciarAssinatura(args) {
  const atual = await assinaturaAtual(args.organizationId);
  if (atual && (atual.status === "autorizada" || atual.status === "pausada")) {
    if (!args.trocar) throw new ErroDeAssinatura(409, "Esta conta j\xE1 tem uma assinatura em vigor. Para mudar de plano, use a troca.");
    if (atual.mp_preapproval_id) await cancelarAssinatura(atual.mp_preapproval_id);
    await supabaseServer.from("assinaturas").update({ status: "cancelada", cancelada_em: (/* @__PURE__ */ new Date()).toISOString(), updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", atual.id);
  }
  await supabaseServer.from("assinaturas").delete().eq("organization_id", args.organizationId).eq("status", "pendente").is("mp_preapproval_id", null);
  const planId = mpPlanId(args.plano, args.ciclo);
  const base = { organization_id: args.organizationId, plano: args.plano, ciclo: args.ciclo, valor: precoDo(args.plano, args.ciclo), payer_email: args.payerEmail, status: "pendente" };
  if (planId) {
    const { data: data2, error: error2 } = await supabaseServer.from("assinaturas").insert({ ...base, mp_plan_id: planId }).select("*").single();
    if (error2) throw error2;
    return { url: urlDoCheckoutDoPlano(planId, args.organizationId), assinatura: data2 };
  }
  const pre = await criarAssinaturaSemPlano({ plano: args.plano, ciclo: args.ciclo, organizationId: args.organizationId, payerEmail: args.payerEmail });
  if (!pre.init_point) throw new Error("O Mercado Pago n\xE3o devolveu o link do checkout.");
  const { data, error } = await supabaseServer.from("assinaturas").insert({ ...base, mp_preapproval_id: pre.id }).select("*").single();
  if (error) throw error;
  return { url: pre.init_point, assinatura: data };
}
async function cancelarAssinatura2(organizationId) {
  const atual = await assinaturaAtual(organizationId);
  if (!atual || atual.status !== "autorizada" && atual.status !== "pausada") throw new ErroDeAssinatura(409, "N\xE3o h\xE1 assinatura em vigor para cancelar.");
  if (atual.mp_preapproval_id) await cancelarAssinatura(atual.mp_preapproval_id);
  const { data, error } = await supabaseServer.from("assinaturas").update({ status: "cancelada", cancelada_em: (/* @__PURE__ */ new Date()).toISOString(), updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", atual.id).select("*").single();
  if (error) throw error;
  esquecerPlano(organizationId);
  return data;
}
var ErroDeAssinatura = class extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
};
async function organizacaoExiste(id) {
  if (!id || !UUID.test(id)) return false;
  const { data } = await supabaseServer.from("organizations").select("id").eq("id", id).maybeSingle();
  return Boolean(data);
}
async function acharDona(pre, sugerida) {
  const { data: existente } = await supabaseServer.from("assinaturas").select("*").eq("mp_preapproval_id", pre.id).maybeSingle();
  if (existente) return { organizationId: existente.organization_id, intencao: existente };
  const candidatas = [sugerida, pre.external_reference].filter((x) => Boolean(x));
  for (const id of candidatas) {
    if (await organizacaoExiste(id)) {
      const { data: intencao } = await supabaseServer.from("assinaturas").select("*").eq("organization_id", id).eq("status", "pendente").is("mp_preapproval_id", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
      return { organizationId: id, intencao: intencao ?? null };
    }
  }
  if (pre.payer_email) {
    const { data: intencao } = await supabaseServer.from("assinaturas").select("*").eq("status", "pendente").is("mp_preapproval_id", null).ilike("payer_email", pre.payer_email).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (intencao) return { organizationId: intencao.organization_id, intencao };
  }
  return null;
}
async function aplicarPreapproval(pre, opcoes = {}) {
  const dona = await acharDona(pre, opcoes.organizationId);
  if (!dona) return { casou: false, organizationId: null, assinatura: null, motivo: "nenhuma organiza\xE7\xE3o corresponde (sem external_reference, inten\xE7\xE3o ou e-mail)" };
  if (opcoes.organizationId && dona.organizationId !== opcoes.organizationId) {
    return { casou: false, organizationId: dona.organizationId, assinatura: null, motivo: "a assinatura pertence a outra organiza\xE7\xE3o" };
  }
  const doPainel = planoDoMpPlanId(pre.preapproval_plan_id, modoTeste());
  const plano = doPainel?.plano ?? dona.intencao?.plano ?? null;
  const ciclo = doPainel?.ciclo ?? dona.intencao?.ciclo ?? (pre.auto_recurring?.frequency === 12 ? "anual" : "mensal");
  if (!ehPlano(plano)) return { casou: false, organizationId: dona.organizationId, assinatura: null, motivo: `plano do MP desconhecido (${pre.preapproval_plan_id ?? "sem plano"})` };
  const agora = (/* @__PURE__ */ new Date()).toISOString();
  const status = traduzirStatus(pre.status);
  const campos = {
    organization_id: dona.organizationId,
    plano,
    ciclo,
    valor: pre.auto_recurring?.transaction_amount ?? precoDo(plano, ciclo),
    mp_preapproval_id: pre.id,
    mp_plan_id: pre.preapproval_plan_id ?? null,
    status,
    payer_email: pre.payer_email ?? dona.intencao?.payer_email ?? null,
    proxima_cobranca: pre.next_payment_date ?? null,
    autorizada_em: status === "autorizada" ? dona.intencao?.autorizada_em ?? agora : dona.intencao?.autorizada_em ?? null,
    cancelada_em: status === "cancelada" ? dona.intencao?.cancelada_em ?? agora : null,
    updated_at: agora
  };
  let assinatura;
  if (dona.intencao) {
    const { data, error } = await supabaseServer.from("assinaturas").update(campos).eq("id", dona.intencao.id).select("*").single();
    if (error) throw error;
    assinatura = data;
  } else {
    const { data, error } = await supabaseServer.from("assinaturas").insert(campos).select("*").single();
    if (error) throw error;
    assinatura = data;
  }
  if (status === "autorizada") {
    await supabaseServer.from("assinaturas").update({ status: "cancelada", cancelada_em: agora, updated_at: agora }).eq("organization_id", dona.organizationId).eq("status", "autorizada").neq("id", assinatura.id);
    const { data: org } = await supabaseServer.from("organizations").select("plano_desde").eq("id", dona.organizationId).maybeSingle();
    await supabaseServer.from("organizations").update({ plano, plano_desde: org?.plano_desde ?? agora, plano_ate: planoAteDe(pre, ciclo) }).eq("id", dona.organizationId);
  }
  esquecerPlano(dona.organizationId);
  return { casou: true, organizationId: dona.organizationId, assinatura };
}
async function aplicarPagamentoAutorizado(ap) {
  let { data: assinatura } = await supabaseServer.from("assinaturas").select("*").eq("mp_preapproval_id", ap.preapproval_id).maybeSingle();
  if (!assinatura) {
    const pre = await buscarAssinatura(ap.preapproval_id);
    const r = await aplicarPreapproval(pre);
    if (!r.casou) return r;
    assinatura = r.assinatura;
  }
  const a = assinatura;
  const { status, detalhe } = traduzirPagamento(ap);
  const agora = (/* @__PURE__ */ new Date()).toISOString();
  const campos = {
    organization_id: a.organization_id,
    assinatura_id: a.id,
    mp_authorized_payment_id: String(ap.id),
    mp_payment_id: ap.payment?.id != null ? String(ap.payment.id) : null,
    status,
    valor: ap.transaction_amount ?? a.valor,
    moeda: ap.currency_id ?? "BRL",
    detalhe,
    data: ap.debit_date ?? ap.date_created ?? agora,
    updated_at: agora
  };
  const { error } = await supabaseServer.from("pagamentos").upsert(campos, { onConflict: "mp_authorized_payment_id" });
  if (error) throw error;
  if (status === "aprovado") {
    const pre = await buscarAssinatura(ap.preapproval_id);
    await supabaseServer.from("assinaturas").update({ proxima_cobranca: pre.next_payment_date ?? null, status: traduzirStatus(pre.status), updated_at: agora }).eq("id", a.id);
    await supabaseServer.from("organizations").update({ plano: a.plano, plano_ate: planoAteDe(pre, a.ciclo) }).eq("id", a.organization_id);
    esquecerPlano(a.organization_id);
  }
  return { casou: true, organizationId: a.organization_id, assinatura: a };
}
async function tratarEvento(tipo, id) {
  if (tipo === "subscription_preapproval") return aplicarPreapproval(await buscarAssinatura(id));
  if (tipo === "subscription_authorized_payment") return aplicarPagamentoAutorizado(await buscarPagamentoAutorizado(id));
  return { ignorado: true };
}
async function registrarEvento(args) {
  try {
    await supabaseServer.from("mp_eventos").insert({ tipo: args.tipo, mp_id: args.mpId, organization_id: args.organizationId, tratado: args.tratado, erro: args.erro, payload: args.payload ?? null });
  } catch (e) {
    console.error("[mp_eventos] n\xE3o gravou:", e.message);
  }
}

// src/server/mail.ts
function configuracaoSmtp(env = process.env) {
  const brevo = Boolean(env.BREVO_SMTP_LOGIN && env.BREVO_SMTP_KEY);
  const host = env.SMTP_HOST || (brevo ? "smtp-relay.brevo.com" : "");
  const user = env.SMTP_USER || env.BREVO_SMTP_LOGIN || "";
  const pass = env.SMTP_PASS || env.BREVO_SMTP_KEY || "";
  if (!host || !user || !pass) return null;
  const port = Number(env.SMTP_PORT) || (env.SMTP_HOST ? 465 : 2525);
  return { host, port, secure: port === 465, auth: { user, pass } };
}
function remetente(env = process.env) {
  return env.SMTP_FROM_EMAIL || env.SMTP_USER || "noreply@stokai.app";
}
function destinatarioAdmin(env = process.env) {
  return env.ADMIN_EMAIL || remetente(env);
}
function destinatarioDemo(env = process.env) {
  return env.DEMO_EMAIL || destinatarioAdmin(env);
}

// src/server/senha.ts
import { createHash, randomBytes } from "node:crypto";
var VALIDADE_DO_TOKEN_MS = 60 * 60 * 1e3;
var MIN_SENHA = 8;
var MAX_SENHA = 200;
function siteUrl2(env = process.env) {
  return (env.SITE_URL || env.VITE_SITE_URL || "https://stokai.app").replace(/\/+$/, "");
}
function gerarToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashDoToken(token) };
}
function hashDoToken(token) {
  return createHash("sha256").update(token).digest("hex");
}
function tokenPlausivel(token) {
  return typeof token === "string" && /^[A-Za-z0-9_-]{40,50}$/.test(token);
}
function tokenValido(registro, agora = /* @__PURE__ */ new Date()) {
  if (registro.used_at) return false;
  return new Date(registro.expires_at).getTime() > agora.getTime();
}
function validarNovaSenha(senha) {
  if (typeof senha !== "string") return "Informe a nova senha.";
  if (senha.length < MIN_SENHA) return `A senha deve ter pelo menos ${MIN_SENHA} caracteres.`;
  if (senha.length > MAX_SENHA) return "Senha longa demais.";
  return null;
}
function linkDeRedefinicao(token, env) {
  return `${siteUrl2(env)}/redefinir-senha?token=${encodeURIComponent(token)}`;
}
function primeiroNome(nome) {
  return nome.trim().split(/\s+/)[0] || nome;
}
function emailDeRecuperacao(nome, link) {
  return {
    subject: "Redefinir sua senha do Stok A\xED",
    html: layoutEmail({
      titulo: `Ol\xE1, ${escapeHtml(primeiroNome(nome))}.`,
      corpo: p("Recebemos um pedido para redefinir a senha da sua conta. O bot\xE3o abaixo vale por <strong>1 hora</strong> e funciona uma vez s\xF3."),
      botao: { rotulo: "Criar nova senha", url: link },
      observacao: "Se voc\xEA n\xE3o pediu isso, pode ignorar este e-mail \u2014 sua senha continua a mesma."
    })
  };
}
function emailDeBoasVindas(nome, empresa, env) {
  const base = siteUrl2(env);
  return {
    subject: `Bem-vindo(a) ao Stok A\xED, ${primeiroNome(nome)}`,
    html: layoutEmail({
      titulo: `${escapeHtml(empresa)} est\xE1 no ar.`,
      corpo: p(`Ol\xE1, ${escapeHtml(primeiroNome(nome))}. A conta da <strong>${escapeHtml(empresa)}</strong> foi criada e voc\xEA \xE9 o administrador. Ela j\xE1 vem com uma unidade e dois dep\xF3sitos (Central e Obra) prontos.`) + p("Por onde come\xE7ar:") + `<ol style="margin:0 0 12px;padding-left:20px"><li style="margin-bottom:6px"><strong>Materiais</strong> \u2014 cadastre o que a empresa controla, com unidade de medida e estoque m\xEDnimo.</li><li style="margin-bottom:6px"><strong>Usu\xE1rios</strong> \u2014 crie o acesso de quem opera cada dep\xF3sito.</li><li style="margin-bottom:6px"><strong>Movimenta\xE7\xF5es</strong> \u2014 registre entradas, remessas e consumos; o painel faz o resto.</li></ol>` + p(`Voc\xEA entra com este e-mail em <a href="${escapeHtml(base)}/entrar" style="color:${PRODUTO.cor}">${escapeHtml(base.replace(/^https?:\/\//, ""))}/entrar</a>. Esqueceu a senha? Tem "Esqueci minha senha" na tela de login.`),
      botao: { rotulo: "Abrir o Stok A\xED", url: `${base}/entrar` },
      observacao: "D\xFAvida, sugest\xE3o ou algo que n\xE3o funcionou? Responda este e-mail ou chame no WhatsApp \u2014 quem responde \xE9 gente."
    })
  };
}
function emailDeNovaEmpresa(dados) {
  return {
    subject: `Nova empresa no Stok A\xED: ${dados.empresa}`,
    html: layoutEmail({
      titulo: "Nova conta criada",
      corpo: p(`<strong>${escapeHtml(dados.nome)}</strong> acabou de criar a conta da <strong>${escapeHtml(dados.empresa)}</strong> sozinho(a), pela Home.`) + tabela([
        ["E-mail", dados.email],
        ["Slug", dados.slug],
        ["IP", dados.ip ?? null]
      ]) + p("Vale um oi nas pr\xF3ximas 24 horas: \xE9 quando a pessoa decide se o produto entra na rotina.")
    })
  };
}

// src/server/estoque.ts
var MODOS = ["almoxarifado", "emprestimo", "entrega", "validade", "patrimonio"];
var TODAS_AS_OPERACOES = ["ENTRADA", "SAIDA", "CONSUMO", "TRANSFERENCIA", "AJUSTE"];
var OPERACOES = {
  ENTRADA: { lado: "destino", rotulo: "esta entrada" },
  SAIDA: { lado: "origem", rotulo: "esta sa\xEDda" },
  CONSUMO: { lado: "origem", rotulo: "este consumo" },
  AJUSTE: { lado: "destino", ajuste: true, rotulo: "este ajuste" },
  TRANSFERENCIA: { lado: "origem", precisaDestino: true, rotulo: "esta transfer\xEAncia" }
};
function ehOperacaoGenerica(s) {
  return typeof s === "string" && s in OPERACOES;
}
function validarEstoque(body) {
  const b = body && typeof body === "object" ? body : {};
  const nome = typeof b.nome === "string" ? b.nome.trim() : "";
  if (nome.length < 2 || nome.length > 60) return { ok: false, erro: "Informe o nome do estoque (2 a 60 caracteres)." };
  const modo = typeof b.modo === "string" ? b.modo : "almoxarifado";
  if (!MODOS.includes(modo)) return { ok: false, erro: "Modo de estoque inv\xE1lido." };
  let prazo = null;
  if (modo === "emprestimo") {
    prazo = Number(b.prazo_padrao_horas ?? 2);
    if (!Number.isInteger(prazo) || prazo < 1 || prazo > 8760) return { ok: false, erro: "O prazo padr\xE3o deve ser de 1 a 8760 horas." };
  }
  let operacoes = null;
  if (modo === "almoxarifado" && Array.isArray(b.operacoes_permitidas)) {
    const lista = [...new Set(b.operacoes_permitidas.map((x) => String(x)))];
    if (lista.length === 0) return { ok: false, erro: "Deixe pelo menos uma opera\xE7\xE3o ligada." };
    if (!lista.every(ehOperacaoGenerica)) return { ok: false, erro: "Opera\xE7\xE3o desconhecida na lista de permitidas." };
    operacoes = lista.length === TODAS_AS_OPERACOES.length ? null : lista;
  }
  const exige_assinatura = modo === "entrega" ? Boolean(b.exige_assinatura) : false;
  let dias_aviso_validade = 30;
  if (modo === "validade") {
    dias_aviso_validade = Number(b.dias_aviso_validade ?? 30);
    if (!Number.isInteger(dias_aviso_validade) || dias_aviso_validade < 1 || dias_aviso_validade > 365) return { ok: false, erro: "O aviso de validade deve ser de 1 a 365 dias." };
  }
  return { ok: true, nome, modo, prazo_padrao_horas: prazo, operacoes_permitidas: operacoes, exige_assinatura, dias_aviso_validade };
}
function operacaoPermitida(deposito, op) {
  return !deposito.operacoes_permitidas || deposito.operacoes_permitidas.includes(op);
}
function arredondar(n) {
  return Math.round(n * 100) / 100;
}
function calcularMovimento(atuais, p2) {
  const q = Number(p2.quantidade);
  if (!Number.isFinite(q)) return { ok: false, erro: "Quantidade inv\xE1lida." };
  if (!p2.ajuste && q <= 0) {
    return { ok: false, erro: "A quantidade precisa ser maior que zero." };
  }
  const novos = { ...atuais };
  const saldoDe = (id) => Number(novos[id] ?? 0);
  const tocados = [];
  if (p2.ajuste) {
    if (!p2.destino_id) return { ok: false, erro: "Ajuste sem dep\xF3sito de destino." };
    novos[p2.destino_id] = arredondar(saldoDe(p2.destino_id) + q);
    tocados.push(p2.destino_id);
  } else {
    if (!p2.origem_id && !p2.destino_id) {
      return { ok: false, erro: "Movimenta\xE7\xE3o sem origem nem destino." };
    }
    if (p2.origem_id) {
      if (q > saldoDe(p2.origem_id)) {
        return { ok: false, erro: `Saldo insuficiente em ${p2.nomeDe(p2.origem_id)} para ${p2.rotulo}.` };
      }
      novos[p2.origem_id] = arredondar(saldoDe(p2.origem_id) - q);
      tocados.push(p2.origem_id);
    }
    if (p2.destino_id) {
      novos[p2.destino_id] = arredondar(saldoDe(p2.destino_id) + q);
      tocados.push(p2.destino_id);
    }
  }
  for (const id of tocados) {
    if (novos[id] < 0) return { ok: false, erro: "A opera\xE7\xE3o resultaria em saldo negativo." };
  }
  return { ok: true, novos };
}
function acharDeposito(depositos, tipo) {
  const achados = depositos.filter((d) => d.tipo === tipo);
  if (achados.length === 0) {
    throw new Error(`N\xE3o h\xE1 dep\xF3sito ${tipo} cadastrado nesta organiza\xE7\xE3o.`);
  }
  if (achados.length > 1) {
    throw new Error(
      `H\xE1 ${achados.length} dep\xF3sitos ${tipo} nesta organiza\xE7\xE3o. A opera\xE7\xE3o precisa informar de qual dep\xF3sito se trata.`
    );
  }
  return achados[0];
}
function depositosDaUnidade(depositos, unitId) {
  if (unitId) {
    const daUnidade = depositos.filter((d) => d.unit_id === unitId);
    if (daUnidade.length === 0) throw new Error("Unidade sem dep\xF3sito cadastrado, ou inexistente.");
    return daUnidade;
  }
  const unidades = new Set(depositos.map((d) => d.unit_id));
  if (unidades.size > 1) {
    throw new Error("H\xE1 mais de uma unidade. A opera\xE7\xE3o precisa informar em qual unidade acontece.");
  }
  return depositos;
}
async function depositosDaOrg(db, opcoes = {}) {
  let q = db.from("warehouses").select("id, nome, tipo, unit_id, ativo, modo, prazo_padrao_horas, operacoes_permitidas, exige_assinatura, dias_aviso_validade, units!inner(ativo)").eq("ativo", true);
  if (!opcoes.incluirUnidadesInativas) q = q.eq("units.ativo", true);
  const { data, error } = await q.order("nome", { ascending: true });
  if (error) throw error;
  return (data || []).map(({ units, ...d }) => d);
}
async function unidadesDaOrg(db) {
  const { data, error } = await db.from("units").select("id, nome, slug, ativo").order("nome", { ascending: true });
  if (error) throw error;
  return data || [];
}
async function saldosDaOrg(db) {
  const porMaterial = /* @__PURE__ */ new Map();
  const PAGINA = 1e3;
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await db.from("stock_balances").select("material_id, warehouse_id, saldo").range(de, de + PAGINA - 1);
    if (error) throw error;
    for (const linha of data || []) {
      const atual = porMaterial.get(linha.material_id) || {};
      atual[linha.warehouse_id] = Number(linha.saldo);
      porMaterial.set(linha.material_id, atual);
    }
    if (!data || data.length < PAGINA) break;
  }
  return porMaterial;
}
async function saldosDoMaterial(db, materialId) {
  const { data, error } = await db.from("stock_balances").select("warehouse_id, saldo").eq("material_id", materialId);
  if (error) throw error;
  const saldos = {};
  for (const linha of data || []) saldos[linha.warehouse_id] = Number(linha.saldo);
  return saldos;
}
async function gravarSaldos(db, materialId, novos) {
  const linhas = Object.entries(novos).map(([warehouse_id, saldo]) => ({
    material_id: materialId,
    warehouse_id,
    saldo: arredondar(saldo),
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  }));
  if (linhas.length === 0) return;
  const { error } = await db.from("stock_balances").upsert(linhas, { onConflict: "warehouse_id,material_id" });
  if (error) throw error;
}
function totalDosDepositos(saldos) {
  return arredondar(Object.values(saldos).reduce((s, v) => s + Number(v), 0));
}

// src/server/acessos.ts
function ehAdmin(role) {
  return ADMIN_ROLES.includes(role);
}
async function acessosDoUsuario(db, userId, role) {
  if (ehAdmin(role)) return null;
  const { data, error } = await db.from("estoque_user_warehouses").select("warehouse_id, nivel").eq("user_id", userId);
  if (error) throw error;
  const mapa = /* @__PURE__ */ new Map();
  for (const a of data || []) mapa.set(a.warehouse_id, a.nivel);
  return mapa;
}
function podeVer(acessos, warehouseId) {
  return acessos === null || acessos.has(warehouseId);
}
function podeOperar(acessos, warehouseId) {
  return acessos === null || acessos.get(warehouseId) === "OPERA";
}

// src/server/app.ts
var ESTOQUE_USERS = "estoque_users";
var JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("[Server] JWT_SECRET n\xE3o definido \u2014 configure essa vari\xE1vel de ambiente antes de subir o servidor.");
}
var transporter = null;
async function getTransporter() {
  if (transporter) return transporter;
  const config = configuracaoSmtp();
  if (!config) return null;
  transporter = nodemailer.createTransport(config);
  return transporter;
}
var SUPABASE_PAGE_SIZE = 1e3;
async function fetchAllRows(buildQuery) {
  const all = [];
  let from = 0;
  for (; ; ) {
    const { data, error } = await buildQuery().range(from, from + SUPABASE_PAGE_SIZE - 1);
    if (error) throw error;
    const batch = data || [];
    all.push(...batch);
    if (batch.length < SUPABASE_PAGE_SIZE) break;
    from += SUPABASE_PAGE_SIZE;
  }
  return all;
}
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Token de acesso ausente." });
  try {
    const payload = jwt2.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Token inv\xE1lido ou expirado." });
  }
}
async function withTenant(req, res, next) {
  const organizationId = req.user?.organization_id;
  if (!organizationId) {
    return res.status(401).json({ error: "Sess\xE3o desatualizada. Entre novamente." });
  }
  req.db = scopedDb(organizationId);
  try {
    req.conta = await contaDaOrg(organizationId);
    req.plano = req.conta.plano;
  } catch (err) {
    console.error("[withTenant] conta:", err.message);
    return res.status(500).json({ error: "Erro ao carregar a organiza\xE7\xE3o." });
  }
  if (req.conta.situacao === "bloqueada" && !req.path.startsWith("/api/assinatura")) {
    return res.status(402).json({
      error: ehPlano(req.conta.plano) || req.conta.ate ? "Sua conta est\xE1 bloqueada. Assine um plano para continuar." : "Sua conta est\xE1 bloqueada.",
      bloqueada: true,
      conta: req.conta
    });
  }
  next();
}
async function withAcessos(req, res, next) {
  try {
    req.acessos = await acessosDoUsuario(req.db, req.user.id, req.user.role);
    next();
  } catch (err) {
    console.error("[withAcessos] erro:", err.message);
    res.status(500).json({ error: "Erro ao carregar permiss\xF5es." });
  }
}
function requireRole(allowed) {
  return (req, res, next) => {
    if (!req.user || !allowed.includes(req.user.role)) {
      return res.status(403).json({ error: "Voc\xEA n\xE3o tem permiss\xE3o para executar esta a\xE7\xE3o." });
    }
    next();
  };
}
async function verifyPassword(inputPassword, storedValue) {
  const looksHashed = /^\$2[aby]\$/.test(storedValue);
  if (looksHashed) {
    return bcrypt.compare(inputPassword, storedValue);
  }
  return inputPassword === storedValue;
}
var ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").map((o) => o.trim()).filter(Boolean);
function createApp() {
  const app = express();
  if (process.env.VERCEL || process.env.TRUST_PROXY === "true") {
    app.set("trust proxy", 1);
  }
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
      credentials: false
    })
  );
  app.use(express.json({ limit: "64kb" }));
  const loginAccountLimiter = rateLimit({
    windowMs: 15 * 60 * 1e3,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    // só conta tentativa que falhou
    // Roda depois do express.json(), então req.body já está disponível.
    keyGenerator: (req) => String(req.body?.matricula ?? "").trim().toLowerCase().slice(0, 120) || "sem-identificador",
    message: { error: "Muitas tentativas para esta conta. Aguarde 15 minutos e tente novamente." }
  });
  const loginIpLimiter = rateLimit({
    windowMs: 15 * 60 * 1e3,
    limit: 60,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { error: "Muitas tentativas de login a partir desta rede. Aguarde alguns minutos." }
  });
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1e3,
    limit: 600,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Muitas requisi\xE7\xF5es. Aguarde alguns minutos." }
  });
  app.use("/api/", apiLimiter);
  app.post("/api/login", loginIpLimiter, loginAccountLimiter, async (req, res) => {
    try {
      const { matricula, senha } = req.body || {};
      if (typeof matricula !== "string" || typeof senha !== "string" || !matricula || !senha) {
        return res.status(400).json({ error: "Informe matr\xEDcula e senha." });
      }
      const identificador = matricula.trim();
      if (identificador.length > 120 || /[,()"]/.test(identificador)) {
        console.warn("[Login] identificador rejeitado por conter caracteres de filtro", {
          ip: req.ip,
          tamanho: identificador.length
        });
        return res.status(401).json({ error: "Credenciais inv\xE1lidas." });
      }
      const { data: candidatas, error } = await supabaseServer.from(ESTOQUE_USERS).select("*").or(`matricula.eq.${identificador},email.eq.${identificador.toLowerCase()}`).eq("ativo", true).limit(10);
      if (error || !candidatas || candidatas.length === 0) {
        console.warn("[Login] falha: nenhuma conta para o identificador informado", {
          ip: req.ip,
          tamanho: identificador.length
        });
        return res.status(401).json({ error: "Credenciais inv\xE1lidas." });
      }
      const validas = [];
      for (const c of candidatas) {
        if (await verifyPassword(senha, c.senha)) validas.push(c);
      }
      if (validas.length === 0) {
        console.warn("[Login] falha: senha incorreta", { candidatas: candidatas.length, ip: req.ip });
        return res.status(401).json({ error: "Credenciais inv\xE1lidas." });
      }
      if (validas.length > 1) {
        console.error("[Login] amb\xEDguo: mesma credencial em mais de uma organiza\xE7\xE3o", { ip: req.ip });
        return res.status(401).json({ error: "Credenciais amb\xEDguas. Entre com o seu e-mail." });
      }
      const userRow = validas[0];
      const role = userRow.role || (String(userRow.matricula || "").startsWith("E") ? "OPERADOR" : null);
      if (!role || !ALL_INVENTORY_ROLES.includes(role)) {
        return res.status(403).json({ error: "Este usu\xE1rio n\xE3o tem acesso ao sistema de estoque." });
      }
      if (!userRow.organization_id) {
        console.error("[Login] conta sem organization_id", { matricula: userRow.matricula });
        return res.status(403).json({ error: "Conta sem organiza\xE7\xE3o vinculada. Procure a gest\xE3o." });
      }
      const authedUser = {
        id: userRow.id,
        nome: userRow.nome,
        matricula: userRow.matricula,
        role,
        organization_id: userRow.organization_id
      };
      try {
        const { error: acessoError } = await supabaseServer.from(ESTOQUE_USERS).update({ ultimo_acesso: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", userRow.id);
        if (acessoError) console.warn("[Login] n\xE3o foi poss\xEDvel gravar ultimo_acesso:", acessoError.message);
      } catch (acessoErr) {
        console.warn("[Login] n\xE3o foi poss\xEDvel gravar ultimo_acesso:", acessoErr?.message);
      }
      if (!/^\$2[aby]\$/.test(String(userRow.senha || ""))) {
        try {
          const hash = await bcrypt.hash(senha, 10);
          const { error: upgradeError } = await supabaseServer.from(ESTOQUE_USERS).update({ senha: hash, senha_alterada_em: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", userRow.id);
          if (upgradeError) {
            console.warn("[Login] falha ao proteger senha legada:", upgradeError.message);
          } else {
            console.info("[Login] senha legada convertida para bcrypt", { matricula: userRow.matricula });
          }
        } catch (upgradeErr) {
          console.warn("[Login] falha ao proteger senha legada:", upgradeErr?.message);
        }
      }
      const token = jwt2.sign(authedUser, JWT_SECRET, { expiresIn: "12h" });
      res.json({ user: authedUser, token });
    } catch (err) {
      console.error("[Login] erro:", err.message);
      res.status(500).json({ error: "Erro interno ao autenticar." });
    }
  });
  const signupLimiter = rateLimit({
    windowMs: 60 * 60 * 1e3,
    limit: 5,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Muitas contas criadas a partir desta rede. Tente novamente em uma hora." }
  });
  app.post("/api/signup", signupLimiter, async (req, res) => {
    try {
      const empresa = String(req.body?.empresa ?? "").trim();
      const nome = String(req.body?.nome ?? "").trim();
      const email = String(req.body?.email ?? "").trim().toLowerCase();
      const senha = String(req.body?.senha ?? "");
      if (empresa.length < 2 || empresa.length > 60) return res.status(400).json({ error: "Informe o nome da empresa (2 a 60 caracteres)." });
      if (nome.length < 2 || nome.length > 80) return res.status(400).json({ error: "Informe o seu nome (2 a 80 caracteres)." });
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 120) return res.status(400).json({ error: "Informe um e-mail v\xE1lido." });
      if (senha.length < MIN_PASSWORD_LENGTH) return res.status(400).json({ error: `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` });
      if (senha.length > 200) return res.status(400).json({ error: "Senha longa demais." });
      const hash = await bcrypt.hash(senha, 10);
      const { data, error } = await supabaseServer.rpc("criar_organizacao", {
        p_empresa: empresa,
        p_nome: nome,
        p_email: email,
        p_senha_hash: hash
      });
      if (error) {
        if (/Já existe uma conta/.test(error.message)) return res.status(409).json({ error: "J\xE1 existe uma conta com este e-mail. Entre com ela, ou use outro e-mail." });
        if (error.code === "23514" || /caracteres|inválido/.test(error.message)) return res.status(400).json({ error: error.message });
        throw error;
      }
      const criado = Array.isArray(data) ? data[0] : data;
      if (!criado?.organization_id || !criado?.user_id) throw new Error("criar_organizacao n\xE3o devolveu ids.");
      const authedUser = {
        id: Number(criado.user_id),
        nome,
        matricula: "ADMIN",
        role: "ADMINISTRADOR",
        organization_id: criado.organization_id
      };
      const token = jwt2.sign(authedUser, JWT_SECRET, { expiresIn: "12h" });
      console.info("[Signup] organiza\xE7\xE3o criada", { slug: criado.slug, ip: req.ip });
      try {
        const t = await getTransporter();
        if (t) {
          const boasVindas = emailDeBoasVindas(nome, empresa);
          const aviso = emailDeNovaEmpresa({ empresa, nome, email, slug: criado.slug, ip: req.ip });
          await Promise.allSettled([
            t.sendMail({ from: remetente(), to: email, ...boasVindas }),
            t.sendMail({ from: remetente(), to: destinatarioDemo(), replyTo: email, ...aviso })
          ]).then((r) => r.forEach((x) => x.status === "rejected" && console.error("[Signup] falha ao enviar e-mail:", x.reason?.message)));
        }
      } catch (mailErr) {
        console.error("[Signup] falha ao enviar e-mail:", mailErr.message);
      }
      res.status(201).json({ user: authedUser, token, organizacao: { slug: criado.slug, nome: empresa } });
    } catch (err) {
      console.error("[POST /api/signup] erro:", err.message);
      res.status(500).json({ error: "N\xE3o foi poss\xEDvel criar a conta agora. Tente novamente em instantes." });
    }
  });
  const esqueciIpLimiter = rateLimit({
    windowMs: 60 * 60 * 1e3,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Muitos pedidos a partir desta rede. Tente novamente em uma hora." }
  });
  const esqueciEmailLimiter = rateLimit({
    windowMs: 60 * 60 * 1e3,
    limit: 3,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: (req) => String(req.body?.email ?? "").trim().toLowerCase().slice(0, 120) || "sem-email",
    message: { error: "J\xE1 enviamos instru\xE7\xF5es para este e-mail h\xE1 pouco. Confira a caixa de entrada e o spam." }
  });
  app.post("/api/senha/esqueci", esqueciIpLimiter, esqueciEmailLimiter, async (req, res) => {
    const resposta = { ok: true, mensagem: "Se existir uma conta com este e-mail, enviamos as instru\xE7\xF5es. Confira tamb\xE9m o spam." };
    try {
      const email = String(req.body?.email ?? "").trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 120) return res.status(400).json({ error: "Informe um e-mail v\xE1lido." });
      const t = await getTransporter();
      if (!t) {
        console.error("[Senha] pedido de recupera\xE7\xE3o sem SMTP configurado");
        return res.status(503).json({ error: "A recupera\xE7\xE3o por e-mail est\xE1 indispon\xEDvel no momento. Fale com o administrador da sua empresa ou pelo WhatsApp." });
      }
      const padrao = email.replace(/[\\%_]/g, "\\$&");
      const { data: usuario, error } = await supabaseServer.from(ESTOQUE_USERS).select("id, nome, email").ilike("email", padrao).eq("ativo", true).limit(1).maybeSingle();
      if (error) throw error;
      if (!usuario?.email) return res.json(resposta);
      const { token, hash } = gerarToken();
      const { error: erroInsert } = await supabaseServer.from("password_resets").insert({
        user_id: usuario.id,
        token_hash: hash,
        expires_at: new Date(Date.now() + VALIDADE_DO_TOKEN_MS).toISOString()
      });
      if (erroInsert) throw erroInsert;
      const { subject, html } = emailDeRecuperacao(usuario.nome, linkDeRedefinicao(token));
      await t.sendMail({ from: remetente(), to: usuario.email, subject, html });
      console.info("[Senha] link de recupera\xE7\xE3o enviado", { user_id: usuario.id, ip: req.ip });
      res.json(resposta);
    } catch (err) {
      console.error("[POST /api/senha/esqueci] erro:", err.message);
      res.status(500).json({ error: "N\xE3o foi poss\xEDvel enviar agora. Tente novamente em instantes." });
    }
  });
  const redefinirLimiter = rateLimit({
    windowMs: 15 * 60 * 1e3,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Muitas tentativas. Aguarde alguns minutos." }
  });
  app.post("/api/senha/redefinir", redefinirLimiter, async (req, res) => {
    try {
      const { token, senha } = req.body || {};
      const erroSenha = validarNovaSenha(senha);
      if (erroSenha) return res.status(400).json({ error: erroSenha });
      if (!tokenPlausivel(token)) return res.status(400).json({ error: 'Este link n\xE3o \xE9 v\xE1lido. Pe\xE7a um novo em "Esqueci minha senha".' });
      const { data: pedido, error } = await supabaseServer.from("password_resets").select("id, user_id, expires_at, used_at").eq("token_hash", hashDoToken(token)).maybeSingle();
      if (error) throw error;
      if (!pedido || !tokenValido(pedido)) {
        return res.status(400).json({ error: 'Este link expirou ou j\xE1 foi usado. Pe\xE7a um novo em "Esqueci minha senha".' });
      }
      const hash = await bcrypt.hash(senha, 10);
      const { data: usuario, error: erroUpdate } = await supabaseServer.from(ESTOQUE_USERS).update({ senha: hash, senha_alterada_em: (/* @__PURE__ */ new Date()).toISOString(), updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", pedido.user_id).eq("ativo", true).select("id, nome, matricula, role, organization_id").maybeSingle();
      if (erroUpdate) throw erroUpdate;
      if (!usuario) return res.status(400).json({ error: "Esta conta n\xE3o est\xE1 mais ativa. Procure o administrador." });
      await supabaseServer.from("password_resets").update({ used_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("user_id", pedido.user_id).is("used_at", null);
      if (!usuario.role || !ALL_INVENTORY_ROLES.includes(usuario.role) || !usuario.organization_id) {
        return res.json({ ok: true });
      }
      const authedUser = {
        id: usuario.id,
        nome: usuario.nome,
        matricula: usuario.matricula,
        role: usuario.role,
        organization_id: usuario.organization_id
      };
      const jwtToken = jwt2.sign(authedUser, JWT_SECRET, { expiresIn: "12h" });
      console.info("[Senha] senha redefinida", { user_id: usuario.id, ip: req.ip });
      res.json({ ok: true, user: authedUser, token: jwtToken });
    } catch (err) {
      console.error("[POST /api/senha/redefinir] erro:", err.message);
      res.status(500).json({ error: "N\xE3o foi poss\xEDvel redefinir agora. Tente novamente em instantes." });
    }
  });
  const demoLimiter = rateLimit({
    windowMs: 60 * 60 * 1e3,
    limit: 5,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Muitos pedidos a partir desta rede. Tente novamente em uma hora." }
  });
  app.post("/api/demo", demoLimiter, async (req, res) => {
    try {
      if (ehRobo(req.body)) return res.status(201).json({ ok: true });
      const validado = validarPedidoDemo(req.body);
      if (!validado.ok) return res.status(400).json({ error: validado.erro });
      const pedido = validado.pedido;
      const { error } = await supabaseServer.from("demo_requests").insert(pedido);
      if (error) throw error;
      try {
        const t = await getTransporter();
        if (t) {
          const { subject, html } = emailDoPedido(pedido);
          await t.sendMail({
            from: remetente(),
            to: destinatarioDemo(),
            replyTo: pedido.email,
            subject,
            html
          });
        }
      } catch (mailErr) {
        console.error("[Demo] falha ao enviar e-mail:", mailErr.message);
      }
      console.info("[Demo] pedido recebido", { empresa: pedido.empresa, origem: pedido.origem, ip: req.ip });
      res.status(201).json({ ok: true });
    } catch (err) {
      console.error("[POST /api/demo] erro:", err.message);
      res.status(500).json({ error: "N\xE3o foi poss\xEDvel enviar o pedido agora. Tente novamente em instantes." });
    }
  });
  app.get("/api/me", authenticate, (req, res) => {
    res.json({ user: req.user });
  });
  app.get("/api/data", authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), withAcessos, async (req, res) => {
    try {
      const db = scopedDb(req.user.organization_id);
      const [materialsRes, movements, staffRes, unidades, depositos, saldos, orgRes, categoriasRes, emprestimosRes, lotesRes, itensRes] = await Promise.all([
        db.from("materials").select("*").order("nome", { ascending: true }),
        fetchAllRows(
          () => db.from("material_movements").select("*, materials(nome)").order("created_at", { ascending: false }).order("id", { ascending: false })
        ),
        // Sem filtro de CLIENTE: esta tabela só tem gente do estoque.
        req.db.from(ESTOQUE_USERS).select("id, nome, matricula, role"),
        unidadesDaOrg(db),
        depositosDaOrg(db, { incluirUnidadesInativas: true }),
        saldosDaOrg(db),
        db.from("organizations").select("id, nome, slug, cor_primaria, logo_url, plano, plano_ate, avaliacao_ate").eq("id", req.user.organization_id).single(),
        db.from("categories").select("id, nome, ordem").order("ordem", { ascending: true }).order("nome", { ascending: true }),
        // Só o que está na rua: pendentes/atrasados dos estoques de empréstimo e entregas abertas dos de EPI.
        db.from("loans").select("*, materials(nome, unidade_medida)").is("devolvido_em", null).is("encerrado_em", null).order("prazo_em", { ascending: true }),
        // Lotes com saldo dos estoques de validade, e os itens dos estoques de patrimônio.
        db.from("lots").select("*, materials(nome, unidade_medida)").gt("quantidade", 0).order("validade", { ascending: true, nullsFirst: false }),
        db.from("assets").select("*, materials(nome)").order("codigo", { ascending: true })
      ]);
      if (materialsRes.error) throw materialsRes.error;
      if (categoriasRes.error) throw categoriasRes.error;
      if (emprestimosRes.error) throw emprestimosRes.error;
      if (lotesRes.error) throw lotesRes.error;
      if (itensRes.error) throw itensRes.error;
      const acessos = req.acessos ?? null;
      const depositosVisiveis = depositos.filter((d) => podeVer(acessos, d.id));
      const unidadesComAcesso = new Set(depositosVisiveis.map((d) => d.unit_id));
      const unidadesVisiveis = acessos === null ? unidades : unidades.filter((u) => unidadesComAcesso.has(u.id));
      const visivel = new Set(depositosVisiveis.map((d) => d.id));
      const materials = (materialsRes.data || []).map((m) => {
        const todos = saldos.get(m.id) || {};
        const porDeposito = acessos === null ? todos : Object.fromEntries(Object.entries(todos).filter(([id]) => visivel.has(id)));
        return { ...m, saldos: porDeposito };
      });
      const emprestimos = (emprestimosRes.data || []).filter((e) => visivel.has(e.warehouse_id)).map(({ materials: mat, ...e }) => ({ ...e, material_nome: mat?.nome ?? "Material removido", unidade_medida: mat?.unidade_medida ?? "" }));
      const lotes = (lotesRes.data || []).filter((l) => visivel.has(l.warehouse_id)).map(({ materials: mat, ...l }) => ({ ...l, material_nome: mat?.nome ?? "Material removido", unidade_medida: mat?.unidade_medida ?? "" }));
      const itens = (itensRes.data || []).filter((i) => visivel.has(i.warehouse_id)).map(({ materials: mat, ...i }) => ({ ...i, material_nome: mat?.nome ?? "Modelo removido" }));
      res.json({
        materials,
        materialMovements: movements,
        staff: staffRes.data || [],
        unidades: unidadesVisiveis,
        depositos: depositosVisiveis,
        categorias: categoriasRes.data || [],
        emprestimos,
        lotes,
        itens,
        // O que ESTA pessoa pode fazer, para o front montar o menu. Admin: null.
        acessos: acessos === null ? null : [...acessos.entries()].map(([warehouse_id, nivel]) => ({ warehouse_id, nivel })),
        // Nome, cor e logo — a identidade que as telas vestem por dentro — e o plano em vigor.
        organizacao: orgRes.data ? { ...orgRes.data, plano_efetivo: req.plano, conta: req.conta } : null
      });
    } catch (err) {
      console.error("[GET /api/data] erro:", err.message);
      res.status(500).json({ error: "Erro ao carregar dados do estoque." });
    }
  });
  const LOGO_MAX_BYTES = 5 * 1024 * 1024;
  const LOGO_TIPOS = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/svg+xml": "svg"
  };
  const COR_HEX = /^#[0-9a-fA-F]{6}$/;
  function caminhoDoLogo(logoUrl) {
    if (!logoUrl) return null;
    const m = logoUrl.match(/\/object\/public\/logos\/([^?]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
  app.patch("/api/organization", authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const patch = {};
      if (req.body?.nome !== void 0) {
        const nome = String(req.body.nome).trim();
        if (nome.length < 2 || nome.length > 60) return res.status(400).json({ error: "Nome deve ter de 2 a 60 caracteres." });
        patch.nome = nome;
      }
      if (req.body?.cor_primaria !== void 0) {
        const negada = negarRecurso(req.plano, "identidade-visual");
        if (negada) return res.status(negada.status).json(negada.body);
        const cor = req.body.cor_primaria === null ? null : String(req.body.cor_primaria).trim().toLowerCase();
        if (cor !== null && !COR_HEX.test(cor)) return res.status(400).json({ error: "Cor inv\xE1lida. Use o formato #rrggbb." });
        patch.cor_primaria = cor;
      }
      if (Object.keys(patch).length === 0) return res.status(400).json({ error: "Nada para alterar." });
      const { data, error } = await req.db.from("organizations").update(patch).eq("id", req.user.organization_id).select("id, nome, slug, cor_primaria, logo_url, plano, plano_ate").single();
      if (error || !data) throw error ?? new Error("organiza\xE7\xE3o n\xE3o encontrada");
      res.json({ organizacao: { ...data, plano_efetivo: req.plano, conta: req.conta } });
    } catch (err) {
      console.error("[PATCH /api/organization] erro:", err.message);
      res.status(500).json({ error: "Erro ao atualizar a organiza\xE7\xE3o." });
    }
  });
  app.post("/api/organization/logo-upload-url", authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const negada = negarRecurso(req.plano, "identidade-visual");
      if (negada) return res.status(negada.status).json(negada.body);
      const tipo = String(req.body?.content_type ?? "");
      const tamanho = Number(req.body?.size ?? 0);
      const ext = LOGO_TIPOS[tipo];
      if (!ext) return res.status(400).json({ error: "Use PNG, JPG, WebP ou SVG." });
      if (!Number.isFinite(tamanho) || tamanho <= 0) return res.status(400).json({ error: "Arquivo vazio." });
      if (tamanho > LOGO_MAX_BYTES) return res.status(400).json({ error: "O logo pode ter no m\xE1ximo 5 MB." });
      const caminho = `${req.user.organization_id}/logo-${Date.now()}.${ext}`;
      const { data, error } = await supabaseServer.storage.from("logos").createSignedUploadUrl(caminho);
      if (error || !data) throw error ?? new Error("sem URL assinada");
      res.json({ signedUrl: data.signedUrl, token: data.token, path: caminho });
    } catch (err) {
      console.error("[POST /api/organization/logo-upload-url] erro:", err.message);
      res.status(500).json({ error: "Erro ao preparar o envio do logo." });
    }
  });
  app.post("/api/organization/logo", authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const negada = negarRecurso(req.plano, "identidade-visual");
      if (negada) return res.status(negada.status).json(negada.body);
      const caminho = String(req.body?.path ?? "");
      const pasta = req.user.organization_id + "/";
      if (!caminho.startsWith(pasta) || caminho.includes("..")) return res.status(400).json({ error: "Caminho inv\xE1lido." });
      const nomeArquivo = caminho.slice(pasta.length);
      const { data: lista, error: lErr } = await supabaseServer.storage.from("logos").list(req.user.organization_id, { search: nomeArquivo });
      if (lErr) throw lErr;
      if (!lista?.some((f) => f.name === nomeArquivo)) return res.status(404).json({ error: "Arquivo n\xE3o encontrado no Storage. Envie de novo." });
      const { data: atual } = await req.db.from("organizations").select("logo_url").eq("id", req.user.organization_id).single();
      const anterior = caminhoDoLogo(atual?.logo_url);
      const publicUrl = supabaseServer.storage.from("logos").getPublicUrl(caminho).data.publicUrl;
      const { data, error } = await req.db.from("organizations").update({ logo_url: publicUrl }).eq("id", req.user.organization_id).select("id, nome, slug, cor_primaria, logo_url, plano, plano_ate").single();
      if (error || !data) throw error ?? new Error("organiza\xE7\xE3o n\xE3o encontrada");
      if (anterior && anterior !== caminho) {
        const { error: rErr } = await supabaseServer.storage.from("logos").remove([anterior]);
        if (rErr) console.warn("[logo] n\xE3o apagou o anterior:", rErr.message);
      }
      res.json({ organizacao: { ...data, plano_efetivo: req.plano, conta: req.conta } });
    } catch (err) {
      console.error("[POST /api/organization/logo] erro:", err.message);
      res.status(500).json({ error: "Erro ao salvar o logo." });
    }
  });
  app.delete("/api/organization/logo", authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const { data: atual } = await req.db.from("organizations").select("logo_url").eq("id", req.user.organization_id).single();
      const caminho = caminhoDoLogo(atual?.logo_url);
      const { data, error } = await req.db.from("organizations").update({ logo_url: null }).eq("id", req.user.organization_id).select("id, nome, slug, cor_primaria, logo_url, plano, plano_ate").single();
      if (error || !data) throw error ?? new Error("organiza\xE7\xE3o n\xE3o encontrada");
      if (caminho) {
        const { error: rErr } = await supabaseServer.storage.from("logos").remove([caminho]);
        if (rErr) console.warn("[logo] n\xE3o apagou o arquivo:", rErr.message);
      }
      res.json({ organizacao: { ...data, plano_efetivo: req.plano, conta: req.conta } });
    } catch (err) {
      console.error("[DELETE /api/organization/logo] erro:", err.message);
      res.status(500).json({ error: "Erro ao remover o logo." });
    }
  });
  app.post("/api/units", authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const nome = String(req.body?.nome || "").trim();
      if (nome.length < 2 || nome.length > 60) {
        return res.status(400).json({ error: "Informe o nome da unidade (2 a 60 caracteres)." });
      }
      const slug = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      if (!slug) return res.status(400).json({ error: "Nome inv\xE1lido para unidade." });
      const { count: ativas } = await req.db.from("units").select("*", { count: "exact", head: true }).eq("ativo", true);
      const negada = negarLimite(req.plano, "unidades", ativas ?? 0);
      if (negada) return res.status(negada.status).json(negada.body);
      const { data: unidade, error: unidadeErr } = await req.db.from("units").insert({ nome, slug }).select("id, nome, slug, ativo").single();
      if (unidadeErr) {
        if (/duplicate|unique/i.test(unidadeErr.message)) {
          return res.status(409).json({ error: "J\xE1 existe uma unidade com esse nome." });
        }
        throw unidadeErr;
      }
      let depositos = [];
      if (req.body?.estoque) {
        const v = validarEstoque(req.body.estoque);
        if (!v.ok) return res.status(400).json({ error: v.erro });
        const { data: dep, error: depErr } = await req.db.from("warehouses").insert({ unit_id: unidade.id, nome: v.nome, tipo: "OUTRO", modo: v.modo, prazo_padrao_horas: v.prazo_padrao_horas, operacoes_permitidas: v.operacoes_permitidas, exige_assinatura: v.exige_assinatura, dias_aviso_validade: v.dias_aviso_validade }).select("id, nome, tipo, unit_id, ativo, modo, prazo_padrao_horas, operacoes_permitidas, exige_assinatura, dias_aviso_validade").single();
        if (depErr) throw depErr;
        depositos = [dep];
      }
      console.info(`[POST /api/units] "${nome}" criada por ${req.user.matricula} com ${depositos.length} estoque(s).`);
      res.status(201).json({ unidade, depositos });
    } catch (err) {
      console.error("[POST /api/units] erro:", err.message);
      res.status(500).json({ error: "Erro ao criar unidade." });
    }
  });
  app.patch("/api/units/:id", authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const patch = {};
      if (req.body?.nome !== void 0) {
        const nome = String(req.body.nome).trim();
        if (nome.length < 2 || nome.length > 60) return res.status(400).json({ error: "Nome deve ter de 2 a 60 caracteres." });
        patch.nome = nome;
      }
      if (req.body?.ativo !== void 0) patch.ativo = Boolean(req.body.ativo);
      if (Object.keys(patch).length === 0) return res.status(400).json({ error: "Nada para alterar." });
      if (patch.ativo === false) {
        const { count } = await req.db.from("units").select("*", { count: "exact", head: true }).eq("ativo", true);
        if ((count ?? 0) <= 1) return res.status(409).json({ error: "N\xE3o d\xE1 para desativar a \xFAnica unidade ativa." });
      }
      if (patch.ativo === true) {
        const { count } = await req.db.from("units").select("*", { count: "exact", head: true }).eq("ativo", true).neq("id", req.params.id);
        const negada = negarLimite(req.plano, "unidades", count ?? 0);
        if (negada) return res.status(negada.status).json(negada.body);
      }
      const { data, error } = await req.db.from("units").update(patch).eq("id", req.params.id).select("id, nome, slug, ativo").single();
      if (error || !data) return res.status(404).json({ error: "Unidade n\xE3o encontrada." });
      res.json({ unidade: data });
    } catch (err) {
      console.error("[PATCH /api/units/:id] erro:", err.message);
      res.status(500).json({ error: "Erro ao atualizar unidade." });
    }
  });
  app.patch("/api/warehouses/:id", authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const { data: atual, error: erroAtual } = await req.db.from("warehouses").select("id, nome, tipo, unit_id, ativo, modo, prazo_padrao_horas, operacoes_permitidas, exige_assinatura, dias_aviso_validade").eq("id", req.params.id).maybeSingle();
      if (erroAtual) throw erroAtual;
      if (!atual) return res.status(404).json({ error: "Estoque n\xE3o encontrado." });
      const v = validarEstoque({
        nome: req.body?.nome ?? atual.nome,
        modo: req.body?.modo ?? atual.modo,
        prazo_padrao_horas: req.body?.prazo_padrao_horas ?? atual.prazo_padrao_horas ?? void 0,
        operacoes_permitidas: req.body?.operacoes_permitidas ?? atual.operacoes_permitidas ?? void 0,
        exige_assinatura: req.body?.exige_assinatura ?? atual.exige_assinatura,
        dias_aviso_validade: req.body?.dias_aviso_validade ?? atual.dias_aviso_validade
      });
      if (!v.ok) return res.status(400).json({ error: v.erro });
      const patch = { nome: v.nome, modo: v.modo, prazo_padrao_horas: v.prazo_padrao_horas, operacoes_permitidas: v.operacoes_permitidas, exige_assinatura: v.exige_assinatura, dias_aviso_validade: v.dias_aviso_validade };
      if (req.body?.ativo !== void 0) patch.ativo = Boolean(req.body.ativo);
      if (patch.ativo === true && !atual.ativo) {
        const { count } = await req.db.from("warehouses").select("*", { count: "exact", head: true }).eq("unit_id", atual.unit_id).eq("ativo", true);
        const negada = negarLimite(req.plano, "depositosPorUnidade", count ?? 0);
        if (negada) return res.status(negada.status).json(negada.body);
      }
      if (v.modo !== atual.modo || patch.ativo === false) {
        const [{ count: abertos }, { count: lotes }, { count: itens }] = await Promise.all([
          req.db.from("loans").select("*", { count: "exact", head: true }).eq("warehouse_id", atual.id).is("devolvido_em", null).is("encerrado_em", null),
          req.db.from("lots").select("*", { count: "exact", head: true }).eq("warehouse_id", atual.id).gt("quantidade", 0),
          req.db.from("assets").select("*", { count: "exact", head: true }).eq("warehouse_id", atual.id).neq("estado", "baixado")
        ]);
        if ((abertos ?? 0) > 0) return res.status(409).json({ error: `H\xE1 ${abertos} retirada(s)/entrega(s) em aberto neste estoque. Encerre-as antes de mudar o modo ou desativar.` });
        if ((lotes ?? 0) > 0) return res.status(409).json({ error: `H\xE1 ${lotes} lote(s) com saldo neste estoque. Zere-os antes de mudar o modo ou desativar.` });
        if ((itens ?? 0) > 0) return res.status(409).json({ error: `H\xE1 ${itens} item(ns) de patrim\xF4nio ativos neste estoque. D\xEA baixa antes de mudar o modo ou desativar.` });
      }
      const { data, error } = await req.db.from("warehouses").update(patch).eq("id", atual.id).select("id, nome, tipo, unit_id, ativo, modo, prazo_padrao_horas, operacoes_permitidas, exige_assinatura, dias_aviso_validade").single();
      if (error) {
        if (/duplicate|unique/i.test(error.message)) return res.status(409).json({ error: "J\xE1 existe um estoque com esse nome nesta unidade." });
        throw error;
      }
      res.json({ deposito: data });
    } catch (err) {
      console.error("[PATCH /api/warehouses/:id] erro:", err.message);
      res.status(500).json({ error: "Erro ao atualizar estoque." });
    }
  });
  app.post("/api/units/:id/estoques", authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const v = validarEstoque(req.body);
      if (!v.ok) return res.status(400).json({ error: v.erro });
      const { data: unidade } = await req.db.from("units").select("id, ativo").eq("id", req.params.id).maybeSingle();
      if (!unidade) return res.status(404).json({ error: "Unidade n\xE3o encontrada." });
      const { count: ativos } = await req.db.from("warehouses").select("*", { count: "exact", head: true }).eq("unit_id", unidade.id).eq("ativo", true);
      const negada = negarLimite(req.plano, "depositosPorUnidade", ativos ?? 0);
      if (negada) return res.status(negada.status).json(negada.body);
      const { data: dep, error } = await req.db.from("warehouses").insert({ unit_id: unidade.id, nome: v.nome, tipo: "OUTRO", modo: v.modo, prazo_padrao_horas: v.prazo_padrao_horas, operacoes_permitidas: v.operacoes_permitidas, exige_assinatura: v.exige_assinatura, dias_aviso_validade: v.dias_aviso_validade }).select("id, nome, tipo, unit_id, ativo, modo, prazo_padrao_horas, operacoes_permitidas, exige_assinatura, dias_aviso_validade").single();
      if (error) {
        if (/duplicate|unique/i.test(error.message)) return res.status(409).json({ error: "J\xE1 existe um estoque com esse nome nesta unidade." });
        throw error;
      }
      const { data: outros } = await req.db.from("warehouses").select("id").eq("unit_id", unidade.id).neq("id", dep.id);
      const idsOutros = (outros || []).map((d) => d.id);
      let adicionados = 0;
      if (idsOutros.length > 0) {
        const { data: linhas } = await req.db.from("stock_balances").select("material_id").in("warehouse_id", idsOutros);
        const materiais = [...new Set((linhas || []).map((l) => l.material_id))];
        if (materiais.length > 0) {
          const { error: erroSaldos } = await req.db.from("stock_balances").upsert(materiais.map((material_id) => ({ material_id, warehouse_id: dep.id, saldo: 0 })), { onConflict: "warehouse_id,material_id", ignoreDuplicates: true });
          if (erroSaldos) throw erroSaldos;
          adicionados = materiais.length;
        }
      }
      console.info(`[POST /api/units/:id/estoques] "${v.nome}" (${v.modo}) criado por ${req.user.matricula}; ${adicionados} materiais herdados.`);
      res.status(201).json({ deposito: dep, materiais: adicionados });
    } catch (err) {
      console.error("[POST /api/units/:id/estoques] erro:", err.message);
      res.status(500).json({ error: "Erro ao criar estoque." });
    }
  });
  app.post("/api/categorias", authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const nome = String(req.body?.nome ?? "").trim();
      if (nome.length < 1 || nome.length > 60) return res.status(400).json({ error: "Informe o nome da categoria (at\xE9 60 caracteres)." });
      const { data: ultima } = await req.db.from("categories").select("ordem").order("ordem", { ascending: false }).limit(1).maybeSingle();
      const { data, error } = await req.db.from("categories").insert({ nome, ordem: (ultima?.ordem ?? 0) + 1 }).select("id, nome, ordem").single();
      if (error) {
        if (/duplicate|unique/i.test(error.message)) return res.status(409).json({ error: "J\xE1 existe uma categoria com esse nome." });
        throw error;
      }
      res.status(201).json({ categoria: data });
    } catch (err) {
      console.error("[POST /api/categorias] erro:", err.message);
      res.status(500).json({ error: "Erro ao criar categoria." });
    }
  });
  app.patch("/api/categorias/:id", authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const { data: atual } = await req.db.from("categories").select("id, nome, ordem").eq("id", req.params.id).maybeSingle();
      if (!atual) return res.status(404).json({ error: "Categoria n\xE3o encontrada." });
      const patch = {};
      if (req.body?.nome !== void 0) {
        const nome = String(req.body.nome).trim();
        if (nome.length < 1 || nome.length > 60) return res.status(400).json({ error: "Informe o nome da categoria (at\xE9 60 caracteres)." });
        patch.nome = nome;
      }
      if (req.body?.ordem !== void 0) {
        const ordem = Number(req.body.ordem);
        if (!Number.isInteger(ordem)) return res.status(400).json({ error: "Ordem inv\xE1lida." });
        patch.ordem = ordem;
      }
      if (Object.keys(patch).length === 0) return res.status(400).json({ error: "Nada para alterar." });
      const { data, error } = await req.db.from("categories").update(patch).eq("id", atual.id).select("id, nome, ordem").single();
      if (error) {
        if (/duplicate|unique/i.test(error.message)) return res.status(409).json({ error: "J\xE1 existe uma categoria com esse nome." });
        throw error;
      }
      if (patch.nome && patch.nome !== atual.nome) {
        const { error: erroMat } = await req.db.from("materials").update({ categoria: patch.nome }).eq("categoria", atual.nome);
        if (erroMat) throw erroMat;
      }
      res.json({ categoria: data });
    } catch (err) {
      console.error("[PATCH /api/categorias/:id] erro:", err.message);
      res.status(500).json({ error: "Erro ao atualizar categoria." });
    }
  });
  app.delete("/api/categorias/:id", authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const { data: atual } = await req.db.from("categories").select("id, nome").eq("id", req.params.id).maybeSingle();
      if (!atual) return res.status(404).json({ error: "Categoria n\xE3o encontrada." });
      const { count: total } = await req.db.from("categories").select("*", { count: "exact", head: true });
      if ((total ?? 0) <= 1) return res.status(409).json({ error: "A organiza\xE7\xE3o precisa ter pelo menos uma categoria." });
      const { count: emUso } = await req.db.from("materials").select("*", { count: "exact", head: true }).eq("categoria", atual.nome);
      if ((emUso ?? 0) > 0) {
        const destinoId = String(req.body?.mover_para ?? "");
        const { data: destino } = destinoId ? await req.db.from("categories").select("id, nome").eq("id", destinoId).maybeSingle() : { data: null };
        if (!destino || destino.id === atual.id) {
          return res.status(409).json({ error: `${emUso} material(is) usam esta categoria. Escolha para qual categoria mov\xEA-los.`, em_uso: emUso });
        }
        const { error: erroMat } = await req.db.from("materials").update({ categoria: destino.nome }).eq("categoria", atual.nome);
        if (erroMat) throw erroMat;
      }
      const { error } = await req.db.from("categories").delete().eq("id", atual.id);
      if (error) throw error;
      res.json({ ok: true, movidos: emUso ?? 0 });
    } catch (err) {
      console.error("[DELETE /api/categorias/:id] erro:", err.message);
      res.status(500).json({ error: "Erro ao remover categoria." });
    }
  });
  app.post("/api/units/:id/materials", authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const ids = Array.isArray(req.body?.material_ids) ? req.body.material_ids.map(Number).filter(Number.isFinite) : [];
      if (ids.length === 0) return res.status(400).json({ error: "Selecione ao menos um material." });
      const depositos = (await depositosDaOrg(req.db, { incluirUnidadesInativas: true })).filter((d) => d.unit_id === req.params.id);
      if (depositos.length === 0) return res.status(404).json({ error: "Unidade n\xE3o encontrada." });
      const { data: existentes, error: matErr } = await req.db.from("materials").select("id").in("id", ids);
      if (matErr) throw matErr;
      const validos = (existentes || []).map((m) => m.id);
      const zeros = validos.flatMap((materialId) => depositos.map((d) => ({ material_id: materialId, warehouse_id: d.id, saldo: 0 })));
      if (zeros.length > 0) {
        const { error } = await req.db.from("stock_balances").upsert(zeros, { onConflict: "warehouse_id,material_id", ignoreDuplicates: true });
        if (error) throw error;
      }
      res.json({ success: true, adicionados: validos.length });
    } catch (err) {
      console.error("[POST /api/units/:id/materials] erro:", err.message);
      res.status(500).json({ error: "Erro ao adicionar materiais \xE0 unidade." });
    }
  });
  app.delete("/api/units/:id/materials", authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const depositos = (await depositosDaOrg(req.db, { incluirUnidadesInativas: true })).filter((d) => d.unit_id === req.params.id);
      if (depositos.length === 0) return res.status(404).json({ error: "Unidade n\xE3o encontrada." });
      const depositoIds = depositos.map((d) => d.id);
      const { data: linhas, error: lErr } = await req.db.from("stock_balances").select("material_id, saldo").in("warehouse_id", depositoIds);
      if (lErr) throw lErr;
      const comSaldo = /* @__PURE__ */ new Set();
      const todos = /* @__PURE__ */ new Set();
      for (const l of linhas || []) {
        todos.add(l.material_id);
        if (Number(l.saldo) !== 0) comSaldo.add(l.material_id);
      }
      const { data: movs, error: mErr } = await req.db.from("material_movements").select("material_id").or(`warehouse_origem_id.in.(${depositoIds.join(",")}),warehouse_destino_id.in.(${depositoIds.join(",")})`);
      if (mErr) throw mErr;
      const comHistorico = new Set((movs || []).map((m) => m.material_id).filter((x) => x != null));
      const removiveis = [...todos].filter((id) => !comSaldo.has(id) && !comHistorico.has(id));
      if (removiveis.length > 0) {
        const { error } = await req.db.from("stock_balances").delete().in("material_id", removiveis).in("warehouse_id", depositoIds);
        if (error) throw error;
      }
      console.info(`[DELETE /api/units/:id/materials] ${removiveis.length} material(is) removidos da unidade ${req.params.id} por ${req.user.matricula}.`);
      res.json({ success: true, removidos: removiveis.length, mantidos: todos.size - removiveis.length });
    } catch (err) {
      console.error("[DELETE /api/units/:id/materials] erro:", err.message);
      res.status(500).json({ error: "Erro ao remover materiais da unidade." });
    }
  });
  app.delete("/api/units/:id/materials/:materialId", authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const materialId = Number(req.params.materialId);
      const depositos = (await depositosDaOrg(req.db, { incluirUnidadesInativas: true })).filter((d) => d.unit_id === req.params.id);
      if (depositos.length === 0) return res.status(404).json({ error: "Unidade n\xE3o encontrada." });
      const depositoIds = depositos.map((d) => d.id);
      const saldos = await saldosDoMaterial(req.db, materialId);
      const comSaldo = depositoIds.filter((id) => Number(saldos[id] ?? 0) !== 0);
      if (comSaldo.length > 0) {
        return res.status(409).json({ error: "Este material ainda tem saldo nesta unidade. Zere o saldo antes de remov\xEA-lo." });
      }
      const { count } = await req.db.from("material_movements").select("*", { count: "exact", head: true }).eq("material_id", materialId).or(`warehouse_origem_id.in.(${depositoIds.join(",")}),warehouse_destino_id.in.(${depositoIds.join(",")})`);
      if ((count ?? 0) > 0) {
        return res.status(409).json({ error: "Este material j\xE1 teve movimenta\xE7\xE3o nesta unidade. O hist\xF3rico precisa continuar apontando para ela." });
      }
      const { error } = await req.db.from("stock_balances").delete().eq("material_id", materialId).in("warehouse_id", depositoIds);
      if (error) throw error;
      res.json({ success: true });
    } catch (err) {
      console.error("[DELETE /api/units/:id/materials/:materialId] erro:", err.message);
      res.status(500).json({ error: "Erro ao remover material da unidade." });
    }
  });
  function validadeDeTroca(v) {
    if (v === void 0 || v === null || v === "") return { ok: true, dias: null };
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 3650) return { ok: false, erro: "Validade de troca inv\xE1lida: use de 1 a 3650 dias." };
    return { ok: true, dias: n };
  }
  app.post("/api/materials", authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const { nome, unidade_medida, qtd_volumes, fator_multiplicador, estoque_minimo, categoria, unit_id, validade_troca_dias } = req.body || {};
      if (!nome || !unidade_medida || qtd_volumes == null || fator_multiplicador == null || estoque_minimo == null) {
        return res.status(400).json({ error: "Preencha todos os campos obrigat\xF3rios." });
      }
      const troca = validadeDeTroca(validade_troca_dias);
      if (!troca.ok) return res.status(400).json({ error: troca.erro });
      const depositos = await depositosDaOrg(req.db);
      let daUnidade;
      try {
        daUnidade = depositosDaUnidade(depositos, unit_id);
      } catch (e) {
        return res.status(409).json({ error: e.message });
      }
      const destino = daUnidade.find((d) => d.id === req.body?.warehouse_id) ?? daUnidade.find((d) => d.tipo === "CENTRAL") ?? daUnidade.find((d) => d.modo === "almoxarifado") ?? daUnidade[0];
      if (!destino) return res.status(409).json({ error: "A unidade n\xE3o tem estoque cadastrado." });
      const saldoInicial = destino.modo === "patrimonio" || destino.modo === "validade" ? 0 : arredondar(Number(qtd_volumes) * Number(fator_multiplicador));
      const { data: material, error } = await req.db.from("materials").insert({
        nome,
        unidade_medida,
        qtd_volumes,
        fator_multiplicador,
        estoque_minimo,
        categoria: categoria || "Outros",
        validade_troca_dias: troca.dias
      }).select().single();
      if (error) throw error;
      const saldos = Object.fromEntries(daUnidade.map((d) => [d.id, d.id === destino.id ? saldoInicial : 0]));
      await gravarSaldos(req.db, material.id, saldos);
      if (saldoInicial > 0) {
        await req.db.from("material_movements").insert({
          material_id: material.id,
          tipo_operacao: destino.tipo === "CENTRAL" ? "ENTRADA_CENTRAL" : "ENTRADA",
          quantidade: saldoInicial,
          warehouse_destino_id: destino.id,
          funcionario_matricula: req.user.matricula,
          justificativa: "Cadastro inicial de material"
        });
      }
      res.status(201).json({ ...material, saldos });
    } catch (err) {
      console.error("[POST /api/materials] erro:", err.message);
      res.status(500).json({ error: "Erro ao cadastrar material." });
    }
  });
  app.put("/api/materials/:id", authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const { id } = req.params;
      const { nome, categoria, unidade_medida, estoque_minimo, fator_multiplicador, validade_troca_dias } = req.body || {};
      const updates = { updated_at: (/* @__PURE__ */ new Date()).toISOString() };
      if (nome !== void 0) updates.nome = nome;
      if (categoria !== void 0) updates.categoria = categoria;
      if (unidade_medida !== void 0) updates.unidade_medida = unidade_medida;
      if (estoque_minimo !== void 0) updates.estoque_minimo = estoque_minimo;
      if (validade_troca_dias !== void 0) {
        const troca = validadeDeTroca(validade_troca_dias);
        if (!troca.ok) return res.status(400).json({ error: troca.erro });
        updates.validade_troca_dias = troca.dias;
      }
      if (fator_multiplicador !== void 0) updates.fator_multiplicador = fator_multiplicador;
      const { data, error } = await req.db.from("materials").update(updates).eq("id", id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err) {
      console.error("[PUT /api/materials/:id] erro:", err.message);
      res.status(500).json({ error: "Erro ao atualizar material." });
    }
  });
  app.delete("/api/materials/:id", authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const { id } = req.params;
      const { data: material, error: fetchError } = await req.db.from("materials").select("*").eq("id", id).single();
      if (fetchError || !material) return res.status(404).json({ error: "Material n\xE3o encontrado." });
      const { data: relatedMovements } = await req.db.from("material_movements").select("id, justificativa").eq("material_id", id);
      for (const mov of relatedMovements || []) {
        await req.db.from("material_movements").update({ material_id: null, justificativa: `[${material.nome}] ${mov.justificativa || ""}`.trim() }).eq("id", mov.id);
      }
      const saldoTotal = totalDosDepositos(await saldosDoMaterial(req.db, Number(id)));
      await req.db.from("material_movements").insert({
        material_id: null,
        tipo_operacao: "EXCLUS\xC3O",
        quantidade: saldoTotal,
        funcionario_matricula: req.user.matricula,
        justificativa: `EXCLUS\xC3O DO MATERIAL: O material '${material.nome}' (Saldo em estoque era de ${saldoTotal} ${material.unidade_medida}) foi exclu\xEDdo do sistema permanentemente por ${req.user.nome}.`
      });
      const { error: deleteError } = await req.db.from("materials").delete().eq("id", id);
      if (deleteError) throw deleteError;
      res.json({ success: true });
    } catch (err) {
      console.error("[DELETE /api/materials/:id] erro:", err.message);
      res.status(500).json({ error: "Erro ao excluir material." });
    }
  });
  app.patch("/api/materials/bulk-minimo", authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const { ids, estoque_minimo } = req.body || {};
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "Selecione ao menos um material." });
      }
      const minimo = Number(estoque_minimo);
      if (Number.isNaN(minimo) || minimo < 0) {
        return res.status(400).json({ error: "Informe um estoque m\xEDnimo v\xE1lido." });
      }
      const { error } = await req.db.from("materials").update({ estoque_minimo: minimo, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).in("id", ids);
      if (error) throw error;
      res.json({ success: true, updated: ids.length });
    } catch (err) {
      console.error("[PATCH /api/materials/bulk-minimo] erro:", err.message);
      res.status(500).json({ error: "Erro ao atualizar estoque m\xEDnimo em lote." });
    }
  });
  app.post("/api/materials/merge", authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const { targetId, sourceIds } = req.body || {};
      const sources = Array.isArray(sourceIds) ? sourceIds.filter((id) => id !== targetId) : [];
      if (!targetId || sources.length === 0) {
        return res.status(400).json({ error: "Selecione um material principal e ao menos mais um para unificar." });
      }
      const { data: allSelected, error: fetchError } = await req.db.from("materials").select("*").in("id", [targetId, ...sources]);
      if (fetchError || !allSelected || allSelected.length !== sources.length + 1) {
        return res.status(404).json({ error: "Um ou mais materiais selecionados n\xE3o foram encontrados." });
      }
      const target = allSelected.find((m) => m.id === targetId);
      const donors = allSelected.filter((m) => m.id !== targetId);
      const unidadesDiferentes = donors.some((d) => d.unidade_medida !== target.unidade_medida);
      if (unidadesDiferentes) {
        return res.status(400).json({
          error: `As unidades de medida n\xE3o coincidem (${target.unidade_medida} vs. outras). Ajuste antes de unificar.`
        });
      }
      const depositos = await depositosDaOrg(req.db, { incluirUnidadesInativas: true });
      const saldosAlvo = await saldosDoMaterial(req.db, targetId);
      const somaPorDeposito = {};
      const totalDoDoador = /* @__PURE__ */ new Map();
      for (const donor of donors) {
        const saldosDoador = await saldosDoMaterial(req.db, donor.id);
        totalDoDoador.set(donor.id, totalDosDepositos(saldosDoador));
        for (const [depositoId, saldo] of Object.entries(saldosDoador)) {
          somaPorDeposito[depositoId] = arredondar((somaPorDeposito[depositoId] ?? 0) + saldo);
        }
      }
      const novosSaldos = { ...saldosAlvo };
      for (const [depositoId, soma] of Object.entries(somaPorDeposito)) {
        novosSaldos[depositoId] = arredondar((novosSaldos[depositoId] ?? 0) + soma);
      }
      await gravarSaldos(req.db, targetId, novosSaldos);
      const somaTotal = totalDosDepositos(somaPorDeposito);
      const nomeDo = (id) => depositos.find((d) => d.id === id)?.nome ?? id;
      if (somaTotal !== 0) {
        const detalhe = Object.entries(somaPorDeposito).filter(([, v]) => v !== 0).map(([id, v]) => `${nomeDo(id)} +${v}`).join(", ");
        await req.db.from("material_movements").insert({
          material_id: targetId,
          tipo_operacao: "UNIFICACAO",
          quantidade: somaTotal,
          funcionario_matricula: req.user.matricula,
          justificativa: `Unifica\xE7\xE3o: incorporou o saldo de ${donors.map((d) => `'${d.nome}'`).join(", ")} (${detalhe}).`
        });
      }
      for (const donor of donors) {
        const { data: relatedMovements } = await req.db.from("material_movements").select("id, justificativa").eq("material_id", donor.id);
        for (const mov of relatedMovements || []) {
          await req.db.from("material_movements").update({ material_id: null, justificativa: `[${donor.nome}] ${mov.justificativa || ""}`.trim() }).eq("id", mov.id);
        }
        await req.db.from("material_movements").insert({
          material_id: null,
          tipo_operacao: "EXCLUS\xC3O",
          quantidade: totalDoDoador.get(donor.id) ?? 0,
          funcionario_matricula: req.user.matricula,
          justificativa: `UNIFICA\xC7\xC3O: o material '${donor.nome}' foi unificado com '${target.nome}' e removido do sistema por ${req.user.nome}.`
        });
        await req.db.from("materials").delete().eq("id", donor.id);
      }
      res.json({ success: true, targetId, saldos: novosSaldos });
    } catch (err) {
      console.error("[POST /api/materials/merge] erro:", err.message);
      res.status(500).json({ error: "Erro ao unificar materiais." });
    }
  });
  async function avisarMinimo(plano, material, saldosNovos, saldosAntes, depositosDaUnidadeDela, resumo) {
    if (!planoLibera(plano, "alertas-por-email")) return;
    const saldos_unidade = {};
    for (const d of depositosDaUnidadeDela) saldos_unidade[d.id] = Number(saldosNovos[d.id] ?? saldosAntes[d.id] ?? 0);
    const saldo_unidade = Object.values(saldos_unidade).reduce((s, v) => s + v, 0);
    const campos = { saldo_unidade, saldos_unidade, estoque_minimo: material.estoque_minimo };
    if (!needsPurchase(campos)) return;
    const semEstoque = stockStatus(campos, "empresa") === "RUPTURA";
    try {
      const t = await getTransporter();
      if (!t) return;
      const linhas = depositosDaUnidadeDela.map((d) => `${d.nome}: ${saldos_unidade[d.id]} ${material.unidade_medida}`).join("<br/>");
      await t.sendMail({
        from: remetente(),
        to: destinatarioAdmin(),
        subject: `${semEstoque ? "Sem estoque" : "Estoque abaixo do m\xEDnimo"}: ${material.nome}`,
        html: `<p>O material <strong>${material.nome}</strong> ${semEstoque ? "est\xE1 <strong>sem estoque</strong> em todos os estoques da unidade." : "est\xE1 com o saldo da unidade <strong>abaixo do estoque m\xEDnimo</strong>."}</p><p>${linhas}<br/><strong>Total: ${stockTotal(campos)} ${material.unidade_medida}</strong><br/>Estoque m\xEDnimo: ${material.estoque_minimo} ${material.unidade_medida}</p><p>${resumo}</p>`
      });
    } catch (mailErr) {
      console.error("[Alerta de Estoque] falha ao enviar e-mail:", mailErr.message);
    }
  }
  app.post("/api/estoques/:id/movimentacoes", authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), withAcessos, async (req, res) => {
    try {
      const { operacao, material_id, quantidade, justificativa, destino_id, lote_id } = req.body || {};
      if (!ehOperacaoGenerica(operacao)) return res.status(400).json({ error: "Opera\xE7\xE3o inv\xE1lida." });
      if (!material_id || quantidade == null || !String(justificativa ?? "").trim()) {
        return res.status(400).json({ error: "Preencha material, quantidade e justificativa." });
      }
      const depositos = await depositosDaOrg(req.db);
      const estoque = depositos.find((d) => d.id === req.params.id);
      if (!estoque) return res.status(404).json({ error: "Estoque n\xE3o encontrado." });
      if (estoque.modo === "emprestimo") return res.status(409).json({ error: "Este estoque \xE9 de empr\xE9stimo: registre retiradas e devolu\xE7\xF5es." });
      if (estoque.modo === "entrega") return res.status(409).json({ error: "Este estoque \xE9 de entrega: registre entregas na tela dele." });
      if (estoque.modo === "patrimonio") return res.status(409).json({ error: "Este estoque \xE9 de patrim\xF4nio: cadastre, aloque e baixe itens na tela dele." });
      if (!podeOperar(req.acessos ?? null, estoque.id)) return res.status(403).json({ error: "Voc\xEA n\xE3o tem permiss\xE3o para operar este estoque." });
      if (!operacaoPermitida(estoque, operacao)) return res.status(409).json({ error: `A opera\xE7\xE3o ${operacao} est\xE1 desligada em ${estoque.nome}.` });
      if (operacao === "TRANSFERENCIA") {
        const negada = negarRecurso(req.plano, "transferencia");
        if (negada) return res.status(negada.status).json(negada.body);
      }
      const def = OPERACOES[operacao];
      const lados = def.lado === "origem" ? { origem_id: estoque.id } : { destino_id: estoque.id };
      let destino;
      if (def.precisaDestino) {
        destino = depositos.find((d) => d.id === destino_id);
        if (!destino) return res.status(400).json({ error: "Escolha o estoque de destino." });
        if (destino.id === estoque.id) return res.status(400).json({ error: "Origem e destino s\xE3o o mesmo estoque." });
        if (destino.unit_id !== estoque.unit_id) return res.status(409).json({ error: "Transfer\xEAncia s\xF3 entre estoques da mesma unidade." });
        if (destino.modo === "patrimonio") return res.status(409).json({ error: "N\xE3o d\xE1 para transferir quantidade para um estoque de patrim\xF4nio." });
        lados.destino_id = destino.id;
      }
      const { data: material, error: fetchError } = await req.db.from("materials").select("*").eq("id", material_id).single();
      if (fetchError || !material) return res.status(404).json({ error: "Material n\xE3o encontrado." });
      const nomeDo = (id) => depositos.find((d) => d.id === id)?.nome ?? id;
      const q = Number(quantidade);
      const atuais = await saldosDoMaterial(req.db, Number(material_id));
      const calculo = calcularMovimento(atuais, { ...lados, quantidade: q, ajuste: def.ajuste, rotulo: def.rotulo, nomeDe: nomeDo });
      if (!calculo.ok) return res.status(400).json({ error: calculo.erro });
      let detalheLotes = "";
      const gravacoesDeLote = [];
      const origemValidade = estoque.modo === "validade" && (operacao === "SAIDA" || operacao === "CONSUMO" || operacao === "TRANSFERENCIA");
      const lotesDoOrigem = async () => {
        const { data, error } = await req.db.from("lots").select("id, lote, validade, quantidade").eq("warehouse_id", estoque.id).eq("material_id", material_id);
        if (error) throw error;
        return data || [];
      };
      let consumos = [];
      if (origemValidade) {
        const lotes = await lotesDoOrigem();
        const aloc = alocarSaida(lotes, q, lote_id ? String(lote_id) : null);
        if (!aloc.ok) return res.status(400).json({ error: aloc.erro });
        consumos = aloc.consumos;
        detalheLotes = ` \u2014 lote(s) ${descreverConsumos(consumos)}`;
        for (const c of consumos) {
          const l = lotes.find((x) => x.id === c.id);
          gravacoesDeLote.push(async () => {
            const { error } = await req.db.from("lots").update({ quantidade: arredondar(Number(l.quantidade) - c.quantidade), updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", c.id);
            if (error) throw error;
          });
        }
      }
      if (estoque.modo === "validade" && operacao === "ENTRADA") {
        const v = validarLote(req.body);
        if (!v.ok) return res.status(400).json({ error: v.erro });
        detalheLotes = ` \u2014 lote ${v.lote.lote}${v.lote.validade ? ` (val. ${v.lote.validade})` : ""}`;
        gravacoesDeLote.push(async () => {
          const { data: existente } = await req.db.from("lots").select("id, quantidade, validade").eq("warehouse_id", estoque.id).eq("material_id", material_id).eq("lote", v.lote.lote).maybeSingle();
          if (existente) {
            const { error } = await req.db.from("lots").update({ quantidade: arredondar(Number(existente.quantidade) + q), validade: v.lote.validade ?? existente.validade, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", existente.id);
            if (error) throw error;
          } else {
            const { error } = await req.db.from("lots").insert({ warehouse_id: estoque.id, material_id, lote: v.lote.lote, validade: v.lote.validade, quantidade: q });
            if (error) throw error;
          }
        });
      }
      if (estoque.modo === "validade" && operacao === "AJUSTE") {
        const lotes = await lotesDoOrigem();
        const l = lotes.find((x) => x.id === String(lote_id ?? ""));
        if (!l) return res.status(400).json({ error: "Aponte o lote que est\xE1 sendo ajustado." });
        if (Number(l.quantidade) + q < 0) return res.status(400).json({ error: `O lote ${l.lote} tem ${l.quantidade}; o ajuste deixaria negativo.` });
        detalheLotes = ` \u2014 lote ${l.lote}`;
        gravacoesDeLote.push(async () => {
          const { error } = await req.db.from("lots").update({ quantidade: arredondar(Number(l.quantidade) + q), updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", l.id);
          if (error) throw error;
        });
      }
      if (operacao === "TRANSFERENCIA" && destino?.modo === "validade") {
        let partes;
        if (consumos.length > 0) {
          const lotesOrigem = await lotesDoOrigem();
          partes = consumos.map((c) => ({ lote: c.lote, validade: lotesOrigem.find((l) => l.id === c.id)?.validade ?? null, quantidade: c.quantidade }));
        } else {
          partes = [{ lote: "TRANSF", validade: null, quantidade: q }];
        }
        for (const p2 of partes) {
          gravacoesDeLote.push(async () => {
            const { data: existente } = await req.db.from("lots").select("id, quantidade").eq("warehouse_id", destino.id).eq("material_id", material_id).eq("lote", p2.lote).maybeSingle();
            if (existente) {
              const { error } = await req.db.from("lots").update({ quantidade: arredondar(Number(existente.quantidade) + p2.quantidade), updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", existente.id);
              if (error) throw error;
            } else {
              const { error } = await req.db.from("lots").insert({ warehouse_id: destino.id, material_id, lote: p2.lote, validade: p2.validade, quantidade: p2.quantidade });
              if (error) throw error;
            }
          });
        }
      }
      for (const gravar of gravacoesDeLote) await gravar();
      await gravarSaldos(req.db, Number(material_id), calculo.novos);
      await req.db.from("material_movements").insert({
        material_id,
        tipo_operacao: operacao,
        quantidade: q,
        warehouse_origem_id: lados.origem_id ?? null,
        warehouse_destino_id: lados.destino_id ?? null,
        funcionario_matricula: req.user.matricula,
        justificativa: `${String(justificativa).trim()}${detalheLotes}`
      });
      await avisarMinimo(req.plano, material, calculo.novos, atuais, depositos.filter((d) => d.unit_id === estoque.unit_id), `Opera\xE7\xE3o: ${operacao} em ${estoque.nome} | Quantidade: ${q} | Respons\xE1vel: ${req.user.nome}`);
      res.json({ success: true, material_id, saldos: calculo.novos, lotes: consumos });
    } catch (err) {
      console.error("[POST /api/estoques/:id/movimentacoes] erro:", err.message);
      res.status(500).json({ error: "Erro ao registrar movimenta\xE7\xE3o." });
    }
  });
  app.get("/api/estoques/:id/emprestimos", authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), withAcessos, async (req, res) => {
    try {
      if (!podeVer(req.acessos ?? null, req.params.id)) return res.status(403).json({ error: "Voc\xEA n\xE3o tem acesso a este estoque." });
      const { data, error } = await req.db.from("loans").select("*, materials(nome, unidade_medida)").eq("warehouse_id", req.params.id).order("retirado_em", { ascending: false }).limit(300);
      if (error) throw error;
      res.json({
        emprestimos: (data || []).map(({ materials: mat, ...e }) => ({ ...e, material_nome: mat?.nome ?? "Material removido", unidade_medida: mat?.unidade_medida ?? "" }))
      });
    } catch (err) {
      console.error("[GET /api/estoques/:id/emprestimos] erro:", err.message);
      res.status(500).json({ error: "Erro ao carregar retiradas." });
    }
  });
  app.post("/api/estoques/:id/emprestimos", authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), withAcessos, async (req, res) => {
    try {
      const depositos = await depositosDaOrg(req.db);
      const estoque = depositos.find((d) => d.id === req.params.id);
      if (!estoque) return res.status(404).json({ error: "Estoque n\xE3o encontrado." });
      if (estoque.modo !== "emprestimo") return res.status(409).json({ error: "Este estoque n\xE3o \xE9 de empr\xE9stimo." });
      if (!podeOperar(req.acessos ?? null, estoque.id)) return res.status(403).json({ error: "Voc\xEA n\xE3o tem permiss\xE3o para operar este estoque." });
      const v = validarRetirada(req.body, estoque.prazo_padrao_horas);
      if (!v.ok) return res.status(400).json({ error: v.erro });
      const r = v.retirada;
      const { data: material } = await req.db.from("materials").select("*").eq("id", r.material_id).maybeSingle();
      if (!material) return res.status(404).json({ error: "Material n\xE3o encontrado." });
      const atuais = await saldosDoMaterial(req.db, r.material_id);
      const calculo = calcularMovimento(atuais, { origem_id: estoque.id, quantidade: r.quantidade, rotulo: "esta retirada", nomeDe: () => estoque.nome });
      if (!calculo.ok) return res.status(400).json({ error: calculo.erro });
      const agora = /* @__PURE__ */ new Date();
      const { data: emprestimo, error } = await req.db.from("loans").insert({
        warehouse_id: estoque.id,
        material_id: r.material_id,
        quantidade: r.quantidade,
        tomador_nome: r.tomador_nome,
        tomador_referencia: r.tomador_referencia,
        observacao: r.observacao,
        retirado_em: agora.toISOString(),
        prazo_em: prazoEm(r.prazo_horas, agora).toISOString(),
        retirada_matricula: req.user.matricula
      }).select("*").single();
      if (error) throw error;
      await gravarSaldos(req.db, r.material_id, calculo.novos);
      await req.db.from("material_movements").insert({
        material_id: r.material_id,
        tipo_operacao: "EMPRESTIMO",
        quantidade: r.quantidade,
        warehouse_origem_id: estoque.id,
        warehouse_destino_id: null,
        funcionario_matricula: req.user.matricula,
        justificativa: `Retirada por ${r.tomador_nome}${r.tomador_referencia ? ` (${r.tomador_referencia})` : ""} \u2014 prazo ${r.prazo_horas} h`
      });
      await avisarMinimo(req.plano, material, calculo.novos, atuais, depositos.filter((d) => d.unit_id === estoque.unit_id), `Retirada em ${estoque.nome} por ${r.tomador_nome} | Quantidade: ${r.quantidade} | Registrou: ${req.user.nome}`);
      res.status(201).json({ emprestimo: { ...emprestimo, material_nome: material.nome, unidade_medida: material.unidade_medida }, saldos: calculo.novos });
    } catch (err) {
      console.error("[POST /api/estoques/:id/emprestimos] erro:", err.message);
      res.status(500).json({ error: "Erro ao registrar retirada." });
    }
  });
  app.post("/api/emprestimos/:id/devolver", authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), withAcessos, async (req, res) => {
    try {
      const { data: emp } = await req.db.from("loans").select("*, materials(nome, unidade_medida)").eq("id", req.params.id).maybeSingle();
      if (!emp) return res.status(404).json({ error: "Retirada n\xE3o encontrada." });
      if (emp.devolvido_em) return res.status(409).json({ error: "Esta retirada j\xE1 foi devolvida." });
      if (!podeOperar(req.acessos ?? null, emp.warehouse_id)) return res.status(403).json({ error: "Voc\xEA n\xE3o tem permiss\xE3o para operar este estoque." });
      const falta = Math.round((Number(emp.quantidade) - Number(emp.quantidade_devolvida)) * 100) / 100;
      const q = req.body?.quantidade == null || req.body.quantidade === "" ? falta : Math.round(Number(req.body.quantidade) * 100) / 100;
      if (!Number.isFinite(q) || q <= 0 || q > falta) return res.status(400).json({ error: `Informe uma quantidade entre 0 e ${falta}.` });
      const atuais = await saldosDoMaterial(req.db, emp.material_id);
      const calculo = calcularMovimento(atuais, { destino_id: emp.warehouse_id, quantidade: q, rotulo: "esta devolu\xE7\xE3o", nomeDe: (id) => id });
      if (!calculo.ok) return res.status(400).json({ error: calculo.erro });
      const agora = (/* @__PURE__ */ new Date()).toISOString();
      const devolvidaTotal = Math.round((Number(emp.quantidade_devolvida) + q) * 100) / 100;
      const completa = devolvidaTotal >= Number(emp.quantidade);
      const { data: atualizado, error } = await req.db.from("loans").update({ quantidade_devolvida: devolvidaTotal, devolvido_em: completa ? agora : null, devolucao_matricula: req.user.matricula }).eq("id", emp.id).select("*").single();
      if (error) throw error;
      await gravarSaldos(req.db, emp.material_id, calculo.novos);
      await req.db.from("material_movements").insert({
        material_id: emp.material_id,
        tipo_operacao: "DEVOLUCAO_EMPRESTIMO",
        quantidade: q,
        warehouse_origem_id: null,
        warehouse_destino_id: emp.warehouse_id,
        funcionario_matricula: req.user.matricula,
        justificativa: `Devolu\xE7\xE3o de ${emp.tomador_nome}${completa ? "" : " (parcial)"}`
      });
      res.json({ emprestimo: { ...atualizado, material_nome: emp.materials?.nome ?? "", unidade_medida: emp.materials?.unidade_medida ?? "" }, saldos: calculo.novos });
    } catch (err) {
      console.error("[POST /api/emprestimos/:id/devolver] erro:", err.message);
      res.status(500).json({ error: "Erro ao registrar devolu\xE7\xE3o." });
    }
  });
  const selecionarEntrega = "*, materials(nome, unidade_medida)";
  const comMaterial = ({ materials: mat, ...e }) => ({ ...e, material_nome: mat?.nome ?? "Material removido", unidade_medida: mat?.unidade_medida ?? "" });
  app.get("/api/estoques/:id/entregas", authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), withAcessos, async (req, res) => {
    try {
      if (!podeVer(req.acessos ?? null, req.params.id)) return res.status(403).json({ error: "Voc\xEA n\xE3o tem acesso a este estoque." });
      const { data, error } = await req.db.from("loans").select(selecionarEntrega).eq("warehouse_id", req.params.id).eq("tipo", "entrega").order("retirado_em", { ascending: false }).limit(500);
      if (error) throw error;
      res.json({ entregas: (data || []).map(comMaterial) });
    } catch (err) {
      console.error("[GET /api/estoques/:id/entregas] erro:", err.message);
      res.status(500).json({ error: "Erro ao carregar entregas." });
    }
  });
  async function registrarEntrega(req, estoque, corpo) {
    const v = validarEntrega(corpo, estoque.exige_assinatura);
    if (!v.ok) return { status: 400, body: { error: v.erro } };
    const e = v.entrega;
    const { data: material } = await req.db.from("materials").select("*").eq("id", e.material_id).maybeSingle();
    if (!material) return { status: 404, body: { error: "Material n\xE3o encontrado." } };
    const atuais = await saldosDoMaterial(req.db, e.material_id);
    const calculo = calcularMovimento(atuais, { origem_id: estoque.id, quantidade: e.quantidade, rotulo: "esta entrega", nomeDe: () => estoque.nome });
    if (!calculo.ok) return { status: 400, body: { error: calculo.erro } };
    const agora = /* @__PURE__ */ new Date();
    const ate = validoAte(material.validade_troca_dias, agora);
    const { data: entrega, error } = await req.db.from("loans").insert({
      tipo: "entrega",
      warehouse_id: estoque.id,
      material_id: e.material_id,
      quantidade: e.quantidade,
      tomador_nome: e.tomador_nome,
      tomador_referencia: e.tomador_referencia,
      observacao: e.observacao,
      assinatura: e.assinatura,
      retirado_em: agora.toISOString(),
      prazo_em: ate ? ate.toISOString() : null,
      retirada_matricula: req.user.matricula
    }).select("*").single();
    if (error) throw error;
    await gravarSaldos(req.db, e.material_id, calculo.novos);
    await req.db.from("material_movements").insert({
      material_id: e.material_id,
      tipo_operacao: "ENTREGA",
      quantidade: e.quantidade,
      warehouse_origem_id: estoque.id,
      warehouse_destino_id: null,
      funcionario_matricula: req.user.matricula,
      justificativa: `Entrega a ${e.tomador_nome}${e.tomador_referencia ? ` (${e.tomador_referencia})` : ""}${ate ? ` \u2014 trocar at\xE9 ${ate.toISOString().slice(0, 10)}` : ""}`
    });
    return { status: 201, body: { entrega: { ...entrega, material_nome: material.nome, unidade_medida: material.unidade_medida }, saldos: calculo.novos }, material, saldosNovos: calculo.novos, saldosAntes: atuais };
  }
  app.post("/api/estoques/:id/entregas", authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), withAcessos, async (req, res) => {
    try {
      const depositos = await depositosDaOrg(req.db);
      const estoque = depositos.find((d) => d.id === req.params.id);
      if (!estoque) return res.status(404).json({ error: "Estoque n\xE3o encontrado." });
      if (estoque.modo !== "entrega") return res.status(409).json({ error: "Este estoque n\xE3o \xE9 de entrega." });
      if (!podeOperar(req.acessos ?? null, estoque.id)) return res.status(403).json({ error: "Voc\xEA n\xE3o tem permiss\xE3o para operar este estoque." });
      const r = await registrarEntrega(req, estoque, req.body);
      if (r.status === 201 && r.material) {
        await avisarMinimo(req.plano, r.material, r.saldosNovos, r.saldosAntes, depositos.filter((d) => d.unit_id === estoque.unit_id), `Entrega em ${estoque.nome} | Registrou: ${req.user.nome}`);
      }
      res.status(r.status).json(r.body);
    } catch (err) {
      console.error("[POST /api/estoques/:id/entregas] erro:", err.message);
      res.status(500).json({ error: "Erro ao registrar entrega." });
    }
  });
  app.post("/api/entregas/:id/encerrar", authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), withAcessos, async (req, res) => {
    try {
      const { data: ent } = await req.db.from("loans").select(selecionarEntrega).eq("id", req.params.id).eq("tipo", "entrega").maybeSingle();
      if (!ent) return res.status(404).json({ error: "Entrega n\xE3o encontrada." });
      if (ent.devolvido_em || ent.encerrado_em) return res.status(409).json({ error: "Esta entrega j\xE1 foi encerrada." });
      if (!podeOperar(req.acessos ?? null, ent.warehouse_id)) return res.status(403).json({ error: "Voc\xEA n\xE3o tem permiss\xE3o para operar este estoque." });
      const modo = String(req.body?.modo ?? "");
      const agora = (/* @__PURE__ */ new Date()).toISOString();
      const falta = arredondar(Number(ent.quantidade) - Number(ent.quantidade_devolvida));
      if (modo === "devolvido") {
        const atuais = await saldosDoMaterial(req.db, ent.material_id);
        const calculo = calcularMovimento(atuais, { destino_id: ent.warehouse_id, quantidade: falta, rotulo: "esta devolu\xE7\xE3o", nomeDe: (id) => id });
        if (!calculo.ok) return res.status(400).json({ error: calculo.erro });
        const { data: atualizado, error } = await req.db.from("loans").update({ quantidade_devolvida: Number(ent.quantidade), devolvido_em: agora, devolucao_matricula: req.user.matricula }).eq("id", ent.id).select(selecionarEntrega).single();
        if (error) throw error;
        await gravarSaldos(req.db, ent.material_id, calculo.novos);
        await req.db.from("material_movements").insert({
          material_id: ent.material_id,
          tipo_operacao: "DEVOLUCAO_ENTREGA",
          quantidade: falta,
          warehouse_origem_id: null,
          warehouse_destino_id: ent.warehouse_id,
          funcionario_matricula: req.user.matricula,
          justificativa: `Devolu\xE7\xE3o de ${ent.tomador_nome}${req.body?.detalhe ? ` \u2014 ${String(req.body.detalhe).slice(0, 200)}` : ""}`
        });
        return res.json({ entrega: comMaterial(atualizado) });
      }
      if (modo === "consumido") {
        const { data: atualizado, error } = await req.db.from("loans").update({ encerrado_em: agora, encerramento: "consumido", devolucao_matricula: req.user.matricula }).eq("id", ent.id).select(selecionarEntrega).single();
        if (error) throw error;
        return res.json({ entrega: comMaterial(atualizado) });
      }
      if (modo === "substituido") {
        const depositos = await depositosDaOrg(req.db);
        const estoque = depositos.find((d) => d.id === ent.warehouse_id);
        if (!estoque) return res.status(409).json({ error: "O estoque desta entrega n\xE3o est\xE1 mais ativo." });
        const r = await registrarEntrega(req, estoque, {
          material_id: ent.material_id,
          quantidade: falta,
          tomador_nome: ent.tomador_nome,
          tomador_referencia: ent.tomador_referencia,
          observacao: req.body?.detalhe ? String(req.body.detalhe) : `Troca da entrega de ${String(ent.retirado_em).slice(0, 10)}`,
          assinatura: req.body?.assinatura ?? null
        });
        if (r.status !== 201) return res.status(r.status).json(r.body);
        const nova = r.body.entrega;
        const { data: antiga, error } = await req.db.from("loans").update({ encerrado_em: agora, encerramento: "substituido", substituido_por: nova.id, devolucao_matricula: req.user.matricula }).eq("id", ent.id).select(selecionarEntrega).single();
        if (error) throw error;
        return res.status(201).json({ entrega: comMaterial(antiga), nova });
      }
      return res.status(400).json({ error: "Informe como encerrar: devolvido, consumido ou substituido." });
    } catch (err) {
      console.error("[POST /api/entregas/:id/encerrar] erro:", err.message);
      res.status(500).json({ error: "Erro ao encerrar entrega." });
    }
  });
  const selecionarItem = "*, materials(nome)";
  const itemComMaterial = ({ materials: mat, ...i }) => ({ ...i, material_nome: mat?.nome ?? "Modelo removido" });
  async function sincronizarSaldoDoModelo(req, warehouseId, materialId) {
    const { count } = await req.db.from("assets").select("*", { count: "exact", head: true }).eq("warehouse_id", warehouseId).eq("material_id", materialId).neq("estado", "baixado");
    const atuais = await saldosDoMaterial(req.db, materialId);
    await gravarSaldos(req.db, materialId, { ...atuais, [warehouseId]: count ?? 0 });
  }
  app.get("/api/estoques/:id/patrimonio", authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), withAcessos, async (req, res) => {
    try {
      if (!podeVer(req.acessos ?? null, req.params.id)) return res.status(403).json({ error: "Voc\xEA n\xE3o tem acesso a este estoque." });
      const { data, error } = await req.db.from("assets").select(selecionarItem).eq("warehouse_id", req.params.id).order("codigo", { ascending: true });
      if (error) throw error;
      res.json({ itens: (data || []).map(itemComMaterial) });
    } catch (err) {
      console.error("[GET /api/estoques/:id/patrimonio] erro:", err.message);
      res.status(500).json({ error: "Erro ao carregar itens." });
    }
  });
  app.post("/api/estoques/:id/patrimonio", authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), withAcessos, async (req, res) => {
    try {
      const depositos = await depositosDaOrg(req.db);
      const estoque = depositos.find((d) => d.id === req.params.id);
      if (!estoque) return res.status(404).json({ error: "Estoque n\xE3o encontrado." });
      if (estoque.modo !== "patrimonio") return res.status(409).json({ error: "Este estoque n\xE3o \xE9 de patrim\xF4nio." });
      if (!podeOperar(req.acessos ?? null, estoque.id)) return res.status(403).json({ error: "Voc\xEA n\xE3o tem permiss\xE3o para operar este estoque." });
      const v = validarItem(req.body);
      if (!v.ok) return res.status(400).json({ error: v.erro });
      const { data: material } = await req.db.from("materials").select("id, nome").eq("id", v.item.material_id).maybeSingle();
      if (!material) return res.status(404).json({ error: "Modelo (material) n\xE3o encontrado." });
      const { data: item, error } = await req.db.from("assets").insert({ ...v.item, warehouse_id: estoque.id }).select(selecionarItem).single();
      if (error) {
        if (/duplicate|unique/i.test(error.message)) return res.status(409).json({ error: `J\xE1 existe um item com o n\xFAmero ${v.item.codigo}.` });
        throw error;
      }
      await req.db.from("asset_events").insert({ asset_id: item.id, tipo: "cadastro", detalhe: v.item.local ? `Local: ${v.item.local}` : null, funcionario_matricula: req.user.matricula });
      await sincronizarSaldoDoModelo(req, estoque.id, v.item.material_id);
      await req.db.from("material_movements").insert({
        material_id: v.item.material_id,
        tipo_operacao: "ENTRADA",
        quantidade: 1,
        warehouse_origem_id: null,
        warehouse_destino_id: estoque.id,
        funcionario_matricula: req.user.matricula,
        justificativa: `Cadastro do item ${v.item.codigo}`
      });
      res.status(201).json({ item: itemComMaterial(item) });
    } catch (err) {
      console.error("[POST /api/estoques/:id/patrimonio] erro:", err.message);
      res.status(500).json({ error: "Erro ao cadastrar item." });
    }
  });
  app.patch("/api/patrimonio/:id", authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), withAcessos, async (req, res) => {
    try {
      const { data: atual } = await req.db.from("assets").select(selecionarItem).eq("id", req.params.id).maybeSingle();
      if (!atual) return res.status(404).json({ error: "Item n\xE3o encontrado." });
      if (!podeOperar(req.acessos ?? null, atual.warehouse_id)) return res.status(403).json({ error: "Voc\xEA n\xE3o tem permiss\xE3o para operar este estoque." });
      const v = validarItem({ ...atual, ...req.body, material_id: atual.material_id });
      if (!v.ok) return res.status(400).json({ error: v.erro });
      const { codigo, serie, local, observacao, adquirido_em, valor } = v.item;
      const { data: item, error } = await req.db.from("assets").update({ codigo, serie, local, observacao, adquirido_em, valor, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", atual.id).select(selecionarItem).single();
      if (error) {
        if (/duplicate|unique/i.test(error.message)) return res.status(409).json({ error: `J\xE1 existe um item com o n\xFAmero ${v.item.codigo}.` });
        throw error;
      }
      await req.db.from("asset_events").insert({ asset_id: atual.id, tipo: "edicao", detalhe: "Dados do item alterados", funcionario_matricula: req.user.matricula });
      res.json({ item: itemComMaterial(item) });
    } catch (err) {
      console.error("[PATCH /api/patrimonio/:id] erro:", err.message);
      res.status(500).json({ error: "Erro ao editar item." });
    }
  });
  app.post("/api/patrimonio/:id/eventos", authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), withAcessos, async (req, res) => {
    try {
      const { data: atual } = await req.db.from("assets").select(selecionarItem).eq("id", req.params.id).maybeSingle();
      if (!atual) return res.status(404).json({ error: "Item n\xE3o encontrado." });
      if (!podeOperar(req.acessos ?? null, atual.warehouse_id)) return res.status(403).json({ error: "Voc\xEA n\xE3o tem permiss\xE3o para operar este estoque." });
      const v = validarEvento(req.body);
      if (!v.ok) return res.status(400).json({ error: v.erro });
      const t = transicionar(atual.estado, v.evento.tipo);
      if (!t.ok) return res.status(409).json({ error: t.erro });
      const patch = { estado: t.para, updated_at: (/* @__PURE__ */ new Date()).toISOString() };
      if (v.evento.tipo === "alocacao") {
        patch.responsavel_nome = v.evento.para_nome;
        patch.responsavel_referencia = v.evento.para_referencia;
      }
      if (v.evento.tipo === "devolucao" || v.evento.tipo === "manutencao" || v.evento.tipo === "baixa") {
        patch.responsavel_nome = null;
        patch.responsavel_referencia = null;
      }
      const { data: item, error } = await req.db.from("assets").update(patch).eq("id", atual.id).select(selecionarItem).single();
      if (error) throw error;
      const { data: evento, error: erroEv } = await req.db.from("asset_events").insert({ asset_id: atual.id, tipo: v.evento.tipo, detalhe: v.evento.detalhe, para_nome: v.evento.para_nome, para_referencia: v.evento.para_referencia, funcionario_matricula: req.user.matricula }).select("*").single();
      if (erroEv) throw erroEv;
      if (v.evento.tipo === "baixa") {
        await sincronizarSaldoDoModelo(req, atual.warehouse_id, atual.material_id);
        await req.db.from("material_movements").insert({
          material_id: atual.material_id,
          tipo_operacao: "BAIXA",
          quantidade: 1,
          warehouse_origem_id: atual.warehouse_id,
          warehouse_destino_id: null,
          funcionario_matricula: req.user.matricula,
          justificativa: `Baixa do item ${atual.codigo}${v.evento.detalhe ? ` \u2014 ${v.evento.detalhe}` : ""}`
        });
      }
      res.json({ item: itemComMaterial(item), evento });
    } catch (err) {
      console.error("[POST /api/patrimonio/:id/eventos] erro:", err.message);
      res.status(500).json({ error: "Erro ao registrar evento." });
    }
  });
  app.get("/api/patrimonio/:id/eventos", authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), withAcessos, async (req, res) => {
    try {
      const { data: item } = await req.db.from("assets").select("id, warehouse_id").eq("id", req.params.id).maybeSingle();
      if (!item) return res.status(404).json({ error: "Item n\xE3o encontrado." });
      if (!podeVer(req.acessos ?? null, item.warehouse_id)) return res.status(403).json({ error: "Voc\xEA n\xE3o tem acesso a este estoque." });
      const { data, error } = await req.db.from("asset_events").select("*").eq("asset_id", item.id).order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      res.json({ eventos: data || [] });
    } catch (err) {
      console.error("[GET /api/patrimonio/:id/eventos] erro:", err.message);
      res.status(500).json({ error: "Erro ao carregar hist\xF3rico do item." });
    }
  });
  const resumoDaAssinatura = async (organizationId) => {
    const [c, assinatura, pagamentos] = await Promise.all([contaDe(organizationId), assinaturaAtual(organizationId), pagamentosDe(organizationId)]);
    return {
      organizacao: c?.organizacao ?? null,
      conta: c?.conta ?? null,
      assinatura,
      pagamentos,
      // O que dá para assinar agora: por plano e ciclo, se existe caminho (plano no painel ou API configurada).
      disponivel: Object.fromEntries(CICLOS.map((ciclo) => [ciclo, mpConfigurado() || PLANOS.some((p2) => mpPlanId(p2, ciclo))])),
      modo_teste: modoTeste(),
      avaliacao_dias: AVALIACAO_DIAS
    };
  };
  app.get("/api/assinatura", authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      res.json(await resumoDaAssinatura(req.user.organization_id));
    } catch (err) {
      console.error("[GET /api/assinatura] erro:", err.message);
      res.status(500).json({ error: "Erro ao carregar a assinatura." });
    }
  });
  app.post("/api/assinatura", authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const plano = req.body?.plano;
      const ciclo = req.body?.ciclo ?? "mensal";
      if (!ehPlano(plano)) return res.status(400).json({ error: "Escolha o plano." });
      if (!CICLOS.includes(ciclo)) return res.status(400).json({ error: "Ciclo inv\xE1lido: mensal ou anual." });
      if (!mpPlanId(plano, ciclo) && !mpConfigurado()) return res.status(503).json({ error: "Pagamento ainda n\xE3o configurado para este ciclo. Fale com a gente." });
      const { data: eu } = await req.db.from(ESTOQUE_USERS).select("email").eq("id", req.user.id).maybeSingle();
      const email = String(eu?.email || "").trim().toLowerCase();
      if (!email) return res.status(400).json({ error: "Cadastre um e-mail no seu usu\xE1rio antes de assinar: \xE9 para onde v\xE3o os recibos." });
      const r = await iniciarAssinatura({ organizationId: req.user.organization_id, plano, ciclo, payerEmail: email, trocar: Boolean(req.body?.trocar) });
      console.info(`[assinatura] ${req.user.organization_id} \u2192 ${plano}/${ciclo} (${r.assinatura.mp_plan_id ? "plano do painel" : "API"})`);
      res.json({ url: r.url, valor: precoDo(plano, ciclo) });
    } catch (err) {
      if (err instanceof ErroDeAssinatura) return res.status(err.status).json({ error: err.message });
      console.error("[POST /api/assinatura] erro:", err.message);
      res.status(500).json({ error: "N\xE3o foi poss\xEDvel iniciar a assinatura." });
    }
  });
  app.post("/api/assinatura/cancelar", authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      await cancelarAssinatura2(req.user.organization_id);
      res.json(await resumoDaAssinatura(req.user.organization_id));
    } catch (err) {
      if (err instanceof ErroDeAssinatura) return res.status(err.status).json({ error: err.message });
      console.error("[POST /api/assinatura/cancelar] erro:", err.message);
      res.status(500).json({ error: "N\xE3o foi poss\xEDvel cancelar a assinatura." });
    }
  });
  app.post("/api/assinatura/sincronizar", authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const id = String(req.body?.preapproval_id ?? "").trim();
      if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) return res.status(400).json({ error: "Assinatura inv\xE1lida." });
      const pre = await buscarAssinatura(id);
      const r = await aplicarPreapproval(pre, { organizationId: req.user.organization_id });
      if (!r.casou) return res.status(409).json({ error: r.motivo ?? "A assinatura n\xE3o corresponde a esta conta." });
      res.json(await resumoDaAssinatura(req.user.organization_id));
    } catch (err) {
      console.error("[POST /api/assinatura/sincronizar] erro:", err.message);
      res.status(500).json({ error: "N\xE3o foi poss\xEDvel confirmar a assinatura. O Mercado Pago ainda vai avisar a gente; tente de novo em instantes." });
    }
  });
  app.post("/api/webhooks/mercadopago", async (req, res) => {
    const tipo = tipoDoEvento(req.body, req.query);
    const id = idDoEvento(req.body, req.query);
    if (!id) return res.status(400).json({ error: "Evento sem id." });
    const valida = assinaturaDoWebhookValida({
      xSignature: req.header("x-signature"),
      xRequestId: req.header("x-request-id"),
      dataId: id,
      secret: process.env.MP_WEBHOOK_SECRET
    });
    if (valida === false) {
      console.warn("[webhook MP] assinatura inv\xE1lida", { tipo, id });
      return res.status(401).json({ error: "Assinatura do webhook inv\xE1lida." });
    }
    if (valida === null) console.warn("[webhook MP] MP_WEBHOOK_SECRET n\xE3o configurado \u2014 evento aceito sem conferir a assinatura.");
    res.status(200).json({ ok: true });
    try {
      const r = await tratarEvento(tipo, id);
      const casou = "casou" in r ? r.casou : true;
      await registrarEvento({ tipo, mpId: id, organizationId: "organizationId" in r ? r.organizationId : null, tratado: casou, erro: "motivo" in r ? r.motivo ?? null : null, payload: req.body });
      if (!("ignorado" in r)) console.info(`[webhook MP] ${tipo} ${id}: ${casou ? "aplicado" : `n\xE3o casou (${r.motivo})`}`);
    } catch (err) {
      console.error("[webhook MP] erro:", err.message);
      await registrarEvento({ tipo, mpId: id, organizationId: null, tratado: false, erro: err.message, payload: req.body });
    }
  });
  app.post("/api/materials/bulk-recount", authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), withAcessos, async (req, res) => {
    try {
      const { location, warehouse_id, unit_id, counts } = req.body || {};
      const depositos = await depositosDaOrg(req.db);
      let deposito;
      if (warehouse_id) {
        deposito = depositos.find((d) => d.id === warehouse_id);
        if (!deposito) return res.status(404).json({ error: "Dep\xF3sito n\xE3o encontrado." });
      } else {
        if (location !== "CENTRAL" && location !== "OBRA") {
          return res.status(400).json({ error: "Local inv\xE1lido." });
        }
        try {
          deposito = acharDeposito(depositosDaUnidade(depositos, unit_id), location);
        } catch (e) {
          return res.status(409).json({ error: e.message });
        }
      }
      const tipo_operacao = deposito.tipo === "CENTRAL" ? "AJUSTE_CENTRAL" : deposito.tipo === "OBRA" ? "AJUSTE_OBRA" : "AJUSTE";
      if (!podeOperar(req.acessos ?? null, deposito.id)) {
        return res.status(403).json({ error: "Voc\xEA n\xE3o tem permiss\xE3o para ajustar este dep\xF3sito." });
      }
      if (deposito.modo === "validade") return res.status(409).json({ error: "Este estoque controla lotes: ajuste lote a lote na tela dele." });
      if (deposito.modo === "patrimonio") return res.status(409).json({ error: "Este estoque \xE9 de patrim\xF4nio: cadastre ou baixe itens na tela dele." });
      if (!operacaoPermitida(deposito, "AJUSTE")) return res.status(409).json({ error: `Ajuste est\xE1 desligado em ${deposito.nome}.` });
      if (!Array.isArray(counts) || counts.length === 0) {
        return res.status(400).json({ error: "Nenhuma contagem enviada." });
      }
      const applied = [];
      const criticalItems = [];
      for (const entry of counts) {
        const materialId = entry?.material_id;
        const contagem = arredondar(Number(entry?.contagem));
        if (materialId == null || Number.isNaN(contagem)) continue;
        if (contagem < 0) continue;
        const { data: material } = await req.db.from("materials").select("id, nome, estoque_minimo").eq("id", materialId).single();
        if (!material) continue;
        const atuais = await saldosDoMaterial(req.db, Number(materialId));
        const saldoAtual = atuais[deposito.id] ?? 0;
        const diferenca = arredondar(contagem - saldoAtual);
        if (diferenca === 0) continue;
        const novos = { ...atuais, [deposito.id]: contagem };
        try {
          await gravarSaldos(req.db, Number(materialId), novos);
        } catch (e) {
          console.error(`[bulk-recount] material ${materialId}:`, e.message);
          continue;
        }
        await req.db.from("material_movements").insert({
          material_id: materialId,
          tipo_operacao,
          quantidade: diferenca,
          warehouse_destino_id: deposito.id,
          funcionario_matricula: req.user.matricula,
          justificativa: `Recontagem di\xE1ria: sistema indicava ${saldoAtual}, contagem f\xEDsica apontou ${contagem}.`
        });
        applied.push({ material_id: materialId, nome: material.nome, diferenca });
        if (contagem <= material.estoque_minimo) {
          criticalItems.push({ nome: material.nome, novoSaldo: contagem, estoque_minimo: material.estoque_minimo });
        }
      }
      if (criticalItems.length > 0) {
        try {
          const t = await getTransporter();
          if (t) {
            await t.sendMail({
              from: remetente(),
              to: destinatarioAdmin(),
              subject: `Recontagem (${deposito.nome}): ${criticalItems.length} item(ns) em estoque cr\xEDtico`,
              html: `<p>Ap\xF3s a recontagem de ${req.user.nome}, os itens abaixo ficaram em n\xEDvel cr\xEDtico:</p>
                     <ul>${criticalItems.map((i) => `<li>${i.nome}: ${i.novoSaldo} (m\xEDnimo ${i.estoque_minimo})</li>`).join("")}</ul>`
            });
          }
        } catch (mailErr) {
          console.error("[Alerta de Recontagem] falha ao enviar e-mail:", mailErr.message);
        }
      }
      res.json({ success: true, applied });
    } catch (err) {
      console.error("[POST /api/materials/bulk-recount] erro:", err.message);
      res.status(500).json({ error: "Erro ao salvar recontagem." });
    }
  });
  const MISSING_TABLE_CODES = ["42P01", "PGRST205"];
  function isMissingSupportTable(err) {
    return MISSING_TABLE_CODES.includes(err?.code) || /support_tickets/.test(err?.message || "");
  }
  const SETUP_ERROR = "O m\xF3dulo de suporte ainda n\xE3o foi instalado no banco. Rode a migra\xE7\xE3o migrations/001_suporte_e_seguranca.sql no Supabase.";
  const TICKET_TYPES = ["DUPLICADO", "NOME_INCORRETO", "INFO_INCORRETA", "FALTA_CADASTRO", "OUTRO"];
  const TICKET_STATUSES = ["ABERTO", "EM_ANALISE", "RESOLVIDO", "RECUSADO"];
  const TICKET_PRIORITIES = ["BAIXA", "NORMAL", "ALTA"];
  async function loadTickets(db, onlyMatricula) {
    let query = db.from("support_tickets").select("*, materiais:support_ticket_materials(id, material_id, material_nome)").order("created_at", { ascending: false });
    if (onlyMatricula) query = query.eq("autor_matricula", onlyMatricula);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }
  app.get("/api/support", authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), async (req, res) => {
    try {
      const isAdmin = ADMIN_ROLES.includes(req.user.role);
      res.json({ tickets: await loadTickets(req.db, isAdmin ? void 0 : req.user.matricula) });
    } catch (err) {
      if (isMissingSupportTable(err)) return res.status(503).json({ error: SETUP_ERROR, setup_required: true });
      console.error("[GET /api/support] erro:", err.message);
      res.status(500).json({ error: "Erro ao carregar chamados de suporte." });
    }
  });
  app.get("/api/support/:id/comments", authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { data: ticket } = await req.db.from("support_tickets").select("autor_matricula").eq("id", id).maybeSingle();
      if (!ticket) return res.status(404).json({ error: "Chamado n\xE3o encontrado." });
      if (!ADMIN_ROLES.includes(req.user.role) && ticket.autor_matricula !== req.user.matricula) {
        return res.status(403).json({ error: "Voc\xEA n\xE3o tem acesso a este chamado." });
      }
      const { data, error } = await req.db.from("support_ticket_comments").select("*").eq("ticket_id", id).order("created_at", { ascending: true });
      if (error) throw error;
      res.json({ comments: data || [] });
    } catch (err) {
      console.error("[GET /api/support/:id/comments] erro:", err.message);
      res.status(500).json({ error: "Erro ao carregar mensagens do chamado." });
    }
  });
  app.post("/api/support", authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), async (req, res) => {
    try {
      const { tipo, assunto, descricao, prioridade, material_ids } = req.body || {};
      if (!TICKET_TYPES.includes(tipo)) return res.status(400).json({ error: "Tipo de chamado inv\xE1lido." });
      if (!assunto || String(assunto).trim().length < 3) return res.status(400).json({ error: "Descreva o assunto em pelo menos 3 caracteres." });
      if (!descricao || String(descricao).trim().length < 5) return res.status(400).json({ error: "Descreva o problema em pelo menos 5 caracteres." });
      if (prioridade && !TICKET_PRIORITIES.includes(prioridade)) return res.status(400).json({ error: "Prioridade inv\xE1lida." });
      const ids = Array.isArray(material_ids) ? [...new Set(material_ids.map(Number))].filter(Boolean) : [];
      if (tipo === "DUPLICADO" && ids.length < 2) {
        return res.status(400).json({ error: "Para relatar duplicidade, selecione pelo menos dois materiais." });
      }
      if (tipo !== "OUTRO" && tipo !== "FALTA_CADASTRO" && ids.length === 0) {
        return res.status(400).json({ error: "Selecione ao menos um material." });
      }
      const { data: ticket, error } = await req.db.from("support_tickets").insert({
        tipo,
        assunto: String(assunto).trim(),
        descricao: String(descricao).trim(),
        prioridade: prioridade || "NORMAL",
        autor_matricula: req.user.matricula,
        autor_nome: req.user.nome,
        autor_role: req.user.role
      }).select().single();
      if (error) throw error;
      if (ids.length > 0) {
        const { data: mats } = await req.db.from("materials").select("id, nome").in("id", ids);
        const rows = (mats || []).map((m) => ({
          ticket_id: ticket.id,
          material_id: m.id,
          material_nome: m.nome
          // snapshot: sobrevive a exclusão/unificação
        }));
        if (rows.length > 0) await req.db.from("support_ticket_materials").insert(rows);
      }
      res.status(201).json({ ticket });
    } catch (err) {
      if (isMissingSupportTable(err)) return res.status(503).json({ error: SETUP_ERROR, setup_required: true });
      console.error("[POST /api/support] erro:", err.message);
      res.status(500).json({ error: "Erro ao abrir chamado." });
    }
  });
  app.post("/api/support/:id/comments", authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { mensagem } = req.body || {};
      if (!mensagem || String(mensagem).trim().length === 0) {
        return res.status(400).json({ error: "Escreva uma mensagem." });
      }
      const { data: ticket } = await req.db.from("support_tickets").select("autor_matricula").eq("id", id).maybeSingle();
      if (!ticket) return res.status(404).json({ error: "Chamado n\xE3o encontrado." });
      if (!ADMIN_ROLES.includes(req.user.role) && ticket.autor_matricula !== req.user.matricula) {
        return res.status(403).json({ error: "Voc\xEA n\xE3o tem acesso a este chamado." });
      }
      const { data, error } = await req.db.from("support_ticket_comments").insert({
        ticket_id: id,
        autor_matricula: req.user.matricula,
        autor_nome: req.user.nome,
        mensagem: String(mensagem).trim()
      }).select().single();
      if (error) throw error;
      await req.db.from("support_tickets").update({ status: "EM_ANALISE" }).eq("id", id).in("status", ["RESOLVIDO", "RECUSADO"]);
      res.status(201).json({ comment: data });
    } catch (err) {
      console.error("[POST /api/support/:id/comments] erro:", err.message);
      res.status(500).json({ error: "Erro ao enviar mensagem." });
    }
  });
  app.patch("/api/support/:id", authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { status, prioridade, resolucao } = req.body || {};
      const patch = {};
      if (status !== void 0) {
        if (!TICKET_STATUSES.includes(status)) return res.status(400).json({ error: "Status inv\xE1lido." });
        patch.status = status;
        if (status === "RESOLVIDO" || status === "RECUSADO") {
          patch.resolved_at = (/* @__PURE__ */ new Date()).toISOString();
          patch.resolvido_por = req.user.nome;
        } else {
          patch.resolved_at = null;
          patch.resolvido_por = null;
        }
      }
      if (prioridade !== void 0) {
        if (!TICKET_PRIORITIES.includes(prioridade)) return res.status(400).json({ error: "Prioridade inv\xE1lida." });
        patch.prioridade = prioridade;
      }
      if (resolucao !== void 0) patch.resolucao = resolucao ? String(resolucao).trim() : null;
      if (Object.keys(patch).length === 0) return res.status(400).json({ error: "Nada para atualizar." });
      const { data, error } = await req.db.from("support_tickets").update(patch).eq("id", id).select().single();
      if (error) throw error;
      res.json({ ticket: data });
    } catch (err) {
      console.error("[PATCH /api/support/:id] erro:", err.message);
      res.status(500).json({ error: "Erro ao atualizar chamado." });
    }
  });
  const MANAGEABLE_ROLES = ALL_INVENTORY_ROLES;
  const MIN_PASSWORD_LENGTH = 8;
  const USER_COLUMNS = "id, nome, email, matricula, role, created_at";
  function assertManageable(role) {
    return !!role && MANAGEABLE_ROLES.includes(role);
  }
  app.get("/api/users", authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const { data, error } = await req.db.from(ESTOQUE_USERS).select(`${USER_COLUMNS}, senha`).in("role", MANAGEABLE_ROLES).order("nome", { ascending: true });
      if (error) throw error;
      const { data: atribuicoes, error: aErr } = await req.db.from("estoque_user_warehouses").select("user_id, warehouse_id, nivel");
      if (aErr) throw aErr;
      const porUsuario = /* @__PURE__ */ new Map();
      for (const a of atribuicoes || []) {
        const lista = porUsuario.get(a.user_id) || [];
        lista.push({ warehouse_id: a.warehouse_id, nivel: a.nivel });
        porUsuario.set(a.user_id, lista);
      }
      const users = (data || []).map(({ senha, ...u }) => ({
        ...u,
        senha_em_texto_puro: !/^\$2[aby]\$/.test(String(senha || "")),
        acessos: porUsuario.get(u.id) || []
      }));
      res.json({ users });
    } catch (err) {
      console.error("[GET /api/users] erro:", err.message);
      res.status(500).json({ error: "Erro ao carregar usu\xE1rios." });
    }
  });
  app.post("/api/users", authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const { nome, matricula, email, role, senha } = req.body || {};
      if (!nome || !matricula || !senha) return res.status(400).json({ error: "Informe nome, matr\xEDcula e senha." });
      if (!ASSIGNABLE_ROLES.includes(String(role))) return res.status(400).json({ error: "Perfil inv\xE1lido: use Administrador, Administrativo ou Operador." });
      if (String(senha).length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ error: `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` });
      }
      const { data: existing } = await req.db.from(ESTOQUE_USERS).select("id").eq("matricula", matricula).maybeSingle();
      if (existing) return res.status(409).json({ error: "J\xE1 existe um usu\xE1rio com esta matr\xEDcula." });
      const { count: pessoas } = await req.db.from(ESTOQUE_USERS).select("*", { count: "exact", head: true });
      const negada = negarLimite(req.plano, "usuarios", pessoas ?? 0);
      if (negada) return res.status(negada.status).json(negada.body);
      const { data, error } = await req.db.from(ESTOQUE_USERS).insert({
        nome: String(nome).trim(),
        matricula: String(matricula).trim(),
        email: email ? String(email).trim().toLowerCase() : null,
        role,
        senha: await bcrypt.hash(String(senha), 10)
      }).select(USER_COLUMNS).single();
      if (error) throw error;
      res.status(201).json({ user: data });
    } catch (err) {
      console.error("[POST /api/users] erro:", err.message);
      res.status(500).json({ error: "Erro ao criar usu\xE1rio." });
    }
  });
  app.patch("/api/users/:id", authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { nome, email, role, senha } = req.body || {};
      const { data: target } = await req.db.from(ESTOQUE_USERS).select("id, role, matricula").eq("id", id).maybeSingle();
      if (!target) return res.status(404).json({ error: "Usu\xE1rio n\xE3o encontrado." });
      if (!assertManageable(target.role)) {
        return res.status(403).json({ error: "Este usu\xE1rio pertence a outro sistema e n\xE3o pode ser editado aqui." });
      }
      const patch = {};
      if (nome !== void 0) patch.nome = String(nome).trim();
      if (email !== void 0) patch.email = email ? String(email).trim().toLowerCase() : null;
      if (role !== void 0) {
        if (!ASSIGNABLE_ROLES.includes(String(role))) return res.status(400).json({ error: "Perfil inv\xE1lido: use Administrador, Administrativo ou Operador." });
        if (target.id === req.user.id && !ADMIN_ROLES.includes(role)) {
          return res.status(400).json({ error: "Voc\xEA n\xE3o pode remover o seu pr\xF3prio acesso de administrador." });
        }
        patch.role = role;
      }
      if (senha) {
        if (String(senha).length < MIN_PASSWORD_LENGTH) {
          return res.status(400).json({ error: `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` });
        }
        patch.senha = await bcrypt.hash(String(senha), 10);
      }
      if (Object.keys(patch).length === 0) return res.status(400).json({ error: "Nada para atualizar." });
      const { data, error } = await req.db.from(ESTOQUE_USERS).update(patch).eq("id", id).select(USER_COLUMNS).single();
      if (error) throw error;
      res.json({ user: data });
    } catch (err) {
      console.error("[PATCH /api/users/:id] erro:", err.message);
      res.status(500).json({ error: "Erro ao atualizar usu\xE1rio." });
    }
  });
  app.delete("/api/users/:id", authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (id === req.user.id) return res.status(400).json({ error: "Voc\xEA n\xE3o pode excluir a pr\xF3pria conta." });
      const { data: target } = await req.db.from(ESTOQUE_USERS).select("id, role").eq("id", id).maybeSingle();
      if (!target) return res.status(404).json({ error: "Usu\xE1rio n\xE3o encontrado." });
      if (!assertManageable(target.role)) {
        return res.status(403).json({ error: "Este usu\xE1rio pertence a outro sistema e n\xE3o pode ser exclu\xEDdo aqui." });
      }
      if (ADMIN_ROLES.includes(target.role)) {
        const { count } = await req.db.from(ESTOQUE_USERS).select("id", { count: "exact", head: true }).in("role", ADMIN_ROLES);
        if ((count ?? 0) <= 1) return res.status(400).json({ error: "Este \xE9 o \xFAltimo administrador \u2014 n\xE3o \xE9 poss\xEDvel exclu\xED-lo." });
      }
      const { error } = await req.db.from(ESTOQUE_USERS).delete().eq("id", id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err) {
      console.error("[DELETE /api/users/:id] erro:", err.message);
      res.status(500).json({ error: "Erro ao excluir usu\xE1rio." });
    }
  });
  app.put("/api/users/:id/acessos", authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { data: alvo } = await req.db.from(ESTOQUE_USERS).select("id, nome, role").eq("id", id).maybeSingle();
      if (!alvo) return res.status(404).json({ error: "Usu\xE1rio n\xE3o encontrado." });
      if (!assertManageable(alvo.role)) return res.status(403).json({ error: "Este usu\xE1rio n\xE3o pertence ao estoque." });
      if (ADMIN_ROLES.includes(alvo.role)) {
        return res.status(400).json({ error: "Administrador v\xEA e opera tudo; n\xE3o recebe atribui\xE7\xE3o por dep\xF3sito." });
      }
      const pedidos = Array.isArray(req.body?.acessos) ? req.body.acessos : [];
      for (const a of pedidos) {
        if (!a?.warehouse_id || !["OPERA", "CONSULTA"].includes(a?.nivel)) {
          return res.status(400).json({ error: "Cada acesso precisa de dep\xF3sito e n\xEDvel (OPERA ou CONSULTA)." });
        }
      }
      const depositos = await depositosDaOrg(req.db, { incluirUnidadesInativas: true });
      const validos = new Set(depositos.map((d) => d.id));
      const invalido = pedidos.find((a) => !validos.has(a.warehouse_id));
      if (invalido) return res.status(404).json({ error: "Dep\xF3sito n\xE3o encontrado." });
      const { error: dErr } = await req.db.from("estoque_user_warehouses").delete().eq("user_id", id);
      if (dErr) throw dErr;
      const unicos = new Map(pedidos.map((a) => [a.warehouse_id, a.nivel]));
      if (unicos.size > 0) {
        const { error: iErr } = await req.db.from("estoque_user_warehouses").insert(
          [...unicos.entries()].map(([warehouse_id, nivel]) => ({ user_id: id, warehouse_id, nivel }))
        );
        if (iErr) throw iErr;
      }
      console.info(`[PUT /api/users/:id/acessos] ${alvo.nome} agora tem ${unicos.size} atribui\xE7\xE3o(\xF5es), por ${req.user.matricula}.`);
      res.json({ success: true, acessos: [...unicos.entries()].map(([warehouse_id, nivel]) => ({ warehouse_id, nivel })) });
    } catch (err) {
      console.error("[PUT /api/users/:id/acessos] erro:", err.message);
      res.status(500).json({ error: "Erro ao salvar acessos." });
    }
  });
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  return app;
}

// src/server/vercel-entry.ts
var vercel_entry_default = createApp();
export {
  vercel_entry_default as default
};
