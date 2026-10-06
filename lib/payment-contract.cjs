const METHODS = new Set(['PIX', 'BOLETO', 'CARD']);
const WEBHOOK_STATUSES = new Set(['PROCESSING', 'PAID', 'SETTLED', 'FAILED', 'EXPIRED', 'CANCELLED', 'REFUNDED', 'REVIEW_REQUIRED']);

function requiredText(value, label, maximum = 200) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum) throw new Error(`${label} inválido.`);
  return value.trim();
}

function optionalText(value, label, maximum = 200) {
  if (value == null || value === '') return undefined;
  return requiredText(value, label, maximum);
}

function secureUrl(value, label) {
  const text = optionalText(value, label, 2048);
  if (!text) return undefined;
  let url;
  try { url = new URL(text); }
  catch { throw new Error(`${label} inválido.`); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`${label} inválido.`);
  return url.toString();
}

function normalizeCheckout(checkout = {}, method) {
  if (!checkout || typeof checkout !== 'object' || Array.isArray(checkout)) throw new Error('Dados de checkout inválidos.');
  const normalized = { redirectUrl: secureUrl(checkout.redirectUrl, 'URL de checkout') };
  if (checkout.expiresAt != null) {
    const expiresAt = new Date(checkout.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) throw new Error('Vencimento do checkout inválido.');
    normalized.expiresAt = expiresAt.toISOString();
  }

  if (method === 'PIX') {
    normalized.pixCopyPaste = optionalText(checkout.pixCopyPaste, 'Pix Copia e Cola', 4096);
    const qrCodeDataUrl = optionalText(checkout.pixQrCodeDataUrl, 'QR Code Pix', 700000);
    if (qrCodeDataUrl && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(qrCodeDataUrl)) throw new Error('QR Code Pix inválido.');
    normalized.pixQrCodeDataUrl = qrCodeDataUrl;
    if (!normalized.pixCopyPaste && !normalized.pixQrCodeDataUrl && !normalized.redirectUrl) throw new Error('O provedor não retornou dados de checkout Pix.');
  }

  if (method === 'BOLETO') {
    normalized.boletoUrl = secureUrl(checkout.boletoUrl, 'URL do boleto');
    normalized.boletoLine = optionalText(checkout.boletoLine, 'Linha digitável', 256);
    normalized.boletoBarcode = optionalText(checkout.boletoBarcode, 'Código de barras', 256);
    if (!normalized.boletoUrl && !normalized.boletoLine && !normalized.boletoBarcode) throw new Error('O provedor não retornou dados de boleto.');
  }

  if (method === 'CARD' && !normalized.redirectUrl) throw new Error('O cartão deve usar o checkout seguro hospedado pelo provedor.');
  return Object.fromEntries(Object.entries(normalized).filter(([, value]) => value !== undefined));
}

function normalizeChargeResult(result, requestedMethod) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Resposta de cobrança inválida.');
  if (!METHODS.has(requestedMethod)) throw new Error('Método de pagamento inválido.');
  const status = requiredText(result.status, 'Status de pagamento', 30);
  if (!['PENDING', 'PROCESSING'].includes(status)) throw new Error('O checkout não pode confirmar a liquidação do pagamento.');
  return {
    externalPaymentId: requiredText(result.externalPaymentId, 'Identificador externo', 200),
    status,
    method: requestedMethod,
    checkout: normalizeCheckout(result.checkout, requestedMethod),
  };
}

function normalizeWebhookEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error('Evento normalizado inválido.');
  const status = requiredText(event.status, 'Status do evento', 30);
  const amountCents = event.amountCents;
  const method = event.method == null ? undefined : requiredText(event.method, 'Método do evento', 20);
  if (!WEBHOOK_STATUSES.has(status)) throw new Error('Status de webhook não suportado.');
  if (method && !METHODS.has(method)) throw new Error('Método de webhook inválido.');
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) throw new Error('Valor de webhook inválido.');
  const netAmountCents = event.netAmountCents;
  if (status === 'SETTLED' && (!Number.isSafeInteger(netAmountCents) || netAmountCents <= 0 || netAmountCents > amountCents)) throw new Error('Valor líquido do webhook inválido.');
  const currency = requiredText(event.currency, 'Moeda', 3);
  if (currency !== 'BRL') throw new Error('Moeda de webhook inválida.');
  return {
    eventId: requiredText(event.eventId, 'Identificador do evento', 160),
    eventName: optionalText(event.eventName, 'Evento do provedor', 120),
    externalPaymentId: requiredText(event.externalPaymentId, 'Identificador externo', 200),
    providerReference: optionalText(event.providerReference, 'Referência externa', 200),
    providerCustomerId: optionalText(event.providerCustomerId, 'Cliente externo', 200),
    invoiceId: optionalText(event.invoiceId, 'Fatura', 64),
    payerUserId: optionalText(event.payerUserId, 'Usuário', 64),
    amountCents,
    netAmountCents,
    currency,
    method,
    status,
  };
}

module.exports = { METHODS, WEBHOOK_STATUSES, normalizeChargeResult, normalizeWebhookEvent };