import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAtualizacaoAutomatica } from '@/lib/useAtualizacaoAutomatica';
import { api, ApiError } from '@/lib/api';
import type { Conta } from '@/shared/planos';
import { useUnidade } from '@/store/unidade';
import { useMarca } from '@/store/marca';
import type { Acesso, Categoria, Deposito, Emprestimo, Item, Lote, Material, MaterialMovement, NivelAcesso, Organizacao, StaffUser, Unidade } from '@/shared/types';
import { toast } from 'sonner';

/** O que o servidor devolve. Os materiais vêm com `saldos` por depósito. */
interface EstoqueResposta {
  materials: Omit<Material, 'saldo_unidade' | 'saldos_unidade' | 'na_unidade'>[];
  materialMovements: MaterialMovement[];
  staff: StaffUser[];
  unidades: Unidade[];
  depositos: Deposito[];
  categorias: Categoria[];
  /** Retiradas não devolvidas (empréstimo) e entregas abertas (EPI), em todos os estoques da organização. */
  emprestimos: Emprestimo[];
  /** Lotes com saldo dos estoques de validade. */
  lotes: Lote[];
  /** Itens dos estoques de patrimônio (inclusive baixados). */
  itens: Item[];
  /** O que ESTA pessoa pode, por depósito. `null` = administrador. */
  acessos: Acesso[] | null;
  organizacao: Organizacao | null;
}

const VAZIO: EstoqueResposta = {
  materials: [],
  materialMovements: [],
  staff: [],
  unidades: [],
  depositos: [],
  categorias: [],
  emprestimos: [],
  lotes: [],
  itens: [],
  acessos: null,
  organizacao: null,
};

/**
 * Carrega o estoque e o entrega já visto de uma unidade.
 *
 * O servidor manda o saldo de cada material em cada depósito de cada unidade.
 * A interface, porém, fala "Central" e "Obra" — e está falando dos depósitos
 * da unidade que a pessoa escolheu. Aqui a tradução acontece uma vez só:
 * `saldo_central` e `saldo_obra` de cada material passam a ser o saldo nos
 * depósitos desta unidade. Nenhuma tela precisa saber que existe outra.
 *
 * Cada unidade é um estoque próprio: o mínimo se compara com o total DELA
 * (ver stockTotal em utils.ts), e só o que ela tem aparece nas telas.
 */
export function useEstoqueData() {
  const [data, setData] = useState<EstoqueResposta>(VAZIO);
  const [loading, setLoading] = useState(true);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  // Conta bloqueada (avaliação terminou, cartão recusado): o servidor recusa
  // o /api/data com 402 e diz a situação. A tela de bloqueio assume dali.
  const [bloqueio, setBloqueio] = useState<Conta | null>(null);
  // Falhou e nunca chegou a carregar: a tela não pode concluir nada sobre a empresa.
  const [semResposta, setSemResposta] = useState(false);
  const unidadeEscolhida = useUnidade((s) => s.unidadeId);
  const setUnidade = useUnidade((s) => s.setUnidade);
  const setOrganizacao = useMarca((s) => s.setOrganizacao);

  // Uma busca de cada vez: aba voltando ao foco no meio de um carregamento
  // não pode empilhar pedidos, senão a tela pisca com respostas fora de ordem.
  const buscando = useRef(false);
  // Se ALGUMA busca já trouxe dados. Num ref, não numa dependência: ler
  // `atualizadoEm` dentro do refetch faria o hook se recriar a cada sucesso
  // e o efeito disparar de novo — um laço infinito de requisições.
  const jaCarregou = useRef(false);
  const refetch = useCallback(async (opcoes: { silencioso?: boolean } = {}) => {
    if (buscando.current) return;
    buscando.current = true;
    try {
      let result: EstoqueResposta;
      try {
        result = await api.get<EstoqueResposta>('/api/data');
      } catch (primeiro: any) {
        // O primeiro carregamento falhou por algo passageiro (rede, servidor
        // acordando)? Tenta de novo sozinho antes de mostrar a tela de erro —
        // a pessoa não precisa apertar "Tentar de novo" por um soluço de 1s.
        // 401 e 402 não são soluço: sessão e plano, tratados abaixo.
        const passageiro = !(primeiro instanceof ApiError && (primeiro.status === 401 || primeiro.status === 402));
        if (jaCarregou.current || !passageiro) throw primeiro;
        await new Promise((r) => setTimeout(r, 1500));
        result = await api.get<EstoqueResposta>('/api/data');
      }
      setData({ ...VAZIO, ...result });
      setAtualizadoEm(new Date());
      setBloqueio(null);
      setSemResposta(false);
      jaCarregou.current = true;
      // Veste a cor e o logo desta organização assim que se sabe qual é.
      setOrganizacao(result.organizacao ?? null);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 402 && err.body?.bloqueada) {
        setBloqueio(err.body.conta ?? { situacao: 'bloqueada', renovacao: null, plano: 'avaliacao', ate: null, dias_restantes: 0 });
        return;
      }
      // Nunca carregou? A tela precisa dizer que não conseguiu — e não
      // desenhar uma empresa vazia que não existe.
      if (!jaCarregou.current) setSemResposta(true);
      // Atualização de fundo que falha (queda de rede, servidor reiniciando)
      // não vira aviso: a tela continua com o que tinha e tenta de novo.
      if (!opcoes.silencioso) toast.error(err.message || 'Erro ao carregar dados do estoque.');
    } finally {
      buscando.current = false;
      setLoading(false);
    }
  }, [setOrganizacao]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // A tela se atualiza sozinha: intervalo, foco e volta da internet.
  const emSegundoPlano = useCallback(() => {
    refetch({ silencioso: true });
  }, [refetch]);
  useAtualizacaoAutomatica(emSegundoPlano);

  // Só se opera em unidade ativa. As desativadas continuam no payload para a
  // tela de Configurações poder mostrá-las e reativá-las.
  const unidadesAtivas = useMemo(() => data.unidades.filter((u) => u.ativo), [data.unidades]);

  // A unidade em uso: a escolhida, se ainda estiver ativa; senão a primeira.
  // Uma escolha salva no navegador pode apontar para uma unidade desativada.
  const unidade = useMemo<Unidade | null>(() => {
    if (unidadesAtivas.length === 0) return null;
    return unidadesAtivas.find((u) => u.id === unidadeEscolhida) ?? unidadesAtivas[0];
  }, [unidadesAtivas, unidadeEscolhida]);

  // Corrige a escolha salva quando ela não vale mais, para o seletor e os
  // pedidos ao servidor concordarem sobre qual unidade é.
  useEffect(() => {
    if (unidade && unidade.id !== unidadeEscolhida) setUnidade(unidade.id);
  }, [unidade, unidadeEscolhida, setUnidade]);

  const depositosDaUnidade = useMemo(
    () => (unidade ? data.depositos.filter((d) => d.unit_id === unidade.id) : []),
    [data.depositos, unidade],
  );

  // Catálogo: todos os materiais da organização, vistos da unidade em uso.
  // Um material ESTÁ na unidade quando tem linha de saldo em algum depósito
  // dela — é o admin quem o coloca lá. Zero é saldo; ausência de linha é
  // "não trabalha com isso aqui".
  const catalogo = useMemo<Material[]>(() => {
    const idsDaUnidade = depositosDaUnidade.map((d) => d.id);
    return data.materials.map((m) => {
      const saldos = m.saldos ?? {};
      const saldos_unidade: Record<string, number> = {};
      let saldo_unidade = 0;
      let na_unidade = false;
      for (const id of idsDaUnidade) {
        if (id in saldos) {
          na_unidade = true;
          saldos_unidade[id] = Number(saldos[id] ?? 0);
          saldo_unidade += saldos_unidade[id];
        }
      }
      return { ...m, saldos, na_unidade, saldo_unidade: Math.round(saldo_unidade * 100) / 100, saldos_unidade };
    });
  }, [data.materials, depositosDaUnidade]);

  // O que as telas de operação mostram: só o que existe nesta unidade.
  const materials = useMemo(() => catalogo.filter((m) => m.na_unidade), [catalogo]);

  // O nível da pessoa num estoque. Administrador opera tudo; quem não tem o
  // estoque não o vê — e a tela dele nem aparece no menu.
  const nivelEm = useCallback(
    (depositoId: string): NivelAcesso | null => {
      if (data.acessos === null) return 'OPERA';
      return data.acessos.find((a) => a.warehouse_id === depositoId)?.nivel ?? null;
    },
    [data.acessos],
  );

  // Os estoques da unidade que esta pessoa pode ver, com o nível dela em cada um.
  const estoquesVisiveis = useMemo(
    () =>
      depositosDaUnidade
        .filter((d) => d.ativo)
        .map((d) => ({ deposito: d, nivel: nivelEm(d.id) }))
        .filter((x): x is { deposito: Deposito; nivel: NivelAcesso } => x.nivel !== null),
    [depositosDaUnidade, nivelEm],
  );

  return {
    /** Materiais que existem na unidade em uso. É o que Central, Obra, alertas e dashboard mostram. */
    materials,
    /** Todos os materiais da organização, com `na_unidade` dizendo se estão nesta. */
    catalogo,
    materialMovements: data.materialMovements,
    staff: data.staff,
    /** Todas, inclusive desativadas — para Configurações. O seletor usa `unidadesAtivas`. */
    unidades: data.unidades,
    unidadesAtivas,
    depositos: data.depositos,
    /** A unidade cujos depósitos as telas estão mostrando. */
    unidade,
    /** Só os depósitos da unidade em uso. */
    depositosDaUnidade,
    /** Nível da pessoa num estoque: 'OPERA', 'CONSULTA' ou null (não vê). */
    nivelEm,
    /** Estoques ativos da unidade em uso que esta pessoa enxerga, com o nível dela. É o que vira menu. */
    estoquesVisiveis,
    categorias: data.categorias,
    emprestimos: data.emprestimos,
    lotes: data.lotes,
    itens: data.itens,
    organizacao: data.organizacao,
    /** A situação quando o servidor bloqueou a conta; null quando está tudo bem. */
    bloqueio,
    loading,
    semResposta,
    /** Quando os dados chegaram pela última vez — o "última atualização" do painel. */
    atualizadoEm,
    refetch,
  };
}
