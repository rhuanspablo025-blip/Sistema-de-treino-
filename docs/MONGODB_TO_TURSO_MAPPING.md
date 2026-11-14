# Mapeamento MongoDB → Turso/libSQL

**Status:** mapeamento documental; nenhuma query ao banco e nenhuma migration executada.  
**Fontes:** `lib/models.js`, APIs/services da workspace Mongo, commit `0e3e4cf` e `domainCollections` no `main`.  
**Regra:** campos/tipos desconhecidos estão marcados como lacuna; não completar por suposição.

## 1. Diferença no inventário de collections

A lista de entrada do proprietário contém 21 collections. No `main` pós-migração, `domainCollections` lista essas famílias e mais `app_settings` e `workout_templates`; o legado `lib/models.js` do workspace aberto não lista esses dois. Tratar ambos como dados de origem potenciais no baseline oficial e verificar cada cluster antes de importar.

| Collection (21 solicitadas) | Campos observados no código aberto / services | PK/relacionamentos | Índices Mongo conhecidos | Tabela SQL proposta e atenção |
| --- | --- | --- | --- | --- |
| `users` | `id`, `username`, `name`, `passwordHash`, `role`, `active`, `sessionVersion`, `ownerAdminId`, `createdAt`, `updatedAt`, `deletedAt`; campos pessoais permanecem em profiles | `id` UUID string; referenciado por profiles, owner, payments e logs | unique username via `ensureUniqueUserIndexes`; role partial unique `SUPER_ADMIN`; createdAt | `users`. Manter bcrypt hash sem rehash/texto puro; normalized username unique; `SUPER_ADMIN` global; não guardar segredo de sessão. `_id` separado de `id` |
| `students` | `id`, `userId`, `name`, `phone`, `dateOfBirth`, `goal`, `trainerId`, `measurements[]`, `ownerAdminId`, `active`, `createdAt`, `updatedAt`, `deletedAt` | `userId` aponta para `users.id`; `trainerId` aponta para professor; `measurements` é array embedded | `userId` unique, `trainerId`, `createdAt` | `students` + `body_measurements`. Cada item de `measurements[]` vira row filha; determinar chaves/unidades antes do DDL |
| `trainers` | `id`, `userId`, `name`, `cref`, `ownerAdminId`, `active`, `createdAt`, `updatedAt`, `deletedAt` | `userId` aponta para `users.id`; alunos/fichas apontam para professor | `userId` unique, `createdAt` | `trainers`; manter vínculo de aluno e escopo tenant sem excluir histórico |
| `exercises` | `id`, `name`, `nameKey`, `muscleGroup`, `equipment`, `description`, `instructions`, `active`, `createdAt`, `updatedAt`, `createdBy`; main/API remota também usa `primaryMuscles`, `secondaryMuscles`, `difficulty`, `category`, `gifUrl`, `imageUrl`, `videoUrl`, `mediaAttribution`, `mediaSourceUrl`, `executionTips`, `contraindications` | `id` UUID usado por `workouts.exercises.exerciseId` e `workout_history.exerciseId` | unique `nameKey`, `muscleGroup`, `createdAt` | `exercises`; arrays de músculos podem ser JSON inicial ou tabelas filhas; preservar URLs/licenças; mídia não é dado de exemplo |
| `workout_plans` | `id`, `studentId`, `trainerId`, `name`, `objective`, `objectiveDetails`, `level`, `observations`, `frequency`, `startDate`, `endDate`, `active`, `createdAt`, `updatedAt`, `deletedAt` | student→users/profile; trainer→users; days em `workouts` | student+createdAt/updatedAt, trainer+createdAt/updatedAt, updatedAt, createdAt | `workout_plans`; soft delete; datas civis sem timezone; owner/tenant se o dado existir |
| `workouts` | `id`, `workoutPlanId`, `name`, `order`, `dayOfWeek`, `isRestDay`, `description`, `observations`, `archived`, `createdAt`, `updatedAt`; array `exercises[]` | `workoutPlanId`→plan; prescriptions referem `exerciseId` | plan+order, `exercises.exerciseId`, createdAt | `workouts` + `workout_exercises`; manter ordem, dia, descanso e exercício vinculado |
| `workout_history` | `id`, `studentId`, `workoutId`, `exerciseId`, `sets[]` (`series`, `repetitions`, `load`), `date`, `observations`, `createdAt`; `workoutName` aparece em caminho de preservação histórica | student, workout, exercise; uma linha representa registro de exercício executado, não há entidade de sessão confirmada | student+date, workout+date, exercise+date, createdAt | `workout_history` + `workout_history_sets`; `workoutName` snapshot se presente; não inventar session/pause state |
| `audit_logs` | `id`, `userId` (em alguns fluxos pode ser ator sistema), `action`, `resource`, `resourceId`, `timestamp`, `metadata` | ator user pode ser string de sistema (`billing-system`, `payment-provider`); recurso/id polimórfico | user+timestamp, resource+resourceId+timestamp; main indica TTL para timestamp | `audit_logs`; ator tipado/nullable e actor key para manter sistemas; metadados JSON válido; validar política de retenção |
| `billing_plans` | `id`, `name`, `slug`, `description`, `billingPeriod`, `billingModel`, `monthlyPriceCents`, `annualPriceCents`, `includedStudents`, `extraStudentPriceCents`, `includedTeachers`, `extraTeacherPriceCents`, `studentMonthlyPriceCents`, `studentAnnualPriceCents`, `discountCents`, `discountPercent`, `platformFeePercent`, `dueDay`, `noticeDays`, `graceDays`, `restrictAfterDays`, `blockAfterDays`, `allowStudentRevenueOffset`, `offsetPercent`, `offsetCapCents`, `active`, `createdAt`, `updatedAt` | plan id→subscriptions/invoices | slug unique; active+updated | `billing_plans`; preços/offset em centavos; percent decimal precisa escala/precisão aprovada |
| `subscriptions` | `id`, `accountUserId`, `accountRole`, `ownerAdminId`, `planId`, `billingPeriod`, `status`, `startAt`, `nextDueAt`, `discountCents`, `createdAt`, `updatedAt`, `cancelledAt`, `cancelledBy`; alguns flows aceitam `perpetual`, `test`, `weekly`, `bimonthly` na versão remota | account user→users; plan→plans; invoice→subscription; owner/tenant | unique parcial accountUserId se status ACTIVE; status+nextDueAt; owner+status | `subscriptions`; status `ACTIVE/PAUSED/CANCELLED` observado no snapshot, mas validar todos os períodos da versão oficial |
| `invoices` | `id`, `subscriptionId`, `payerUserId`, `ownerAdminId`, `planId`, `periodKey`, `currency`, `dueAt`, `status`, componentes calculados `baseCents`, excedentes, desconto, taxa, multa/juros, receita/abatimento/crédito, `finalAmountCents`, `paidAt`, `paymentMethod`, `providerPaymentId`, `paymentAttemptId`, `cancelledAt`, `cancelledBy`, timestamps; `accountRole` é referenciado em agregações | subscription, payer, plan, payment attempts | subscription+period unique; status+dueAt; payer+createdAt | `invoices`; colunas de dinheiro INTEGER cents; `period_key` `YYYY-MM`; status explícito e `currency`; `accountRole` verificar persistência |
| `payments` | `id`, `invoiceId`, `subscriptionId`, `payerUserId`, `provider`, `method`, `amountCents`, `currency`, `status`, `activeAttempt`, `idempotencyKey`, `providerPaymentId`, `checkout` mínimo, `paidAt`, `createdAt`, `updatedAt` | invoice, subscription, payer; Asaas external payment ID | invoice+createdAt; providerPaymentId unique sparse; invoice unique partial activeAttempt | `payments`; unique parcial ativa em SQL; checkout JSON restrito e sem cartão/CVV |
| `payment_webhooks` | `id`, `provider`, `providerEventId`, `eventType`, `status`, `payloadHash`, `receivedAt`, `processedAt`, `lockExpiresAt`, `workerToken`, `retryAt`, `invoiceId`, `paymentId`, `payoutId`, `outcome`, `reviewReason` | referência pode ser nula até conciliação | providerEventId unique; receivedAt | `payment_webhook_events`; `workerToken`/lock temporários; id externo unique, payload raw não deve ser copiado por padrão |
| `billing_rules` | `id='global'`, `currency`, `dueDay`, `noticeDays`, `graceDays`, `restrictAfterDays`, `blockAfterDays`, `lateFeePercent`, `dailyInterestPercent`, `platformFeePercent`, `allowStudentRevenueOffset`, `offsetPercent`, `offsetCapCents`, `creditCarryover`, `updatedAt`, `updatedBy` | config singleton global no código observado | id unique | `billing_rules`; manter singleton e defaults sem convertê-los em política por tenant sem aprovação |
| `access_blocks` | `id`, `userId`, `source`, `status`, `level`, `invoiceId`, `reason`, `startsAt`, `endsAt`, `createdBy`, `releasedBy`, `releasedAt`, `ipAddress`, `createdAt`, `updatedAt` | user/invoice | user+status; unique parcial user/source automatic active; level+startsAt | `access_blocks`; soft release/expire e índices parciais; `ipAddress` é dado pessoal, avaliar retenção |
| `financial_ledger` | `id`, `accountUserId`, `invoiceId`, `providerEventId`, `paymentId`, `payoutId`, `type`, `amountCents`, `createdBy`, `createdAt`, credited/fee values e referência externa onde payout | IDs financeiros distintos; referência evento e payout | account+createdAt; invoice; event unique sparse; payout unique sparse | `financial_ledger`; append-only; dinheiro em INTEGER cents; preserve atores sistema e evento externo |
| `payment_provider_config` | `id='global'`, `provider`, `environment`, `methods` (pix/boleto/card), `updatedAt`, `updatedBy` | configuração global; secrets não estão nesta collection | id unique | `payment_provider_config`; flags/métodos em tabela/colunas, nunca API key/token |
| `payment_provider_customers` | `id`, `provider`, `environment`, `userId`, `providerCustomerId`, `createdAt` | user→users; customer id externo por ambiente | provider+environment+user unique; provider+environment+providerCustomerId unique | `payment_provider_customers`; unicidade dos dois pares; CPF/CNPJ não deve ser migrado porque adapter documenta que não é persistido |
| `payment_payouts` | `id`, `provider`, `paymentId`, `invoiceId`, `payerUserId`, `amountCents`, `currency`, `externalReference`, `externalTransferId`, `status`, `creditedAmountCents`, `transferFeeCents`, `sourceEventId`, `createdAt`, `updatedAt`, `completedAt` | payment/invoice/payer e Asaas transfer | provider+payment unique; status+createdAt; externalTransferId unique sparse | `payment_payouts`; net/fee cents; um payout no máximo por pagamento |
| `auth_attempts` | `key`, `expiresAt`; código de rate limit usa chave com username normalizado/IP e counter/expiração a validar | sem user FK garantida: key pode não apontar a usuário existente | key unique; TTL expiresAt | `auth_attempts`; preservar key e contador encontrados, index unique; TTL vira job de expurgo explícito |
| `notifications` | `id`, `userId`, `dedupeKey`, `type`, `channel`, `invoiceId`, `title`, `message`, `readAt`, `createdAt` | user/invoice opcional | user+createdAt; dedupeKey unique sparse; main tem TTL para lidas | `notifications`; dedupe parcial e limpeza temporal conforme retenção validada |

## 2. Collections extras na linha Turso remota

| Collection adicional | Evidência e campos conhecidos | Tratamento proposto |
| --- | --- | --- |
| `workout_templates` | Está em `domainCollections.training`; índices `updatedAt`, `active+updatedAt`, `deletedAt` com TTL 30 dias. UI remota usa `name`, `objective`, `level`, `active`, `days[]`; demais campos exigem inspeção do SHA/produção | Mapear para `workout_templates`, `workout_template_days`, `workout_template_exercises`; preservar TTL/soft-delete após política |
| `app_settings` | Está em `domainCollections.accounts`; o `models.js` cria marker `system:exercise-catalog-seed-v1` com `seededAt`. Outros conteúdos não foram confirmados | `app_settings(id, ...)` somente após inventário de keys e valores; não descartar marker nem dados de workspace |

## 3. Tipagem e regras de conversão

- `Date` de Mongo deve virar UTC consistente; adapter histórico codifica Date como JSON tag com milliseconds. Migrador relacional deve extrair valores para a coluna UTC escolhida e manter data civil separada.
- Boolean Mongo→INTEGER 0/1 com CHECK. Campos ausentes não devem virar `false`, zero ou string vazia sem regra; manter NULL/flag explícita.
- `id` UUID de app permanece. Converter ObjectId apenas quando for `_id` legado; documentar map e medir colisões. Não substituir UUID por auto-increment.
- `passwordHash` é bcrypt hash e move byte-a-byte/texto; nunca senha simples.
- Decimal dinheiro nunca usa `REAL`/floating point; converter para cents por validação e comparar valor original antes de gravar.
- `measurements[]`, `workouts.exercises[]`, `workout_history.sets[]` e `workout_templates.days[]` viram tabelas filhas, preservando a posição (`sort_order`/`set_number`) e JSON residual apenas para chaves não mapeadas na fase de transição.
- Campos de mídia são URLs/atribuição, não blobs; manter origem/URL/ID e evitar download/rehost. Confirmar campos existentes no Mongo real por count de chave antes de DDL.
- `metadata`, event payloads e checkout: persistir apenas o que o código armazena e sanitizar segredo/PII; `JSON` é usado só para conteúdo semi-estruturado, não para substituir relações.

## 4. Índices/constraints a preservar

Fonte Mongo cria índices listados em `lib/models.js` e em main `domainCollections`. Recriar suas semânticas com índices SQL únicos/parciais. Exemplos críticos:

- `users.username` unique normalizado e `role='SUPER_ADMIN'` partial unique.
- `students.userId`, `trainers.userId` unique.
- `exercises.nameKey` unique.
- `invoices(subscriptionId, periodKey)` unique.
- `payments(providerPaymentId)` unique quando não nulo e no máximo um `activeAttempt` por `invoiceId`.
- `payment_webhooks(providerEventId)` unique.
- `payment_provider_customers(provider,environment,userId)` e external customer únicos.
- `payment_payouts(provider,paymentId)` e `externalTransferId` únicos.
- `access_blocks` automático ativo único por usuário.
- `financial_ledger.providerEventId/payoutId` unique quando informados.
- auth dedupe/notification dedupe.

TTL conhecidos no `main` remoto: audit logs timestamp ~30d; notifications `readAt` date ~30d; workout templates `deletedAt` date ~30d; `auth_attempts.expiresAt` TTL Mongo. O snapshot aberto local não mostra todos esses TTL; checar se estavam configurados em produção e decidir retenção/expurgo SQL antes da migração. Não omitir retenção silenciosamente.

## 5. Dados e relações a reconciliar antes de copiar

1. Quatro domínios Mongo em `0e3e4cf` (`accounts`, `exercises`, `training`, `finance`) podem apontar a quatro URIs, com `MONGODB_URI` fallback. Descobrir quais estão usados sem exibir valores.
2. Fazer counts por collection/tenant, IDs duplicados, documentos sem `id`, `_id` type, arrays e refs órfãs.
3. A collection `academies` não está nas 21; `ownerAdminId` é o vínculo de tenant observado. Não inferir academia id a partir de nome/URL; construir mapping de owner admin→tenant com revisão humana.
4. O `SUPER_ADMIN` é proprietário global e distinto de admin academy; não vincular ao tenant por padrão.
5. Prescrições e histórico referenciam exercise IDs; não apagar/excluir exercícios legados que estejam em fichas históricas.
6. Financial refs usam UUIDs internos e provider IDs externos separados; manter namespace e ambiente do Asaas.
7. O estado atual de dados em Turso não foi consultado; usar DB de destino novo/vazio sob autorização e export/backup Mongo verificado.
