# Auditoria Técnica da Integração Asaas

**Status:** auditoria do código, sem chamadas à conta Asaas e sem alteração financeira.  
**Persistência:** MongoDB Atlas, confirmado pelo proprietário.  
**Conclusão:** a integração existente é uma implementação server-side relevante. Não reconstruir o gateway durante o redesign; preservar adapter, contratos, conciliação e estados.

## 1. Arquitetura identificada

| Camada | Arquivos | Responsabilidade |
| --- | --- | --- |
| Seleção de gateway | `lib/payment-provider.js` | Usa `PAYMENT_PROVIDER`; retorna Asaas ou provider explicitamente não configurado |
| Adapter | `lib/payment-providers/asaas.mjs` | Cliente HTTP, customer, charge, consulta/cancelamento/refund, payout e autenticação de webhook |
| Contrato Asaas | `lib/payment-providers/asaas-contract.cjs` | Converte eventos oficiais e status de transferência/pagamento para contrato interno |
| Contrato genérico | `lib/payment-contract.cjs` | Valida respostas de checkout e eventos normalizados; rejeita sucesso de pagamento vindo de checkout |
| Serviço financeiro | `lib/finance-service.js` | Planos, subscriptions, invoices, checkout, pagamentos, bloqueios, dashboard e ledger |
| Job | `lib/finance-jobs.js` | Emissão/overdue, política de bloqueio e processamento de payouts pendentes |
| Payout | `lib/finance-payouts.js` | Lock/reserva, chamada de transferência, persistência, ledger e auditoria |
| Regra de acesso | `lib/access-policy.cjs`, `lib/finance-access.js` | Evolução warning/restrição/bloqueio |
| API administrativa | `app/api/finance/[resource]/route.js` | Recursos SUPER_ADMIN, `enforceSameOrigin` nas mutações |
| Checkout do pagador | `app/api/finance/checkout/route.js` | Usuário autenticado, same-origin e chamada ao service |
| Conta própria | `app/api/finance/my-account/route.js` | Retorna somente a conta do usuário autenticado |
| Webhook | `app/api/finance/webhook/[provider]/route.js` | Valida provider, token, tamanho, idempotência, concilia e atualiza em transação Mongo |
| Job HTTP | `app/api/finance/cron/daily/route.js` | GET protegido por `CRON_SECRET` com comparação timing-safe |
| UI | `components/FinancialManager.jsx`, `app/billing/page.jsx` | Painel Super Admin e cobrança de conta/usuário |

## 2. Separação de domínio: estado atual

O módulo chama o painel de “Financeiro” do proprietário/SaaS e limita esse painel ao papel `SUPER_ADMIN` (username de proprietário definido no código). Entretanto, o mesmo conjunto de `billing_plans`, `subscriptions`, `invoices` e `payments` suporta `accountRole` admin/trainer/student e configura modelos `ADMIN_SUBSCRIPTION`, `STUDENT_FEE` e `HYBRID`. Portanto, o código permite faturamento da conta administrativa e também regras/cobranças relacionadas a alunos; os conceitos não estão completamente separados em bounded contexts ou collections.

No planejamento de UI, separar visualmente **cobrança pela plataforma** de **cobrança de aluno pela academia**, mas não alterar IDs, collections, modelo comercial, cobrança ou permissão sem decisão explícita. Há de se confirmar com o proprietário quais partes estão ativas em produção e qual domínio cada tela representa.

## 3. Configuração e segurança

Variáveis mencionadas em `README.md`/`.env.example`:

- `PAYMENT_PROVIDER=unconfigured|asaas`.
- `PAYMENT_ENVIRONMENT=sandbox|production`.
- `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` somente no servidor.
- `ASAAS_AUTO_PAYOUT_ENABLED` e `ASAAS_PAYOUT_BANK_ACCOUNT_JSON` opcionais; `CRON_SECRET` para job.
- Bases fixas no adapter: `https://api-sandbox.asaas.com/v3` e `https://api.asaas.com/v3`; não são aceitas por payload de browser.

O adapter verifica chave, ambiente conhecido e token de webhook entre 32 e 255 caracteres. A requisição usa cabeçalho `access_token`, timeout 20s, `User-Agent` de produto e corpos JSON. Dados de cartão são enviados ao checkout hospedado do Asaas; não há coleta/armazenamento de PAN/CVV. CPF/CNPJ é enviado ao criar customer, mas a documentação diz que não é persistido; o teste existente verifica que não aparece no mapping local.

O endpoint de webhook exige `asaas-access-token`, comparação timing-safe e limita corpo a 64KB. O service evita expor stack trace nos retornos e usa logs de auditoria/metadados. Deve-se revisar segredo de payout e superfície de logs em auditoria de segurança separada; não reproduzir nenhum valor de ambiente em documentos, logs ou UI.

## 4. Fluxo técnico já implementado

### Plano, assinatura e fatura

1. Superadmin configura plano e regras no banco; valores são inteiros em centavos e moeda `BRL`.
2. `createSubscription` valida usuário/plano/período, recusa assinatura ativa duplicada e cria assinatura em transação Mongo.
3. `createInvoice` carrega plano, subscription, contagens e regras no servidor; aplica descontos, excedentes, taxas, encargos e abatimentos; grava fatura, ledger, notificação e auditoria em transação.
4. Job diário cria faturas próximas do vencimento, marca faturas atrasadas, expira bloqueios manuais e aplica/revoga bloqueios automáticos.
5. Para vencimento, o sistema usa `periodKey`, índice único `(subscriptionId, periodKey)` e update condicional da subscription. Não foi observado lock distribuído do job.

`createSubscription` grava `status: ACTIVE` antes da primeira cobrança estar liquidada. O acesso efetivo depende também de faturas/bloqueios; a UI não pode converter esse status interno em “pagamento confirmado”. A subscription recorrente é mantida pelo scheduler interno; o adapter cria pagamentos avulsos. Não foi encontrado uso do endpoint de subscription recorrente do Asaas.

### Checkout / payment

1. Conta autenticada só pode pagar invoice cujo `payerUserId` é o próprio user.
2. Serviço recusa métodos fora de PIX/BOLETO/CARD, moeda diferente de BRL, amount inconsistente com os componentes salvos e fatura fora dos estados pagáveis.
3. Reserva attempt `PROCESSING` e `activeAttempt` em transação, com índice único de attempt ativo por invoice.
4. Adapter busca customer por mapping Mongo e `externalReference`; cria no Asaas quando necessário, mantendo mapping por provider+environment+user.
5. Busca payment por `externalReference` idempotente antes de criar nova cobrança; compara customer, referência, método e amount.
6. Pix retorna QR e copia/cola; boleto retorna URL/linha/código; cartão retorna `invoiceUrl` HTTPS hospedada.
7. Retorno de checkout é sempre `PENDING` ou `PROCESSING`; somente webhook autenticado atualiza pagamento/fatura e acesso.
8. Persistência posterior também é transacional. Se provider criou a cobrança mas a resposta/persistência não pode ser conciliada, status vai a `REVIEW_REQUIRED` para não criar segunda cobrança cegamente.

### Webhook, conciliação e idempotência

- `asaas-contract.cjs` normaliza IDs, customer, referência externa, valor inteiro em centavos, tipo de cobrança, status e net value.
- Eventos desconhecidos são auditados/registrados e reconhecidos sem processar pagamento.
- IDs duplicados usam índice único; worker grava lock/token/expiração, reconhece `PROCESSED`, responde `202` para processamento em curso e permite retry de `RETRYABLE_ERROR` ou lock vencido.
- Evento conciliado compara payment externo, invoice, customer mapping, payer, referência, método, amount e moeda; mismatch vai para `REVIEW_REQUIRED` e não liquida invoice.
- Atualização de payment, invoice, ledger, subscription, access blocks e evento é transacional.
- Eventos antigos/out-of-order são ignorados quando identificados; conflitos ou múltiplos settlements seguem para revisão.
- `PAYMENT_RECEIVED` mapeia para `SETTLED`, inclui `netAmountCents`; `PAYMENT_CONFIRMED` mapeia para `PAID`. Refund parcial, chargeback e eventos sensíveis são encaminhados para revisão.
- Eventos de transferência têm seu próprio caminho, conciliam valor, payout e referências e atualizam ledger.

## 5. Estados financeiros existentes

| Entidade | Estados observados | Observação de UI |
| --- | --- | --- |
| Subscription | `ACTIVE`, `PAUSED`, `CANCELLED` | Não equivale à liquidação da cobrança; pausa/cancelamento são internos |
| Invoice | `PENDING`, `AWAITING_PAYMENT`, `PAID`, `OVERDUE`, `CANCELLED`, `REFUNDED`, `BLOCKED`, `PROCESSING`, `REVIEW_REQUIRED` | Estado oficial da cobrança local, fonte de apresentação do pagador |
| Payment attempt | `PROCESSING`, `PENDING`, `FAILED`, `PAID`, `EXPIRED`, `CANCELLED`, `REFUNDED`, `REVIEW_REQUIRED` | Pode diferir do invoice e do status Asaas; mostrar estados distintos só se suportado |
| Webhook event | `PROCESSING`, `PROCESSED`, `RETRYABLE_ERROR`, `REVIEW_REQUIRED`, `REJECTED` e outcome | Operação interna; não expor payload bruto a usuário |
| Access block | `WARNING`, `RESTRICTION`, `PARTIAL`, `TOTAL`, `CANCELLED` e `ACTIVE` como nível/estado | Mensagens devem refletir política e acesso resultante |
| Payout | `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `REVIEW_REQUIRED` e eventos de transferência mapeados | Apenas Super Admin; nunca apresentar payout como pagamento da fatura |

O contrato Asaas reconhece eventos de pagamento de risco, confirmação/recebimento, inadimplência, remoção, estorno e chargeback. `PAYMENT_OVERDUE` mapeia para `EXPIRED` na tentativa; invoice calcula `OVERDUE` segundo vencimento. A interface precisa seguir o estado local conciliado, não traduzir status do provider diretamente.

## 6. Política de cobrança e cálculo

`lib/finance-calculator.cjs` (checkout aberto) faz cálculo em centavos:

1. Base mensal/anual por papel (preço do plano ou preço de aluno).
2. Contagem de alunos/professores acima dos incluídos e valores excedentes.
3. Taxa de plataforma sobre receita elegível.
4. Desconto percentual + valor do plano + desconto da assinatura, limitado ao bruto.
5. Multa e juros diários conforme `billing_rules` quando vencido.
6. Abatimento de receita do aluno permitido por plano/regra, percentual e limite; não deixa valor negativo; carryover opcional.
7. `finalAmountCents = max(0, antesDoAbatimento - abatimento)`.

Regras iniciais vistas no seed: moeda BRL, vencimento dia 10, aviso 5 dias, carência 3 dias, restrição/bloqueio configuráveis, multa 2%, juros diários 0,033%, abatimento desligado. São defaults técnicos, não decisão comercial definitiva. Preços não devem ser inventados no frontend; servidor resolve plano e valores.

`access-policy.cjs` prioriza carência, aviso, restrição e bloqueio. `finance-access.js` é consultado pelos guardas de API, portanto mensagens de billing precisam continuar acessíveis a usuário restrito. O endpoint de dashboard aceita `allowBlocked` para evitar loop e a página `/billing` consulta `my-account` autenticado.

## 7. O que funciona no código auditado

- Adapter e modo “unconfigured” explícito; sem pagamento simulado como aprovado.
- Sandbox/produção escolhidos no servidor e URLs fixas.
- Pix, boleto e cartão hospedado pelo Asaas.
- Customer externo separado do usuário via mapping por ambiente.
- Centavos inteiros e BRL; cálculo de preço no backend.
- Reutilização de tentativa ativa e busca por externalReference para reduzir duplicidade.
- Webhook autenticado, validação de payload e reconciliação de múltiplos identificadores.
- Pagamento, fatura, ledger e subscription atualizados transacionalmente em Mongo.
- Payout automático isolado e desativado por padrão; destino por secret.
- Mensagens de erro sanitizadas e auditoria de operações críticas.
- Testes unitários em `tests/finance-calculator.test.cjs` exercitam cálculo, policy, normalização de webhook, checkout, fluxos PIX/BOLETO/CARD com fetch stub, autenticação de webhook e payout stub.

**Isso prova implementação e cobertura isolada, não prova credenciais válidas, sandbox real, produção ou webhooks chegando da conta do proprietário.**

## 8. Lacunas e melhorias que não devem virar regressão do redesign

1. Não há uso visível de `POST /subscriptions` do Asaas; recorrência é invoice local + charge avulso. Confirmar se é o modelo comercial desejado.
2. `createSubscription` inicia em `ACTIVE`; falta estado de assinatura aguardando pagamento explícito. Não mudar até aprovação e plano de compatibilidade.
3. O checkout timeout vai a revisão; não há reconciliação automática subsequente consultando provider antes de nova tentativa. É conservador contra duplicidade, mas cria operação manual.
4. A chave de idempotência é implementada via reserva Mongo + lookup `externalReference`; não foi visto header nativo de idempotência Asaas. Revisar concorrência/race de customer/payment e contrato atual da API oficial antes de ampliar.
5. Job diário é protegido por secret e índices evitam fatura repetida, mas não há lock distribuído, telemetria de execução nem fila de retry durável para cada falha. `nextDueAt`/fatura e bloqueios não são uma única transação global.
6. `getFinanceDashboard` usa múltiplas queries de alto volume, incluindo consultas por mês e limites de até 10.000 invoices; paginação/índices devem ser avaliados antes de novos gráficos.
7. Status internos e externos não são apresentados de maneira completamente unificada; risco de mostrar “assinatura ativa” quando ainda não foi liquidada.
8. Reembolso parcial/chargeback vai para revisão, não é uma resolução automática fim-a-fim. Fluxo operacional precisa de permissão, fila e trilha de decisão.
9. Testes usam `fetchImpl` mockado e fixtures; não há evidência de teste de integração com sandbox, endpoint HTTP completo, eventos concorrentes, replay em produção ou verificação externa de webhook.
10. Não existe confirmação documentada de política de inadimplência, carência efetiva, cancelamento e reativação comercial por parte do proprietário.
11. Há diferença entre checkout atual e documentação remota de periods; consolidar SHA antes de basear o novo painel.
12. A interface de owner mistura planos, assinaturas da plataforma, mensalidades de estudantes, ledger, bloqueios e payout em 12 abas. Separação visual é necessária; separação de domínio/collections exige decisão fora do redesign.

## 9. Casos de validação de integração antes/depois da UI

- Provider ausente: API retorna indisponível e UI não inventa QR, boleto, link ou status.
- Sandbox/produção: ambientes não cruzam customer mapping nem base URL; credencial nunca chega ao cliente.
- Invoice própria vs ID de outra conta; superadmin vs admin de academia.
- Clique repetido e duas requisições concorrentes de checkout; timeout após criação remota; lookup por referência; ausência de duplicata.
- Eventos válidos, inválidos, repetidos, desconhecidos e fora de ordem; webhook sem token e com token de tamanho diferente.
- Amount/customer/payment/reference/method/currency divergentes; nunca liberar acesso nesses casos.
- `CONFIRMED`, `RECEIVED`, `OVERDUE`, `DELETED`, `REFUNDED`, parcial, chargeback e eventos de transferência.
- Job diário chamado duas vezes, invoice única, atraso, carência, warning/restriction/total e liberação após pagamento.
- Checkout Pix copia/cola e QR; boleto; cartão em HTTPS hospedado; nenhum retorno visual marca fatura paga.
- Payout desligado, destino incompleto, timeout, transferência pendente, done, failed, duplicada e divergente.
- Regressão de ledger, auditoria, notificações e relações Mongo.

## 10. Escopo de preservação

No redesign, podem mudar: composição de páginas, layout, labels apresentacionais aprovados, componentes e CSS. Não podem mudar sem autorização: endpoint/payload/status, cálculo, provider adapter, credenciais, environment selection, idempotência, locks, coleção/índice, cron, webhook, regra de acesso, uso de dados pessoais, valor/método comercial ou liberação por evento. Qualquer melhoria no domínio financeiro deve ser proposta em documento/tarefa separada e testada em sandbox antes da UI.
