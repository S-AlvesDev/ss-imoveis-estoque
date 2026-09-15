/**
 * Termos de uso e política de privacidade do Stok Aí — o texto, separado
 * da tela. Cada seção é um título e parágrafos; a tela só desenha.
 *
 * Escrito para uma pessoa física operando o produto (sem CNPJ, por
 * enquanto). Quando existir empresa, troque RESPONSAVEL e a seção "Quem
 * somos"; o resto continua valendo.
 */

export const RESPONSAVEL = {
  nome: 'Samuel Alves',
  produto: 'Stok Aí',
  email: 'team@stokai.app',
  whatsapp: '+55 84 99143-4190',
  cidade: 'Natal/RN',
  /** Data da última revisão dos dois textos. */
  atualizadoEm: '15 de setembro de 2026',
};

export interface Secao {
  titulo: string;
  paragrafos: string[];
}

export interface Documento {
  titulo: string;
  resumo: string;
  secoes: Secao[];
}

export const TERMOS: Documento = {
  titulo: 'Termos de uso',
  resumo: 'O combinado entre você (a empresa que usa o Stok Aí) e a gente. Em português claro, sem letra miúda — mas vale como contrato.',
  secoes: [
    {
      titulo: '1. Quem somos e o que você aceita',
      paragrafos: [
        `O ${RESPONSAVEL.produto} é um sistema de controle de estoque oferecido pela internet, operado por ${RESPONSAVEL.nome} ("nós"). Ao criar uma conta ou usar o sistema, a empresa representada por quem criou a conta ("você" ou "cliente") aceita estes termos e a política de privacidade.`,
        'Quem cria a conta declara ter poderes para representar a empresa. A pessoa que cria a conta vira o CEO dela no sistema: é quem responde pela cobrança e pode passar a titularidade a outro administrador.',
      ],
    },
    {
      titulo: '2. O serviço',
      paragrafos: [
        'O Stok Aí permite cadastrar materiais, unidades e estoques; registrar entradas, saídas, consumos, transferências, empréstimos, entregas, lotes e patrimônio; gerar relatórios; e, nos planos que incluem, conversar com o sistema pelo WhatsApp e pedir cotações a fornecedores.',
        'Evoluímos o produto o tempo todo. Recursos podem ser adicionados, mudados ou retirados; quando algo relevante muda, avisamos no próprio sistema (seção "Novidades") ou por e-mail.',
      ],
    },
    {
      titulo: '3. Conta, acessos e senhas',
      paragrafos: [
        'Cada pessoa da sua equipe tem o próprio usuário, com cargo e acessos definidos pelos administradores da empresa. Vocês são responsáveis por quem recebe acesso, por manter as senhas em sigilo e por retirar o acesso de quem sai da empresa.',
        'Tudo o que é feito com um usuário conta como feito pela empresa. Se suspeitar de uso indevido, troque a senha na hora e nos avise.',
        'O número de WhatsApp cadastrado em um usuário identifica essa pessoa perante o sistema. Cadastre só números de pessoas da equipe, com autorização delas.',
      ],
    },
    {
      titulo: '4. Avaliação, planos e pagamento',
      paragrafos: [
        'Toda conta nova tem 7 dias de avaliação gratuita, sem cartão, com todos os recursos. Depois disso, é preciso escolher um plano (Essencial, Profissional ou Empresarial) para continuar usando; os preços e o que cada plano inclui estão na página inicial e em Configurações → Plano e assinatura.',
        'O pagamento é processado pelo Mercado Pago (cartão, Pix ou boleto). Não guardamos dados de cartão. A assinatura mensal renova automaticamente até ser cancelada; o pagamento anual dá direito a 12 meses pelo preço de 10, sem renovação automática.',
        'Se um pagamento falhar ou atrasar, a conta fica em carência por 2 dias e, depois, é bloqueada até regularizar. Os dados não são apagados pelo bloqueio.',
        'Por enquanto emitimos recibo (não fiscal) de cada pagamento, por e-mail e em PDF no sistema. Os preços podem ser reajustados com aviso de pelo menos 30 dias; o reajuste vale a partir da renovação seguinte.',
      ],
    },
    {
      titulo: '5. Cancelamento e reembolso',
      paragrafos: [
        'Você pode cancelar a qualquer momento em Configurações → Plano e assinatura. O acesso continua até o fim do período já pago; não há multa.',
        'Compras anuais podem ser reembolsadas integralmente em até 7 dias da compra (direito de arrependimento). Fora disso, não há reembolso proporcional de períodos já iniciados, salvo falha nossa que tenha impedido o uso do sistema.',
      ],
    },
    {
      titulo: '6. WhatsApp e inteligência artificial',
      paragrafos: [
        'Nos planos que incluem, a equipe pode consultar e registrar movimentações pelo WhatsApp, e a empresa pode pedir cotações a fornecedores. As mensagens são interpretadas por um modelo de inteligência artificial; toda gravação de estoque só acontece depois que a pessoa confirma explicitamente ("SIM"), e fica registrada no histórico como feita por ela, via WhatsApp.',
        'A IA pode entender errado. Confira o resumo antes de confirmar. Nas cotações, a IA apenas lê e organiza o que o fornecedor respondeu; ela não negocia, não compra e não se compromete em nome da empresa — o pedido é fechado por uma pessoa, na tela.',
        'As mensagens aos fornecedores saem do número do Stok Aí, identificando-se como assistente de compras da sua empresa. Você é responsável pelo conteúdo do que pede e por cadastrar apenas fornecedores que aceitam ser contatados por WhatsApp.',
        'Há um limite de uso justo de mensagens por mês em cada plano; avisamos quando estiver perto.',
      ],
    },
    {
      titulo: '7. Seus dados são seus',
      paragrafos: [
        'Tudo o que a empresa cadastra ou registra no sistema pertence a ela. Usamos esses dados só para prestar o serviço, como descrito na política de privacidade. Você pode exportar seus dados a qualquer momento (Configurações → Exportar).',
        'Se a conta for encerrada, os dados ficam disponíveis para exportação por 90 dias e depois são apagados, salvo o que a lei nos obrigar a guardar (como registros de pagamento).',
      ],
    },
    {
      titulo: '8. Uso aceitável',
      paragrafos: [
        'Não use o sistema para atividades ilegais, para enviar mensagens indesejadas a terceiros, para tentar acessar dados de outras empresas ou para sobrecarregar o serviço. Podemos suspender contas que violem estes termos, avisando por e-mail.',
      ],
    },
    {
      titulo: '9. Disponibilidade e suporte',
      paragrafos: [
        'Trabalhamos para manter o sistema no ar o tempo todo, mas não garantimos disponibilidade ininterrupta: dependemos de serviços de terceiros (hospedagem, banco de dados, Mercado Pago, WhatsApp, provedores de IA) e fazemos manutenções. Fazemos cópias de segurança regulares.',
        `Suporte pelo WhatsApp ${RESPONSAVEL.whatsapp}, pela seção Suporte do sistema ou pelo e-mail ${RESPONSAVEL.email}, em dias úteis.`,
      ],
    },
    {
      titulo: '10. Limites de responsabilidade',
      paragrafos: [
        'O Stok Aí é uma ferramenta de registro e apoio à decisão. Decisões de compra, contagem física, validade de produtos e obrigações fiscais continuam sendo da empresa. Não respondemos por prejuízos indiretos, lucros cessantes ou por dados inseridos incorretamente por usuários.',
        'Em qualquer caso, nossa responsabilidade total fica limitada ao valor pago pela empresa nos 12 meses anteriores ao fato.',
      ],
    },
    {
      titulo: '11. Mudanças nestes termos',
      paragrafos: [
        'Podemos atualizar estes termos. Mudanças relevantes são avisadas com pelo menos 15 dias de antecedência por e-mail ou no sistema. Continuar usando depois disso é aceitar a versão nova.',
      ],
    },
    {
      titulo: '12. Lei e foro',
      paragrafos: [`Valem as leis do Brasil. Para qualquer disputa, fica eleito o foro da comarca de ${RESPONSAVEL.cidade}, sem prejuízo do direito do consumidor, quando aplicável.`],
    },
  ],
};

export const PRIVACIDADE: Documento = {
  titulo: 'Política de privacidade',
  resumo: 'Quais dados o Stok Aí guarda, para quê, com quem compartilha e como você exerce seus direitos pela LGPD.',
  secoes: [
    {
      titulo: '1. Quem é o responsável',
      paragrafos: [`${RESPONSAVEL.nome}, operador do ${RESPONSAVEL.produto}, é o controlador dos dados das contas e o encarregado (DPO) para os fins da Lei Geral de Proteção de Dados (Lei 13.709/2018). Contato: ${RESPONSAVEL.email} ou WhatsApp ${RESPONSAVEL.whatsapp}.`],
    },
    {
      titulo: '2. Que dados guardamos',
      paragrafos: [
        'Da conta e da equipe: nome, e-mail, matrícula, cargo, senha (guardada só como hash, nunca em texto), número de WhatsApp quando cadastrado, e os acessos de cada pessoa.',
        'Da operação: materiais, estoques, unidades, movimentações (com quem registrou, quando e por quê), empréstimos e entregas (com o nome de quem retirou e, se usado, a assinatura), lotes, patrimônio, fornecedores (nome, WhatsApp, contato) e cotações.',
        'Das conversas pelo WhatsApp: o número, o texto das mensagens trocadas com o assistente e com fornecedores, e quanto cada resposta custou em processamento — isso serve para o histórico, para o limite de uso e para investigar problemas.',
        'Da cobrança: plano, datas, status dos pagamentos e o identificador do pagamento no Mercado Pago. Não recebemos nem guardamos números de cartão.',
        'Técnicos: endereço IP, navegador e registros de erro, pelo tempo necessário para segurança e diagnóstico.',
      ],
    },
    {
      titulo: '3. Para quê e com que base',
      paragrafos: [
        'Para prestar o serviço contratado (execução de contrato): tudo o que faz o sistema funcionar, do login ao relatório.',
        'Para cobrar e emitir recibos (execução de contrato e obrigação legal).',
        'Para avisar sobre estoque, cobrança e novidades do produto (legítimo interesse; você pode pedir para parar os avisos que não forem essenciais).',
        'Para segurança e prevenção a fraudes (legítimo interesse).',
      ],
    },
    {
      titulo: '4. Inteligência artificial',
      paragrafos: [
        'Quando alguém fala com o assistente pelo WhatsApp ou um fornecedor responde a uma cotação, o texto da mensagem — junto com os dados de estoque necessários para responder, como nomes de materiais e saldos — é enviado à Anthropic (provedora do modelo Claude) para interpretação, pela API da empresa. Pelos termos da API, essas mensagens não são usadas para treinar modelos.',
        'A IA nunca grava nada por conta própria: toda alteração de estoque depende de confirmação da pessoa.',
      ],
    },
    {
      titulo: '5. Com quem compartilhamos',
      paragrafos: [
        'Só com quem precisa para o serviço funcionar, e só o necessário: Supabase (banco de dados e arquivos), Vercel (hospedagem e métricas de acesso sem cookies), Mercado Pago (pagamentos), Anthropic (IA), Meta/WhatsApp por meio de uma instalação própria da Evolution API (mensagens), o provedor de e-mail (avisos e recibos) e o Sentry (registro de erros). Alguns deles ficam fora do Brasil; a transferência segue as salvaguardas da LGPD.',
        'Não vendemos dados. Não compartilhamos dados de uma empresa com outra. Só entregamos dados a autoridades quando a lei obrigar.',
      ],
    },
    {
      titulo: '6. Cookies e armazenamento no navegador',
      paragrafos: ['Não usamos cookies de rastreamento. Guardamos no navegador apenas o token da sessão e preferências de tela (como o tema escuro). As métricas da página inicial são agregadas e não identificam pessoas.'],
    },
    {
      titulo: '7. Por quanto tempo',
      paragrafos: [
        'Enquanto a conta existir. Depois do encerramento, os dados ficam disponíveis para exportação por 90 dias e são apagados em seguida — exceto registros de pagamento, guardados pelo prazo que a lei exige. As conversas pelo WhatsApp guardam só as últimas mensagens de cada pessoa para dar contexto ao assistente; o diário de uso é mantido para fins de cobrança e segurança.',
      ],
    },
    {
      titulo: '8. Seus direitos',
      paragrafos: [
        'Você pode pedir acesso, correção, anonimização, portabilidade ou exclusão dos seus dados, e informação sobre com quem compartilhamos. Administradores exportam os dados da empresa em Configurações → Exportar; o resto é só pedir pelos contatos acima. Respondemos em até 15 dias.',
        'Pessoas da equipe de um cliente devem procurar primeiro a própria empresa, que administra a conta; ajudamos a empresa a atender o pedido.',
      ],
    },
    {
      titulo: '9. Segurança',
      paragrafos: ['Senhas com hash (bcrypt), dados de cada empresa isolados no banco (row level security), tráfego cifrado (HTTPS), acesso ao banco restrito ao servidor, cópias de segurança regulares. Nenhum sistema é infalível; se houver um incidente que afete seus dados, avisamos você e a autoridade competente como a lei manda.'],
    },
    {
      titulo: '10. Menores',
      paragrafos: ['O Stok Aí é para uso profissional por empresas. Não coletamos intencionalmente dados de menores de 18 anos.'],
    },
    {
      titulo: '11. Mudanças nesta política',
      paragrafos: [`Podemos atualizar esta política; a data da última revisão está no fim da página. Mudanças relevantes são avisadas por e-mail ou no sistema. Última revisão: ${RESPONSAVEL.atualizadoEm}.`],
    },
  ],
};
