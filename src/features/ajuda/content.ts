import { ADMIN_ROLES, OBRA_ROLES, CENTRAL_ROLES } from '@/shared/constants';

/** Quem precisa ler o tópico. 'todos' aparece para qualquer perfil. */
export type Audience = 'todos' | 'admin' | 'central' | 'obra';

export interface Tip {
  tipo: 'dica' | 'atencao';
  texto: string;
}

export interface Topic {
  id: string;
  titulo: string;
  audiencia: Audience[];
  resumo: string;
  passos?: string[];
  dicas?: Tip[];
}

export interface Section {
  id: string;
  titulo: string;
  descricao: string;
  topicos: Topic[];
}

/** Traduz o papel do usuário para as audiências que ele deve enxergar. */
export function audiencesForRole(role: string): Audience[] {
  const out: Audience[] = ['todos'];
  if (ADMIN_ROLES.includes(role)) return [...out, 'admin', 'central', 'obra'];
  if (OBRA_ROLES.includes(role)) out.push('obra');
  if (CENTRAL_ROLES.includes(role)) out.push('central');
  return out;
}

export const GUIA: Section[] = [
  {
    id: 'primeiros-passos',
    titulo: 'Primeiros passos',
    descricao: 'O básico para começar a usar o sistema.',
    topicos: [
      {
        id: 'entrar',
        titulo: 'Entrar no sistema',
        audiencia: ['todos'],
        resumo: 'Você entra com a sua matrícula (ou e-mail cadastrado) e a sua senha.',
        passos: [
          'Abra o endereço do sistema no navegador.',
          'Digite sua matrícula ou o e-mail que a gestão cadastrou.',
          'Digite sua senha e clique em Entrar.',
        ],
        dicas: [
          {
            tipo: 'atencao',
            texto:
              'Esqueceu a senha? O sistema não tem "recuperar senha". Peça para a gestão gerar uma nova em Usuários.',
          },
        ],
      },
      {
        id: 'menu',
        titulo: 'Encontrar as telas no menu',
        audiencia: ['todos'],
        resumo:
          'O menu da esquerda é dividido em Visão geral, Estoque e Sistema. Você só enxerga o que o seu perfil pode usar.',
        passos: [
          'No computador, o menu fica sempre visível à esquerda.',
          'No celular, toque no ícone de três riscos no canto superior esquerdo.',
          'Clique no item desejado — o item ativo fica destacado em laranja.',
        ],
      },
      {
        id: 'tema',
        titulo: 'Trocar entre tema claro e escuro',
        audiencia: ['todos'],
        resumo: 'Dá para deixar a tela clara ou escura, o que for mais confortável.',
        passos: [
          'No topo da tela, clique no ícone de lua (tema escuro) ou sol (tema claro).',
          'A escolha fica salva no seu navegador e volta assim quando você entrar de novo.',
        ],
      },
    ],
  },

  {
    id: 'conceitos',
    titulo: 'Entendendo o estoque',
    descricao: 'A parte mais importante. Ler isso evita pedir compra do que já existe.',
    topicos: [
      {
        id: 'dois-almoxarifados',
        titulo: 'Central e Obra são dois lugares, um estoque só',
        audiencia: ['todos'],
        resumo:
          'O mesmo material pode estar na Central, na Obra, ou nos dois. O que a empresa tem é a soma dos dois.',
        dicas: [
          {
            tipo: 'dica',
            texto:
              'Na tabela de Materiais, a coluna Total mostra Central + Obra. É esse número que diz se a empresa tem ou não o material.',
          },
        ],
      },
      {
        id: 'estoque-minimo',
        titulo: 'O que é o Estoque Mínimo',
        audiencia: ['todos'],
        resumo:
          'É o ponto de recompra da empresa inteira — não de cada almoxarifado. Se o mínimo é 10, a empresa deve ter 10 somando Central + Obra.',
        dicas: [
          {
            tipo: 'atencao',
            texto:
              'Mínimo 0 significa "sem controle de mínimo". O material só gera alerta se zerar nos dois almoxarifados.',
          },
        ],
      },
      {
        id: 'status',
        titulo: 'Os selos de situação',
        audiencia: ['todos'],
        resumo: 'Cada material recebe um selo que diz o que fazer com ele. A cor indica a gravidade.',
        passos: [
          'Sem estoque (vermelho): não existe em lugar nenhum. Precisa comprar.',
          'Abaixo do mínimo (laranja): o total da empresa caiu abaixo do ponto de recompra. Precisa comprar.',
          'Atenção (cinza): está perto do mínimo. Só monitorar.',
          'Tem na Central / Tem na Obra (azul): falta aqui, mas existe no outro almoxarifado. Basta pedir remessa — não é falta.',
          'Sem selo: está tudo certo com esse material.',
        ],
        dicas: [
          {
            tipo: 'dica',
            texto:
              'O selo azul é o mais importante do dia a dia: ele separa o que precisa de compra do que só precisa de transferência interna.',
          },
        ],
      },
    ],
  },

  {
    id: 'central',
    titulo: 'Almoxarifado Central',
    descricao: 'Recebimento de compras, envio para a obra e devoluções.',
    topicos: [
      {
        id: 'movimentacao-central',
        titulo: 'Registrar uma movimentação',
        audiencia: ['central'],
        resumo: 'Toda entrada e saída da Central é registrada aqui e fica gravada com o seu nome.',
        passos: [
          'Abra Almoxarifado Central.',
          'Em Registrar Movimentação, escolha a operação: Receber Compra, Enviar p/ Obra, Aceitar Devolução ou Saída / Consumo Adm.',
          'Busque o material pelo nome no campo Material.',
          'Informe a quantidade.',
          'Preencha a Justificativa / NFE / Guia — é obrigatório e serve de comprovante na auditoria.',
          'Clique em Registrar Movimentação.',
        ],
        dicas: [
          {
            tipo: 'dica',
            texto:
              'Enviar p/ Obra não diminui o estoque da empresa: tira da Central e põe na Obra. O total continua o mesmo.',
          },
          {
            tipo: 'atencao',
            texto: 'Não dá para apagar uma movimentação. Se errar, registre o ajuste contrário e explique na justificativa.',
          },
        ],
      },
      {
        id: 'consultar-central',
        titulo: 'Consultar o estoque atual',
        audiencia: ['central'],
        resumo: 'A lista Estoque Atual mostra os saldos e permite alternar entre Central e Obra.',
        passos: [
          'Use a busca para achar o material pelo nome.',
          'Clique em Central ou Obra para ver o saldo de cada lugar.',
          'Clique nos blocos de Distribuição por Seções para filtrar por categoria.',
          'Passe o mouse sobre a linha e clique no relógio para ver o histórico daquele material.',
        ],
      },
      {
        id: 'recontagem-central',
        titulo: 'Fazer a recontagem física',
        audiencia: ['central', 'obra'],
        resumo:
          'A Recontagem Rápida serve para acertar o sistema com o que existe de verdade na prateleira.',
        passos: [
          'Clique em Recontagem Rápida no topo da tela.',
          'Busque o material e digite a quantidade que você contou.',
          'Materiais que batem com o sistema não precisam ser preenchidos.',
          'Revise a lista de divergências e confirme.',
        ],
        dicas: [
          {
            tipo: 'atencao',
            texto: 'A recontagem sobrescreve o saldo do sistema. Confira a contagem antes de confirmar.',
          },
        ],
      },
    ],
  },

  {
    id: 'obra',
    titulo: 'Almoxarifado de Obra',
    descricao: 'Consumo de materiais e devolução para a central.',
    topicos: [
      {
        id: 'movimentacao-obra',
        titulo: 'Registrar consumo ou devolução',
        audiencia: ['obra'],
        resumo: 'Na obra você registra o que foi consumido e o que está voltando para a Central.',
        passos: [
          'Abra Almoxarifado Obra.',
          'Escolha Consumo (material usado na obra) ou Devolver p/ Central (sobrou e está voltando).',
          'Busque o material, informe a quantidade e a justificativa.',
          'Clique em Registrar Movimentação.',
        ],
        dicas: [
          {
            tipo: 'dica',
            texto: 'Consumo baixa o estoque da empresa. Devolução apenas transfere de volta para a Central.',
          },
        ],
      },
      {
        id: 'tem-na-central',
        titulo: 'Ver o que falta na Obra mas existe na Central',
        audiencia: ['obra'],
        resumo:
          'Esse é o atalho que evita pedir compra à toa. Ele lista só os materiais zerados na Obra que a Central tem em estoque.',
        passos: [
          'Abra Almoxarifado Obra.',
          'Na lista Estoque Atual, clique no botão azul "Não tem na Obra, tem na Central".',
          'A lista passa a mostrar só esses materiais, com o selo TEM NA CENTRAL.',
          'Peça a remessa desses itens à Central — não é caso de compra.',
        ],
        dicas: [
          {
            tipo: 'dica',
            texto: 'O número no botão é a quantidade de materiais nessa situação. Clique de novo para tirar o filtro.',
          },
        ],
      },
    ],
  },

  {
    id: 'materiais',
    titulo: 'Materiais',
    descricao: 'Cadastro e manutenção da lista de materiais.',
    topicos: [
      {
        id: 'cadastrar',
        titulo: 'Cadastrar um material novo',
        audiencia: ['admin'],
        resumo: 'O formulário fica à esquerda da tela Materiais.',
        passos: [
          'Preencha o Nome. Se já existir algo parecido, o sistema avisa antes de deixar salvar.',
          'Escolha a Categoria e informe a Unidade de Medida (UN, CX, KG...).',
          'Informe Qtd. Volumes e Fator Multiplicador — o saldo inicial é a multiplicação dos dois.',
          'Defina o Estoque Mínimo (o ponto de recompra da empresa).',
          'Clique em Cadastrar Material.',
        ],
        dicas: [
          {
            tipo: 'atencao',
            texto:
              'Se o sistema avisar que existem materiais parecidos, confira antes. Cadastro duplicado é o erro mais comum e bagunça os saldos.',
          },
        ],
      },
      {
        id: 'consultar-materiais',
        titulo: 'Buscar e filtrar materiais',
        audiencia: ['admin'],
        resumo: 'A tabela mostra Central, Obra, Total, Mínimo e a situação de cada material.',
        passos: [
          'Use a busca por nome ou o seletor de categoria.',
          'Use os botões de situação para ver só o que interessa: Sem estoque, Abaixo do mínimo ou Tem na Central.',
          'Clique na linha do material para expandir e ver a barra de estoque, o percentual do mínimo e os volumes.',
          'Com a linha aberta, use Histórico, Gerenciar ou Excluir.',
        ],
      },
      {
        id: 'lote',
        titulo: 'Editar vários materiais de uma vez',
        audiencia: ['admin'],
        resumo: 'Dá para definir o mínimo em lote e unificar cadastros duplicados.',
        passos: [
          'Clique em Selecionar Múltiplos.',
          'Clique nas linhas dos materiais que quer selecionar.',
          'Use Definir Mínimo para aplicar o mesmo estoque mínimo a todos.',
          'Use Unificar (a partir de 2 selecionados) para juntar cadastros duplicados num só.',
        ],
        dicas: [
          {
            tipo: 'atencao',
            texto:
              'Ao unificar, escolha com atenção qual cadastro fica como principal: os saldos dos outros são somados nele e os duplicados são removidos.',
          },
        ],
      },
      {
        id: 'exportar',
        titulo: 'Exportar e auditar',
        audiencia: ['admin'],
        resumo: 'Exportar Word gera a lista completa por categoria. Auditoria Geral mostra todas as movimentações.',
        passos: [
          'Exportar Word baixa um documento com todos os materiais separados por categoria.',
          'Auditoria Geral abre o histórico completo, com filtros por período, tipo de operação e busca.',
          'Dentro da auditoria, o botão PDF gera o relatório do que está filtrado na tela.',
        ],
      },
    ],
  },

  {
    id: 'alertas',
    titulo: 'Alertas',
    descricao: 'O que precisa de compra e o que só precisa de remessa.',
    topicos: [
      {
        id: 'ler-alertas',
        titulo: 'Ler a tela de Alertas',
        audiencia: ['admin'],
        resumo:
          'Os alertas vêm separados por causa, porque cada um pede uma ação diferente.',
        passos: [
          'Sem estoque: não existe em lugar nenhum — comprar.',
          'Abaixo do mínimo: o total da empresa está abaixo do ponto de recompra — comprar.',
          'Requer remessa: falta na Obra mas a Central tem — transferir, não comprar.',
          'Cada cartão mostra o percentual do mínimo que o saldo cobre.',
        ],
      },
      {
        id: 'lista-compras',
        titulo: 'Gerar a lista de compras',
        audiencia: ['admin'],
        resumo: 'O botão Lista de Compras baixa um documento com o que realmente precisa ser comprado.',
        dicas: [
          {
            tipo: 'dica',
            texto:
              'A lista inclui uma sugestão de quantidade e, de propósito, deixa de fora os itens que só precisam de remessa — para você não comprar o que já tem na Central.',
          },
        ],
      },
    ],
  },

  {
    id: 'suporte',
    titulo: 'Suporte',
    descricao: 'Como avisar a gestão sobre problemas no cadastro de materiais.',
    topicos: [
      {
        id: 'abrir-chamado',
        titulo: 'Abrir um chamado',
        audiencia: ['todos'],
        resumo:
          'Encontrou material duplicado, com nome errado ou informação incorreta? Abra um chamado em vez de corrigir por fora.',
        passos: [
          'Abra Suporte e clique em Abrir chamado.',
          'Escolha o tipo: Material duplicado, Nome incorreto, Informação incorreta, Material não cadastrado ou Outro assunto.',
          'Busque e selecione os materiais envolvidos. Para duplicidade, selecione todos os cadastros repetidos.',
          'Escreva um assunto curto e explique o problema na descrição.',
          'Defina a prioridade e clique em Enviar chamado.',
        ],
        dicas: [
          {
            tipo: 'dica',
            texto: 'Quanto mais específico o texto, mais rápido a gestão resolve. Diga qual seria a informação correta.',
          },
        ],
      },
      {
        id: 'acompanhar-chamado',
        titulo: 'Acompanhar e responder',
        audiencia: ['todos'],
        resumo: 'Cada chamado tem uma conversa. Você recebe a resposta da gestão ali mesmo.',
        passos: [
          'Clique no chamado na lista para abrir.',
          'Use os filtros no topo para ver Pendentes, Abertos, Em análise, Resolvidos ou Todos.',
          'Escreva na caixa de mensagem e clique em Enviar para responder.',
        ],
        dicas: [
          {
            tipo: 'dica',
            texto: 'Responder um chamado já resolvido reabre ele automaticamente.',
          },
        ],
      },
      {
        id: 'resolver-chamado',
        titulo: 'Resolver um chamado',
        audiencia: ['admin'],
        resumo: 'A gestão muda o status e registra o que foi feito.',
        passos: [
          'Abra o chamado e vá até Ações da gestão.',
          'Mude o Status para Em análise, Resolvido ou Recusado.',
          'Escreva no campo Resolução o que foi feito e clique em Salvar resolução.',
        ],
        dicas: [
          {
            tipo: 'dica',
            texto: 'Quem abriu o chamado só enxerga os próprios. A gestão enxerga todos.',
          },
        ],
      },
    ],
  },

  {
    id: 'usuarios',
    titulo: 'Usuários',
    descricao: 'Gerenciar quem tem acesso ao sistema.',
    topicos: [
      {
        id: 'criar-usuario',
        titulo: 'Criar ou editar um usuário',
        audiencia: ['admin'],
        resumo: 'Só perfis do estoque aparecem aqui. Usuários de outros sistemas não podem ser alterados.',
        passos: [
          'Abra Usuários e clique em Novo usuário.',
          'Preencha nome, matrícula e escolha o perfil.',
          'Clique em Gerar para criar uma senha forte, ou digite uma com no mínimo 8 caracteres.',
          'Copie a senha e entregue ao funcionário antes de salvar — depois ela não pode mais ser lida.',
        ],
        dicas: [
          {
            tipo: 'atencao',
            texto:
              'A matrícula não pode ser alterada depois: ela identifica o histórico de movimentações da pessoa.',
          },
        ],
      },
      {
        id: 'senha-texto-puro',
        titulo: 'O aviso de senha em texto puro',
        audiencia: ['admin'],
        resumo:
          'Contas antigas têm a senha gravada de forma legível no banco. O selo vermelho marca quais são.',
        passos: [
          'Abra Usuários e veja quais contas têm o selo TEXTO PURO.',
          'Clique no lápis para editar a conta.',
          'Gere uma nova senha, entregue ao funcionário e salve.',
          'O selo passa a Protegida.',
        ],
        dicas: [
          {
            tipo: 'atencao',
            texto: 'Enquanto houver senha em texto puro, quem tiver acesso ao banco consegue ler a senha da pessoa.',
          },
        ],
      },
    ],
  },
];
