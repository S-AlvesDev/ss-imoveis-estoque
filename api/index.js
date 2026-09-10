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
  "estoque_users"
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

// src/server/app.ts
var ESTOQUE_USERS = "estoque_users";
var JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("[Server] JWT_SECRET n\xE3o definido \u2014 configure essa vari\xE1vel de ambiente antes de subir o servidor.");
}
var transporter = null;
async function getTransporter() {
  if (!process.env.BREVO_SMTP_LOGIN || !process.env.BREVO_SMTP_KEY) return null;
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: "smtp-relay.brevo.com",
    port: 2525,
    secure: false,
    auth: { user: process.env.BREVO_SMTP_LOGIN, pass: process.env.BREVO_SMTP_KEY }
  });
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
var OPERATION_ROLES = {
  ENTRADA_CENTRAL: CENTRAL_ROLES,
  SAIDA: CENTRAL_ROLES,
  REMESSA_OBRA: CENTRAL_ROLES,
  DEVOLUCAO_CENTRAL: ALL_INVENTORY_ROLES,
  CONSUMO_OBRA: OBRA_ROLES,
  // Ajustes de recontagem: cada equipe pode corrigir o saldo do próprio local (fica tudo auditado por quem fez).
  AJUSTE_CENTRAL: CENTRAL_ROLES,
  AJUSTE_OBRA: OBRA_ROLES
};
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
      const { data: userRow, error } = await supabaseServer.from(ESTOQUE_USERS).select("*").or(`matricula.eq.${identificador},email.eq.${identificador}`).eq("ativo", true).maybeSingle();
      if (error || !userRow) {
        console.warn("[Login] falha: nenhuma conta para o identificador informado", {
          ip: req.ip,
          tamanho: identificador.length
        });
        return res.status(401).json({ error: "Credenciais inv\xE1lidas." });
      }
      const role = userRow.role || (String(userRow.matricula || "").startsWith("E") ? "ALMOXARIFE_GERAL" : null);
      if (!role || !ALL_INVENTORY_ROLES.includes(role)) {
        return res.status(403).json({ error: "Este usu\xE1rio n\xE3o tem acesso ao sistema de estoque." });
      }
      const passwordOk = await verifyPassword(senha, userRow.senha);
      if (!passwordOk) {
        console.warn("[Login] falha: senha incorreta", { matricula: userRow.matricula, ip: req.ip });
        return res.status(401).json({ error: "Credenciais inv\xE1lidas." });
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
  app.get("/api/me", authenticate, (req, res) => {
    res.json({ user: req.user });
  });
  app.get("/api/data", authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), async (req, res) => {
    try {
      const db = scopedDb(req.user.organization_id);
      const [materialsRes, movements, staffRes] = await Promise.all([
        db.from("materials").select("*").order("nome", { ascending: true }),
        fetchAllRows(
          () => db.from("material_movements").select("*, materials(nome)").order("created_at", { ascending: false }).order("id", { ascending: false })
        ),
        // Sem filtro de CLIENTE: esta tabela só tem gente do estoque.
        req.db.from(ESTOQUE_USERS).select("id, nome, matricula, role")
      ]);
      if (materialsRes.error) throw materialsRes.error;
      res.json({
        materials: materialsRes.data || [],
        materialMovements: movements,
        staff: staffRes.data || []
      });
    } catch (err) {
      console.error("[GET /api/data] erro:", err.message);
      res.status(500).json({ error: "Erro ao carregar dados do estoque." });
    }
  });
  app.post("/api/materials", authenticate, withTenant, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const { nome, unidade_medida, qtd_volumes, fator_multiplicador, estoque_minimo, categoria } = req.body || {};
      if (!nome || !unidade_medida || qtd_volumes == null || fator_multiplicador == null || estoque_minimo == null) {
        return res.status(400).json({ error: "Preencha todos os campos obrigat\xF3rios." });
      }
      const saldo_central = Number(qtd_volumes) * Number(fator_multiplicador);
      const { data: material, error } = await req.db.from("materials").insert({
        nome,
        unidade_medida,
        qtd_volumes,
        fator_multiplicador,
        estoque_minimo,
        categoria: categoria || "Outros",
        saldo_central,
        saldo_obra: 0
      }).select().single();
      if (error) throw error;
      await req.db.from("material_movements").insert({
        material_id: material.id,
        tipo_operacao: "ENTRADA_CENTRAL",
        quantidade: saldo_central,
        funcionario_matricula: req.user.matricula,
        justificativa: "Cadastro inicial de material"
      });
      res.status(201).json(material);
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
      await req.db.from("material_movements").insert({
        material_id: null,
        tipo_operacao: "EXCLUS\xC3O",
        quantidade: material.saldo_central,
        funcionario_matricula: req.user.matricula,
        justificativa: `EXCLUS\xC3O DO MATERIAL: O material '${material.nome}' (Saldo em estoque era de ${material.saldo_central} ${material.unidade_medida}) foi exclu\xEDdo do sistema permanentemente por ${req.user.nome}.`
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
      const somaCentral = donors.reduce((s, d) => s + Number(d.saldo_central), 0);
      const somaObra = donors.reduce((s, d) => s + Number(d.saldo_obra), 0);
      const novoSaldoCentral = Number(target.saldo_central) + somaCentral;
      const novoSaldoObra = Number(target.saldo_obra) + somaObra;
      const { error: updateError } = await req.db.from("materials").update({ saldo_central: novoSaldoCentral, saldo_obra: novoSaldoObra, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", targetId);
      if (updateError) throw updateError;
      if (somaCentral !== 0 || somaObra !== 0) {
        await req.db.from("material_movements").insert({
          material_id: targetId,
          tipo_operacao: "UNIFICACAO",
          quantidade: somaCentral + somaObra,
          funcionario_matricula: req.user.matricula,
          justificativa: `Unifica\xE7\xE3o: incorporou o saldo de ${donors.map((d) => `'${d.nome}'`).join(", ")} (Central +${somaCentral}, Obra +${somaObra}).`
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
          quantidade: donor.saldo_central + donor.saldo_obra,
          funcionario_matricula: req.user.matricula,
          justificativa: `UNIFICA\xC7\xC3O: o material '${donor.nome}' foi unificado com '${target.nome}' e removido do sistema por ${req.user.nome}.`
        });
        await req.db.from("materials").delete().eq("id", donor.id);
      }
      res.json({ success: true, targetId, novoSaldoCentral, novoSaldoObra });
    } catch (err) {
      console.error("[POST /api/materials/merge] erro:", err.message);
      res.status(500).json({ error: "Erro ao unificar materiais." });
    }
  });
  app.post("/api/materials/:id/movement", authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), async (req, res) => {
    try {
      const { id } = req.params;
      const { tipo_operacao, quantidade, justificativa } = req.body || {};
      if (!tipo_operacao || quantidade == null || !justificativa) {
        return res.status(400).json({ error: "Preencha opera\xE7\xE3o, quantidade e justificativa." });
      }
      const allowedRoles = OPERATION_ROLES[tipo_operacao];
      if (!allowedRoles) return res.status(400).json({ error: "Opera\xE7\xE3o inv\xE1lida." });
      if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({ error: "Voc\xEA n\xE3o tem permiss\xE3o para esta opera\xE7\xE3o." });
      }
      const { data: material, error: fetchError } = await req.db.from("materials").select("*").eq("id", id).single();
      if (fetchError || !material) return res.status(404).json({ error: "Material n\xE3o encontrado." });
      const q = Number(quantidade);
      let novoSaldoCentral = Number(material.saldo_central);
      let novoSaldoObra = Number(material.saldo_obra);
      switch (tipo_operacao) {
        case "ENTRADA_CENTRAL":
          novoSaldoCentral += q;
          break;
        case "SAIDA":
          if (q > novoSaldoCentral) return res.status(400).json({ error: "Saldo Central insuficiente para esta sa\xEDda." });
          novoSaldoCentral -= q;
          break;
        case "REMESSA_OBRA":
          if (q > novoSaldoCentral) return res.status(400).json({ error: "Saldo Central insuficiente para esta remessa." });
          novoSaldoCentral -= q;
          novoSaldoObra += q;
          break;
        case "CONSUMO_OBRA":
          if (q > novoSaldoObra) return res.status(400).json({ error: "Saldo de Obra insuficiente para este consumo." });
          novoSaldoObra -= q;
          break;
        case "DEVOLUCAO_CENTRAL":
          if (q > novoSaldoObra) return res.status(400).json({ error: "Saldo de Obra insuficiente para esta devolu\xE7\xE3o." });
          novoSaldoObra -= q;
          novoSaldoCentral += q;
          break;
        case "AJUSTE_CENTRAL":
          novoSaldoCentral += q;
          break;
        case "AJUSTE_OBRA":
          novoSaldoObra += q;
          break;
        default:
          return res.status(400).json({ error: "Opera\xE7\xE3o inv\xE1lida." });
      }
      if (novoSaldoCentral < 0 || novoSaldoObra < 0) {
        return res.status(400).json({ error: "A opera\xE7\xE3o resultaria em saldo negativo." });
      }
      const { error: updateError } = await req.db.from("materials").update({ saldo_central: novoSaldoCentral, saldo_obra: novoSaldoObra, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id);
      if (updateError) throw updateError;
      await req.db.from("material_movements").insert({
        material_id: id,
        tipo_operacao,
        quantidade: q,
        funcionario_matricula: req.user.matricula,
        justificativa
      });
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
              from: process.env.SMTP_FROM_EMAIL || "noreply@ssimoveisbrasil.app",
              to: process.env.ADMIN_EMAIL || "admin@ssimoveis.com",
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
      res.json({ success: true, material_id: id, novoSaldo: novoSaldoCentral, saldoObra: novoSaldoObra });
    } catch (err) {
      console.error("[POST /api/materials/:id/movement] erro:", err.message);
      res.status(500).json({ error: "Erro ao registrar movimenta\xE7\xE3o." });
    }
  });
  app.post("/api/materials/bulk-recount", authenticate, withTenant, requireRole(ALL_INVENTORY_ROLES), async (req, res) => {
    try {
      const { location, counts } = req.body || {};
      if (location !== "CENTRAL" && location !== "OBRA") {
        return res.status(400).json({ error: "Local inv\xE1lido." });
      }
      const tipo_operacao = location === "CENTRAL" ? "AJUSTE_CENTRAL" : "AJUSTE_OBRA";
      if (!OPERATION_ROLES[tipo_operacao].includes(req.user.role)) {
        return res.status(403).json({ error: "Voc\xEA n\xE3o tem permiss\xE3o para ajustar este estoque." });
      }
      if (!Array.isArray(counts) || counts.length === 0) {
        return res.status(400).json({ error: "Nenhuma contagem enviada." });
      }
      const applied = [];
      const criticalItems = [];
      for (const entry of counts) {
        const materialId = entry?.material_id;
        const contagem = Number(entry?.contagem);
        if (materialId == null || Number.isNaN(contagem)) continue;
        const { data: material } = await req.db.from("materials").select("*").eq("id", materialId).single();
        if (!material) continue;
        const saldoAtual = location === "CENTRAL" ? Number(material.saldo_central) : Number(material.saldo_obra);
        const diferenca = contagem - saldoAtual;
        if (diferenca === 0) continue;
        if (contagem < 0) continue;
        const novoSaldoCentral = location === "CENTRAL" ? contagem : Number(material.saldo_central);
        const novoSaldoObra = location === "OBRA" ? contagem : Number(material.saldo_obra);
        const { error: updateError } = await req.db.from("materials").update({ saldo_central: novoSaldoCentral, saldo_obra: novoSaldoObra, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", materialId);
        if (updateError) continue;
        await req.db.from("material_movements").insert({
          material_id: materialId,
          tipo_operacao,
          quantidade: diferenca,
          funcionario_matricula: req.user.matricula,
          justificativa: `Recontagem di\xE1ria: sistema indicava ${saldoAtual}, contagem f\xEDsica apontou ${contagem}.`
        });
        applied.push({ material_id: materialId, nome: material.nome, diferenca });
        const novoSaldoLocal = location === "CENTRAL" ? novoSaldoCentral : novoSaldoObra;
        if (novoSaldoLocal <= material.estoque_minimo) {
          criticalItems.push({ nome: material.nome, novoSaldo: novoSaldoLocal, estoque_minimo: material.estoque_minimo });
        }
      }
      if (criticalItems.length > 0) {
        try {
          const t = await getTransporter();
          if (t) {
            await t.sendMail({
              from: process.env.SMTP_FROM_EMAIL || "noreply@ssimoveisbrasil.app",
              to: process.env.ADMIN_EMAIL || "admin@ssimoveis.com",
              subject: `Recontagem (${location === "CENTRAL" ? "Central" : "Obra"}): ${criticalItems.length} item(ns) em estoque cr\xEDtico`,
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
      const users = (data || []).map(({ senha, ...u }) => ({
        ...u,
        senha_em_texto_puro: !/^\$2[aby]\$/.test(String(senha || ""))
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
        email: email ? String(email).trim() : null,
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
      if (email !== void 0) patch.email = email ? String(email).trim() : null;
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
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  return app;
}

// src/server/vercel-entry.ts
var vercel_entry_default = createApp();
export {
  vercel_entry_default as default
};
