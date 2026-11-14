# Proteção contra Regressões

**Objetivo:** checklist de contratos e testes que devem acompanhar toda etapa visual.  
**Regra:** redesign não é autorização para alterar MongoDB, APIs, autenticação, regras de treino, cobrança ou mídia.

## 1. Invariantes de mudança

1. MongoDB Atlas permanece runtime; nunca alterar driver, URI/env, collections, índices, relações ou dados como parte do trabalho visual.
2. Não executar migração destrutiva, seed em produção, remoção de campo, deduplicação, regravação de URLs ou troca de ID.
3. APIs e payloads permanecem compatíveis; qualquer necessidade de endpoint/contrato novo vira proposta separada.
4. Autorização sempre no servidor. Condição de botão/menu não é controle de acesso.
5. Asaas continua no backend; browser não recebe API key, webhook token, CPF salvo, dados de payout, valor autoritativo ou status inventado.
6. Histórico executado é imutável diante de alterações na prescrição atual; exercícios em uso não são deletados destrutivamente.
7. Assets e licença permanecem; mídia indisponível recebe fallback descritivo, não URL nova presumida.
8. Dados de dashboard/gráfico são reais, com período/unidade explícitos; não se semeiam números de demonstração no ambiente real.

## 2. Matriz de comportamento por área

| Área | Regressão a impedir | Teste mínimo antes de substituir a tela |
| --- | --- | --- |
| Login/sessão | Username case-normalizado, bcrypt, rate-limit, cookie HttpOnly/SameSite, expiração, logout e sessão invalidada por versão | POST login válido/inválido, bloqueio 429, cookie, logout, página privada sem sessão |
| Cadastro público | Registro só pode criar estudante; unicidade e senha confirmada; dados mínimos preservados | Cadastro válido, username duplicado, payload inválido, papel admin enviado pelo browser ignorado/rejeitado |
| Papel/permissão | `student`, `trainer`, `admin`, `dev`, `SUPER_ADMIN`; não autoelevar; proprietário especial protegido | Matriz de endpoints por role com 401/403/423; tentar IDs de outros alunos e role alterada |
| Alunos/equipe | Criar/editar/inativar/excluir conforme API; vínculo student/trainer/owner; histórico preservado | CRUD, validação, vínculo válido/inválido, remoção sem apagar histórico, role/proprietário protegido |
| Fichas | Metadados, dias, descanso, ordem, prescription, professor e aluno | Create/edit/duplicate/status/delete; validação datas/dias/exercícios; transação; editor não perde dados após erro |
| Prescrição | Séries, repetições, carga, intervalo, tempo, método, observações e IDs | Round-trip API e UI, campos opcionais preservados, ordenação por botões e drag alternativa |
| Biblioteca | Identificadores, metadados, mídia, ativo/inativo e vínculos de fichas | Snapshot de contagem, IDs e URL antes/depois; exercícios usados não desaparecem; busca/paginação/filtros |
| Player | URL, poster, autoplay desligado, codec/status, crédito/licença, fallback e lazy load | Cada mídia existente em browser; erro de rede e mídia indisponível; teclado, mobile, reduced motion |
| Execução do aluno | Escopo próprio, valores/observações e gravação com API existente | POST histórico, inválido/duplicado conforme regra, rede falhando, refresh e visual do histórico |
| Medidas/evolução | Escopo de aluno, unidade, timestamps e persistência Mongo | GET/POST own vs cross-user, atualização, histórico vazio e gráficos com amostras reais |
| Billing user | Conta própria, fatura real e método ativo; acesso continua possível durante bloqueio | `my-account` próprio, outra conta 404/negado, provider off, QR/link/linha e estados sem sucesso falso |
| Finance Super Admin | Role e CSRF; só owner acessa; preço e regras server-side | Admin comum 403; POST/PATCH sem same-origin falha; payload adulterado não define valor final |
| Asaas/webhook | Token autenticado, dedupe, lock/retry, reconciliação e transação | Reusar suite financeira; evento repetido/out-of-order/mismatch; status pago só com webhook conciliado |
| Job/payout | Cron secret, invoice única, bloqueio/release e payout único | Duplo job, secret inválido, expiração, destino ausente, timeout, transferência e ledger consistente |
| Navegação | Link ativo tem destino real, role menu correto, voltar mantém filtros e contexto | E2E por perfil, links, reload/deep-link, teclado/escape e mobile drawer |
| Layout | Sem overflow, modal utilizável, zoom e foco visível | Viewports 360/390/768/1024/1366/1600, screenshot, axe ou equivalente e teclado |

## 3. Dados e setup de fixtures

- Usar base de teste isolada, usuário sintético e IDs UUID criados para a suite; nunca fixtures com dados pessoais reais.
- Mascarar/desativar credenciais e evitar que `npm test` ou E2E conecte à produção.
- Para UI, mockar a resposta HTTP no limite do browser. Mocks não podem ser habilitados como fallback de produção.
- Para integração Mongo, utilizar ambiente de teste autorizado, coleção/banco isolado e limpeza restrita; não executar limpeza ampla.
- Comparar snapshot read-only do catálogo de produção antes/depois de alteração na feature, com contagem por campo e hashes das URLs (sem expor conteúdo/credencial).
- Não incluir tokens, password hashes, CPF/CNPJ, cookie ou URI Mongo em screenshot, artefato de teste ou log.

## 4. Suíte existente e gaps

Arquivos de teste no checkout aberto:

- `tests/finance-calculator.test.cjs`: cálculo em centavos, abatimento, access policy, contrato de checkout, evento webhook, status Asaas, Pix/boleto/cartão mockados, autenticação de webhook e payout mockado.
- `tests/workout-plan-validation.test.cjs`: datas, dias, IDs e validação de estrutura/exercícios.
- `tests/username-utils.test.cjs`: normalização/compatibilidade de username.

`package.json` executa `node --test`. O histórico remoto adiciona `tests/exercise-animation-matching.test.cjs` e pode incluir `tests/turso-document-store.test.cjs`; este último está ligado ao commit de migração e não deve ser interpretado como requisito para troca de Mongo. Confirmar quais testes existem no SHA final antes de executar/editar.

Gaps de evidência observados: não há E2E Playwright confirmado na árvore aberta; não há teste de integração de endpoint HTTP completo do webhook; suite Asaas usa fetch stub e não prova sandbox real; não há contagem de mídia/URL de produção nem visual regression suite confirmada; acesso entre tenants deve ser coberto com testes negativos específicos.

## 5. Portões de merge por etapa

### Shell e auth

- build de produção e `npm test` passam.
- screenshot desktop/mobile e teste keyboard/focus.
- login/cadastro/logout com backend de teste.

### Admin/professor/aluno

- testes de rota e autorização continuam passando sem alteração.
- contratos JSON/API comparados; histórico e relações intactos.
- loading, vazio, erro, acesso negado e sessão expirada validados em cada viewport-chave.

### Mídia

- inventário de mídia base gravado antes de refatorar.
- cada tipo/host real testado; player não inicia sem ação; attribution renderiza; erros de rede têm fallback.
- CSP do SHA implantado é verificada, sem mudar configuração implicitamente.

### Financeiro

- suite atual passa, sem mudança do service/adapter/webhook.
- testes de UI garantem que retorno de checkout não liquida estado.
- telas apresentam status local, não status de browser; não exibem segredo/dados sensíveis.

### Release

- deploy canário, smoke test com role admin/trainer/student e owner em contas de teste; rollback apenas da UI.
- observação de logs sem segredos e confirmação da conexão Mongo health endpoint.
- manter anotado o que não foi testado e qualquer diferença entre local, preview e produção.

## 6. Evidência de aceitação por perfil

### ADMIN

- Dashboard sem faturamento/retention inventados e com período/definição.
- Gerencia alunos e staff dentro do escopo atual; páginas/ações do owner não vazam.
- Biblioteca, fichas e financeiro só aparecem conforme role e endpoints.

### PROFESSOR

- Lista apenas alunos vinculados/autorizados.
- Cria/edita fichas do aluno permitido; preserve prescrições, IDs e histórico.
- Não edita catálogo global nem papéis sem permissão explícita.

### ALUNO

- Acessa ficha, treino, histórico e medidas próprios.
- Registra séries pelo fluxo existente e consulta mídia sem perder contexto.
- Não edita role/tenant nem vê dados de outro usuário.

### Visitante e billing

- Visitante não vê shell/dados privados.
- Usuário inadimplente chega a billing e consulta somente sua conta.
- Gateway ausente/pendente/erro não apresenta pagamento falso nem perde dados digitados.

## 7. Itens explicitamente fora da aceitação visual

- Migração MongoDB→Turso ou mudança de driver/schema.
- Mudança de política comercial, preço, carência, suspensão, cancelamento e reativação.
- Alteração de API/webhook, autenticação/CSRF, modelo de sessão ou RBAC.
- Implementação de sessão completa de treino, pause/cancel state, offline sync, email reset, notificações reais ou novas cobranças.
- Upload/re-host de mídia, limpeza de duplicidades, recodificação de vídeo e troca de licenças.

Cada item acima requer decisão e plano de engenharia próprios; não fazer implicitamente como “melhoria UX”.
