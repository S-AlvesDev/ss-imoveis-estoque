import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Check, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { Modal } from '@/shared/ui/Modal';
import { Button } from '@/shared/ui/Button';
import { Select } from '@/shared/ui/Field';
import { api } from '@/lib/api';
import { naUnidade } from '@/store/unidade';
import type { Deposito } from '@/shared/types';
import { lerPlanilha, MAX_LINHAS_POR_ENVIO, MODELO_CSV, type LeituraDaPlanilha, type MaterialImportado } from '@/shared/importacao';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Estoques da unidade em uso — o saldo inicial entra em um deles. */
  depositos: Deposito[];
  refetch: () => Promise<void>;
}

interface Resultado {
  criados: number;
  pulados: Array<{ linha: number; nome: string; motivo: string }>;
  deposito: string;
}

/**
 * Trazer o catálogo de uma planilha. A leitura é na tela, para a pessoa
 * ver o que vai entrar antes de qualquer gravação; o servidor confere de
 * novo. Arquivo grande vai em partes, para não estourar a requisição.
 */
export function ImportarModal({ open, onClose, depositos, refetch }: Props) {
  const [leitura, setLeitura] = useState<LeituraDaPlanilha | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [depositoId, setDepositoId] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const operaveis = depositos.filter((d) => d.ativo);
  const destino = operaveis.find((d) => d.id === depositoId) ?? operaveis.find((d) => d.modo === 'almoxarifado') ?? operaveis[0];
  const validas = leitura?.linhas.filter((l) => l.dados) ?? [];
  const comErro = leitura?.linhas.filter((l) => !l.dados) ?? [];
  const contaSaldo = destino ? destino.modo !== 'patrimonio' && destino.modo !== 'validade' : false;

  function limpar() {
    setLeitura(null);
    setNomeArquivo('');
    setResultado(null);
    setProgresso(0);
    if (input.current) input.current.value = '';
  }

  async function escolher(arquivo: File | null) {
    if (!arquivo) return;
    if (arquivo.size > 2 * 1024 * 1024) return toast.error('Arquivo muito grande (máximo 2 MB). Exporte só as colunas de material.');
    const texto = await arquivo.text();
    const lida = lerPlanilha(texto);
    setNomeArquivo(arquivo.name);
    setLeitura(lida);
    setResultado(null);
    if (lida.erroGeral) toast.error(lida.erroGeral);
  }

  function baixarModelo() {
    const url = URL.createObjectURL(new Blob(['﻿' + MODELO_CSV], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo-materiais.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function importar() {
    if (!destino || validas.length === 0) return;
    setEnviando(true);
    setProgresso(0);
    const linhas: MaterialImportado[] = validas.map((l) => l.dados as MaterialImportado);
    const total: Resultado = { criados: 0, pulados: [], deposito: destino.nome };
    try {
      for (let i = 0; i < linhas.length; i += MAX_LINHAS_POR_ENVIO) {
        const parte = linhas.slice(i, i + MAX_LINHAS_POR_ENVIO);
        const r = await api.post<Resultado>('/api/materials/importar', naUnidade({ linhas: parte, warehouse_id: destino.id }));
        total.criados += r.criados;
        total.pulados.push(...r.pulados);
        setProgresso(Math.min(100, Math.round(((i + parte.length) / linhas.length) * 100)));
      }
      setResultado(total);
      await refetch();
      if (total.criados > 0) toast.success(`${total.criados} material(is) importado(s) em ${destino.nome}.`);
      else toast.warning('Nenhum material novo — veja a lista abaixo.');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao importar.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        limpar();
        onClose();
      }}
      title="Importar materiais de uma planilha"
      subtitle="Traga o catálogo de uma vez, em CSV. Você vê o que vai entrar antes de gravar."
      maxWidth="max-w-2xl"
      footer={
        resultado ? (
          <Button
            onClick={() => {
              limpar();
              onClose();
            }}
          >
            Fechar
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={baixarModelo} icon={<Download size={14} />}>
              Baixar modelo
            </Button>
            <Button onClick={importar} loading={enviando} disabled={validas.length === 0 || !destino} icon={<Upload size={14} />}>
              {enviando && progresso > 0 ? `Importando… ${progresso}%` : `Importar ${validas.length || ''} material(is)`}
            </Button>
          </>
        )
      }
    >
      {resultado ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-[var(--verde)]/30 bg-[var(--verde)]/10 p-4">
            <Check size={18} className="shrink-0 text-[var(--verde)]" />
            <p className="text-sm text-[var(--text)]">
              <strong>{resultado.criados}</strong> material(is) cadastrado(s) em {resultado.deposito}.
            </p>
          </div>
          {resultado.pulados.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">Não entraram ({resultado.pulados.length})</p>
              <ul className="max-h-60 space-y-1 overflow-y-auto text-xs">
                {resultado.pulados.map((p, i) => (
                  <li key={i} className="flex gap-2 rounded-lg bg-[var(--bg-2)] px-3 py-2">
                    <span className="shrink-0 font-mono text-[var(--text-muted)]">L{p.linha}</span>
                    <span className="min-w-0 flex-1 text-[var(--text)]">{p.nome || '—'}</span>
                    <span className="shrink-0 text-[var(--text-muted)]">{p.motivo}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Arquivo (.csv)</label>
            <div className="flex flex-wrap items-center gap-2">
              <input ref={input} type="file" accept=".csv,text/csv,text/plain" onChange={(e) => escolher(e.target.files?.[0] ?? null)} className="hidden" id="arquivo-importacao" />
              <label htmlFor="arquivo-importacao" className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--text)] transition-colors hover:border-[var(--brand)]/50">
                <FileSpreadsheet size={15} /> Escolher arquivo
              </label>
              {nomeArquivo && <span className="text-xs text-[var(--text-muted)]">{nomeArquivo}</span>}
            </div>
            <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
              No Excel ou no Google Planilhas: Arquivo → Baixar → CSV. A primeira linha é o cabeçalho; as colunas reconhecidas são <strong>nome</strong>, unidade, categoria, estoque mínimo e quantidade — nessa ordem ou em qualquer outra.
            </p>
          </div>

          {leitura && !leitura.erroGeral && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Select label="Saldo inicial entra em" value={destino?.id ?? ''} onChange={(e) => setDepositoId(e.target.value)}>
                  {operaveis.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nome}
                    </option>
                  ))}
                </Select>
                <div className="flex items-end">
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {contaSaldo ? 'A coluna de quantidade vira a entrada inicial neste estoque. Sem a coluna, entra zerado.' : 'Neste modo o saldo entra pela tela do estoque (item a item ou por lote): os materiais entram zerados.'}
                  </p>
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs text-[var(--text-muted)]">
                  <strong className="text-[var(--text)]">{validas.length}</strong> material(is) prontos para importar
                  {comErro.length > 0 && (
                    <>
                      {' · '}
                      <span className="text-rose-500">{comErro.length} linha(s) com problema</span>
                    </>
                  )}
                  . Colunas lidas: {leitura.colunas.join(', ')}.
                </p>
                <div className="max-h-64 overflow-auto rounded-xl border border-[var(--border)]">
                  <table className="w-full min-w-[520px] border-collapse text-xs">
                    <thead className="sticky top-0 bg-[var(--surface)]">
                      <tr className="border-b border-[var(--border)] text-left">
                        <th className="px-3 py-2 font-bold uppercase tracking-wide text-[var(--text-muted)]">Linha</th>
                        <th className="px-3 py-2 font-bold uppercase tracking-wide text-[var(--text-muted)]">Material</th>
                        <th className="px-3 py-2 font-bold uppercase tracking-wide text-[var(--text-muted)]">Un.</th>
                        <th className="px-3 py-2 font-bold uppercase tracking-wide text-[var(--text-muted)]">Categoria</th>
                        <th className="px-3 py-2 font-bold uppercase tracking-wide text-[var(--text-muted)]">Mín.</th>
                        <th className="px-3 py-2 font-bold uppercase tracking-wide text-[var(--text-muted)]">Qtd.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leitura.linhas.slice(0, 200).map((l) => (
                        <tr key={l.linha} className={`border-b border-[var(--border)] ${l.dados ? '' : 'bg-rose-500/5'}`}>
                          <td className="px-3 py-1.5 font-mono text-[var(--text-muted)]">{l.linha}</td>
                          {l.dados ? (
                            <>
                              <td className="px-3 py-1.5 font-medium text-[var(--text)]">{l.dados.nome}</td>
                              <td className="px-3 py-1.5 text-[var(--text-muted)]">{l.dados.unidade_medida}</td>
                              <td className="px-3 py-1.5 text-[var(--text-muted)]">{l.dados.categoria}</td>
                              <td className="px-3 py-1.5 text-[var(--text-muted)]">{l.dados.estoque_minimo}</td>
                              <td className="px-3 py-1.5 text-[var(--text-muted)]">{contaSaldo ? l.dados.quantidade : 0}</td>
                            </>
                          ) : (
                            <td colSpan={5} className="px-3 py-1.5 text-rose-500">
                              <AlertTriangle size={11} className="mr-1 inline" />
                              {l.erro}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {leitura.linhas.length > 200 && <p className="mt-1 text-[11px] text-[var(--text-muted)]">Mostrando as 200 primeiras; todas as {validas.length} válidas serão importadas.</p>}
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">Material com nome que já existe é pulado — a importação nunca sobrescreve o que está cadastrado.</p>
            </>
          )}

          {leitura?.erroGeral && (
            <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-rose-500" />
              <p className="text-sm text-[var(--text)]">{leitura.erroGeral}</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
