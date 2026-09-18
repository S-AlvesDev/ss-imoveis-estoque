import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/shared/ui/Button';
import { Card, CardHeader } from '@/shared/ui/Card';
import { Input } from '@/shared/ui/Field';
import { api, ErroDaApi } from '../lib/api';
import { useSessaoAtende } from '../store/sessao';
import { NOME_DO_PAPEL } from '../../shared/papeis';
import { MIN_SENHA } from '../../shared/validacao';
import { CartaoDeNotificacoes } from './Notificacoes';

/** A própria conta: quem sou, notificações deste aparelho e trocar a senha. */
export function Conta() {
  const sessao = useSessaoAtende((s) => s.sessao)!;
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
    <div className="mx-auto max-w-xl space-y-5">
      <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">Minha conta</h1>
      <Card className="p-5">
        <p className="text-lg font-extrabold text-[var(--text)]">{sessao.nome}</p>
        <p className="text-sm text-[var(--text-muted)]">
          {sessao.email} · {NOME_DO_PAPEL[sessao.papel]}
        </p>
      </Card>
      <CartaoDeNotificacoes />
      <Card className="space-y-4 p-5">
        <CardHeader title="Trocar senha" />
        <form onSubmit={trocar} className="space-y-4">
          <Input label="Senha atual" type="password" autoComplete="current-password" required value={atual} onChange={(e) => setAtual(e.target.value)} />
          <Input label={`Nova senha (mínimo ${MIN_SENHA})`} type="password" autoComplete="new-password" required minLength={MIN_SENHA} value={nova} onChange={(e) => setNova(e.target.value)} />
          <Input label="Confirme a nova senha" type="password" autoComplete="new-password" required minLength={MIN_SENHA} value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} />
          <Button type="submit" loading={salvando}>
            Trocar senha
          </Button>
        </form>
      </Card>
    </div>
  );
}
