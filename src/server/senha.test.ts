import { describe, it, expect } from 'vitest';
import {
  gerarToken,
  hashDoToken,
  tokenPlausivel,
  tokenValido,
  validarNovaSenha,
  linkDeRedefinicao,
  siteUrl,
  emailDeRecuperacao,
  emailDeBoasVindas,
  emailDeNovaEmpresa,
  VALIDADE_DO_TOKEN_MS,
} from './senha';

describe('token de recuperação', () => {
  it('é aleatório, seguro para URL e o hash bate', () => {
    const a = gerarToken();
    const b = gerarToken();
    expect(a.token).not.toBe(b.token);
    expect(tokenPlausivel(a.token)).toBe(true);
    expect(a.hash).toBe(hashDoToken(a.token));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/); // sha256 em hex: o check da migração 017 exige 64
  });

  it('rejeita o que não tem cara de token antes de ir ao banco', () => {
    expect(tokenPlausivel('')).toBe(false);
    expect(tokenPlausivel('curto')).toBe(false);
    expect(tokenPlausivel("x'.repeat(45)")).toBe(false);
    expect(tokenPlausivel(42)).toBe(false);
    expect(tokenPlausivel('a'.repeat(300))).toBe(false);
  });

  it('vale dentro do prazo e uma vez só', () => {
    const agora = new Date('2026-09-12T10:00:00Z');
    const daquiUmaHora = new Date(agora.getTime() + VALIDADE_DO_TOKEN_MS).toISOString();
    expect(tokenValido({ expires_at: daquiUmaHora, used_at: null }, agora)).toBe(true);
    expect(tokenValido({ expires_at: daquiUmaHora, used_at: agora.toISOString() }, agora)).toBe(false);
    const passado = new Date(agora.getTime() - 1000).toISOString();
    expect(tokenValido({ expires_at: passado, used_at: null }, agora)).toBe(false);
  });
});

describe('validarNovaSenha', () => {
  it('exige 8 a 200 caracteres', () => {
    expect(validarNovaSenha('1234567')).toContain('8 caracteres');
    expect(validarNovaSenha('12345678')).toBeNull();
    expect(validarNovaSenha('x'.repeat(201))).toContain('longa');
    expect(validarNovaSenha(undefined)).toContain('Informe');
  });
});

describe('links', () => {
  it('usa stokai.app de fábrica e SITE_URL quando existe, sem barra dupla', () => {
    expect(siteUrl({})).toBe('https://stokai.app');
    expect(siteUrl({ SITE_URL: 'http://localhost:3001/' })).toBe('http://localhost:3001');
    expect(linkDeRedefinicao('abc-_123', { SITE_URL: 'http://localhost:3001/' })).toBe('http://localhost:3001/redefinir-senha?token=abc-_123');
  });
});

describe('e-mails', () => {
  it('recuperação: leva o link no botão e avisa que dá para ignorar', () => {
    const { subject, html } = emailDeRecuperacao('Ana Souza', 'https://stokai.app/redefinir-senha?token=t');
    expect(subject).toContain('Redefinir');
    expect(html).toContain('Olá, Ana.');
    expect(html).toContain('href="https://stokai.app/redefinir-senha?token=t"');
    expect(html).toContain('pode ignorar');
  });

  it('boas-vindas: nome da empresa, link de entrar e nada de HTML injetado', () => {
    const { subject, html } = emailDeBoasVindas('Ana <b>S</b>', 'A & B Construções', {});
    expect(subject).toBe('Bem-vindo(a) ao Stok Aí, Ana');
    expect(html).toContain('A &amp; B Construções');
    expect(html).not.toContain('<b>S</b>');
    expect(html).toContain('https://stokai.app/entrar');
  });

  it('aviso interno: dados da empresa nova, escapados', () => {
    const { subject, html } = emailDeNovaEmpresa({ empresa: 'Horizonte <script>', nome: 'Ana', email: 'ana@h.com', slug: 'horizonte', ip: '1.2.3.4' });
    expect(subject).toBe('Nova empresa no Stok Aí: Horizonte <script>');
    expect(html).toContain('Horizonte &lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('ana@h.com');
    expect(html).toContain('1.2.3.4');
  });
});
