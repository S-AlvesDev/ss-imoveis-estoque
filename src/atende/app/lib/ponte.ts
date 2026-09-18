/**
 * A sessão do Stok Aí que pode estar neste mesmo navegador. Os dois produtos
 * moram na mesma origem, e o Stok Aí guarda a sessão em localStorage
 * ('estoque-auth', zustand/persist). Ler é só isso; validar é o servidor.
 */
export interface SessaoDoStokAiNoNavegador {
  token: string;
  nome: string;
  role: string;
}

export function sessaoDoStokAi(): SessaoDoStokAiNoNavegador | null {
  try {
    const bruto = localStorage.getItem('estoque-auth');
    if (!bruto) return null;
    const { state } = JSON.parse(bruto) as { state?: { token?: string; user?: { nome?: string; role?: string } } };
    if (!state?.token || !state.user) return null;
    return { token: state.token, nome: String(state.user.nome ?? ''), role: String(state.user.role ?? '') };
  } catch {
    return null;
  }
}
