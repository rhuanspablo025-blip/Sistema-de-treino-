import financeErrors from './finance-errors.cjs';
import { AsaasPaymentProvider } from './payment-providers/asaas.mjs';

const { FinanceError } = financeErrors;

export class PaymentProvider {
  constructor() {
    if (new.target === PaymentProvider) throw new TypeError('PaymentProvider is an abstraction.');
  }

  get status() { throw new Error('Provider must define status.'); }
  async createCharge() { throw new FinanceError('Gateway de pagamento não configurado.', 503); }
  async getPayerSetup() { return { requiresTaxId: false }; }
  async getPaymentStatus() { throw new FinanceError('Consulta de pagamento indisponível sem gateway configurado.', 503); }
  async cancelPayment() { throw new FinanceError('Cancelamento indisponível sem gateway configurado.', 503); }
  async refundPayment() { throw new FinanceError('Estorno indisponível sem gateway configurado.', 503); }
  async createPayout() { throw new FinanceError('Transferência externa indisponível sem gateway configurado.', 503); }
  async validateWebhook() { throw new FinanceError('Validação de webhook indisponível sem gateway configurado.', 503); }
}

export class UnconfiguredPaymentProvider extends PaymentProvider {
  constructor(provider = 'unconfigured') {
    super();
    this.configuredProvider = provider;
  }

  get status() {
    return { provider: 'unconfigured', configuredProvider: this.configuredProvider, environment: 'unconfigured', available: false, methods: { pix: false, boleto: false, card: false } };
  }
}

export function getPaymentProvider() {
  const provider = process.env.PAYMENT_PROVIDER || 'unconfigured';
  if (provider === 'asaas') return new AsaasPaymentProvider();
  return new UnconfiguredPaymentProvider(provider);
}