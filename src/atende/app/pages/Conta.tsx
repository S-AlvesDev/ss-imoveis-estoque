import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { KeyRound } from 'lucide-react';
import { Botao } from '../ui/Botao';
import { Cartao, CabecalhoDoCartao } from '../ui/Cartao';
import { Entrada } from '../ui/Campo';
import { Avatar } from '../ui/Avatar';
import { Etiqueta } from '../ui/Etiqueta';
import { Pagina } from '../ui/Pagina';
import { api, ErroDaApi } from '../lib/api';
import { useSessaoAtende } from '../store/sessao';
import { useDadosAtende } from '../store/dados';
import { NOME_DO_PAPEL, DESCRICAO_DO_PAPEL } from '../../shared/papeis';
import { MIN_SENHA } from '../../shared/validacao';
import { CartaoDeNotificacoes } from './Notificacoes';

/** A própria conta: quem sou, notificações deste aparelho e trocar a senha. */
export function Conta() {
  const sessao = useSessaoAtende((s) => s.sessao)!;
  const empresa = useDadosAtende((s) => s.empresa);
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function trocar(e: FormEvent) {
    e.preventDefault();
    if (nova !== confirmacao) return toast.error('As senhas não conferem.');
    setSalvando(true);
    try {
      await api.post('/minha-senha', { atual, nova });
      toast.success('Senha trocada.');
      setAtual('');
      setNova('');
      setConfirmacao('');
    } catch (err) {
      toast.error(err instanceof ErroDaApi ? err.message : 'Não foi possível trocar a senha.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Pagina titulo="Minha conta" descricao="Quem você é no Atende Aí, as notificações deste aparelho e a sua senha." largura="sm">
      <div className="space-y-4">
        <Cartao className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
          <Avatar nome={sessao.nome} tamanho={56} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold tracking-tight text-[var(--text)]">{sessao.nome}</p>
            <p className="truncate text-sm text-[var(--text-muted)]">{sessao.email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Etiqueta tom="roxo" tamanho="md">{NOME_DO_PAPEL[sessao.papel]}</Etiqueta>
              {empresa && <span className="text-xs text-[var(--text-muted)]">{empresa.nome}</span>}
            </div>
          </div>
          <p className="w-full text-xs leading-5 text-[var(--text-muted)]">{DESCRICAO_DO_PAPEL[sessao.papel]}</p>
        </Cartao>

        <CartaoDeNotificacoes />

        <Cartao className="space-y-4 p-4 sm:p-5">
          <CabecalhoDoCartao icone={<KeyRound size={14} />} titulo="Trocar senha" descricao={`Mínimo de ${MIN_SENHA} caracteres.`} />
          <form onSubmit={trocar} className="space-y-4">
            <Entrada rotulo="Senha atual" type="password" autoComplete="current-password" required value={atual} onChange={(e) => setAtual(e.target.value)} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Entrada rotulo="Nova senha" type="password" autoComplete="new-password" required minLength={MIN_SENHA} value={nova} onChange={(e) => setNova(e.target.value)} />
              <Entrada rotulo="Confirme a nova senha" type="password" autoComplete="new-password" required minLength={MIN_SENHA} value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} erro={confirmacao && nova !== confirmacao ? 'As senhas não conferem.' : undefined} />
            </div>
            <Botao type="submit" carregando={salvando}>
              Trocar senha
            </Botao>
          </form>
        </Cartao>
      </div>
    </Pagina>
  );
}
