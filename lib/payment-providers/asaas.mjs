import { timingSafeEqual } from 'node:crypto';
import asaasContract from './asaas-contract.cjs';
import financeErrors from '../finance-errors.cjs';

const { amountToCents, mapAsaasPaymentStatus, normalizeAsaasWebhook } = asaasContract;
const { FinanceError } = financeErrors;

async function defaultDatabase() {
  const { getDatabase } = await import('../mongodb.js');
  return getDatabase();
}

function cleanTaxId(value) {
  if (typeof value !== 'string') return '';
  const digits = value.replace(/\D/g, '');
  return digits.length === 11 || digits.length === 14 ? digits : '';
}

function payoutBankAccount(rawValue) {
  let account;
  try { account = JSON.parse(rawValue || ''); }
  catch { throw new FinanceError('Destino de payout Asaas não configurado corretamente.', 503); }
  const bankCode = account?.bank?.code;
  const ownerName = typeof account?.ownerName === 'string' ? account.ownerName.trim() : '';
  const cpfCnpj = cleanTaxId(account?.cpfCnpj);
  const agency = typeof account?.agency === 'string' ? account.agency.trim() : '';
  const accountNumber = typeof account?.account === 'string' ? account.account.trim() : '';
  const accountDigit = typeof account?.accountDigit === 'string' ? account.accountDigit.trim() : '';
  const bankAccountType = account?.bankAccountType;
  if (typeof bankCode !== 'string' || !bankCode.trim() || !ownerName || !cpfCnpj || !agency || !accountNumber || !accountDigit || !['CONTA_CORRENTE', 'CONTA_POUPANCA'].includes(bankAccountType)) {
    throw new FinanceError('Destino de payout Asaas incompleto; confira o secret ASAAS_PAYOUT_BANK_ACCOUNT_JSON.', 503);
  }
  return {
    bank: { code: bankCode.trim() }, ownerName, cpfCnpj, agency,
    account: accountNumber, accountDigit, bankAccountType,
    ...(typeof account.accountName === 'string' && account.accountName.trim() && { accountName: account.accountName.trim() }),
    ...(typeof account.ownerBirthDate === 'string' && account.ownerBirthDate.trim() && { ownerBirthDate: account.ownerBirthDate.trim() }),
  };
}

function hasValidPayoutBankAccount(rawValue) {
  try { payoutBankAccount(rawValue); return true; }
  catch { return false; }
}

function asaasMethod(method) {
  return { PIX: 'PIX', BOLETO: 'BOLETO', CARD: 'CREDIT_CARD' }[method];
}

function paymentDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new FinanceError('Vencimento da fatura inválido.', 409);
  return date.toISOString().slice(0, 10);
}

function mapPaymentResponse(payment, method, expected) {
  if (!payment || typeof payment !== 'object' || typeof payment.id !== 'string' || !payment.id) throw new FinanceError('Resposta de cobrança Asaas inválida.', 502);
  if (payment.externalReference !== expected.externalReference || payment.customer !== expected.customerId || payment.billingType !== asaasMethod(method) || amountToCents(payment.value) !== expected.amountCents) {
    throw new FinanceError('A cobrança Asaas diverge da fatura; revisão necessária.', 502);
  }
  const status = payment.status === 'PENDING' ? 'PENDING' : mapAsaasPaymentStatus(payment.status);
  if (!['PENDING', 'PROCESSING'].includes(status)) throw new FinanceError('A cobrança retornou um estado que exige conciliação manual.', 502);
  return { payment, status };
}

export class AsaasPaymentProvider {
  constructor({ apiKey = process.env.ASAAS_API_KEY, webhookToken = process.env.ASAAS_WEBHOOK_TOKEN, environment = process.env.PAYMENT_ENVIRONMENT, autoPayoutEnabled = process.env.ASAAS_AUTO_PAYOUT_ENABLED, payoutBankAccountJson = process.env.ASAAS_PAYOUT_BANK_ACCOUNT_JSON, fetchImpl = globalThis.fetch, database = defaultDatabase } = {}) {
    this.apiKey = typeof apiKey === 'string' ? apiKey.trim() : '';
    this.webhookToken = typeof webhookToken === 'string' ? webhookToken : '';
    this.environment = environment;
    this.autoPayoutEnabled = autoPayoutEnabled === 'true';
    this.payoutBankAccountJson = payoutBankAccountJson;
    this.fetchImpl = fetchImpl;
    this.database = database;
  }

  get status() {
    const validEnvironment = ['sandbox', 'production'].includes(this.environment);
    const validWebhookToken = this.webhookToken.length >= 32 && this.webhookToken.length <= 255 && !/\s/.test(this.webhookToken);
    const available = Boolean(this.apiKey && validEnvironment && validWebhookToken);
    return {
      provider: 'asaas',
      environment: validEnvironment ? this.environment : 'unconfigured',
      available,
      methods: { pix: available, boleto: available, card: available },
      automaticPayoutEnabled: this.autoPayoutEnabled,
      payoutDestinationConfigured: hasValidPayoutBankAccount(this.payoutBankAccountJson),
      message: available ? 'Asaas configurado.' : 'Configure chave API, token de webhook e ambiente Asaas em secrets do servidor.',
    };
  }

  get apiBaseUrl() {
    if (this.environment === 'sandbox') return 'https://api-sandbox.asaas.com/v3';
    if (this.environment === 'production') return 'https://api.asaas.com/v3';
    throw new FinanceError('Ambiente Asaas inválido.', 503);
  }

  async request(path, { method = 'GET', body } = {}) {
    if (!this.status.available) throw new FinanceError('Asaas não configurado para este ambiente.', 503);
    let response;
    try {
      response = await this.fetchImpl(`${this.apiBaseUrl}${path}`, {
        method,
        headers: { access_token: this.apiKey, 'User-Agent': 'AtlasTraining/1.0.0', ...(body && { 'Content-Type': 'application/json' }) },
        ...(body && { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new FinanceError('Não foi possível confirmar a resposta da API Asaas; pagamento retido para conciliação.', 502);
    }
    let result;
    try { result = await response.json(); }
    catch { throw new FinanceError('Resposta inválida da API Asaas.', 502); }
    if (!response.ok) {
      const status = response.status >= 400 && response.status < 500 ? 422 : 502;
      throw new FinanceError(`A API Asaas recusou a operação (HTTP ${response.status}).`, status);
    }
    return result;
  }

  async getPayerSetup(userId) {
    if (!this.status.available) return { requiresTaxId: false };
    const mapping = await (await this.database()).collection('payment_provider_customers').findOne({ provider: 'asaas', environment: this.environment, userId });
    return { requiresTaxId: !mapping?.providerCustomerId };
  }

  async getOrCreateCustomer(payer) {
    const database = await this.database();
    const mappings = database.collection('payment_provider_customers');
    const mapping = await mappings.findOne({ provider: 'asaas', environment: this.environment, userId: payer.id });
    if (mapping?.providerCustomerId) return mapping.providerCustomerId;

    const taxId = cleanTaxId(payer.cpfCnpj);
    if (!taxId) throw new FinanceError('Informe CPF ou CNPJ válido para cadastrar o pagador no Asaas.');
    if (typeof payer.name !== 'string' || !payer.name.trim()) throw new FinanceError('Nome do pagador ausente.');

    const query = new URLSearchParams({ externalReference: payer.id, limit: '100' });
    const existing = await this.request(`/customers?${query}`);
    let customer = Array.isArray(existing.data) ? existing.data.find((item) => item.externalReference === payer.id) : null;
    if (!customer) {
      customer = await this.request('/customers', {
        method: 'POST',
        body: { name: payer.name.trim().slice(0, 100), cpfCnpj: taxId, externalReference: payer.id },
      });
    }
    if (typeof customer?.id !== 'string' || !customer.id) throw new FinanceError('O Asaas não retornou o identificador do pagador.', 502);
    try {
      await mappings.updateOne(
        { provider: 'asaas', environment: this.environment, userId: payer.id },
        { $setOnInsert: { id: `${this.environment}:${payer.id}:asaas`, provider: 'asaas', environment: this.environment, userId: payer.id, providerCustomerId: customer.id, createdAt: new Date() } },
        { upsert: true },
      );
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
    const saved = await mappings.findOne({ provider: 'asaas', environment: this.environment, userId: payer.id });
    return saved?.providerCustomerId || customer.id;
  }

  async createCharge({ invoice, method, idempotencyKey, payer }) {
    if (!this.status.available) throw new FinanceError('Asaas não configurado para este ambiente.', 503);
    const billingType = asaasMethod(method);
    if (!billingType) throw new FinanceError('Método de pagamento não suportado pelo Asaas.');
    if (!Number.isSafeInteger(invoice.finalAmountCents) || invoice.finalAmountCents <= 0 || invoice.currency !== 'BRL') throw new FinanceError('Valor ou moeda da fatura inválidos.', 409);

    const customerId = await this.getOrCreateCustomer(payer);
    const expected = { externalReference: idempotencyKey, customerId, amountCents: invoice.finalAmountCents };
    const query = new URLSearchParams({ externalReference: idempotencyKey, limit: '100' });
    const existingResult = await this.request(`/payments?${query}`);
    let payment = Array.isArray(existingResult.data) ? existingResult.data.find((item) => item.externalReference === idempotencyKey) : null;
    if (!payment) {
      payment = await this.request('/payments', {
        method: 'POST',
        body: {
          customer: customerId,
          billingType,
          value: invoice.finalAmountCents / 100,
          dueDate: paymentDate(invoice.dueAt),
          description: `Fatura ${invoice.id}`.slice(0, 500),
          externalReference: idempotencyKey,
        },
      });
    }
    const mapped = mapPaymentResponse(payment, method, expected);
    const checkout = {};

    if (method === 'PIX') {
      const pix = await this.request(`/payments/${encodeURIComponent(payment.id)}/pixQrCode`);
      const image = typeof pix.encodedImage === 'string' ? pix.encodedImage.replace(/^data:image\/[^;]+;base64,/, '') : '';
      if (image) checkout.pixQrCodeDataUrl = `data:image/png;base64,${image}`;
      if (typeof pix.payload === 'string') checkout.pixCopyPaste = pix.payload;
      if (pix.expirationDate) checkout.expiresAt = pix.expirationDate;
    } else if (method === 'BOLETO') {
      if (typeof payment.bankSlipUrl === 'string') checkout.boletoUrl = payment.bankSlipUrl;
      const line = await this.request(`/payments/${encodeURIComponent(payment.id)}/identificationField`);
      if (typeof line.identificationField === 'string') checkout.boletoLine = line.identificationField;
      if (typeof line.barCode === 'string') checkout.boletoBarcode = line.barCode;
    } else {
      checkout.redirectUrl = payment.invoiceUrl;
    }

    return { externalPaymentId: payment.id, status: mapped.status, checkout };
  }

  async getPaymentStatus(externalPaymentId) {
    const payment = await this.request(`/payments/${encodeURIComponent(externalPaymentId)}`);
    return {
      externalPaymentId: payment.id,
      status: mapAsaasPaymentStatus(payment.status),
      amountCents: amountToCents(payment.value),
      currency: 'BRL',
      method: ({ PIX: 'PIX', BOLETO: 'BOLETO', CREDIT_CARD: 'CARD' })[payment.billingType],
      providerReference: payment.externalReference,
    };
  }

  async cancelPayment(externalPaymentId) {
    return this.request(`/payments/${encodeURIComponent(externalPaymentId)}`, { method: 'DELETE' });
  }

  async refundPayment(externalPaymentId, { amountCents, description } = {}) {
    const body = {
      ...(amountCents != null && { value: amountCents / 100 }),
      ...(typeof description === 'string' && description.trim() && { description: description.trim().slice(0, 200) }),
    };
    return this.request(`/payments/${encodeURIComponent(externalPaymentId)}/refund`, { method: 'POST', body });
  }

  async createPayout({ payout }) {
    if (!this.status.available || !this.autoPayoutEnabled) throw new FinanceError('Payout automático Asaas desativado.', 503);
    if (!payout || !Number.isSafeInteger(payout.amountCents) || payout.amountCents <= 0 || payout.currency !== 'BRL') throw new FinanceError('Valor de payout inválido.');
    const bankAccount = payoutBankAccount(this.payoutBankAccountJson);
    const externalReference = `payout:${payout.paymentId}`;
    const transfer = await this.request('/transfers', {
      method: 'POST',
      body: { value: payout.amountCents / 100, bankAccount, externalReference },
    });
    if (typeof transfer?.id !== 'string' || !transfer.id || transfer.externalReference !== externalReference || amountToCents(transfer.value) !== payout.amountCents) {
      throw new FinanceError('A transferência Asaas retornou dados divergentes; payout retido para revisão.', 502);
    }
    if (!['PENDING', 'BANK_PROCESSING', 'DONE'].includes(transfer.status)) throw new FinanceError('A transferência Asaas retornou um estado não conciliável.', 502);
    const creditedAmountCents = transfer.netValue == null ? null : amountToCents(transfer.netValue);
    if (creditedAmountCents != null && creditedAmountCents > payout.amountCents) throw new FinanceError('O líquido da transferência Asaas diverge do valor solicitado.', 502);
    return {
      externalTransferId: transfer.id,
      externalReference,
      amountCents: payout.amountCents,
      currency: 'BRL',
      status: transfer.status,
      creditedAmountCents,
      transferFeeCents: transfer.transferFee == null ? null : amountToCents(transfer.transferFee),
    };
  }

  async validateWebhook(rawBody, headers) {
    if (!this.status.available || typeof rawBody !== 'string') throw new FinanceError('Asaas não configurado.', 503);
    const supplied = headers?.get?.('asaas-access-token') || '';
    const expectedBuffer = Buffer.from(this.webhookToken);
    const suppliedBuffer = Buffer.from(supplied);
    if (!supplied || suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) throw new FinanceError('Token de webhook Asaas inválido.', 401);
    let body;
    try { body = JSON.parse(rawBody); }
    catch { throw new FinanceError('Payload Asaas inválido.'); }
    try { return normalizeAsaasWebhook(body); }
    catch { throw new FinanceError('Evento Asaas inválido.'); }
  }
}