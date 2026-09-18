import { useState, type ReactNode } from 'react';
import { BarChart3, Building2, Eye, LogOut, Menu, MessageSquare, UserCircle, Users, UsersRound, X } from 'lucide-react';
import { MarcaAtende } from './Marca';
import { TELAS, useRotaAtende, type Tela } from './router';
import { useSessaoAtende } from './store/sessao';
import { useDadosAtende } from './store/dados';
import { pode, NOME_DO_PAPEL, type Permissao } from '../shared/papeis';

/**
 * A moldura do Atende Aí depois de entrar: barra lateral navy com a marca,
 * o menu por papel, quem está logado e o botão de sair. O conteúdo vem por
 * `children`. No celular, a barra vira gaveta.
 */
interface Item {
  tela: Tela;
  nome: string;
  icone: ReactNode;
  permissao?: Permissao;
}

const ITENS: Item[] = [
  { tela: TELAS.central, nome: 'Central', icone: <MessageSquare size={17} />, permissao: 'conversas.atender' },
  { tela: TELAS.supervisao, nome: 'Supervisão', icone: <Eye size={17} />, permissao: 'conversas.supervisionar' },
  { tela: TELAS.dashboard, nome: 'Dashboard', icone: <BarChart3 size={17} />, permissao: 'dashboard.ver' },
  { tela: TELAS.empresa, nome: 'Empresa', icone: <Building2 size={17} />, permissao: 'empresa.gerir' },
  { tela: TELAS.times, nome: 'Times', icone: <UsersRound size={17} />, permissao: 'times.gerir' },
  { tela: TELAS.equipe, nome: 'Equipe', icone: <Users size={17} />, permissao: 'equipe.ver' },
];

export function itensDoMenu(papel: string): Item[] {
  return ITENS.filter((i) => !i.permissao || pode(papel, i.permissao));
}

export function Shell({ tela, children }: { tela: Tela | null; children: ReactNode }) {
  const [gavetaAberta, setGavetaAberta] = useState(false);
  const sessao = useSessaoAtende((s) => s.sessao)!;
  const sair = useSessaoAtende((s) => s.sair);
  const limpar = useDadosAtende((s) => s.limpar);
  const empresa = useDadosAtende((s) => s.empresa);
  const ir = useRotaAtende((s) => s.ir);
  const itens = itensDoMenu(sessao.papel);

  function navegar(t: Tela) {
    ir(t);
    setGavetaAberta(false);
  }

  const barra = (
    <div className="flex h-full flex-col bg-[var(--sidebar-bg)] text-[var(--sidebar-text)]">
      <div className="flex items-center justify-between px-5 py-5">
        <MarcaAtende tema="escuro" tamanho={30} />
        <button type="button" onClick={() => setGavetaAberta(false)} className="rounded-lg p-1.5 text-[var(--sidebar-muted)] hover:bg-white/10 lg:hidden" aria-label="Fechar menu">
          <X size={18} />
        </button>
      </div>
      {empresa && (
        <div className="mx-4 mb-3 rounded-xl border border-[var(--sidebar-border)] bg-[var(--sidebar-bg-2)] px-3.5 py-2.5">
          <p className="truncate text-sm font-bold text-white">{empresa.nome}</p>
          <p className="truncate text-[11px] text-[var(--sidebar-muted)]">{empresa.segmento || 'Empresa'}</p>
        </div>
      )}
      <nav className="flex-1 space-y-0.5 px-3">
        {itens.map((i) => {
          const ativo = tela === i.tela;
          return (
            <button
              key={i.tela}
              type="button"
              onClick={() => navegar(i.tela)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${ativo ? 'bg-gradiente text-white shadow-lg shadow-[var(--brand)]/30' : 'text-[var(--sidebar-text)] hover:bg-white/[0.06]'}`}
            >
              <span className={ativo ? 'text-white' : 'text-[var(--sidebar-muted)]'}>{i.icone}</span>
              {i.nome}
            </button>
          );
        })}
      </nav>
      <div className="border-t border-[var(--sidebar-border)] p-3">
        <button type="button" onClick={() => navegar(TELAS.conta)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${tela === TELAS.conta ? 'bg-white/[0.08]' : 'hover:bg-white/[0.06]'}`}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand)]/25 text-[var(--lilas)]">
            <UserCircle size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-white">{sessao.nome}</span>
            <span className="block truncate text-[11px] text-[var(--sidebar-muted)]">{NOME_DO_PAPEL[sessao.papel]}</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            limpar();
            sair();
            ir(TELAS.entrar);
          }}
          className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-[var(--sidebar-muted)] transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          <LogOut size={16} /> Sair
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[var(--bg)]">
      <aside className="hidden w-64 shrink-0 lg:block">{barra}</aside>
      {gavetaAberta && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setGavetaAberta(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 shadow-2xl">{barra}</aside>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <header className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3 lg:hidden">
          <button type="button" onClick={() => setGavetaAberta(true)} className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-2)]" aria-label="Abrir menu">
            <Menu size={20} />
          </button>
          <MarcaAtende tema="claro" tamanho={26} />
        </header>
        <main className="p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
