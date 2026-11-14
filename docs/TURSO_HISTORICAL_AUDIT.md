# Auditoria Histórica do Turso

**Data da auditoria:** 2026-11-13  
**Escopo:** código e histórico remoto; sem conexão com bancos, sem migration, sem instalação e sem alteração de aplicação.  
**Decisão:** Turso/libSQL é o destino oficial desta missão. O runtime Mongo visto no workspace deve ser tratado como estado a migrar, não como requisito arquitetural final.

## 1. Resultado executivo

O commit `0e3e4cff670b290b3cc023e5a449772a86890d35` (“feat: migrate database runtime to Turso”) contém uma implementação funcional de **compatibilidade documental Mongo-like sobre libSQL**, não um schema relacional de domínio. O código troca o provider em `lib/mongodb.js` por `@libsql/client`, preserva chamadas de aplicação como `database.collection(...).findOne(...)`, cria quatro tabelas genéricas SQL e oferece uma cópia batch Mongo→Turso com `--dry-run`/`--resume` e um marcador.

Há prova de operações básicas no `file::memory:` por dois testes automatizados, mas não há prova de uso real contra Turso remoto, execução dos serviços completos sobre libSQL, desempenho ou migração de dados de produção. `package.json` e `package-lock.json` incluem `@libsql/client`, porém **o package ainda contém `mongodb`** para a ferramenta de origem/migração. O teste não faz integração com endpoints, Asaas ou volumes reais.

`main` remoto no momento da auditoria está em `771958d46754a10f7443ebdff92a931c63ef1352`, descendente de `0e3e4cf`; o compare API mostra `0e3e4cf` como um dos oito commits exclusivos de `2041188...main`. O histórico de `lib/mongodb.js` lista a migração Turso em 2026-11-01 como mudança mais recente desse arquivo; `lib/turso-document-store.cjs` tem somente a introdução no commit. Ou seja, a implementação não foi removida em `main`, mas tampouco recebeu evolução aparente no adapter após o commit original.

## 2. Branches e snapshot de trabalho

### Remoto GitHub observável

| Ref remota | SHA observado | Relação com `main` | Leitura técnica |
| --- | --- | --- | --- |
| `main` | `771958d46754a10f7443ebdff92a931c63ef1352` | HEAD remoto consultado; commit de domínio | Contém runtime Turso e as correções posteriores de mídia |
| `feat/animated-exercise-demos` | `c037f219c4d8c5a79c6277124621c8a13a80a82d` | 3 commits à frente/11 atrás | Implementação antiga de animações; antecessora de ajustes de matching/CSP |
| `feat/videos-exercicios` | `1b9912f45fa8ffbb98aaabedacc2ca9b7e7b0eb9` | 4 à frente/12 atrás | Player iframe/URL para YouTube, Vimeo e arquivos; não contém evolução Turso |
| `fix/exercise-animation-matching` | `592bff9a539f595175ab47969895e2ddc75c235e` | 1 à frente/10 atrás | Matching intermediário, superado por main e sem migração de banco |
| `fix/exercise-animation-rendering-v2` | `ce4932aca065945d8b549a8922686018d11a3cc1` | 1 à frente/9 atrás | Correção pontual de frame/matching, sem progresso no banco |

As quatro branches temáticas têm merge base anterior à atualização de banco, divergem e são antigas. Nenhuma é base preferível para o runtime Turso. A comparação identificou base `e26b22e` para o branch de vídeos; o branch de animações usa base `a2b3fa8`; os branches de matching/renderização partem da linhagem de animação anterior. Não fazer merge/cherry-pick sem comparar commits individualmente.

### Checkout virtual aberto

A workspace é `vscode-vfs://github/rhuanspablo025-blip/Sistema-de-treino-`. O terminal está em `C:\Users\Usuario`, não no repositório, e `C:\Users\Usuario\source\repos` foi encontrado vazio na etapa anterior. O GitKraken não retornou workspaces; tentativa anterior de `git log` usando o URI falhou porque `chdir vscode-vfs://...` não é um diretório do Windows. Assim, **branch local, SHA local, staged/unstaged e outros untracked não são verificáveis nesta sessão**.

Evidência do conteúdo, não substituto de `git status`: a árvore aberta contém `lib/mongodb.js` com `MongoClient`/`MONGODB_URI`, `package.json` sem `@libsql/client`, scripts de bootstrap Mongo, `.env.example` Mongo e README Mongo. A versão remota atual contém os componentes Turso abaixo. Não atribuir a árvore aberta ao SHA `2041188` sem leitura de `.git`/SCM no checkout real.

Arquivos documentais conhecidos criados na etapa anterior do agente: `FRONTEND_REDESIGN_AUDIT.md`, `EXERCISE_MEDIA_AUDIT.md`, `ASAAS_TECHNICAL_AUDIT.md`, `DESIGN_SYSTEM_PROPOSAL.md`, `NEW_FRONTEND_ARCHITECTURE.md`, `IMPLEMENTATION_ROADMAP.md`, `REGRESSION_PROTECTION.md`. Nenhum commit foi feito; a classificação Git (tracked/untracked/staged) é desconhecida pela mesma limitação VFS. Eles foram escritos sob uma decisão anterior de manter Mongo e ficam **superados pela decisão atual**; não foram alterados nesta tarefa porque o proprietário limitou a escrita a seis documentos específicos.

## 3. Linha histórica relevante

| Data/commit | Evidência | Efeito |
| --- | --- | --- |
| `20411886feb8bc2b4f32a7708fff96f81a61600c` (2026-10-31) | Pai direto de `0e3e4cf`, PR #4 “Fix animation frame paths…” | Base Mongo anterior, com catálogo e correções de mídia |
| `0e3e4cff670b290b3cc023e5a449772a86890d35` (2026-11-01) | 16 arquivos, 1169 adições/337 remoções; diff acessível no GitHub | Troca runtime para libSQL/Turso, storage de compatibilidade, cópia Mongo, mudança de sessão e bootstrap |
| `0b8914f654bbf06acdd02d55345be6a9a2be2654`, `fcd20c67d84d5432e57cf0600ff48fef1e065c9b`, `97d9e9fd7f6218424a6d3f7fc4b1cf51150fe6fd`, `9d4e402678bf2d35e92b386bd95d0c9373e285bf`, `3163bdc762681687ae9fca9b885dd4910e1fdd44`, `ee5c3f5060348a990be2504c7b21eaf3fb7d38a6` | Commits posteriores no `main` | Endurecem CSP/matching, carregamento de frames e vídeos/licenças; não alteram o adapter Turso |
| `771958d46754a10f7443ebdff92a931c63ef1352` (2026-11-13) | HEAD remoto atual | Redirecionamento de domínio; mantém a linha Turso do main |

Não há commit subsequente conhecido que substitua o document store por SQL normalizado. O plano atual deve aproveitar o cliente, configurações de conexão, encoding de datas, transações e ferramenta de import como referência, mas não declarar a camada Mongo-compatível como o schema SQL final.

## 4. Componentes introduzidos pelo commit `0e3e4cf`

| Arquivo | Finalidade | Estado em `main` | Reaproveitamento/limite |
| --- | --- | --- | --- |
| `package.json` | Adiciona `@libsql/client ^0.18.0`, script `migrate:mongodb-to-turso`, altera build para `node scripts/migrate-on-build.js && next build`, fixa Next em `^16.4.3` | Presente no main | Cliente é reaproveitável; build com side-effect de migração não é política recomendada para cutover final. Mongo permanece dependência porque script importa os clusters de origem |
| `package-lock.json` | Resolve `@libsql/client 0.18.0`, transitive `libsql 0.5.29`, plataformas nativas e Next 16.4.3 | Presente no main | Reutilizar lockfile apenas na branch oficial e após compatibilidade de runtime |
| `.env.example` | `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SESSION_SECRET` e URIs Mongo de origem | Presente no main | Variáveis de runtime ficam server-side; nunca divulgar valores reais |
| `lib/mongodb.js` | Fachada `getDatabase(domain)` sobre `createClient`; valida config; inicializa um state global por URL/token; `getMongoClient` passa a devolver a fachada compatível | Presente no main e alterado só em `0e3e4cf` conforme histórico do arquivo | Reaproveitar o padrão de cliente/sessão; renomear internamente depois da transição, não antes. API de domínio continua Mongo-like |
| `lib/turso-document-store.cjs` | Implementa `collection`, queries, updates, projeções, cursor, metadados de índice, sessão e transações sobre tabelas JSON | Presente no main; arquivo só nasceu em `0e3e4cf` | Reaproveitar para ambiente de compatibilidade/validação e extração de documentos, não como desenho relacional definitivo |
| `lib/models.js` | Move domínio/coleções/índices para lista `domainCollections`, mantém seeds e inicialização de coleções ao adapter | Presente no main | Reaproveitar inventário de collections/indexes/defaults; converter cada constraint para DDL real |
| `lib/session.js` | Deixa de derivar chave de sessão de `MONGODB_URI`; exige `SESSION_SECRET` com pelo menos 32 bytes | Presente no main | Reaproveitar segredo estável server-side; cutover invalida JWT antigos se chave mudar, exigir estratégia explícita de sessão/relogin |
| `scripts/migrate-mongodb-to-turso.js` | Cópia por domínio, cursor Mongo batch 250, inserts libSQL em lotes até 100, dry-run e resume | Presente no main | Reaproveitar como referência/prova de mapeamento e ferramenta de snapshot, após adicionar validação/checksum/relational importer. Não executado |
| `scripts/migrate-on-build.js` | Se `TURSO_MIGRATE_FROM_MONGO=true`, executa migration durante build com `--resume` | Presente no main; chamado pelo script build | Não reaproveitar no release definitivo: build não deve conectar/alterar produção nem ser o gatilho da migração |
| `scripts/create-admin-user.js`, `scripts/create-dev-user.js`, `scripts/setup-super-admin.js` | Mudam bootstrap para `getDatabase()` e config Turso | Presentes no main | Reaproveitar após testar contra SQL de domínio, unique constraints e transações; `getMongoClient` falso nome é dívida |
| `app/api/auth/login/route.js` | Converte erro ausente de Mongo para config Turso/SESSION_SECRET | Presente no main | Mensagem deve continuar sem revelar URL/token; testar ausência de variável |
| `tests/turso-document-store.test.cjs` | Testa adapter com `@libsql/client` em `file::memory:` | Presente no main, introduzido em `0e3e4cf` | Único teste específico encontrado; serve como baseline do adapter, não como validação real Turso ou relational schema |
| `vercel.json` | Define build command `npm run build` | Presente no main | No estado do commit, isso dispara script build; rever a operação de release separadamente antes de cutover. Nenhum ajuste feito |
| `README.md` | Documenta configuração Turso e estratégia Mongo→Turso | Presente no main | Informa que dados continuam como documentos JSON; documentação deve ser atualizada só após arquitetura aprovada |

## 5. SQL efetivamente criado

`initializeSchema(client)` executa DDL idempotente para quatro tabelas, sem migrations versionadas para o schema da aplicação:

```sql
CREATE TABLE turso_collections (
  name TEXT PRIMARY KEY
);
CREATE TABLE turso_documents (
  collection TEXT NOT NULL,
  id TEXT NOT NULL,
  document TEXT NOT NULL CHECK (json_valid(document)),
  PRIMARY KEY (collection, id)
);
CREATE TABLE turso_indexes (
  collection TEXT NOT NULL,
  name TEXT NOT NULL,
  keys TEXT NOT NULL,
  options TEXT NOT NULL,
  PRIMARY KEY (collection, name)
);
CREATE TABLE turso_migrations (
  migration_key TEXT PRIMARY KEY,
  completed_at TEXT NOT NULL,
  counts TEXT NOT NULL
);
```

Essas tabelas não modelam `users`, `students`, `invoices` etc. como colunas/relacionamentos SQL; `document` é JSON serializado. A única constraint de dados efetiva no SQL é a chave composta `(collection,id)` e a validade JSON. A tabela `turso_indexes` guarda descrição de índices Mongo, não cria `CREATE INDEX` nas chaves JSON e não cria foreign keys. A tabela `turso_migrations` registra o cutover da cópia, não é uma ferramenta geral de migrations DDL.

## 6. API de compatibilidade e operação

O adapter suporta, no código encontrado: `find`, `findOne`, `countDocuments`, `insertOne`, `insertMany`, `updateOne`, `updateMany`, `findOneAndUpdate`, `replaceOne`, `deleteOne`, `deleteMany`, `createIndex`, `listIndexes`, `dropIndex`, `createCollection`, `listCollections`, `command({ping:1})`, cursor `sort/limit/toArray/hasNext/next` e `startSession().withTransaction()`.

Filtros e update operators são implementados em JavaScript sobre JSON. O adapter carrega todos os documentos da collection (`SELECT document ... WHERE collection=?`) e filtra/sorta/projeta no processo Node. `limit` acontece depois da leitura. `createIndex` persiste JSON do índice em `turso_indexes`; unicidade é verificada por varredura no app, sem constraint SQL nos campos nem proteção robusta contra escrita concorrente. Índices TTL viram metadados, sem expiração SQL automática.

**Gap comprovado no código aberto:** `app/api/body-measurements/route.js` e `app/api/workout-exercises/route.js` usam `updateOne(..., { arrayFilters: [...] })`. `TursoCollection.updateOne` encaminha `options.session`, mas `applyUpdate` não implementa `$[item]`/`arrayFilters`; as atualizações aninhadas não estão preservadas. O teste do adapter só cobre `$push` e `$pull` simples, não `arrayFilters`.

Outras lacunas de compatibilidade: sem `aggregate`, sem funções SQL/repos reescritos, sem FKs, sem `EXPLAIN`/índices de consulta, sem prova de Query API completa; dados BSON como `ObjectId` e `Date` são convertidos, mas tipo BSON não coberto (por exemplo Decimal128/Binary) precisa inventário. Nenhum `arrayFilters` ou branch de operação equivale a teste end-to-end da aplicação.

## 7. Ferramenta de cópia Mongo→Turso

`migrate-mongodb-to-turso.js`:

- Lê `MONGODB_URI_ACCOUNTS`, `MONGODB_URI_EXERCISES`, `MONGODB_URI_TRAINING`, `MONGODB_URI_FINANCE`; fallback `MONGODB_URI`; database fixo `sistema_treino`.
- Requer `TURSO_DATABASE_URL` e, exceto `file:`, `TURSO_AUTH_TOKEN`; origem usa `MongoClient` com pool 4 e timeout de seleção 10s.
- `--dry-run` percorre origem e conta docs; só mede contagem no destino se `turso_documents` já existe. Não executa validação de payload/campos, checksum, FK ou comparação completa origem/destino.
- Run normal cria schema, pula se `mongodb-to-turso-v1` já estiver gravado; recusa destino já não vazio sem `--resume`.
- `--resume` permite retomar em destino não vazio e usa `ON CONFLICT(collection,id) DO UPDATE`, logo sobrescreve os documentos com mesmo id conforme snapshot atual da origem.
- Converte ObjectId reconhecível em hex string; se faltar `id`, deriva `id` de `_id`; rejeita documento sem ambos.
- Insere batches de até 100 statements; percorre cursor batch size 250; não tem checkpoint de coleção/posição, transação de migração global, checksum, snapshot de consistência ou CDC/delta sync.
- Após copiar, chama `initializeDatabase` por domínio (pode seedar catálogo/defaults/preencher metadados) e só então registra marcador/contagens.

**Conclusão:** ferramenta idempotente para repetir cópia documental em destino dedicado, não plano comprovado de zero downtime nem migração para tabelas relacionais. O `--dry-run` não demonstra que o cutover é seguro. `migrate-on-build.js` e build script tornam possível acionar efeito de banco no ambiente de build; não usar isso como procedimento de produção sem reengenharia e aprovação.

## 8. O que funciona / incompleto / reaproveitável

### Funciona no escopo testado pelo commit

- Cliente libSQL inicializado com URL/token server-side e cacheado no processo.
- Criação idempotente de tabelas SQLite/libSQL e facade Mongo-like.
- Serialização JSON com tag para Date; ObjectId com `toHexString` convertido a string.
- CRUD comum, filtros/projeção/ordenação no processo, unique precheck sequencial e transação de escrita.
- Cópia de collections em batches com IDs preservados/convertidos e marcador; bootstrap atualizado.
- Teste de duas situações no DB local em memória: filtros/projeção/date/index/upsert/session/array push/pull e seed idempotente.

### Não comprovado / não pronto como arquitetura final

- Nenhum SQL normalizado, FK, índices SQL por access pattern, migration framework ou search/pagination server-side sobre SQL.
- Não há prova de teste Turso remoto, conexão da Vercel, `TURSO_DATABASE_URL`, migração real, estado de dados ou validação de backup.
- Não há validação de todas as rotas/services, Asaas/webhooks ou concorrência no adapter.
- `arrayFilters` não implementado, embora usado pelo código Mongo atual.
- FKs, TTL e unicidade concorrente não são equivalentes ao Mongo. Bulk parallel operations/atomic constraints não foram comprovadas.
- Imports `mongodb` ainda necessários para a migração; `MongoClient` não some do runtime do package até retirar o importer.

### Reaproveitar

1. `@libsql/client` e a configuração server-only como ponto de conexão.
2. Conversão testada de dates e IDs como referência de transformação, após ampliar os tipos BSON.
3. Contrato `domainCollections`, nomes de coleção, campos, índices e defaults de `models.js` como inventário fonte.
4. Migração one-shot como ferramenta de extração se modificada para export/validation e depois import relacional separado.
5. Teste `file::memory:` como teste de adapter legado, mantendo-o identificado como compatibilidade, não schema final.
6. Separação de ambiente Turso e segredo de sessão; planejar invalidar sessão antiga ou manter estratégia segura explícita.

## 9. Estado da implementação no workspace aberto e limitação

O código aberto visível continua chamando `MongoClient` em `lib/mongodb.js`; `package.json`/lock têm driver Mongo e sem `@libsql/client`; há bootstrap Mongo. Isso contrasta com `main@771958d`, onde `lib/mongodb.js` instancia `createClient` e delega a `turso-document-store.cjs`. A VFS não expõe branch/HEAD/working-tree metadata nesta sessão; portanto, não é tecnicamente correto dizer qual commit local está aberto ou quais documentos da sessão são staged/untracked.

**Nenhuma conexão com Mongo ou Turso, nenhum comando de migration e nenhum teste foram executados nesta auditoria.**
