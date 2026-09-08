export type ChangeKind = 'novo' | 'melhoria' | 'correcao' | 'seguranca';

export interface Change {
  tipo: ChangeKind;
  titulo: string;
  descricao: string;
}

export interface Release {
  versao: string;
  data: string; // ISO
  titulo: string;
  resumo: string;
  mudancas: Change[];
}

export const KIND_META: Record<ChangeKind, { label: string; className: string }> = {
  novo: { label: 'Novo', className: 'bg-emerald-500/15 text-emerald-500' },
  melhoria: { label: 'Melhoria', className: 'bg-[var(--brand)]/15 text-[var(--brand)]' },
  correcao: { label: 'Correção', className: 'bg-sky-500/15 text-sky-500' },
  seguranca: { label: 'Segurança', className: 'bg-rose-500/15 text-rose-500' },
};

/** Mais recente primeiro. A versão do topo é a que aparece no aviso do Dashboard. */
export const RELEASES: Release[] = [
  {
    versao: '2.0',
    data: '2026-09-08',
    titulo: 'Alertas confiáveis, novas telas e visual novo',
    resumo:
      'A maior mudança é como o sistema decide que um material está em falta. Antes, 132 materiais apareciam em alerta; 99 deles não eram falta — a empresa tinha o item na Central.',
    mudancas: [
      {
        tipo: 'correcao',
        titulo: 'Alerta de falta deixou de mentir',
        descricao:
          'O sistema marcava um material como crítico se qualquer um dos almoxarifados estivesse baixo, mesmo com centenas de unidades no outro. Agora o Estoque Mínimo vale para a empresa (Central + Obra), e faltar em um só lugar aparece como "requer remessa", não como falta. Os alertas de compra caíram de 132 para 67.',
      },
      {
        tipo: 'correcao',
        titulo: 'Materiais sem mínimo não geram mais alarme falso',
        descricao:
          'Material com estoque mínimo 0 ficava marcado como crítico para sempre. Agora mínimo 0 significa "sem controle de mínimo" e só alerta se zerar nos dois almoxarifados.',
      },
      {
        tipo: 'novo',
        titulo: 'Filtro "Não tem na Obra, tem na Central"',
        descricao:
          'Na tela da Obra, um botão lista só os materiais zerados ali que a Central tem em estoque. Serve para pedir remessa em vez de abrir compra.',
      },
      {
        tipo: 'novo',
        titulo: 'Tela de Alertas',
        descricao:
          'Separa o que precisa de compra do que só precisa de remessa, mostra o percentual do mínimo que cada saldo cobre e gera a Lista de Compras em Word — já sem os itens que existem na Central.',
      },
      {
        tipo: 'novo',
        titulo: 'Suporte',
        descricao:
          'Almoxarifes abrem chamados sobre cadastro de materiais (duplicado, nome errado, informação incorreta), marcando os materiais envolvidos. Cada chamado tem conversa e a gestão registra a resolução.',
      },
      {
        tipo: 'novo',
        titulo: 'Gerenciador de Usuários',
        descricao:
          'Criar, editar e remover quem acessa o estoque, com gerador de senha forte. Só enxerga perfis do estoque — usuários de outros sistemas ficam protegidos.',
      },
      {
        tipo: 'novo',
        titulo: 'Ajuda',
        descricao:
          'Guia de uso com busca, mostrando os tópicos do perfil de cada funcionário. Disponível para todos.',
      },
      {
        tipo: 'seguranca',
        titulo: 'Senhas passam a ser gravadas com bcrypt',
        descricao:
          'Toda senha criada ou redefinida agora é gravada de forma irreversível. As contas antigas aparecem marcadas com o selo TEXTO PURO em Usuários, para serem trocadas uma a uma.',
      },
      {
        tipo: 'melhoria',
        titulo: 'Lista de materiais virou tabela',
        descricao:
          'Os 317 materiais saíram da grade de cartões para uma tabela com Central, Obra, Total, Mínimo e situação. Clique na linha para expandir. Ganhou filtro por categoria e por situação, com contagem.',
      },
      {
        tipo: 'melhoria',
        titulo: 'Histórico mais legível',
        descricao:
          'As movimentações agora mostram o tipo como etiqueta colorida e a quantidade com sinal (+30, −15), separando entrada, saída e transferência.',
      },
      {
        tipo: 'melhoria',
        titulo: 'Visual novo e tema escuro',
        descricao:
          'Interface redesenhada, com alternância entre tema claro e escuro pelo ícone no topo. A escolha fica salva.',
      },
      {
        tipo: 'melhoria',
        titulo: 'Menu organizado por categoria',
        descricao: 'O menu lateral foi dividido em Visão geral, Estoque e Sistema.',
      },
      {
        tipo: 'correcao',
        titulo: 'Menu não some mais ao rolar a página',
        descricao: 'O menu lateral saía da tela ao rolar e deixava um espaço vazio. Agora fica fixo.',
      },
      {
        tipo: 'correcao',
        titulo: 'E-mails de alerta corrigidos',
        descricao:
          'O aviso automático usava a mesma regra errada e disparava por falta em um só almoxarifado. Agora só avisa quando o total da empresa está abaixo do mínimo, e diz se é falta total ou reposição.',
      },
    ],
  },
];

export const LATEST = RELEASES[0];
