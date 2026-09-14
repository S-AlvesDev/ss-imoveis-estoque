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
    versao: '3.7',
    data: '2026-09-14',
    titulo: 'Stok Aí no WhatsApp',
    resumo:
      'Quem tem o WhatsApp cadastrado no usuário conversa com o sistema pelo número do Stok Aí: pergunta saldo e pendências, registra saída, consumo, transferência e devolução — sempre com confirmação, e só no que o cargo permite. Plano Empresarial.',
    mudancas: [
      { tipo: 'novo', titulo: 'WhatsApp no usuário', descricao: 'Em Usuários, cada pessoa ganha o campo WhatsApp, a lista do que pode registrar por lá (padrão: operador não dá entrada) e um PIN opcional para confirmar gravações.' },
      { tipo: 'novo', titulo: 'Assistente com confirmação', descricao: '"saiu 10 sacos de cimento pra obra" vira "Transferir 10 sacos de Cimento CP-II do Central para Obra? Responda SIM". Quem registra é o sistema, no SIM — nunca a IA; fica no histórico como "via WhatsApp".' },
      { tipo: 'novo', titulo: 'Simulador em Configurações', descricao: 'Teste o assistente como qualquer usuário, sem celular, e veja o uso do mês.' },
    ],
  },
  {
    versao: '3.6',
    data: '2026-09-14',
    titulo: 'CEO: quem criou a conta é o dono dela — e recibo a cada pagamento',
    resumo:
      'Um cargo novo e único por empresa. O CEO é quem cadastrou a conta: só ele assina, troca ou cancela o plano, recebe recibos, lembretes e notas fiscais, e pode passar a titularidade a outro administrador. Ninguém o rebaixa nem exclui. No resto, é um administrador como os outros.',
    mudancas: [
      { tipo: 'novo', titulo: 'Cargo CEO', descricao: 'Aparece em Usuários com um selo. Só o próprio CEO edita os dados dele; o cargo não se atribui nem se troca por ali.' },
      { tipo: 'novo', titulo: 'Transferir titularidade', descricao: 'Em Configurações → Plano e assinatura, o CEO escolhe outro administrador (com e-mail) para assumir; quem passou continua como administrador e entra de novo.' },
      { tipo: 'melhoria', titulo: 'Cobrança só com o CEO', descricao: 'Administradores veem o plano e o uso, mas os botões de assinar, trocar e cancelar ficam com o CEO — a tela diz quem é.' },
      { tipo: 'novo', titulo: 'Recibo de cada pagamento', descricao: 'Pagamento aprovado gera um recibo numerado: vai por e-mail para quem pagou e fica em PDF na lista de cobranças. Não substitui nota fiscal.' },
    ],
  },
  {
    versao: '3.5',
    data: '2026-09-14',
    titulo: 'Cartão dentro do site, Pix e boleto',
    resumo:
      'Assinar ficou mais direto: o cartão é digitado na própria página, sem ir ao site do Mercado Pago. Quem prefere Pix ou boleto paga o período inteiro (mês ou ano) e recebe aviso antes de vencer.',
    mudancas: [
      { tipo: 'novo', titulo: 'Cartão na própria página', descricao: 'Número, validade e CVV em campos protegidos do Mercado Pago; a assinatura nasce autorizada na hora. Cartão recusado vira uma frase clara do que tentar.' },
      { tipo: 'novo', titulo: 'Pix e boleto', descricao: 'Pague o mês ou o ano de uma vez: QR Code do Pix na tela (libera em segundos) ou boleto para imprimir. A renovação é manual — 5 dias antes de vencer, um aviso no painel e um e-mail; pagando antes, o período novo começa onde o atual termina.' },
    ],
  },
  {
    versao: '3.4',
    data: '2026-09-12',
    titulo: 'Assinatura pelo Mercado Pago e 7 dias grátis',
    resumo:
      'Conta nova começa com 7 dias grátis, sem cartão. Depois, o administrador assina um plano em Configurações e conclui no Mercado Pago — mensal ou anual (2 meses grátis). Cobrança recusada dá 2 dias de aviso antes de travar; nada é apagado.',
    mudancas: [
      { tipo: 'novo', titulo: 'Assinar, trocar e cancelar em Configurações', descricao: 'O cartão Plano ganhou o botão Assinar (ou Trocar de plano), o histórico de cobranças e o cancelamento. O pagamento é no checkout do Mercado Pago, no cartão de crédito; o recibo vai para o e-mail do administrador.' },
      { tipo: 'novo', titulo: 'Avaliação de 7 dias', descricao: 'Toda conta nova entra com tudo do Empresarial por 7 dias. Uma faixa no topo mostra quanto falta; no fim, a tela pede um plano — os dados continuam guardados.' },
      { tipo: 'melhoria', titulo: 'Home', descricao: 'Os botões viraram "Começar grátis"; os cartões de plano mostram também o preço anual.' },
    ],
  },
  {
    versao: '3.3',
    data: '2026-09-12',
    titulo: 'Planos: Essencial, Profissional e Empresarial',
    resumo:
      'A conta passa a ter um plano, com limite de unidades, depósitos por unidade e usuários, e recursos que entram a partir de cada nível. Quem ainda não assinou está em avaliação, com tudo liberado. Em Configurações, o cartão Plano mostra o que a sua conta inclui e quanto já está em uso.',
    mudancas: [
      {
        tipo: 'novo',
        titulo: 'Cartão Plano em Configurações',
        descricao: 'Qual é o seu plano, quantas unidades e depósitos já existem contra o limite, e a lista do que está liberado ou travado. Um clique para falar com a gente sobre mudar.',
      },
      {
        tipo: 'melhoria',
        titulo: 'Cadeados com o plano certo',
        descricao: 'Onde o plano não cobre — transferir entre depósitos, logo e cor, exportar relatórios, criar além do limite — o botão trava e diz a partir de qual plano existe. O servidor recusa também.',
      },
      {
        tipo: 'melhoria',
        titulo: 'Home com os planos',
        descricao: 'A página pública mostra os três planos, preços e o que cada um inclui. O botão de cada plano abre o pedido de contato.',
      },
    ],
  },
  {
    versao: '3.2',
    data: '2026-09-12',
    titulo: 'Três modos novos: Entrega / EPI, Validade e lotes, Patrimônio',
    resumo:
      'Além de almoxarifado e empréstimo, um estoque agora pode ser de entrega (o que sai não volta, cobra-se a troca), de validade (lotes com data, saída pelo que vence primeiro) ou de patrimônio (cada item com número e vida própria). E o almoxarifado pode ter operações desligadas.',
    mudancas: [
      {
        tipo: 'novo',
        titulo: 'Modo Entrega / EPI',
        descricao:
          'Ficha por pessoa com o que ela recebeu, assinatura na tela (opcional ou exigida), validade de troca por material, botão Trocar e termo de responsabilidade em PDF. Trocas vencidas viram alerta.',
      },
      {
        tipo: 'novo',
        titulo: 'Modo Validade e lotes',
        descricao:
          'Entrada informa lote e validade; saída, consumo e transferência tiram do lote que vence primeiro (FEFO) ou de um lote apontado; ajuste acerta um lote. Vencidos e vencendo em destaque e em Alertas.',
      },
      {
        tipo: 'novo',
        titulo: 'Modo Patrimônio',
        descricao:
          'O material é o modelo; cada item tem número de patrimônio, série, local, valor e estado (disponível, em uso, manutenção, baixado). Entregar, receber, manutenção e baixa ficam no histórico do item.',
      },
      {
        tipo: 'novo',
        titulo: 'Operações por estoque',
        descricao: 'No cartão do estoque, o administrador desliga as operações que não fazem sentido ali. O formulário só mostra as ligadas; o servidor recusa as outras.',
      },
      {
        tipo: 'melhoria',
        titulo: 'Materiais',
        descricao: 'Campo “Validade de troca (dias)” quando a empresa tem estoque de entrega. Material cadastrado num estoque de validade ou patrimônio nasce com saldo zero — o saldo entra pela tela do estoque.',
      },
    ],
  },
  {
    versao: '3.1',
    data: '2026-09-12',
    titulo: 'Estoques do seu jeito: nome livre, modo de operação e categorias próprias',
    resumo:
      'Central e Obra deixam de ser fixos. Cada unidade tem os estoques que precisar — um almoxarifado, um armário de empréstimo com prazo de devolução — e as categorias de material são cadastro da empresa. Os cargos viram Administrador e Operador.',
    mudancas: [
      {
        tipo: 'novo',
        titulo: 'Estoques com nome e modo',
        descricao:
          'Em Configurações, o cartão da unidade cria e edita estoques. Modo Almoxarifado: entrada, saída, consumo, ajuste e transferência entre estoques da unidade. Modo Empréstimo: retirada com prazo e devolução.',
      },
      {
        tipo: 'novo',
        titulo: 'Empréstimos com prazo',
        descricao:
          'Quem retira, o quê, quanto e por quantas horas. A lista de pendentes mostra o que está na rua; passou do prazo, fica vermelho e vira alerta. Devolver fecha a retirada e o saldo volta.',
      },
      {
        tipo: 'novo',
        titulo: 'Categorias da empresa',
        descricao: 'Crie, renomeie e remova categorias em Configurações. Renomear renomeia em todos os materiais; remover uma em uso pede para onde mover.',
      },
      {
        tipo: 'melhoria',
        titulo: 'Menu por estoque',
        descricao: 'Cada estoque que você acessa é um item do menu, com o nome dele. A tabela de Materiais tem uma coluna por estoque; o selo azul diz em qual estoque o material existe.',
      },
      {
        tipo: 'melhoria',
        titulo: 'Cargos: Administrador e Operador',
        descricao: 'Os cargos de almoxarife viraram Operador, mantendo exatamente os acessos que já tinham. O que cada pessoa pode é decidido por estoque, em Configurações → Acessos.',
      },
      {
        tipo: 'melhoria',
        titulo: 'Empresa nova escolhe o primeiro estoque',
        descricao: 'Ao criar a conta, o primeiro acesso pergunta o nome e o modo do primeiro estoque, em vez de criar Central e Obra por padrão.',
      },
    ],
  },
  {
    versao: '3.0',
    data: '2026-09-12',
    titulo: 'Stok Aí: nome novo, cara nova, e a senha você recupera sozinho',
    resumo:
      'O sistema passa a se chamar Stok Aí, com um painel redesenhado — escuro ou claro — e uma busca que acha qualquer material ou tela num atalho. Quem tem e-mail na conta recupera a própria senha.',
    mudancas: [
      {
        tipo: 'novo',
        titulo: 'Painel novo',
        descricao:
          'Saudação com data e hora, quatro cartões com tendência dos últimos 30 dias, entradas e saídas por dia (7, 30 ou 90 dias), materiais por categoria, top 5 e as últimas atividades. Tudo da unidade em uso.',
      },
      {
        tipo: 'novo',
        titulo: 'Busca com Ctrl+K',
        descricao:
          'Aperte Ctrl+K (⌘K no Mac) ou clique na busca do topo. Digite o nome de um material para abri-lo já filtrado, ou o nome de uma tela para pular direto para ela.',
      },
      {
        tipo: 'novo',
        titulo: 'Esqueci minha senha',
        descricao:
          'Na tela de entrada. Quem tem e-mail cadastrado recebe um link que vale por uma hora, cria a senha nova e já entra. Quem entra por matrícula sem e-mail continua pedindo à gestão em Usuários.',
      },
      {
        tipo: 'melhoria',
        titulo: 'Visual Stok Aí, claro ou escuro',
        descricao:
          'Barra lateral navy nos dois temas, cartões e gráficos no mesmo estilo em todas as telas. O tema fica no menu do seu nome, no canto superior direito. A cor e o logo da sua empresa continuam valendo por dentro.',
      },
      {
        tipo: 'melhoria',
        titulo: 'Sino de alertas',
        descricao: 'O número no sino do topo é quantos materiais precisam de compra na unidade em uso. Clique para abrir Alertas.',
      },
    ],
  },
  {
    versao: '2.2',
    data: '2026-09-11',
    titulo: 'Configurações: cada unidade do seu jeito, e quem opera o quê',
    resumo:
      'O administrador desenha a empresa numa tela só: unidades, nome de cada almoxarifado, quais materiais cada unidade trabalha, e o que cada pessoa pode em cada depósito. O cargo deixou de decidir o acesso.',
    mudancas: [
      {
        tipo: 'novo',
        titulo: 'Aba Configurações',
        descricao:
          'Em Sistema → Configurações. Renomeie unidades e almoxarifados, escolha os materiais de cada unidade, desative uma unidade sem apagar nada.',
      },
      {
        tipo: 'novo',
        titulo: 'Acesso por depósito, com nível',
        descricao:
          'Cada pessoa recebe, em cada depósito, "Opera" (registra entrada, consumo, remessa, recontagem) ou "Só consulta" (vê sem mexer). Quem não tem nenhum depósito de uma unidade não vê essa unidade. Quem tinha cargo de Central ou Obra continua com o mesmo acesso — só que agora dá para mudar.',
      },
      {
        tipo: 'melhoria',
        titulo: 'Cada unidade é um estoque próprio',
        descricao:
          'O estoque mínimo se compara com o total da unidade. Faltar numa unidade é compra nela; o que outra unidade tem não entra na conta.',
      },
      {
        tipo: 'melhoria',
        titulo: 'Unidade nova nasce vazia',
        descricao:
          'Em vez de 300 materiais zerados, a unidade começa sem nada e o administrador adiciona só o que ela trabalha — em lote, com busca.',
      },
    ],
  },
  {
    versao: '2.1',
    data: '2026-09-11',
    titulo: 'Unidades: o estoque pode ter mais de uma filial',
    resumo:
      'O sistema deixou de pensar em "um Central e uma Obra". Cada unidade tem os seus, e o administrador cria uma nova pela tela, sem mexer em nada. Para quem usa uma unidade só, nada muda.',
    mudancas: [
      {
        tipo: 'novo',
        titulo: 'Seletor de unidade na barra lateral',
        descricao:
          'Logo abaixo do logo. As telas de Central e Obra passam a mostrar os almoxarifados da unidade escolhida, e toda operação vai para ela. A escolha fica salva no seu navegador.',
      },
      {
        tipo: 'novo',
        titulo: 'Criar unidade pela tela',
        descricao:
          'No seletor, o administrador tem "Nova unidade". Ela nasce com Central e Obra próprios e todos os materiais com saldo zero — o estoque das outras unidades não muda.',
      },
      {
        tipo: 'melhoria',
        titulo: 'Cada unidade é um estoque próprio',
        descricao:
          'O estoque mínimo se compara com o total da unidade (Central + Obra dela). Faltar numa unidade é compra nela — o que outra unidade tem não entra na conta. Remessa continua valendo só entre a Central e a Obra da mesma unidade.',
      },
      {
        tipo: 'melhoria',
        titulo: 'Histórico sabe de onde saiu e para onde foi',
        descricao:
          'Cada movimentação registra o depósito de origem e o de destino. Uma remessa não é "saída" nem "entrada": é a mesma quantidade mudando de lugar.',
      },
      {
        tipo: 'correcao',
        titulo: 'Exclusão registrava só o saldo da Central',
        descricao:
          'Um material que existia só na Obra era excluído com "saldo era 0" no histórico. Agora o registro guarda o total.',
      },
      {
        tipo: 'correcao',
        titulo: 'Entrada com quantidade negativa era aceita',
        descricao: 'Reduzia o saldo e o histórico dizia "entrada". Agora é recusada; só o ajuste de recontagem aceita valor negativo.',
      },
    ],
  },
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
