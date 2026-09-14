import { ADMIN_ROLES } from '@/shared/constants';

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

/**
 * Traduz o papel do usuário para as audiências que ele deve enxergar.
 * "central" e "obra" são nomes antigos: hoje querem dizer "quem opera um
 * estoque", e todo operador vê os dois.
 */
export function audiencesForRole(role: string): Audience[] {
  if (ADMIN_ROLES.includes(role)) return ['todos', 'admin', 'central', 'obra'];
  return ['todos', 'central', 'obra'];
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
          'Abra stokai.app e clique em Entrar.',
          'Digite sua matrícula ou o e-mail que a gestão cadastrou.',
          'Digite sua senha e clique em Entrar.',
        ],
        dicas: [
          {
            tipo: 'dica',
            texto:
              'Esqueceu a senha? Clique em "Esqueci minha senha" na tela de entrada: se a sua conta tem e-mail, chega um link para criar uma senha nova. Se você entra por matrícula e não tem e-mail, peça à gestão uma senha nova em Usuários.',
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
          'Clique no item desejado — o item ativo fica destacado na cor da empresa.',
          'Com pressa? Aperte Ctrl+K (⌘K no Mac) ou clique na busca do topo: digite o nome de um material ou de uma tela e aperte Enter.',
        ],
      },
      {
        id: 'tema',
        titulo: 'Trocar entre tema claro e escuro',
        audiencia: ['todos'],
        resumo: 'Dá para deixar a tela clara ou escura, o que for mais confortável.',
        passos: [
          'No canto superior direito, clique no seu nome.',
          'Escolha "Tema escuro" ou "Tema claro".',
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
        titulo: 'Vários estoques, um total só',
        audiencia: ['todos'],
        resumo:
          'Cada unidade tem os próprios estoques — um almoxarifado, um armário de empréstimo, o que a empresa precisar. O mesmo material pode estar em um, em vários ou em nenhum. O que a unidade tem é a soma de todos.',
        dicas: [
          {
            tipo: 'dica',
            texto:
              'Na tabela de Materiais há uma coluna por estoque e a coluna Total. É o Total que diz se a unidade tem ou não o material.',
          },
          {
            tipo: 'dica',
            texto: 'Estoques têm um modo: Almoxarifado (entrada, saída, consumo, transferência) ou Empréstimo (retirada com prazo e devolução). O administrador cria e configura em Configurações.',
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
    titulo: 'Estoque no modo almoxarifado',
    descricao: 'Entrada, saída, consumo, transferência entre estoques e recontagem.',
    topicos: [
      {
        id: 'movimentacao-central',
        titulo: 'Registrar uma movimentação',
        audiencia: ['central'],
        resumo: 'Toda entrada e saída de um estoque é registrada na tela dele e fica gravada com o seu nome.',
        passos: [
          'No menu Estoque, abra o estoque (ex.: Almoxarifado Central).',
          'Em Registrar movimentação, escolha a operação: Entrada, Saída, Consumo, Transferir (para outro estoque da unidade) ou Ajuste.',
          'Busque o material pelo nome no campo Material.',
          'Informe a quantidade.',
          'Preencha a Justificativa / NFE / Guia — é obrigatório e serve de comprovante na auditoria.',
          'Clique em Registrar Movimentação.',
        ],
        dicas: [
          { tipo: 'dica', texto: 'O administrador pode desligar operações num estoque (ex.: uma cozinha só com Entrada e Consumo). As desligadas não aparecem no formulário.' },
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
    titulo: 'Estoque no modo empréstimo',
    descricao: 'Retiradas com prazo, devoluções e atrasos — uma coordenação de esportes, um laboratório, uma ferramentaria.',
    topicos: [
      {
        id: 'retirada',
        titulo: 'Registrar uma retirada',
        audiencia: ['obra'],
        resumo: 'Alguém pega um material por um tempo. Você anota quem, o quê, quanto e até quando; o saldo sai do estoque e a retirada fica pendente.',
        passos: [
          'No menu Estoque, abra o estoque de empréstimo (ex.: Coordenação de Esportes).',
          'Em Nova retirada, digite quem está retirando — nomes já usados aparecem como sugestão — e, se quiser, uma referência (matrícula, turma, setor).',
          'Escolha o material, a quantidade e confira o prazo em horas (vem preenchido com o padrão do estoque; dá para mudar).',
          'Clique em Registrar retirada. Ela aparece em Pendentes de devolução.',
        ],
        dicas: [{ tipo: 'dica', texto: 'O prazo padrão de cada estoque de empréstimo é definido pelo administrador em Configurações, no cartão da unidade.' }],
      },
      {
        id: 'devolucao',
        titulo: 'Devolver e acompanhar atrasos',
        audiencia: ['obra'],
        resumo: 'A lista de pendentes mostra o que está na rua, ordenado pelo prazo. Passou da hora, fica vermelho e vira alerta.',
        passos: [
          'Na lista Pendentes de devolução, ache a pessoa (dá para buscar por nome, referência ou material).',
          'Clique em Devolver. O saldo volta para o estoque e a retirada sai da lista.',
          'Para ver tudo que já foi retirado e devolvido, clique em Histórico.',
        ],
        dicas: [{ tipo: 'atencao', texto: 'Retiradas atrasadas aparecem também na tela de Alertas, para o administrador. Devolver no sistema é o que encerra o atraso.' }],
      },
      {
        id: 'movimentacao-obra',
        titulo: 'Registrar consumo ou devolução (almoxarifado)',
        audiencia: ['obra'],
        resumo: 'Num estoque de almoxarifado, o que foi usado é Consumo; o que volta de outro estoque é Transferir a partir dele.',
        passos: [
          'Abra o estoque no menu.',
          'Escolha Consumo (material usado) ou, no estoque de origem, Transferir para mandar de volta.',
          'Busque o material, informe a quantidade e a justificativa.',
          'Clique em Registrar.',
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
        titulo: 'Ver o que falta aqui mas existe em outro estoque',
        audiencia: ['obra'],
        resumo:
          'Esse é o atalho que evita pedir compra à toa: um material zerado neste estoque mas com saldo em outro da mesma unidade ganha o selo "Tem em …".',
        passos: [
          'Abra o estoque no menu.',
          'Na lista Estoque atual, os materiais zerados aqui que existem em outro estoque aparecem com o selo azul dizendo onde tem.',
          'Peça a transferência desses itens a quem opera o outro estoque — não é caso de compra.',
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
    id: 'entrega',
    titulo: 'Estoque no modo entrega (EPI)',
    descricao: 'O que sai não volta: capacete, luva, uniforme, crachá. O que se cobra é a troca quando vence — com ficha por pessoa e assinatura.',
    topicos: [
      {
        id: 'registrar-entrega',
        titulo: 'Entregar um item a alguém',
        audiencia: ['obra'],
        resumo: 'Você anota quem recebeu, o quê e quanto; a pessoa assina na tela (se o estoque exigir). O saldo sai e o item fica na ficha dela.',
        passos: [
          'No menu Estoque, abra o estoque de entrega (ex.: EPI).',
          'Em Nova entrega, digite quem recebe e, se quiser, a referência (matrícula, setor, função).',
          'Escolha o material e a quantidade. Se o material tem validade de troca, a tela mostra “troca a cada N dias”.',
          'Peça para a pessoa assinar no quadro (dedo, caneta ou mouse) e clique em Registrar entrega.',
        ],
        dicas: [
          { tipo: 'dica', texto: 'A validade de troca é do material: em Materiais, o campo “Validade de troca (dias)” aparece quando a empresa tem um estoque de entrega. Ex.: capacete 180 dias, luva 30.' },
          { tipo: 'dica', texto: 'O administrador liga “Exige assinatura” no cartão do estoque, em Configurações. Sem isso, a assinatura é opcional.' },
        ],
      },
      {
        id: 'ficha-troca',
        titulo: 'Ficha por pessoa, troca e termo em PDF',
        audiencia: ['obra'],
        resumo: 'Cada pessoa tem uma ficha com o que recebeu. Vencida a validade, o item fica vermelho; Trocar fecha a entrega antiga e registra a nova.',
        passos: [
          'Em Fichas por pessoa, clique no nome para abrir a ficha. Os filtros Vencidas e Vencendo mostram só quem precisa de troca.',
          'Trocar: registra uma entrega igual (mesma pessoa, mesmo material) com validade nova; a antiga fica no histórico como trocada.',
          'Encerrar: escolha Devolveu ao estoque (volta ao saldo), Consumido / perdido (só sai da ficha) ou Trocar por um novo.',
          'Termo: gera um PDF com tudo que a pessoa tem em mãos, com as assinaturas registradas — o termo de responsabilidade.',
        ],
        dicas: [{ tipo: 'atencao', texto: 'Trocas vencidas aparecem também na tela de Alertas. Registrar a troca no sistema é o que encerra o aviso.' }],
      },
    ],
  },

  {
    id: 'validade',
    titulo: 'Estoque no modo validade e lotes',
    descricao: 'Remédio, alimento, reagente, cola: cada entrada é um lote com data. A saída tira do que vence primeiro.',
    topicos: [
      {
        id: 'entrada-lote',
        titulo: 'Dar entrada com lote e validade',
        audiencia: ['central'],
        resumo: 'Toda entrada num estoque de validade diz o lote (o número da embalagem ou da nota) e a data de validade. O saldo do material é a soma dos lotes.',
        passos: [
          'No menu Estoque, abra o estoque de validade (ex.: Farmácia, Cozinha).',
          'Em Movimentar, escolha Entrada, o material e a quantidade.',
          'Preencha o Lote (lotes já existentes aparecem como sugestão) e a Validade. Sem validade, o lote fica “sem validade” e sai por último.',
          'Justifique (nota fiscal, guia) e registre.',
        ],
        dicas: [{ tipo: 'dica', texto: 'Material novo nesse estoque nasce com saldo zero: o cadastro em Materiais não cria lote. A primeira Entrada aqui é que cria.' }],
      },
      {
        id: 'saida-fefo',
        titulo: 'Saída pelo que vence primeiro (FEFO)',
        audiencia: ['central'],
        resumo: 'Saída, consumo e transferência tiram do lote que vence primeiro, automaticamente. Se precisar tirar de um lote específico, aponte-o.',
        passos: [
          'Escolha Saída, Consumo ou Transferir, o material e a quantidade.',
          'Em “De qual lote”, deixe Automático — o que vence primeiro — ou escolha um lote da lista.',
          'Se a quantidade atravessa mais de um lote, o histórico registra cada um: “lote(s) A (4), B (2)”.',
          'Ajuste acerta um lote só: escolha o lote e informe a diferença com sinal (ex.: -5 para descarte de vencido).',
        ],
        dicas: [
          { tipo: 'atencao', texto: 'Lote vencido não some sozinho da lista: dê baixa com um Ajuste negativo apontando o lote, ou registre o descarte como Consumo.' },
          { tipo: 'dica', texto: 'O aviso “Vencendo” usa os dias definidos no cartão do estoque (padrão 30). Vencidos e vencendo aparecem também em Alertas.' },
        ],
      },
    ],
  },

  {
    id: 'patrimonio',
    titulo: 'Estoque no modo patrimônio',
    descricao: 'Notebook, projetor, cadeira, furadeira: cada item tem número próprio e uma vida — disponível, em uso, na manutenção, baixado.',
    topicos: [
      {
        id: 'cadastrar-item',
        titulo: 'Cadastrar um item',
        audiencia: ['central'],
        resumo: 'O material é o modelo (“Notebook Dell Latitude 5420”); o item é a unidade física, com número de patrimônio, série, local e valor.',
        passos: [
          'Em Materiais, cadastre o modelo escolhendo o estoque de patrimônio em “Saldo inicial entra em”. O saldo nasce zero.',
          'No menu Estoque, abra o estoque de patrimônio e clique em Cadastrar item.',
          'Informe o número de patrimônio (único na empresa), o modelo e, se quiser, série, local, data de aquisição e valor.',
          'O saldo do modelo acompanha sozinho: é o número de itens não baixados.',
        ],
      },
      {
        id: 'vida-do-item',
        titulo: 'Entregar, receber, manutenção e baixa',
        audiencia: ['central'],
        resumo: 'O menu de ações de cada item (⋯) só oferece o que cabe no estado dele. Cada ação fica no histórico do item, com quem fez e quando.',
        passos: [
          'Entregar a alguém: o item fica “em uso” com o nome e a referência de quem recebeu.',
          'Receber de volta: fica disponível de novo.',
          'Mandar para manutenção / Voltou da manutenção: sai e volta de circulação.',
          'Dar baixa: fim da vida (quebrou, doado, vendido, extraviado). O item sai do saldo do modelo e não muda mais de estado; o histórico fica.',
        ],
        dicas: [{ tipo: 'dica', texto: 'Os cartões do topo (Disponíveis, Em uso, Manutenção, Baixados) filtram a lista ao clicar. Baixados ficam escondidos no filtro Ativos.' }],
      },
    ],
  },

  {
    id: 'compras',
    titulo: 'Compras e cotações',
    descricao: 'Pedir preço aos fornecedores pelo WhatsApp e comparar sem sair do sistema.',
    topicos: [
      {
        id: 'compras-cotar',
        titulo: 'Fazer uma cotação',
        audiencia: ['admin'],
        resumo: 'Você monta a lista, escolhe os fornecedores e o sistema manda a mesma mensagem para cada um, em nome da sua empresa. As respostas aparecem lado a lado.',
        passos: [
          'Em Compras → Fornecedores, cadastre as lojas: nome e WhatsApp bastam (o nome de quem atende deixa a mensagem mais simpática).',
          'Em Compras → Cotações → Nova cotação: título, os itens (puxe do catálogo ou escreva), quantidade, os fornecedores e onde entregar.',
          'Enviar. Cada fornecedor recebe a lista numerada e responde por ali mesmo. Quando responde, você recebe um aviso no seu WhatsApp e a tabela se atualiza.',
          'Abra a cotação: o mais barato de cada item fica marcado, com o total de cada fornecedor. "Lembrar quem não respondeu" manda a pergunta de novo.',
        ],
        dicas: [
          { tipo: 'dica', texto: 'A IA só lê a resposta do fornecedor e registra preço e prazo por item. Ela não negocia nem compra — isso é com você.' },
          { tipo: 'atencao', texto: 'A mensagem sai do número do Stok Aí, apresentando-se como assistente de compras da sua empresa. Se o fornecedor quiser falar com uma pessoa, ele responde ali e você vê na conversa.' },
        ],
      },
      {
        id: 'compras-pedido',
        titulo: 'Fechar o pedido',
        audiencia: ['admin'],
        resumo: 'Escolhido o fornecedor, um clique manda o pedido pelo WhatsApp: itens, preços, total, entrega e o pedido da nota fiscal em nome da empresa.',
        passos: [
          'Na cotação, clique em "fechar pedido" no fornecedor escolhido. Dá para mandar um recado extra ("entregar de manhã").',
          'A cotação encerra. O que o fornecedor disser depois sobre o pedido chega no WhatsApp de quem criou a cotação.',
          'Quando o material chegar, dê a entrada no estoque normalmente — pelo painel ou pelo WhatsApp.',
        ],
        dicas: [{ tipo: 'dica', texto: 'Faz parte do plano Empresarial, junto com o Stok Aí no WhatsApp.' }],
      },
    ],
  },
  {
    id: 'whatsapp',
    titulo: 'Stok Aí no WhatsApp',
    descricao: 'Consultar e registrar pelo celular, conversando com o número do Stok Aí.',
    topicos: [
      {
        id: 'whatsapp-usar',
        titulo: 'Falar com o Stok Aí pelo WhatsApp',
        audiencia: ['todos'],
        resumo: 'Com o seu WhatsApp cadastrado pelo administrador, você manda mensagem para o número do Stok Aí e ele responde com os dados da sua empresa — só o que você já enxerga no painel.',
        passos: [
          'Salve o número do Stok Aí (está em Configurações → Stok Aí no WhatsApp) e mande uma mensagem: "quanto tem de cimento?", "o que está faltando?", "quem está com a furadeira?".',
          'Para registrar: "saiu 10 sacos de cimento pra obra", "consumimos 5 litros de tinta", "o João devolveu a furadeira". O assistente mostra o que entendeu e pede SIM.',
          'Responda SIM (ou "SIM 1234", se você tem PIN) para gravar; NÃO cancela. Sem resposta em 10 minutos, a proposta some.',
        ],
        dicas: [
          { tipo: 'dica', texto: 'O assistente usa o nome dos materiais como está no cadastro. Se dois se parecem, ele pergunta qual — nunca chuta.' },
          { tipo: 'atencao', texto: 'Ajuste, recontagem e cadastro só pelo painel. E o que você não opera no painel, também não opera pelo WhatsApp.' },
        ],
      },
      {
        id: 'whatsapp-config',
        titulo: 'Liberar o WhatsApp para a equipe',
        audiencia: ['admin'],
        resumo: 'Cada pessoa precisa do WhatsApp cadastrado no usuário dela; o administrador decide o que ela pode registrar por lá e pode exigir um PIN.',
        passos: [
          'Em Usuários → editar, preencha o WhatsApp da pessoa (com DDD). O número identifica a pessoa, então não pode repetir.',
          'Deixe o padrão do cargo (operador: saída, consumo, transferência, devolução; administrador: mais entrada) ou marque "Personalizar" e escolha.',
          'Opcional: defina um PIN de 4 a 6 dígitos — a pessoa confirma gravações com "SIM 1234".',
          'Em Configurações → Stok Aí no WhatsApp, use o simulador para testar como aquela pessoa antes de avisar a equipe.',
        ],
        dicas: [{ tipo: 'dica', texto: 'Faz parte do plano Empresarial, com 1.000 mensagens por mês por empresa.' }],
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
    id: 'configuracoes',
    titulo: 'Configurações',
    descricao: 'Estoques, categorias e acessos — a empresa do jeito dela.',
    topicos: [
      {
        id: 'plano',
        titulo: 'O plano da sua conta',
        audiencia: ['admin'],
        resumo: 'Cada conta tem um plano — Essencial, Profissional ou Empresarial — que define quantas unidades, depósitos por unidade e usuários cabem, e quais recursos existem. Conta nova tem 7 dias grátis com tudo liberado. Quem assina, troca ou cancela é o CEO (quem criou a conta); os outros administradores só consultam.',
        passos: [
          'Em Configurações, o cartão Plano e assinatura mostra o seu plano, o uso contra o limite e a lista do que está liberado.',
          'Onde o plano não cobre, o botão aparece travado com um cadeado e a frase "disponível a partir do plano X".',
          'Para assinar ou trocar, clique em Assinar / Trocar de plano, escolha mensal ou anual e conclua no Mercado Pago. Você volta com a conta liberada.',
        ],
        dicas: [
          { tipo: 'dica', texto: 'Transferência entre depósitos, logo e cor da empresa, exportações em PDF/Word e alertas por e-mail começam no Profissional. A lista de compras e os alertas na tela são de todos os planos.' },
          { tipo: 'dica', texto: 'O anual sai por 10 meses (2 grátis). Cancelar não apaga nada: o plano vale até o fim do período pago, e depois a conta só pede um plano de novo.' },
          { tipo: 'dica', texto: 'Sem cartão? Escolha Pix ou boleto: paga o período inteiro de uma vez. Não renova sozinho — 5 dias antes de vencer aparece o aviso e chega um e-mail; pagando antes, o novo período começa onde o atual termina.' },
          { tipo: 'dica', texto: 'Cada pagamento aprovado gera um recibo numerado (não fiscal): vai por e-mail e fica em PDF na lista de cobranças.' },
          { tipo: 'dica', texto: 'Para passar a conta a outra pessoa, o CEO usa "Transferir titularidade": o escolhido (um administrador com e-mail) vira CEO e quem passou continua como administrador.' },
          { tipo: 'atencao', texto: 'Cartão recusado: o Mercado Pago tenta de novo e a conta continua por 2 dias com um aviso no topo. Passado isso, a tela pede para regularizar — e tudo volta assim que o pagamento aprova.' },
        ],
      },
      {
        id: 'estoques',
        titulo: 'Criar e configurar estoques',
        audiencia: ['admin'],
        resumo: 'Cada unidade tem quantos estoques precisar, cada um com nome livre e um modo de operação.',
        passos: [
          'Em Sistema → Configurações, ache o cartão da unidade.',
          'Clique em Novo estoque, escolha o modo (Almoxarifado ou Empréstimo), dê o nome e, no empréstimo, o prazo padrão em horas.',
          'O lápis edita nome, modo e prazo; o botão de energia desativa (o saldo e o histórico ficam).',
          'Depois, em Acessos, diga quem opera e quem só consulta cada estoque.',
        ],
        dicas: [{ tipo: 'atencao', texto: 'Um estoque de empréstimo com retiradas pendentes não muda de modo nem desativa: registre as devoluções primeiro.' }],
      },
      {
        id: 'categorias',
        titulo: 'Categorias de material',
        audiencia: ['admin'],
        resumo: 'As categorias são suas: crie, renomeie e remova em Configurações. Renomear renomeia em todos os materiais.',
        passos: [
          'Em Configurações, role até Categorias de material.',
          'Digite o nome e clique em Adicionar.',
          'Para remover uma categoria em uso, o sistema pede para qual mover os materiais.',
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
