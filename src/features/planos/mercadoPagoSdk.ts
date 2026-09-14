/**
 * O SDK do Mercado Pago no navegador — só para tokenizar o cartão.
 *
 * Os campos de número, validade e CVV são iframes do próprio MP (Secure
 * Fields): o dado do cartão vai direto para eles, e o que chega ao nosso
 * servidor é um token de uso único. A chave pública vem do servidor, junto
 * com o resumo da assinatura, para não depender de variável de build.
 */

const SDK_URL = 'https://sdk.mercadopago.com/js/v2';

/** O que usamos do objeto `MercadoPago` do SDK. */
export interface CampoSeguro {
  mount(containerId: string): CampoSeguro;
  unmount(): void;
  on(evento: 'validityChange' | 'binChange' | 'focus' | 'blur' | 'ready' | 'error', cb: (e: any) => void): CampoSeguro;
  update(opcoes: Record<string, unknown>): void;
}

export interface SdkMercadoPago {
  fields: {
    create(tipo: 'cardNumber' | 'expirationDate' | 'securityCode', opcoes?: Record<string, unknown>): CampoSeguro;
    createCardToken(dados: { cardholderName: string; identificationType?: string; identificationNumber?: string }): Promise<{ id: string }>;
  };
  getPaymentMethods(args: { bin: string }): Promise<{ results: Array<{ id: string; name: string; thumbnail?: string }> }>;
}

declare global {
  interface Window {
    MercadoPago?: new (publicKey: string, opcoes?: { locale?: string }) => SdkMercadoPago;
  }
}

let carregando: Promise<void> | null = null;

function carregarScript(): Promise<void> {
  if (window.MercadoPago) return Promise.resolve();
  if (carregando) return carregando;
  carregando = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      carregando = null;
      reject(new Error('Não foi possível carregar o Mercado Pago. Verifique a conexão e tente de novo.'));
    };
    document.head.appendChild(s);
  });
  return carregando;
}

const instancias = new Map<string, SdkMercadoPago>();

/** Uma instância do SDK por chave pública, carregando o script na primeira vez. */
export async function mercadoPago(publicKey: string): Promise<SdkMercadoPago> {
  await carregarScript();
  if (!window.MercadoPago) throw new Error('SDK do Mercado Pago indisponível.');
  let mp = instancias.get(publicKey);
  if (!mp) {
    mp = new window.MercadoPago(publicKey, { locale: 'pt-BR' });
    instancias.set(publicKey, mp);
  }
  return mp;
}
