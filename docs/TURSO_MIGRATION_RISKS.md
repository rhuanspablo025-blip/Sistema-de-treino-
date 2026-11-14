# Riscos da Migração MongoDB Atlas → Turso/libSQL

**Status:** análise para aprovação; não houve conexão, escrita ou migration.  
**Premissa:** Turso é destino oficial; Mongo é a fonte de dados do workspace aberto até que migração validada prove o contrário.

## Matriz de riscos

| Risco | Probabilidade / impacto | Evidência | Mitigação e gate |
| --- | --- | --- | --- |
| Baseline incorreto: workspace virtual atual diverge da `main` remota e não expõe HEAD/dirty files | Alta / Crítico | VFS não pode ser `git -C`; terminal está fora do repo; local mostra `lib/mongodb.js` e package Mongo; GitHub main `771958d` é Turso | Suspender código de migração até clone/status branch SHA; preservar mudanças locais; assinar SHA alvo e trabalhar em branch limpa somente após autorização |
| Declarar `0e3e4cf` migration relacional completa | Alta / Crítico | `turso_documents` tem coluna JSON, adapter emula Collection; não há FKs/índices SQL de domínio | Reusar como bridge/test, desenhar SQL real com DDL versionado; não marcar cutover concluído por funcionar em memória |
| Corrupção/perda de registros no copy/upsert | Média / Crítico | Script grava em batches 100, `--resume` faz `ON CONFLICT DO UPDATE`, no build pode executar migration; sem checksum/FK reconcile no script | Backup consistente + restore drill; destino novo; `dry-run` read-only revisado; conflito interrompe; importer versionado com checkpoints/checksums; retirar migração de build antes do cutover |
| Dupla fonte/ambiguidade de autoridade | Média / Crítico | `--resume` sobrescreve same IDs; não há dual-write/outbox documentado | Manter uma única fonte de escrita por fase; freeze/change log; deltas idempotentes e reconciliáveis; não fazer dual-write sem outbox |
| Dados BSON/ID incorretos | Média / Alto | Migrador converte ObjectId de `_id`, mantém `id` se existe e serializa JSON com Date tag; outros tipos BSON sem cobertura | Snapshot de tipo/shape por collection; mapear `_id`/id e colisões; valor/fecha/bytes com checksums; quarantine+reporte; preservar UUID |
| Integridade referencial/permissões cross-tenant | Alta / Crítico | Mongo não declara FKs; tenancy baseada em `ownerAdminId`, `trainerId`; não há collection academy nas 21 | Auditar owner e órfãos; modelar tenant mapping revisto; FKs compostas e auth negative tests; não associar usuário automaticamente |
| Unique/index emuladas no processo e race | Alta / Crítico | `turso_indexes` guarda keys/options; unicidade checada em JS via full scan, sem `UNIQUE` SQL nas colunas | Constraints SQL reais, partial unique, transactions, 2+ writer concurrency tests; corrigir username, webhooks, active attempt e provider IDs antes de import |
| Compatibilidade incompleta do adapter Mongo | Alta / Alto | Código atual usa `arrayFilters` em duas APIs; adapter não implementa; adapter sem aggregate e query scanning em memória | Characterization tests de todos os operadores/chamadas; adapter bridge temporário; reescrever serviços em SQL repos; comparar output antes/depois |
| Full scan e performance/custo em Turso | Alta / Alto | Adapter faz `SELECT document WHERE collection=?`, filtra/projeta/ordena em JS; `limit` acontece pós scan | SQL normalizado com índices/paginação; benchmark com volume real sintético; query plans; p95/p99 e conexão Vercel/Turso; limites do tier aprovados |
| Transação ou consistência parcialmente aplicada | Média / Crítico | Session compatível usa transação libSQL de write; writes simples também abrem transação; unique check pode ser varredura; operações cross-domain precisam ser reavaliadas | Definir limites ACID, transações por caso; testes de rollback/serialização/lock/timeout; atomicity em invoice/webhook/payout/user-profile |
| Migração financeira cents/status | Média / Crítico | Asaas usa centavos, external IDs, status, tentativa ativa, webhook IDs, ledger e bloqueios; script atual copia JSON, sem validação financeira detalhada | Totais por status/period/currency, invariantes invoice↔payment↔webhook↔ledger, centavos inteiros e unique externo; processar sandbox eventos duplicados/out-of-order |
| Liberação de acesso sem evento confiável | Baixa após controle / Crítico | Pagamento é liberado pelo webhook reconciliado; mover para SQL pode enfraquecer idempotência | Nunca confiar em redirect checkout; token de webhook, unique event e reconciliação em transação SQL; cutover gate exige teste sandbox confiável |
| Adaptação incompleta do Asaas | Alta / Crítico | Adapter permanece consumindo collection API; customer mapping, billing, checkout, webhook, payout dependem da facade | Não reescrever provider; migrar repositories de persistence; contract tests e environment isolation; sandbox real e rollback aprovado |
| Perda de compatibilidade de senha/sessão | Média / Alto | Turso commit troca `SESSION_SECRET` derivado de Mongo por secret estável exigido de 32 bytes; rotacionar invalida JWT | Preservar bcrypt hash; decidir session strategy; janela de relogin comunicada; teste de login, versão, logout e rate limit antes da escrita |
| Secrets expostos ou variáveis faltantes | Baixa / Crítico | `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SESSION_SECRET`; build script chama migration baseado em env | Server-only secrets; scopes por ambiente; não imprimir secrets; scan repo/log/build; validar ausência produz erro sanitizado; nenhum token NEXT_PUBLIC |
| Alteração de seeds sobrescreve catálogo real | Média / Crítico | models inicializa seeds e no main usa marker/metadata seed; após migration inicialização ocorre depois da cópia | Inventariar seed marker, IDs, count; importer nunca executar seed sobre dados reais sem política; preservação de IDs/URLs/licença e FK check |
| Divergência por queries que filtram em JS | Alta / Alto | Compatibility store replica Mongo operators e paginação local; dashboard pode carregar muitos documentos | Reescrever SQL com where/order/limit no servidor; golden API tests; query plans e perf tests. Não utilizar adapter em endpoints de alto volume como destino permanente |
| TTL/retention não preservada | Média / Alto | Main Mongo indexes contêm TTL para audit, notifications, templates, auth_attempts; SQL adapter só registra metadados | Definir políticas por dado e retenção legal/operacional; jobs explícitos idempotentes; relatórios pré/pos; sem apagar automaticamente durante migração |
| Falha no rollback após Turso write | Média / Crítico | Rollback a Mongo sem delta perde writes após cutover; script apenas copy Mongo→Turso | Ensaiar rollback antes do release; freeze/maintenance window, change log/outbox, importar delta de volta; após Turso writes, bloquear split-brain e exigir reconciliação |
| Limites de DDL e chave estrangeira no libSQL/Turso | Média / Alto | Adapter não define FKs nem normaliza; limite/branch/config do DB não foi testado | Validar capabilities e flags `foreign_keys` na versão real; teste remoto sandbox; migrar schema em etapas/versionamento; medir write concurrency e transaction size |
| Histórico de mídia perde metadados/licenças | Média / Alto | Campos `videoUrl`, `gifUrl`, `imageUrl`, `mediaAttribution`, `mediaSourceUrl` existem no main/history, embora local schema simples não | Source/production count e checksums de URLs; migration mapping de campos unknown; não rehost; player/wger/source smoke em cada origem |
| Branches de mídia antigas confundidas com baseline | Média / Médio | 4 refs remotas são diverged e antigas; `feat/videos-exercicios` tem iframe/YouTube/Vimeo, `main` tem wger/Flow/licensing | Usar main como base remota Turso, revisar histórico de media em refs sem merge; não importar código branch sem diff/test/approval |
| Contagem de arquivos dependentes incompleta por índice de workspace | Média / Médio | Busca da VFS teve 116 ocorrências de getDatabase/Mongo em 25 arquivos e 241 `.collection` matches em 22 arquivos; tools truncam results | Gerar em clone local relatório via `rg`; aplicar code search completo em cada API, script, teste e provider antes da primeira mudança |
| Estado de dados/produção não verificado | Alta / Crítico | Sem banco, secrets ou endpoint de dados acessado nesta auditoria | Distinguir “código preparado” de “migração executada”; só aprovar cutover com autorização read-only/backup, relatório, checksums e sign-off |
| Build side effect de migração | Média / Crítico | `package.json` remoto executa `migrate-on-build.js` antes de `next build`; flag Turso pode chamar copy em ambiente de build | Nunca ativar em prod nesse estágio; alteração futura separar deploy/migration; build CI sem DB writable; confirmar flag ausente e testar |
| Concurrency e idempotência no job de billing | Média / Alto | Invoice unique subscription+period ajuda, mas job/cutover não tem lock global provado | SQL unique plus lock/job record atomically; test double cron, retry e duplicate webhook; verificar próxima cobrança e bloqueio não duplicados |

## 1. Garantias de preservação

- Snapshot original Mongo com metadata/índices e backup nativo fora do repo; cópia de teste restaurada.
- Migration de somente leitura/dry-run conta cada origem e valida schema, IDs, references e totals antes de qualquer escrita.
- Destination Turso inicial em database isolado; não apontar production antes de reconciliação e aprovação.
- Hash/recount de documentos fonte e linhas destino, mais invariantes de domínio por tabela/tenant; hashes não substituem checagem de relações/dinheiro.
- Relatório de erros/órfãos com decisão humana; mover documentos para staging/quarentena sem apagar original.
- Registro de checkpoint por coleção/batch com checksum, idempotency key e estado; não depender apenas de uma flag “complete”.
- Teste de restore Mongo e Turso e plano de revert/forward delta; preservar Mongo read-only após cutover por prazo aprovado.
- Reconciliação Asaas com referências externas, IDs de customer/payment/transfer, cents, currency, statuses, webhooks, ledger e bloqueio.
- Nenhuma credencial real no Git e nenhum log de URL, token, CPF ou payload bruto.

## 2. Critérios de stop/go

**STOP** se: branch/SHA desconhecido; backup falha; contagens diferem; IDs/relações sem política; unique conflicts; schema/Turso limits sem teste; `arrayFilters`/operação necessária não coberta; teste Asaas webhook/idempotency não passa; queda/performance excede limite; rollback não ensaiado.

**GO** somente quando: dono aprova versionamento/schema/policies; backup restaurável; importer auditado; zero discrepâncias sem decisão; testes de auth/tenant/workout/mídia/financeiro passam; sandbox Asaas validado; métricas de desempenho e limites atendidos; janela/canary/rollback assinados.

## 3. Limitações desta auditoria

Não há acesso a working-tree Git real, branch local, `.env`, MongoDB Atlas, Turso, Vercel settings ou Asaas account; não se afirmam contagens de dados, credential validity, migration production status ou deployment health. As recomendações de risco dependem de inventário autorizado antes da execução.
