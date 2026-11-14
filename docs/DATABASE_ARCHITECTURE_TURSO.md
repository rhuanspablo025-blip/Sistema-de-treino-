# Arquitetura Relacional Alvo para Turso/libSQL

**Status:** proposta de desenho, sem DDL aplicado.  
**Destino oficial:** Turso/libSQL.  
**Fonte de requisitos:** Mongo collections/código aberto, `lib/models.js`/serviços no snapshot observado e `domainCollections`/commit de migração no remoto. Campos sem evidência não são presumidos.

## 1. Conclusão do desenho atual

O adapter de `0e3e4cf` é uma etapa transitória de compatibilidade, não uma arquitetura relacional adequada como estado final: armazena cada documento completo como JSON em `turso_documents`, com índice de chave primária `(collection,id)`. Não há foreign keys, `CHECK` por domínio, índices SQL por consultas, versionamento DDL nem consulta paginada no servidor. O novo schema deve transformar as relações que o backend já usa em chaves explícitas.

## 2. Convenções SQL sugeridas

- IDs públicos existentes permanecem `TEXT` com o valor UUID atual. Não gerar outro ID nem remapear referências. Mongo `_id` só serve de fallback quando o documento não tem `id`; manter um mapa `collection + old _id -> id` no importador e reportar colisões.
- Datas/timestamps em `INTEGER` UTC epoch milliseconds (ou padronizar `TEXT` ISO-8601 UTC se uma decisão de compatibilidade preferir legibilidade; escolher uma única representação antes do DDL). Datas civis `startDate`, `endDate`, `periodKey` ficam `TEXT` ISO `YYYY-MM-DD` / `YYYY-MM` e não devem passar por timezone.
- Boolean em `INTEGER NOT NULL CHECK (value IN (0,1))`.
- Dinheiro em `INTEGER` centavos e moeda como `TEXT` limitada ao domínio; usar `BRL` onde o código já fixa BRL.
- Strings de JSON só como `TEXT CHECK(json_valid(...))` para conteúdo realmente flexível/externo; não encapsular entidades relacionais novamente em documentos JSON.
- `PRAGMA foreign_keys=ON` por conexão; confirmar que o driver/libSQL efetivamente aplica a configuração por conexão e testar cascade/restrict. Preferir `ON DELETE RESTRICT` e inativação lógica; não usar cascade para histórico ou ledger.
- Não criar FKs entre tenants sem incluir `tenant_id` nas chaves compostas. A aplicação também filtra por tenant e role.
- Índices devem refletir queries observadas; validar com `EXPLAIN QUERY PLAN` e fixtures de volume real. `UNIQUE` e partial unique em índices SQL, nunca precheck em JS como único mecanismo.
- Uma tabela `schema_migrations(version, checksum, applied_at)` separada do marcador `turso_migrations` da cópia histórica; DDL versionado e transacional, sem executar durante `next build`.

## 3. Tenant/academy

Não há collection `academies` explícita na lista de 21 do usuário nem no snapshot Mongo de 21. O código usa `ownerAdminId` como vínculo de administrador a membros/estudantes e identifica aluno por `trainerId`; o conceito é, portanto, implícito e não deve ser apresentado como tenancy robusto sem teste.

Proposta para fechar a lacuna antes do schema definitivo:

- Criar `academies`/`tenants` somente depois de aprovação do modelo: `id TEXT PRIMARY KEY`, `owner_user_id TEXT UNIQUE NOT NULL REFERENCES users(id)`, estado/timestamps técnicos; nome/logo/configuração só se localizar campo real em settings.
- Backfill inicial de `tenant_id` derivado por mapping explícito do `ownerAdminId` para admin/conta da academia; não inventar academia para cada professor/aluno sem consultar `ownerAdminId`, `role`, relações e registros órfãos.
- `SUPER_ADMIN` é global e deve ter `tenant_id NULL`, não virar ADMIN de academia. Ações cross-tenant ficam em services autorizados e auditados.
- Se não for seguro inferir tenant de um registro legado, colocar em relatório de quarentena e bloquear cutover daquele registro, sem atribuir a tenant arbitrário.

## 4. Tabelas relacionais propostas

O mapeamento detalhado por collection está em `MONGODB_TO_TURSO_MAPPING.md`. Esquema lógico inicial (colunas entre colchetes só após confirmação de que o campo existe):

### Identidade e operação

- `academies(id, owner_user_id, created_at, updated_at, ...)` — entidade explícita de tenant proposta; pode exigir backfill/decisão de nome e settings.
- `users(id, tenant_id, username, name, password_hash, role, active, session_version, owner_admin_id, created_at, updated_at, deleted_at)`; `username_normalized UNIQUE`, role restrita a papéis existentes; índice parcial para único `SUPER_ADMIN` conforme regra.
- `students(user_id PK/FK, tenant_id, name, phone, date_of_birth, goal, trainer_id, active, created_at, updated_at, deleted_at)`.
- `trainers(user_id PK/FK, tenant_id, name, cref, active, created_at, updated_at, deleted_at)`.
- `app_settings(id PK, payload_json, updated_at, ...)` somente para settings que realmente existam no `main`; não expandir `payload_json` sem mapear o uso.
- `auth_attempts(key PK, failure_count/fields confirmados, expires_at)`; verificar a forma exata em `login-rate-limit.js` antes do DDL.
- `notifications(id PK, user_id, dedupe_key, type, channel, invoice_id, title, message, read_at, created_at)` com dedupe única e cleanup para política TTL confirmada.

### Exercícios e treinamento

- `exercises(id PK, name, name_key UNIQUE, muscle_group, equipment, description, instructions, active, created_by, created_at, updated_at, primary_muscles_json?, secondary_muscles_json?, difficulty?, image_url?, gif_url?, video_url?, media_attribution?, media_source_url?, execution_tips?, contraindications?)`. Campos opcionais só quando confirmados no snapshot de produção/branch oficial. Em uma normalização posterior, músculos/tags podem virar tabelas próprias se query demandar.
- `workout_plans(id PK, tenant_id, student_id FK, trainer_id FK, name, objective, objective_details, level, observations, frequency, start_date, end_date, active, created_at, updated_at, deleted_at)`.
- `workouts(id PK, tenant_id, workout_plan_id FK, name, day_of_week, sort_order, is_rest_day, description, observations, archived, created_at, updated_at)`.
- `workout_exercises(id PK, tenant_id, workout_id FK, exercise_id FK, sort_order, sets, repetitions, load, rest_seconds, time_seconds, method, observations, created_at, updated_at)`; unique `(workout_id, sort_order)` se a regra atual confirmar ordenação sem repetições.
- `workout_history(id PK, tenant_id, student_id FK, workout_id FK, exercise_id FK, performed_at, observations, workout_name_snapshot?, created_at)`; preservar `workoutName` quando usado para histórico ao remover treino.
- `workout_history_sets(id PK, workout_history_id FK, set_number, repetitions, load, ...)` normaliza array de sets atual; `load` é medida decimal, não moeda.
- `body_measurements(id PK, tenant_id, student_id FK, measured_at, measurements atuais em colunas/unidades verificadas, created_at, updated_at)` para separar `students.measurements[]`; antes inventariar todas as chaves/unidades e manter limites de histórico (há código que conserva até 100 entradas).
- `workout_templates(id PK, tenant_id, name/objective/level/active/deletedAt/updatedAt conhecidos no histórico, ...)`, `workout_template_days`, `workout_template_exercises`; coleção existe na `main` remota e não na lista de 21 do snapshot local. Confirmar forma/campos no SHA oficial antes de modelar.

### Financeiro/Asaas

- `billing_plans(id PK, slug UNIQUE, name, description, billing_period, billing_model, monthly_price_cents, annual_price_cents, included_students, extra_student_price_cents, included_teachers, extra_teacher_price_cents, student_monthly_price_cents, student_annual_price_cents, discount_cents, discount_percent, platform_fee_percent, due_day, notice_days, grace_days, restrict_after_days, block_after_days, allow_student_revenue_offset, offset_percent, offset_cap_cents, active, created_at, updated_at)`.
- `subscriptions(id PK, tenant_id, account_user_id FK, account_role, owner_admin_id, plan_id FK, billing_period, status, start_at, next_due_at, discount_cents, created_at, updated_at, cancelled_at, cancelled_by)`; unique parcial `(account_user_id) WHERE status='ACTIVE'` conforme índice Mongo.
- `invoices(id PK, tenant_id, subscription_id FK, payer_user_id FK, owner_admin_id, plan_id FK, period_key, currency, due_at, status, amount components in cents, paid_at, payment_method, provider_payment_id, payment_attempt_id, cancellation fields, created_at, updated_at)`; unique `(subscription_id, period_key)`.
- `payments(id PK, tenant_id, invoice_id FK, subscription_id FK, payer_user_id FK, provider, method, amount_cents, currency, status, active_attempt, idempotency_key UNIQUE, provider_payment_id, checkout JSON minimal/non-sensitive, paid_at, created_at, updated_at)`; unique parcial para uma tentativa ativa por invoice; provider ID único onde presente.
- `payment_webhooks(id PK, provider, provider_event_id UNIQUE, event_type, status, payload_hash, received_at, lock_expires_at, processed_at, retry_at, invoice_id FK NULL, payment_id FK NULL, payout_id FK NULL, outcome, review_reason)`; guardar hash/metadata mínimo, não corpo/segredo sem necessidade explícita.
- `billing_rules(id PK, currency, due_day, notice_days, grace_days, restrict_after_days, block_after_days, late_fee_percent, daily_interest_percent, platform_fee_percent, allow_student_revenue_offset, offset_percent, offset_cap_cents, credit_carryover, updated_at, updated_by)`; código seed usa `id='global'`.
- `access_blocks(id PK, tenant_id, user_id FK, source, status, level, invoice_id FK NULL, reason, starts_at, ends_at, created_by, released_by, released_at, created_at, updated_at)`; unique parcial para um bloqueio automático ativo por usuário.
- `financial_ledger(id PK, tenant_id, account_user_id FK/nullable, invoice_id FK, payment_id?, payout_id?, provider_event_id?, type, amount_cents, created_by, created_at, metadata mínima)`; não deletar/editar lançamentos; unique parcial provider event/payout.
- `payment_provider_config(id PK, provider, environment, methods_json, updated_at, updated_by)`; secrets permanecem env e nunca nessa tabela.
- `payment_provider_customers(id PK, provider, environment, user_id FK, provider_customer_id, created_at)`; unique `(provider, environment, user_id)` e `(provider, environment, provider_customer_id)`.
- `payment_payouts(id PK, tenant_id, payment_id FK, invoice_id FK, payer_user_id FK, provider, amount_cents, currency, external_reference, external_transfer_id, status, net/fee cents, source_event_id, created_at, updated_at, completed_at)`; unique `(provider,payment_id)` e `external_transfer_id` quando presente.

## 5. Constraints, tenant e deletes

- FKs de cadastro em treino/financeiro usam `ON DELETE RESTRICT`; histórico, transações, pagamentos, webhook e ledger permanecem imutáveis e apontam para IDs estáveis. “Excluir usuário” permanece soft-delete/inactive.
- Prescrições podem referenciar exercício global. Se catálogo é compartilhado, não exigir `tenant_id` do exercício; se existir exercício privado, adicionar owner de forma compatível depois de auditar permission API.
- Aplicar tenant scope em users/students/trainers/plans/workouts/history/billing account; relacionar por `(tenant_id,id)` quando entidades por academia forem explicitamente segregadas.
- Admin de academia não vê `SUPER_ADMIN` nem dados de outro tenant. Professor filtra estudantes ligados. Aluno vê só os próprios registros. `SUPER_ADMIN` global é role especial, não valor numérico de permissão.
- Identificar e resolver órfãos, referências quebradas, `_id`/`id` inconsistentes e username colidido em relatório; sem exclusão automática.

## 6. Consultas e índices

Recriar semanticamente, em SQL, os índices do `lib/models.js` no SHA final. Base no snapshot de 21:

- Users: username normalizado único; `created_at`; índice parcial único para role SUPER_ADMIN.
- Students: `user_id` único, `(tenant_id, trainer_id, active)`, `created_at`.
- Trainers: `user_id` único, tenant.
- Exercises: `name_key` único, `muscle_group`, active/name.
- Workout plans: `(tenant_id, student_id, created_at/updated_at)`, `(tenant_id, trainer_id, created_at/updated_at)`.
- Workouts: `(workout_plan_id, sort_order)`, e índice de exerciseId na tabela filha.
- History: `(tenant_id, student_id, performed_at DESC)`, `(workout_id, performed_at)`, `(exercise_id, performed_at)`.
- Audit: `(actor_id, timestamp DESC)` e `(resource, resource_id, timestamp DESC)`; TTL/retention apenas após política confirmada.
- Billing: slug único, active/updated; subscriptions conta/status/next due/owner; invoices subscription+period unique e status+due; payments provider ID unique e invoice+active partial; webhook event unique/received; customer mapping uniques; payout uniques; ledger account/time, invoice, event, payout; auth attempts key unique/expiry; notifications user/time/dedupe.

Os nomes/ordem dos índices são baseados no Mongo e devem ser ajustados ao plano real SQL. O histórico de Mongo pode ter índices TTL para logs/notifications/templates; verificar diferenças do schema entre os 21 collections do workspace e `domainCollections` do main, antes de definir retenção.

## 7. Consultas, writes e transações

- Parametrizar toda query; não montar `IN` com valores concatenados.
- Criação de usuário+perfil, criação de ficha+dias, criação de invoice+ledger+notification, checkout attempt+invoice, processamento webhook e payout+ledger devem ser transações libSQL conforme grupos de consistência atuais.
- Tratar idempotência por `UNIQUE` no banco e `INSERT ... ON CONFLICT`/seleção de retorno; o app-level `assertUnique` do adapter não substitui constraint.
- Consultas atuais usam filtro/sort/limit de collections; ao reescrever, mover `WHERE`, `ORDER BY`, cursor pagination e joins para SQL. Evitar carregar todas as rows para aplicar filtros em JS.
- Transações de dado em um único Turso DB diferem dos clusters Mongo por domínio. Auditar que updates não precisam de consistência cross-domain e medir custo/latência no DB alvo.

## 8. Migrations e compatibilidade

- DDL incremental versionado com checksum e rollback forward; backup e validação antes de executar qualquer script.
- `turso_documents` pode continuar durante etapa curta de import/dual-read apenas se for deliberado e monitorado; não manter duas fontes finais de verdade.
- Mapear fonte→destino e contagem/checksum por collection; migrar em tabelas staging ou usar destino novo, nunca overwrite de DB que já contém dados sem aprovação.
- `turso_migrations` atual é marcador de import `mongodb-to-turso-v1`; não reutilizar como schema versioning.
- Depois do import, importar/normalizar em transação por lote; preservar IDs, timestamps, senha bcrypt, status, URL/licença, valores em centavos e relações.
