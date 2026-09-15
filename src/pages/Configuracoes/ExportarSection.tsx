import { useState } from 'react';
import { toast } from 'sonner';
import { Download, FileSpreadsheet } from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { Button } from '@/shared/ui/Button';
import { useAuth } from '@/store/auth';

const TABELAS: Array<{ id: string; nome: string; descricao: string }> = [
  { id: 'materiais', nome: 'Materiais', descricao: 'Catálogo com o saldo em cada estoque.' },
  { id: 'movimentacoes', nome: 'Movimentações', descricao: 'Tudo o que entrou, saiu e foi transferido, com quem e por quê.' },
  { id: 'emprestimos', nome: 'Empréstimos e entregas', descricao: 'Quem pegou o quê, prazos e devoluções.' },
  { id: 'usuarios', nome: 'Usuários', descricao: 'A equipe, cargos e contatos. Sem senhas.' },
  { id: 'fornecedores', nome: 'Fornecedores', descricao: 'Lojas e contatos cadastrados.' },
  { id: 'cotacoes', nome: 'Cotações', descricao: 'Cada item de cada cotação, com o preço de cada fornecedor.' },
];

/** Baixa um arquivo autenticado: o link normal não carrega o token, então vai por fetch. */
async function baixar(caminho: string): Promise<void> {
  const { token } = useAuth.getState();
  const r = await fetch(caminho, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || `Erro ${r.status}.`);
  const nome = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') ?? '')?.[1] ?? 'export.csv';
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Os dados são da empresa: ela leva quando quiser, em CSV que o Excel abre. */
export function ExportarSection() {
  const [baixando, setBaixando] = useState<string | null>(null);

  async function exportar(id: string) {
    setBaixando(id);
    try {
      await baixar(`/api/exportar/${id}.csv`);
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível exportar.');
    } finally {
      setBaixando(null);
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Exportar dados</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">Os dados são seus. Baixe em CSV (abre no Excel e no Google Planilhas) quando quiser — para conferir, para o contador, ou para levar embora.</p>
      </div>
      <Card className="divide-y divide-[var(--border)]">
        {TABELAS.map((t) => (
          <div key={t.id} className="flex items-center gap-3 px-5 py-3">
            <FileSpreadsheet size={16} className="shrink-0 text-[var(--text-muted)]" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--text)]">{t.nome}</p>
              <p className="text-[11px] text-[var(--text-muted)]">{t.descricao}</p>
            </div>
            <Button size="sm" variant="outline" icon={<Download size={13} />} loading={baixando === t.id} onClick={() => exportar(t.id)}>
              CSV
            </Button>
          </div>
        ))}
      </Card>
    </section>
  );
}
