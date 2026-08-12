// src/server/app.ts
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import jwt from "jsonwebtoken";
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

// src/server/app.ts
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
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Token inv\xE1lido ou expirado." });
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
function createApp() {
  const app = express();
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors());
  app.use(express.json());
  app.post("/api/login", async (req, res) => {
    try {
      const { matricula, senha } = req.body || {};
      if (!matricula || !senha) {
        return res.status(400).json({ error: "Informe matr\xEDcula e senha." });
      }
      const { data: userRow, error } = await supabaseServer.from("users").select("*").or(`matricula.eq.${matricula},email.eq.${matricula}`).neq("role", "CLIENTE").maybeSingle();
      if (error || !userRow) {
        return res.status(401).json({ error: "Credenciais inv\xE1lidas." });
      }
      const role = userRow.role || (String(userRow.matricula || "").startsWith("E") ? "ALMOXARIFE_GERAL" : null);
      if (!role || !ALL_INVENTORY_ROLES.includes(role)) {
        return res.status(403).json({ error: "Este usu\xE1rio n\xE3o tem acesso ao sistema de estoque." });
      }
      const passwordOk = await verifyPassword(senha, userRow.senha);
      if (!passwordOk) {
        return res.status(401).json({ error: "Credenciais inv\xE1lidas." });
      }
      const authedUser = {
        id: userRow.id,
        nome: userRow.nome,
        matricula: userRow.matricula,
        role
      };
      const token = jwt.sign(authedUser, JWT_SECRET, { expiresIn: "12h" });
      res.json({ user: authedUser, token });
    } catch (err) {
      console.error("[Login] erro:", err.message);
      res.status(500).json({ error: "Erro interno ao autenticar." });
    }
  });
  app.get("/api/me", authenticate, (req, res) => {
    res.json({ user: req.user });
  });
  app.get("/api/data", authenticate, requireRole(ALL_INVENTORY_ROLES), async (_req, res) => {
    try {
      const [materialsRes, movementsRes, staffRes] = await Promise.all([
        supabaseServer.from("materials").select("*").order("nome", { ascending: true }),
        supabaseServer.from("material_movements").select("*, materials(nome)").order("created_at", { ascending: false }),
        supabaseServer.from("users").select("id, nome, matricula, role").neq("role", "CLIENTE")
      ]);
      if (materialsRes.error) throw materialsRes.error;
      if (movementsRes.error) throw movementsRes.error;
      res.json({
        materials: materialsRes.data || [],
        materialMovements: movementsRes.data || [],
        staff: staffRes.data || []
      });
    } catch (err) {
      console.error("[GET /api/data] erro:", err.message);
      res.status(500).json({ error: "Erro ao carregar dados do estoque." });
    }
  });
  app.post("/api/materials", authenticate, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const { nome, unidade_medida, qtd_volumes, fator_multiplicador, estoque_minimo, categoria } = req.body || {};
      if (!nome || !unidade_medida || qtd_volumes == null || fator_multiplicador == null || estoque_minimo == null) {
        return res.status(400).json({ error: "Preencha todos os campos obrigat\xF3rios." });
      }
      const saldo_central = Number(qtd_volumes) * Number(fator_multiplicador);
      const { data: material, error } = await supabaseServer.from("materials").insert({
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
      await supabaseServer.from("material_movements").insert({
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
  app.put("/api/materials/:id", authenticate, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const { id } = req.params;
      const { nome, categoria, unidade_medida, estoque_minimo, fator_multiplicador } = req.body || {};
      const updates = { updated_at: (/* @__PURE__ */ new Date()).toISOString() };
      if (nome !== void 0) updates.nome = nome;
      if (categoria !== void 0) updates.categoria = categoria;
      if (unidade_medida !== void 0) updates.unidade_medida = unidade_medida;
      if (estoque_minimo !== void 0) updates.estoque_minimo = estoque_minimo;
      if (fator_multiplicador !== void 0) updates.fator_multiplicador = fator_multiplicador;
      const { data, error } = await supabaseServer.from("materials").update(updates).eq("id", id).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err) {
      console.error("[PUT /api/materials/:id] erro:", err.message);
      res.status(500).json({ error: "Erro ao atualizar material." });
    }
  });
  app.delete("/api/materials/:id", authenticate, requireRole(ADMIN_ROLES), async (req, res) => {
    try {
      const { id } = req.params;
      const { data: material, error: fetchError } = await supabaseServer.from("materials").select("*").eq("id", id).single();
      if (fetchError || !material) return res.status(404).json({ error: "Material n\xE3o encontrado." });
      const { data: relatedMovements } = await supabaseServer.from("material_movements").select("id, justificativa").eq("material_id", id);
      for (const mov of relatedMovements || []) {
        await supabaseServer.from("material_movements").update({ material_id: null, justificativa: `[${material.nome}] ${mov.justificativa || ""}`.trim() }).eq("id", mov.id);
      }
      await supabaseServer.from("material_movements").insert({
        material_id: null,
        tipo_operacao: "EXCLUS\xC3O",
        quantidade: material.saldo_central,
        funcionario_matricula: req.user.matricula,
        justificativa: `EXCLUS\xC3O DO MATERIAL: O material '${material.nome}' (Saldo em estoque era de ${material.saldo_central} ${material.unidade_medida}) foi exclu\xEDdo do sistema permanentemente por ${req.user.nome}.`
      });
      const { error: deleteError } = await supabaseServer.from("materials").delete().eq("id", id);
      if (deleteError) throw deleteError;
      res.json({ success: true });
    } catch (err) {
      console.error("[DELETE /api/materials/:id] erro:", err.message);
      res.status(500).json({ error: "Erro ao excluir material." });
    }
  });
  app.post("/api/materials/:id/movement", authenticate, requireRole(ALL_INVENTORY_ROLES), async (req, res) => {
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
      const { data: material, error: fetchError } = await supabaseServer.from("materials").select("*").eq("id", id).single();
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
      const { error: updateError } = await supabaseServer.from("materials").update({ saldo_central: novoSaldoCentral, saldo_obra: novoSaldoObra, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id);
      if (updateError) throw updateError;
      await supabaseServer.from("material_movements").insert({
        material_id: id,
        tipo_operacao,
        quantidade: q,
        funcionario_matricula: req.user.matricula,
        justificativa
      });
      const isCritical = novoSaldoCentral <= material.estoque_minimo || novoSaldoObra <= material.estoque_minimo;
      if (isCritical) {
        try {
          const t = await getTransporter();
          if (t) {
            await t.sendMail({
              from: process.env.SMTP_FROM_EMAIL || "noreply@ssimoveisbrasil.app",
              to: process.env.ADMIN_EMAIL || "admin@ssimoveis.com",
              subject: `Alerta de Estoque: ${material.nome}`,
              html: `<p>O material <strong>${material.nome}</strong> atingiu n\xEDvel cr\xEDtico de estoque.</p>
                     <p>Saldo Central: ${novoSaldoCentral} ${material.unidade_medida}<br/>
                     Saldo Obra: ${novoSaldoObra} ${material.unidade_medida}<br/>
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
  app.post("/api/materials/bulk-recount", authenticate, requireRole(ALL_INVENTORY_ROLES), async (req, res) => {
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
        const { data: material } = await supabaseServer.from("materials").select("*").eq("id", materialId).single();
        if (!material) continue;
        const saldoAtual = location === "CENTRAL" ? Number(material.saldo_central) : Number(material.saldo_obra);
        const diferenca = contagem - saldoAtual;
        if (diferenca === 0) continue;
        if (contagem < 0) continue;
        const novoSaldoCentral = location === "CENTRAL" ? contagem : Number(material.saldo_central);
        const novoSaldoObra = location === "OBRA" ? contagem : Number(material.saldo_obra);
        const { error: updateError } = await supabaseServer.from("materials").update({ saldo_central: novoSaldoCentral, saldo_obra: novoSaldoObra, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", materialId);
        if (updateError) continue;
        await supabaseServer.from("material_movements").insert({
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
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  return app;
}

// src/server/vercel-entry.ts
var vercel_entry_default = createApp();
export {
  vercel_entry_default as default
};
