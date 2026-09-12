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
var CENTRAL_ROLES = ["ALMOXARIFE_GERAL", "ALMOXARIFADO", ...ADMIN_ROLES];
var OBRA_ROLES = ["ALMOXARIFE_OBRA", ...ADMIN_ROLES];
var ALL_INVENTORY_ROLES = Array.from(/* @__PURE__ */ new Set([...CENTRAL_ROLES, ...OBRA_ROLES]));

// src/features/estoque/utils.ts
var ATTENTION_FACTOR = 1.5;
function stockTotal(m) {
  return Number(m.saldo_central) + Number(m.saldo_obra);
}
function stockStatus(m, scope = "empresa") {
  const total = stockTotal(m);
  const minimo = Number(m.estoque_minimo);
  if (total <= 0) return "RUPTURA";
  if (scope !== "empresa") {
    const aqui = scope === "central" ? Number(m.saldo_central) : Number(m.saldo_obra);
    const outro = scope === "central" ? Number(m.saldo_obra) : Number(m.saldo_central);
    if (aqui <= 0 && outro > 0) return "TRANSFERIR";
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
  "estoque_user_warehouses"
]);
var clientesPorOrg = /* @__PURE__ */ new Map();
function clientePara(organizationId) {
  const cache = clientesPorOrg.get(organizationId);
  if (cache) return cache;
  let client;
  if (RLS_ATIVO) {
    const token = jwt.sign(
      { role: "authenticated", organization_id: organizationId },
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
  whatsapp: "5584991284470",
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
function siteUrl(env = process.env) {
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
  return `${siteUrl(env)}/redefinir-senha?token=${encodeURIComponent(token)}`;
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
  const base = siteUrl(env);
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
var FLUXO_DA_OPERACAO = {
  ENTRADA_CENTRAL: { destino: "CENTRAL", rotulo: "esta entrada", quemOpera: "destino" },
  SAIDA: { origem: "CENTRAL", rotulo: "esta sa\xEDda", quemOpera: "origem" },
  REMESSA_OBRA: { origem: "CENTRAL", destino: "OBRA", rotulo: "esta remessa", quemOpera: "origem" },
  DEVOLUCAO_CENTRAL: { origem: "OBRA", destino: "CENTRAL", rotulo: "esta devolu\xE7\xE3o", quemOpera: "qualquer" },
  CONSUMO_OBRA: { origem: "OBRA", rotulo: "este consumo", quemOpera: "origem" },
  AJUSTE_CENTRAL: { destino: "CENTRAL", ajuste: true, rotulo: "este ajuste", quemOpera: "destino" },
  AJUSTE_OBRA: { destino: "OBRA", ajuste: true, rotulo: "este ajuste", quemOpera: "destino" }
};
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
function depositosDoFluxo(fluxo, depositos) {
  return {
    origem_id: fluxo.origem ? acharDeposito(depositos, fluxo.origem).id : void 0,
    destino_id: fluxo.destino ? acharDeposito(depositos, fluxo.destino).id : void 0
  };
}
async function depositosDaOrg(db, opcoes = {}) {
  let q = db.from("warehouses").select("id, nome, tipo, unit_id, ativo, units!inner(ativo)").eq("ativo", true);
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
function podeExecutar(acessos, lados, quem) {
  if (acessos === null) return true;
  const origem = lados.origem_id ? podeOperar(acessos, lados.origem_id) : false;
  const destino = lados.destino_id ? podeOperar(acessos, lados.destino_id) : false;
  if (quem === "origem") return origem;
  if (quem === "destino") return destino;
  return origem || destino;
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
function withTenant(req, res, next) {
  const organizationId = req.user?.organization_id;
  if (!organizationId) {
    return res.status(401).json({ error: "Sess\xE3o desatualizada. Entre novamente." });
  }
  req.db = scopedDb(organizationId);
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
      const role = userRow.role || (String(userRow.matricula || "").startsWith("E") ? "ALMOXARIFE_GERAL" : null);
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
      const [materialsRes, movements, staffRes, unidades, depositos, saldos, orgRes] = await Promise.all([
        db.from("materials").select("*").order("nome", { ascending: true }),
        fetchAllRows(
          () => db.from("material_movements").select("*, materials(nome)").order("created_at", { ascending: false }).order("id", { ascending: false })
        ),
        // Sem filtro de CLIENTE: esta tabela só tem gente do estoque.
        req.db.from(ESTOQUE_USERS).select("id, nome, matricula, role"),
        unidadesDaOrg(db),
        depositosDaOrg(db, { incluirUnidadesInativas: true }),
        saldosDaOrg(db),
        db.from("organizations").select("id, nome, slug, cor_primaria, logo_url").eq("id", req.user.organization_id).single()
      ]);
      if (materialsRes.error) throw materialsRes.error;
      const acessos = req.acessos ?? null;
      const depositosVisiveis = depositos.filter((d) => podeVer(acessos, d.id));
      const unidadesComAcesso = new Set(depositosVisiveis.map((d) => d.unit_id));
      const unidadesVisiveis = unidades.filter((u) => unidadesComAcesso.has(u.id));
      const visivel = new Set(depositosVisiveis.map((d) => d.id));
      const materials = (materialsRes.data || []).map((m) => {
        const todos = saldos.get(m.id) || {};
        const porDeposito = acessos === null ? todos : Object.fromEntries(Object.entries(todos).filter(([id]) => visivel.has(id)));
        return { ...m, saldos: porDeposito };
      });
      res.json({
        materials,
        materialMovements: movements,
        staff: staffRes.data || [],
        unidades: unidadesVisiveis,
        depositos: depositosVisiveis,
        // O que ESTA pessoa pode fazer, para o front montar o menu. Admin: null.
        acessos: acessos === null ? null : [...acessos.entries()].map(([warehouse_id, nivel]) => ({ warehouse_id, nivel })),
        // Nome, cor e logo — a identidade que as telas vestem por dentro.
        organizacao: orgRes.data ?? null
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
        const cor = req.body.cor_primaria === null ? null : String(req.body.cor_primaria).trim().toLowerCase();
        if (cor !== null && !COR_HEX.test(cor)) return res.status(400).json({ error: "Cor inv\xE1lida. Use o formato #rrggbb." });
        patch.cor_primaria = cor;
      }
      if (Object.keys(patch).length === 0) return res.status(400).json({ error: "Nada para alterar." });
      const { data, error } = await req.db.from("organizations").update(patch).eq("id", req.user.organization_id).select("id, nome, slug, cor_primaria, logo_url").single();
      if (error || !data) throw error ?? new Error("organiza\xE7\xE3o n\xE3o encontrada");
      res.json({ organizacao: data });
    } catch (err) {
      console.error("[PATCH /api/organization] erro:", err.message);
      res.status(500).json({ error: "Erro ao atualizar a organiza\xE7\xE3o." });
    }
  });
  app.post("/api/organization/logo-upload-url", authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
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
      const { data, error } = await req.db.from("organizations").update({ logo_url: publicUrl }).eq("id", req.user.organization_id).select("id, nome, slug, cor_primaria, logo_url").single();
      if (error || !data) throw error ?? new Error("organiza\xE7\xE3o n\xE3o encontrada");
      if (anterior && anterior !== caminho) {
        const { error: rErr } = await supabaseServer.storage.from("logos").remove([anterior]);
        if (rErr) console.warn("[logo] n\xE3o apagou o anterior:", rErr.message);
      }
      res.json({ organizacao: data });
    } catch (err) {
      console.error("[POST /api/organization/logo] erro:", err.message);
      res.status(500).json({ error: "Erro ao salvar o logo." });
    }
  });
  app.delete("/api/organization/logo", authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const { data: atual } = await req.db.from("organizations").select("logo_url").eq("id", req.user.organization_id).single();
      const caminho = caminhoDoLogo(atual?.logo_url);
      const { data, error } = await req.db.from("organizations").update({ logo_url: null }).eq("id", req.user.organization_id).select("id, nome, slug, cor_primaria, logo_url").single();
      if (error || !data) throw error ?? new Error("organiza\xE7\xE3o n\xE3o encontrada");
      if (caminho) {
        const { error: rErr } = await supabaseServer.storage.from("logos").remove([caminho]);
        if (rErr) console.warn("[logo] n\xE3o apagou o arquivo:", rErr.message);
      }
      res.json({ organizacao: data });
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
      const { data: unidade, error: unidadeErr } = await req.db.from("units").insert({ nome, slug }).select("id, nome, slug, ativo").single();
      if (unidadeErr) {
        if (/duplicate|unique/i.test(unidadeErr.message)) {
          return res.status(409).json({ error: "J\xE1 existe uma unidade com esse nome." });
        }
        throw unidadeErr;
      }
      const { data: depositos, error: depErr } = await req.db.from("warehouses").insert([
        { unit_id: unidade.id, nome: "Almoxarifado Central", tipo: "CENTRAL" },
        { unit_id: unidade.id, nome: "Almoxarifado de Obra", tipo: "OBRA" }
      ]).select("id, nome, tipo, unit_id, ativo");
      if (depErr) throw depErr;
      console.info(`[POST /api/units] "${nome}" criada por ${req.user.matricula} com ${depositos?.length} dep\xF3sitos.`);
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
      const nome = String(req.body?.nome || "").trim();
      if (nome.length < 2 || nome.length > 60) return res.status(400).json({ error: "Nome deve ter de 2 a 60 caracteres." });
      const { data, error } = await req.db.from("warehouses").update({ nome }).eq("id", req.params.id).select("id, nome, tipo, unit_id, ativo").single();
      if (error) {
        if (/duplicate|unique/i.test(error.message)) return res.status(409).json({ error: "J\xE1 existe um dep\xF3sito com esse nome nesta unidade." });
        throw error;
      }
      if (!data) return res.status(404).json({ error: "Dep\xF3sito n\xE3o encontrado." });
      res.json({ deposito: data });
    } catch (err) {
      console.error("[PATCH /api/warehouses/:id] erro:", err.message);
      res.status(500).json({ error: "Erro ao renomear dep\xF3sito." });
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
  app.post("/api/materials", authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const { nome, unidade_medida, qtd_volumes, fator_multiplicador, estoque_minimo, categoria, unit_id } = req.body || {};
      if (!nome || !unidade_medida || qtd_volumes == null || fator_multiplicador == null || estoque_minimo == null) {
        return res.status(400).json({ error: "Preencha todos os campos obrigat\xF3rios." });
      }
      const saldoInicial = arredondar(Number(qtd_volumes) * Number(fator_multiplicador));
      const depositos = await depositosDaOrg(req.db);
      let central, obra;
      try {
        const daUnidade = depositosDaUnidade(depositos, unit_id);
        central = acharDeposito(daUnidade, "CENTRAL");
        obra = acharDeposito(daUnidade, "OBRA");
      } catch (e) {
        return res.status(409).json({ error: e.message });
      }
      const { data: material, error } = await req.db.from("materials").insert({
        nome,
        unidade_medida,
        qtd_volumes,
        fator_multiplicador,
        estoque_minimo,
        categoria: categoria || "Outros"
      }).select().single();
      if (error) throw error;
      const saldos = { [central.id]: saldoInicial, [obra.id]: 0 };
      await gravarSaldos(req.db, material.id, saldos);
      await req.db.from("material_movements").insert({
        material_id: material.id,
        tipo_operacao: "ENTRADA_CENTRAL",
        quantidade: saldoInicial,
        warehouse_destino_id: central.id,
        funcionario_matricula: req.user.matricula,
        justificativa: "Cadastro inicial de material"
      });
      res.status(201).json({ ...material, saldos });
    } catch (err) {
      console.error("[POST /api/materials] erro:", err.message);
      res.status(500).json({ error: "Erro ao cadastrar material." });
    }
  });
  app.put("/api/materials/:id", authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const { id } = req.params;
      const { nome, categoria, unidade_medida, estoque_minimo, fator_multiplicador } = req.body || {};
      const updates = { updated_at: (/* @__PURE__ */ new Date()).toISOString() };
      if (nome !== void 0) updates.nome = nome;
      if (categoria !== void 0) updates.categoria = categoria;
      if (unidade_medida !== void 0) updates.unidade_medida = unidade_medida;
      if (estoque_minimo !== void 0) updates.estoque_minimo = estoque_minimo;
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
  app.post("/api/materials/:id/movement", authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), withAcessos, async (req, res) => {
    try {
      const { id } = req.params;
      const { tipo_operacao, quantidade, justificativa, unit_id } = req.body || {};
      if (!tipo_operacao || quantidade == null || !justificativa) {
        return res.status(400).json({ error: "Preencha opera\xE7\xE3o, quantidade e justificativa." });
      }
      const { data: material, error: fetchError } = await req.db.from("materials").select("*").eq("id", id).single();
      if (fetchError || !material) return res.status(404).json({ error: "Material n\xE3o encontrado." });
      const fluxo = FLUXO_DA_OPERACAO[tipo_operacao];
      if (!fluxo) return res.status(400).json({ error: "Opera\xE7\xE3o inv\xE1lida." });
      const q = Number(quantidade);
      const depositos = await depositosDaOrg(req.db);
      const nomeDo = (depositoId) => depositos.find((d) => d.id === depositoId)?.nome ?? depositoId;
      let lados;
      try {
        lados = depositosDoFluxo(fluxo, depositosDaUnidade(depositos, unit_id));
      } catch (e) {
        return res.status(409).json({ error: e.message });
      }
      if (!podeExecutar(req.acessos ?? null, lados, fluxo.quemOpera)) {
        return res.status(403).json({ error: "Voc\xEA n\xE3o tem permiss\xE3o para esta opera\xE7\xE3o neste dep\xF3sito." });
      }
      const atuais = await saldosDoMaterial(req.db, Number(id));
      const calculo = calcularMovimento(atuais, { ...lados, quantidade: q, ajuste: fluxo.ajuste, rotulo: fluxo.rotulo, nomeDe: nomeDo });
      if (!calculo.ok) return res.status(400).json({ error: calculo.erro });
      await gravarSaldos(req.db, Number(id), calculo.novos);
      await req.db.from("material_movements").insert({
        material_id: id,
        tipo_operacao,
        quantidade: q,
        warehouse_origem_id: lados.origem_id ?? null,
        warehouse_destino_id: lados.destino_id ?? null,
        funcionario_matricula: req.user.matricula,
        justificativa
      });
      const daUnidade = depositosDaUnidade(depositos, unit_id);
      const central = daUnidade.find((d) => d.tipo === "CENTRAL");
      const obra = daUnidade.find((d) => d.tipo === "OBRA");
      const novoSaldoCentral = central ? calculo.novos[central.id] ?? atuais[central.id] ?? 0 : 0;
      const novoSaldoObra = obra ? calculo.novos[obra.id] ?? atuais[obra.id] ?? 0 : 0;
      const saldoAtualizado = {
        saldo_central: novoSaldoCentral,
        saldo_obra: novoSaldoObra,
        estoque_minimo: material.estoque_minimo
      };
      const saldoTotal = stockTotal(saldoAtualizado);
      const semEstoque = stockStatus(saldoAtualizado, "empresa") === "RUPTURA";
      if (needsPurchase(saldoAtualizado)) {
        try {
          const t = await getTransporter();
          if (t) {
            await t.sendMail({
              from: remetente(),
              to: destinatarioAdmin(),
              subject: `${semEstoque ? "Sem estoque" : "Estoque abaixo do m\xEDnimo"}: ${material.nome}`,
              html: `<p>O material <strong>${material.nome}</strong> ${semEstoque ? "est\xE1 <strong>sem estoque</strong> nos dois almoxarifados." : "est\xE1 com o saldo total <strong>abaixo do estoque m\xEDnimo</strong>."}</p>
                     <p>Saldo Central: ${novoSaldoCentral} ${material.unidade_medida}<br/>
                     Saldo Obra: ${novoSaldoObra} ${material.unidade_medida}<br/>
                     <strong>Total: ${saldoTotal} ${material.unidade_medida}</strong><br/>
                     Estoque M\xEDnimo: ${material.estoque_minimo} ${material.unidade_medida}</p>
                     <p>Opera\xE7\xE3o: ${tipo_operacao} | Quantidade: ${q} | Respons\xE1vel: ${req.user.nome}</p>`
            });
          }
        } catch (mailErr) {
          console.error("[Alerta de Estoque] falha ao enviar e-mail:", mailErr.message);
        }
      }
      res.json({ success: true, material_id: id, novoSaldo: novoSaldoCentral, saldoObra: novoSaldoObra, saldos: calculo.novos });
    } catch (err) {
      console.error("[POST /api/materials/:id/movement] erro:", err.message);
      res.status(500).json({ error: "Erro ao registrar movimenta\xE7\xE3o." });
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
      const tipo_operacao = deposito.tipo === "CENTRAL" ? "AJUSTE_CENTRAL" : deposito.tipo === "OBRA" ? "AJUSTE_OBRA" : null;
      if (!tipo_operacao || !podeOperar(req.acessos ?? null, deposito.id)) {
        return res.status(403).json({ error: "Voc\xEA n\xE3o tem permiss\xE3o para ajustar este dep\xF3sito." });
      }
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
      if (!assertManageable(role)) return res.status(400).json({ error: "Perfil inv\xE1lido para o sistema de estoque." });
      if (String(senha).length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ error: `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` });
      }
      const { data: existing } = await req.db.from(ESTOQUE_USERS).select("id").eq("matricula", matricula).maybeSingle();
      if (existing) return res.status(409).json({ error: "J\xE1 existe um usu\xE1rio com esta matr\xEDcula." });
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
        if (!assertManageable(role)) return res.status(400).json({ error: "Perfil inv\xE1lido para o sistema de estoque." });
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
