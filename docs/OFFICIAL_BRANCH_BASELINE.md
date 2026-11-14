# Baseline Oficial de Branch e SHA

**Data de consulta ao remoto:** 2026-11-13  
**Repositório remoto observado:** `rhuanspablo025-blip/Sistema-de-treino-`  
**Escopo:** ler refs/commits e árvore, sem checkout/reset/merge/rebase/cherry-pick.

## 1. Recomendação

**Base remota recomendada para iniciar a migração, condicionada a sincronizar/verificar a workspace: `main` em `771958d46754a10f7443ebdff92a931c63ef1352`.**

Justificativa:

- É HEAD remoto do `main` consultado, commit de 2026-11-13.
- O histórico contém `0e3e4cff670b290b3cc023e5a449772a86890d35` e os commits posteriores de segurança/mídia; não houve revert do runtime Turso nessa linha.
- GitHub compare mostra `20411886feb8bc2b4f32a7708fff96f81a61600c` (commit base com código Mongo e correção de animações) como ancestral de `main`; `main` está 8 commits à frente, sem commits de `2041188` exclusivos em relação ao main.
- `lib/mongodb.js` no `main` importa `createClient` de `@libsql/client`, obtém `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN`, e inicializa `turso-document-store.cjs`. A lista de histórico do arquivo identifica `0e3e4cf` como a mudança Turso mais recente. O `package.json` remoto registra `@libsql/client ^0.18.0`, `libsql 0.5.29` lockado e script de migração.
- O commit mais recente é domínio-only; não substitui a migração nem altera o adapter.

**Ressalva de estabilidade:** esse é o melhor baseline de código remoto observado, não prova de migration executada, banco conectado, integridade de dados ou teste end-to-end. O adapter é uma fachada JSON/Mongo-like, e o trabalho de normalização relacional permanece. Não iniciar produção apenas por selecionar este SHA.

## 2. Refs remotas observadas

| Branch | SHA | Relação com `main@771958d` | Motivo para não ser base de banco |
| --- | --- | --- | --- |
| `main` | `771958d46754a10f7443ebdff92a931c63ef1352` | HEAD remoto | Única ref consultada na linha mais recente e com código Turso |
| `feat/animated-exercise-demos` | `c037f219c4d8c5a79c6277124621c8a13a80a82d` | `ahead_by=3`, `behind_by=11`; merge base `a2b3fa899253853d821f8e91bbac50bd52a462ee` | Branch de mídia anterior, pré-Turso; matcher/asset loader é superado |
| `feat/videos-exercicios` | `1b9912f45fa8ffbb98aaabedacc2ca9b7e7b0eb9` | `ahead_by=4`, `behind_by=12`; merge base `e26b22ebb3a3a8a2d90f5ac6aa06ebd71e27a3ad` | Experimentos de vídeo YouTube/Vimeo/iframe, pré-Turso, divergiu |
| `fix/exercise-animation-matching` | `592bff9a539f595175ab47969895e2ddc75c235e` | `ahead_by=1`, `behind_by=10`; merge base `644df432873c66830c5a46f86b9a0a7cfd3cf281` | Matching anterior, sem implementação de banco |
| `fix/exercise-animation-rendering-v2` | `ce4932aca065945d8b549a8922686018d11a3cc1` | `ahead_by=1`, `behind_by=9`; merge base `34c4f4a810c92b6eb3e8989b6c972414d94e75c5` | Correção específica de animação; não acrescenta banco |

GitHub API retornou `protected: false` para as refs consultadas. Branches antigas contêm trabalho de mídia útil para histórico, mas não devem substituir a linha Turso do main; revisar commits individualmente se for necessário recuperar comportamento de UI.

## 3. Situação do commit de migração

`0e3e4cff670b290b3cc023e5a449772a86890d35`:

- Mensagem: `feat: migrate database runtime to Turso`; autoria 2026-11-01.
- Pai: `20411886feb8bc2b4f32a7708fff96f81a61600c`.
- Mudança: 16 arquivos, 1169 adições/337 remoções conforme página do commit.
- HEAD atual `771958d` descende de `0e3e4cf`; compare de `2041188...main` retorna 8 commits à frente, 0 atrás, status `ahead`.
- Não foi encontrado revert do adapter Turso em main; `main/lib/mongodb.js` tem código libSQL atual.
- Após `0e3e4cf`, os commits `0b8914f`, `fcd20c6`, `97d9e9f`, `9d4e402`, `3163bdc`, `ee5c3f5` reforçam mídia/CSP/matching. O `main` também possui o commit mais novo `771958d` de domínio.

## 4. Árvore local e working tree

**Não foi possível determinar** branch local, HEAD local, branches locais, status de index/worktree, staged changes ou untracked files. A raiz fornecida ao agente é a URI virtual `vscode-vfs://github/...`, que não pode ser passada como `-C` ao Git de Windows; o terminal está em `C:\Users\Usuario`; o diretório físico `C:\Users\Usuario\source\repos` foi observado vazio; GitKraken não retornou workspace. Não fazer inferência de SHA local a partir de conteúdo parecido.

A árvore de arquivos aberta é diferente da árvore remota main: inclui Mongo `lib/mongodb.js`, `package.json` sem `@libsql/client`, ausência de `lib/turso-document-store.cjs` e scripts de bootstrap diretamente Mongo. Isso pode ser branch/snapshot mais antigo ou workspace VFS sem sincronização; para decidir, abrir um clone/check-out Git normal e rodar `git status --short --branch`, `git rev-parse HEAD`, `git branch -avv` e `git diff --stat` manualmente antes da implementação. Nenhum desses comandos foi executado porque não havia path Git físico.

### Alterações conhecidas nesta conversa

A sessão anterior do agente criou sete documentos do redesign que permanecem fora dos seis documentos solicitados agora e descrevem a decisão antiga de Mongo. Os nomes são listados em `TURSO_HISTORICAL_AUDIT.md`; por restrição explícita, não foram atualizados. A etapa atual cria somente os seis documentos TURSO nomeados pelo usuário. **Tracked/untracked/staged não verificado.** Preservar todas essas alterações até que o proprietário solicite um tratamento explícito.

## 5. Arquitetura identificada no remoto

No `main@771958d`:

- Runtime DB usa Turso/libSQL no servidor. A fachada ainda é chamada `lib/mongodb.js`, exporta `getDatabase` e um `getMongoClient` compatível; não instancia `MongoClient` para runtime.
- `mongodb` permanece no package por `scripts/migrate-mongodb-to-turso.js` (origem); a lista de dependências sozinha não significa Mongo runtime.
- Collections e índices continuam descritos em `lib/models.js`; persistência em quatro tabelas genéricas `turso_collections`, `turso_documents`, `turso_indexes`, `turso_migrations`.
- Serviços, APIs e Asaas continuam chamando a API Mongo-like. A migração introduzida não transforma essas collections em tabelas SQL relacionais.
- API de branch remote é a fonte de ref; não existe visibilidade de status de deployment/checks nesta auditoria.

## 6. Decisão de baseline recomendada

1. Tratar `main@771958d` como **baseline remoto de código proposto**, pois contém a implementação histórica mais avançada de Turso e é descendente do commit identificado.
2. Antes de escrever/migrar código, obter confirmação local da workspace e status limpo/alterações preservadas; sincronizar apenas em uma etapa autorizada, sem checkout/reset automáticos nesta auditoria.
3. Separar “base de código” de “pronto para cutover”: exigir testes no Turso sandbox, adaptação de `arrayFilters`, SQL relacional, data migration validation, Asaas e reconciliação antes de qualquer troca de produção.
4. Não usar nenhuma branch `feat/*` ou `fix/*` de mídia como base de persistência; elas divergem da main e não carregam o commit `0e3e4cf`.


