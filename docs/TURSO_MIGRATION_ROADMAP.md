# Roadmap Seguro MongoDB Atlas → Turso/libSQL

**Status:** plano para aprovação; nenhuma fase executada.  
**Alvo:** Turso é o banco oficial e definitivo.  
**Não incluído nesta auditoria:** conexão a bancos, snapshot, install, DDL, migration, deploy, branch switch ou cutover.

## Princípios de cutover

1. O baseline de código deve ser `main@771958d46754a10f7443ebdff92a931c63ef1352` somente após conferir o checkout Git real; não presumir que a VFS aberta corresponda a esse SHA.
2. Recuperar e testar `lib/turso-document-store.cjs` como ponte de compatibilidade; schema final é relacional e explícito, não `turso_documents` como destino permanente.
3. Mongo permanece fonte de verdade até snapshot íntegro, import relacional verificado, smoke tests, Asaas sandbox e autorização explícita de cutover.
4. Migração nunca roda em `next build`, `postinstall`, bootstrap ou request HTTP. O build remoto no commit histórico chama `scripts/migrate-on-build.js`; remover esse efeito somente em uma mudança aprovada de código antes da fase operacional, sem executar migration nesta auditoria.
5. Rollback para Mongo exige escrita interrompida ou dual-write controlado e journal de delta; não apontar a aplicação para um snapshot antigo depois de aceitar escrita nova no Turso.

## Fase 0 — Baseline e autorização

**Atividades:**

- Abrir checkout Git físico do projeto, identificar `git rev-parse HEAD`, `git status --short --branch`, branches locais/remotas e arquivos staged/unstaged/untracked.
- Comparar o conteúdo da workspace com `main@771958d` e `0e3e4cf` sem checkout; preservar arquivos de documentação já criados.
- Fixar um SHA de código, obter aprovação do dono do produto e registrar versão Node/Next/libSQL.
- Revisar `.env` nomes sem imprimir valores e separar Mongo origins, Turso sandbox e produção.
- Validar autorização para leitura/export Mongo e criação de Turso temporário; definir responsáveis e janela de manutenção.

**Gate de saída:** branch/SHA e worktree conhecidos, backup owner, destino de teste e rollback definidos. Nenhuma escrita de banco nesta fase.

## Fase 1 — Recuperar adapter e criar suíte de compatibilidade

**Reaproveitar:** `lib/turso-document-store.cjs`, `lib/mongodb.js` da linha Turso, `tests/turso-document-store.test.cjs`, `scripts/migrate-mongodb-to-turso.js` apenas como referência/export.

**Trabalho:**

- Executar testes atuais do adapter em ambiente isolado `file::memory:` depois de obter a árvore do SHA selecionado; não confundir local SQLite/libSQL com teste remoto Turso.
- Adicionar characterization tests para cada operação Mongo efetivamente usada pela aplicação: filtros, projeções, arrays, `arrayFilters`, update operators, `findOneAndUpdate`, `replaceOne`, índices parciais, sessão/transação, datas e valores BSON.
- O snapshot local usa `arrayFilters` em medidas e exercícios; o adapter remoto não suporta esse argumento. Corrigir essa incompatibilidade antes de tentar full app, ou substituir operations por repositórios relacionais planejados.
- Criar testes de query contract para `users`, auth, workout plan, history, dashboard, invoice/payment/webhook e payout.
- Provar rollback de transação em exceção e integridade sob duas escritas simultâneas; adapter em memória sequencial não basta.
- Isolar `getMongoClient` nominal e uso direto de `database.collection` para identificar pontos que ainda exigem API Mongo.

**Gate:** cobertura das APIs/operadores correntes, sem conexão à produção; lista dos métodos não cobertos e plano de substituição aprovado.

## Fase 2 — Inventário e backup de dados Mongo

**Atividades read-only primeiro:**

- Identificar os clusters reais (`accounts`, `exercises`, `training`, `finance`) via nomes de variáveis, sem imprimir valores; `0e3e4cf` tem `MONGODB_URI_ACCOUNTS`, `MONGODB_URI_EXERCISES`, `MONGODB_URI_TRAINING`, `MONGODB_URI_FINANCE` e fallback `MONGODB_URI`.
- Contar documentos por collection em cada DB; capturar índices efetivos, validators, collection options, tamanho, min/max timestamps e dados que parecem legacy.
- Mapear o BSON de todos os campos, inclusive array subdocuments, `ObjectId`, Date, ObjectId embutidos, Decimal128/Buffer se houver, null/ausente e chaves adicionais.
- Contar IDs em duplicidade, ausência de `id`, usernames normalizados conflitantes, referências órfãs entre cada relação, inconsistências de owner/tenant e pagamentos sem webhook/ledger.
- Inventariar campos/URLs/licenças de exercícios e mídia; não baixar nem rehostear arquivos.
- Exportar snapshot consistente nativo/lógico criptografado, armazenar fora do repo e testar restauração em ambiente isolado; documentar contagens e hashes. Não registrar secrets ou dados pessoais no Git/docs.

**Gate:** backup restaurável e contagem aprovada; gaps/órfãos classificados com decisão de retenção.

## Fase 3 — Fechar o modelo de dados e schema versionado

- Aprovar `DATABASE_ARCHITECTURE_TURSO.md`/`MONGODB_TO_TURSO_MAPPING.md`, nomes de tabelas/colunas, tipo de tenant, políticas de FK/soft delete/retention.
- Resolver academy/tenant: código atual usa `ownerAdminId`, não existe `academies` nas 21 collections do snapshot. Criar tabela/mapping apenas após decisão e relatório de órfãos.
- Modelar tabelas filhas para `workout.exercises[]`, `history.sets[]`, `students.measurements[]` e `workout_template.days[]` se a collection existir no baseline; preservar ordem e IDs de itens embedded quando houver.
- Definir cents `INTEGER`, timestamps UTC, campos opcionais, enum/status, foreign keys, índice parcial e unique constraints SQL.
- Escrever migrations incrementais, version/checksum, SQL de rollback/forward e testes com banco efêmero. `turso_migrations` do adapter é marcador único da cópia, não esquema de versionamento.
- Prever `schema_migrations`, version checks, proteção de rollback incompatível e seeds determinísticos somente para defaults que não sobrescrevem dado.

**Gate:** DDL revisado por arquitetura, segurança, financeiro e responsável por dados; nenhum preço/política comercial é inventado.

## Fase 4 — Prova dos repositórios SQL e transações

- Implementar conexão server-only via `@libsql/client`, pool/reuso conforme plataforma, timeout/retry limitado e health-check sem segredos.
- Construir repository/service SQL por domínio, sem manter Mongo operators nos services finais.
- Priorizar transações consistentes: usuário+profile, ficha+dias+auditoria, invoice+ledger+notification, payment attempt+invoice, webhook+payment+invoice+block+ledger+subscription, payout+ledger.
- Implementar Prepared/parameterized statements; paginação por cursor/limit e queries com índice; validar `EXPLAIN QUERY PLAN`.
- Testar FK on/off behavior, cascades proibidos, conflict handling, unique constraints concorrentes, timeout/rollback, serialization/retry e idempotência.
- Não declarar repo pronto se apenas `file::memory:` passa; exigir conexão a Turso sandbox com fixture não sensível e identidade do ambiente verificada.

**Gate:** teste de persistência SQL por domínio e transação crítica aprovada.

## Fase 5 — Importer relacional, não execução do script histórico

`migrate-mongodb-to-turso.js` atual importa documentos em JSON e, com `--resume`, faz upsert por `(collection,id)`; não importa para as tabelas normalizadas propostas. Ele não deve ser executado para “completar SQL” sem ser refeito.

**Importador alvo deve:**

- Aceitar origem em read-only, destino Turso temporário novo/isolado e mapping versionado.
- Ter `--dry-run` sem escritas; reportar por tabela/collection contagem esperada, campos faltantes, IDs/relações órfãs, conflitos e amounts.
- Exportar source snapshots com resume checkpoints próprios, armazenar `migration_run_id` e origem/snapshot ID; batches transacionais com tamanho medido.
- Manter IDs, `id` e mapping de `_id`; inserir parents antes de children; mapear owner→tenant; arrays para child tables mantendo ordem, value e timestamp; bcrypt hash byte-exato; media URLs intactas.
- Não executar seeds sobre IDs reais nem `ON CONFLICT DO UPDATE` sem política; conflito interrompe e exige reconciliação. Retry de batch deve ser idempotente pela key estável e checksum.
- Criar controles para counts, checksums determinísticos normalizados por ID/colunas, somas financeiras por estado/period/currency, invariantes (FK checks, uniqueness, amounts), distribuição por tenant, contagem de mídia e ledger.
- Revalidar destino após close/reopen; exportar relatório de migration sem PII.

**Gate:** relatórios source/destination iguais para contagens e invariantes; zero perda ou exceções assinadas pelo dono.

## Fase 6 — Reescrever serviços/API por domínio

Ordem proposta para reduzir blast radius:

1. Config, connection, schema health e repository contracts.
2. Auth: `users`, login/register/logout, username uniqueness, migration legacy usernames, session JWT/`SESSION_SECRET`, audit attempts, rate limiting, role guards.
3. Profiles/tenant: students/trainers/academy mapping, permissões e isolamento cross-tenant.
4. Exercises/media fields mantendo origem/licença; API search/import wger não altera mídia já persistida.
5. Workout plans, days, templates, exercise prescriptions e soft archive/history preservation.
6. Workout-history e body measurements, child arrays e pagination.
7. Audit log, notifications e retention/cleanup.
8. Billing read paths/calculator/rules/plans/subscriptions/invoices/blocks/ledger.
9. Asaas adapter permanece; adaptar apenas repository/persistence/transaction boundaries no `finance-service`, webhook e payout com contrato externo congelado.
10. Admin dashboards e demais relatórios usam query SQL tenant-scoped.
11. Bootstrap scripts e cron passam para Turso e só executam ações explicitamente; no build apenas validar, nunca migrar.

Cada domínio roda com feature flag de leitura no ambiente de teste; API response contracts comparados com golden fixtures. Evitar dual-write sem ledger de retry/reconciliação.

## Fase 7 — Asaas: preservar e adaptar persistência

- Congelar contrato/payload do provider, ambientes e eventos; nunca retransmitir segredo.
- Introduzir repositories SQL para customer mapping, invoice, payment, webhook event, ledger, block e payout.
- Idempotência com unique DB constraints e transação; `PROCESSING` lock é claim condicional atômico, concorrência testada; fazer query de provedor quando resultado externo incerto e manter revisão manual conservadora.
- Não confirmar pagamento com redirect do browser; apenas webhook autenticado e evento conciliado/consulta oficial.
- Reconciliar cada evento por provider ID, externalReference, customer, invoice, payer, cents, method, currency e estado permitido.
- Sandbox real com eventos controlados/fixtures assinados, retry e duplicação; acompanhar status/histórico/ledger/bloqueio após evento.
- Preservar cálculo em centavos e separar assinatura SaaS vs cobrança do aluno; não alterar preço, carência ou estado de assinatura sem decisão de negócio.

**Gate:** bateria financeira no sandbox e aprovação do responsável financeiro; produção permanece Mongo/sem cutover até a autorização.

## Fase 8 — Shadow read e regressão comparativa

- Em ambiente de staging, importar snapshot para Turso e servir leitura paralela em endpoints não-mutadores; comparar valor de retorno de Mongo e Turso depois de normalização definida.
- Reconciliar contagens e invariantes por collection/tabela, tenant/role, estados, datas, money, links de exercício, mídia, faturas, payments, eventos e ledger.
- Exercitar todos os testes de papéis, IDOR/cross-tenant, alunos, fichas, execução, medidas, cobrança e Asaas.
- Testar volumes comparáveis à produção, cold start, conexão, latency p50/p95/p99, query plans, tamanho do JSON/fan-out e limites do Turso.
- Fazer E2E e browser visual nos 3 roles + SUPER_ADMIN; confirmar sem dados sintéticos misturados.
- Validar backup e restore Turso; RTO/RPO e limites de negócio.

**Gate:** sign-off de QA, produto, segurança e proprietário; sem divergência não explicada.

## Fase 9 — Cutover coordenado e rollback

1. Definir janela, responsáveis, comunicação e freeze de mudanças no Mongo.
2. Fazer backup final/consistent export; executar import final com relatório e checksums.
3. Rodar validação de relações, dinheiro e login sem abrir tráfego.
4. Configurar somente os secrets Turso no ambiente alvo, sem valor em repo/build output.
5. Deploy com traffic gate/feature flag e health/read-only smoke; ativar escrita Turso somente após aprovação.
6. Se dual-read possível, manter Mongo read-only e comparar durante período curto. Evitar dual-write livre; se necessário, usar outbox/change log com replay/idempotência e reconciliation.
7. Se falha antes de aceitar write: voltar read traffic para Mongo e preservar Turso para análise. Se falha após write Turso: não voltar silenciosamente a Mongo; congelar writes, exportar delta Turso e reconciliar/replicar de volta com procedimento previamente ensaiado.
8. Cancelar cutover se faltar backup, verificar status de pagamentos, ou mismatch; nunca apagar Mongo ao fim da janela.
9. Manter Mongo offline/read-only por retenção e auditoria acordadas. Só desprovisionar após reconciliação, restore test, período de estabilidade e aprovação escrita.

## Fase 10 — Remoção definitiva do Mongo

Após Turso ter sido runtime estável e migration declarada concluída:

- Retirar `mongodb` dependency e código de import só quando não houver `MongoClient` nem script/ops pendente.
- Retirar `getMongoClient`, compat collection API e `turso_documents`/legacy store depois que todos consumers e dados estiverem migrados/retidos.
- Atualizar scripts admin/dev/superadmin, cron, health checks, docs, CI, Vercel/env e backup runbook.
- Verificar por busca que não existem `mongodb`, `MongoClient`, `MONGODB_URI*`, `.collection()` Mongo, `$set`, operadores Mongo, ou scripts de origem em runtime. Imports históricos devem ficar apenas em ferramenta de arquivo/backup isolada se aprovado.
- Rodar `npm ci`, suite completa, build, E2E, bundle audit, scan de secrets, checks Turso e Asaas, smoke de todas as rotas.
- Fazer plano de decommission/retention separado; nenhuma exclusão de Mongo automática.

## Ordem de teste e artefatos

1. Unit tests de mappers/schema converter + adapter tests atuais.
2. Integration tests dos repositories contra Turso temporário.
3. Migration dry-run e audit report; validação por checksum.
4. Auth/authorization/tenant negative tests.
5. Treino, mídia, history/measurements regressions.
6. Finance contract, provider unit mocks, webhook integration e sandbox Asaas.
7. Load/performance, query plan, restore, E2E roles, visual regression.
8. Release/canary and rollback drill.

Artefatos: aprovação de schema; mapa `old collection/document id -> SQL IDs`; relatório source/target; checksum; eventos financeiros reconciliados; backup/restore test; métricas de performance; cutover/rollback runbook; checklist de Mongo dependency removal.
