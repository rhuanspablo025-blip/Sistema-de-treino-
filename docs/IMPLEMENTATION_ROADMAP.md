# Roadmap de Implementação do Redesign

**Status:** sequência proposta para aprovação; nenhum item de implementação foi iniciado.  
**Restrições fixas:** MongoDB Atlas permanece; não alterar collections/índices, APIs, auth ou financeiro Asaas no escopo visual; catálogo e mídias preservados.

## 0. Gate de base e segurança

**Objetivo:** eliminar ambiguidade de revisão antes de alterar UI.

- Registrar SHA/branch do checkout que será publicado e reconciliar com `main`/release. Há divergência observada: checkout virtual Mongo antigo vs commits remotos de migração Turso, mídia e rotas adicionais.
- Validar no repositório escolhido se estão presentes `ExerciseAnimation.jsx`, matching, rota demos, assets/fontes, versões CSS e `ExercisePlanManager`; manter as alterações locais do usuário.
- Confirmar Mongo Atlas como runtime ativo por configuração/health check sem revelar URIs; não executar migração ou alteração de dados.
- Solicitar snapshot/contagem read-only de produção dos catálogos, URLs/atribuições e vínculos `workouts.exerciseId`; backup lógico restrito antes de qualquer operação de dados.
- Revisar testes e status de build no SHA base; registrar resultados existentes sem corrigir falhas não relacionadas.

**Arquivos alterados/criados:** nenhum arquivo de aplicação. Criar apenas um registro de baseline se o proprietário aprovar incluir essa evidência.

**Gate:** snapshot, role/rotas e repositório base confirmados. Sem este gate, não se inicia migração de interface de exercício/financeiro.

## 1. Linguagem visual e protótipo do shell

**Objetivo:** validar identidade e navegação em uma fatia de baixo risco.

- Aprovar tokens, fonte, estados, densidade, marca e diretrizes do `docs/DESIGN_SYSTEM_PROPOSAL.md`.
- Implementar tokens e componentes base mínimos; não aplicar ainda a todo o produto.
- Criar shell desktop/mobile com sidebar, topbar, estado ativo, perfil e logout usando sessão e permissões existentes.
- Provar rota `/` compatível e fallback por papel; confirmar que modo prévia não altera autorização.
- Testar 360/390/768/1024/1366/1600px, teclado, leitor de tela e reduced motion.

**Arquivos candidatos a criar:** `styles/tokens.css`, `styles/typography.css`, `styles/primitives.css`; `components/ui/*` (Button, IconButton, Input, Select, Badge, Dialog, Alert, Skeleton); `components/shell/*`; layout route group somente se aprovado.

**Arquivos candidatos a alterar/substituir:** `app/layout.jsx`, `app/globals.css`, `app/page.jsx` inicialmente como adaptador. Não remover CSS antigo até o shell renderizar em paralelo.

**Testes:** snapshot visual do shell e login, teste de role menu e logout, `npm test`, `npm run build`, acessibilidade/foco e overflow.

**Gate:** shell e visual aprovados antes de migrar módulos.

## 2. Autenticação e páginas públicas

**Objetivo:** aplicar identidade sem mudar contrato de login/cadastro.

- Recriar login, cadastro, recuperação informativa e privacidade com labels reais, loading, validação, erro e sucesso existentes.
- Preservar username/senha, endpoint, mensagens e papel student no cadastro público.
- Não prometer reset e-mail; `/forgot-password` continua informativa até serviço real existir.

**Arquivos candidatos:** markup em `app/login/page.jsx`, `app/register/page.jsx`, `app/forgot-password/page.jsx`, `app/privacy/page.jsx`, estilos em `app/auth-overrides.css` e `app/globals.css`; criar `features/auth/*` e base components.

**Testes:** login válido/inválido/rate limit, cookie/logout, registro com conflito/validação, recuperação informativa sem ação inexistente, viewport/teclado.

## 3. Admin: diretório, dashboard e equipe

**Objetivo:** substituir gestão monolítica por experiência operacional, sem criar KPI artificial.

- Primeiro diretório de alunos e detalhes com busca/paginação conforme o backend; depois equipe e professor/alunos vinculados.
- Dashboard mostra somente números atuais derivados da API, período explícito e links para listas suportadas. Valores placeholder (“Em dia”) ficam fora até existir regra real.
- Confirmar deativação/exclusão e preservar registro/histórico conforme API atual.
- Não mostrar Super Admin/financeiro para admin comum.

**Arquivos candidatos a criar:** `features/dashboard/admin/*`, `features/students/*`, `features/team/*`; `components/domain/StudentStatus`, tabelas e formulários.

**Arquivos candidatos a substituir:** módulos admin, gestão de usuário e aluno embutidos em `app/page.jsx`; `app/globals.css` e overrides responsive.

**Testes:** lista/pesquisa/status/paginação, create/update/deactivate, acesso cross-role/tenant usando IDs manipulados, owner e papéis protegidos, dashboard vazio/erro/rede lenta, filtros ao navegar.

## 4. Biblioteca de exercícios e mídia

**Objetivo:** apresentar o catálogo original preservando referências e fontes de mídia.

- Reconciliar a versão correta de `ExerciseAnimation`, campos no Mongo, seed e URLs externas antes do primeiro markup.
- Implementar busca/filtros/paginação utilizando a API atual; não carregar coleção completa em página sem necessidade.
- Refazer cards, detalhes e editor com grupo/equipamento/nível/instruções e atribuição quando existentes.
- Montar player responsivo por tipo efetivamente suportado, lazy load, poster, controles e fallback. Exibir licença e fonte; não começar mídia com som.
- Preservar IDs/URLs/metadados e exercícios arquivados em uso. Não importar novos dados automaticamente nem substituir mídia indisponível por endereço inventado.

**Arquivos candidatos a criar:** `features/exercises/*`, `components/media/*`, `ExerciseCard`, `ExerciseMedia`, `ExerciseVideoPlayer`, `MediaAttribution`.

**Arquivos candidatos a alterar/substituir:** `components/WorkoutPlanManager.jsx`, `app/workout-plans.css`, possivelmente `ExerciseAnimation.jsx` apenas após estabelecer SHA base; `app/api/exercises/**` e banco explicitamente não fazem parte.

**Testes:** preservação de dados fixture, matching exato de nome/equipamento, URL válida/erro/403/timeout, imagem/frame/video/sem mídia, licença, player teclado/reduced motion, lazy load e CSP na versão aprovada.

**Gate:** catálogo contagens e mídia real conferidos por snapshot; aprovação antes de alterar renderização.

## 5. Professor e editor de fichas

**Objetivo:** otimizar criação/edição preservando contrato e histórico.

- Espaço professor mostra somente estudantes autorizados; não abrir escolha de outros tenants.
- Migrar lista, filtros, detalhe e editor em etapas. Editor com seleção de biblioteca, prescrição, dias, busca, reordenação por botões e arraste apenas como alternativa.
- Preview de mídia não deve desmontar editor nem perder valores.
- Status, datas, duplicação, arquivamento/exclusão e confirmação preservam regras atuais.

**Arquivos candidatos:** `features/workout-plans/*`, `features/students/trainer-*`, `components/domain/WorkoutPlanEditor`, `ExercisePicker`, `WorkoutExerciseRow`; reduzir `WorkoutPlanManager.jsx`.

**Testes:** validação schema `workout-plan-validation`, create/edit/duplicate/delete/status, persistência de sets/reps/load/rest/method, vínculo professor/aluno, transações e snapshots históricas, double-submit/retry, navegação/cancelamento e ordenação teclado.

## 6. Aluno: treino, histórico e perfil

**Objetivo:** fluxo mobile-first sem inventar entidade de sessão.

- Migrar home, treino prescrito, registro atual, progresso, histórico e medidas usando endpoints atuais.
- Exibir prescrição e captura conforme granularidade suportada pelo `workout-history`; não afirmar estado persistido de descanso/pausa/conclusão se o backend não grava isso.
- Cronômetro pode ser componente local somente após decisão sobre escopo; não usar sua saída como status de pagamento ou sessão persistida.
- Consultar mídia mantendo contexto da execução; não reinicializar ficha ao fechar.
- Gráficos devem usar observações reais, período e unidade; sem interpolação/fabricação.

**Arquivos candidatos:** `features/workout-execution/*`, `features/history/*`, `features/profile/*`; substituir `StudentView`, `StudentProfile` em `app/page.jsx` e `student/profile/body-map` overrides.

**Testes:** aluno só acessa seu plano/histórico/medidas, registro de séries/repetições/carga, retry/idempotência onde existir, erro de rede sem limpar entrada, histórico real, gráfico sem pontos fake, 360px e interação touch/teclado.

## 7. Financeiro e Asaas: apenas apresentação

**Objetivo:** reconstruir navegação e informação, sem tocar no gateway.

- Separar visualmente conta/pagador e painel de proprietário; mostrar status local e método/checkout disponíveis conforme provider atual.
- Reimplementar 12 seções financeiras do `FinancialManager` usando mesmas rotas, permissões e contratos.
- Manter “não configurado”, confirmação pendente, revisão, erro, fatura vencida, paga e estornada conforme estado real.
- Não criar checkout, subscription recorrente Asaas, plano/preço, carência ou botão de cancelamento se o service não suporta.
- Preservar a tela `/billing` para usuários restritos e não marcar pago por retorno visual.

**Arquivos candidatos:** `features/billing/*`, `features/finance-admin/*`; reorganizar `FinancialManager.jsx`, `app/billing/page.jsx`, `app/billing/billing.css`, `app/finance.css`.

**Arquivos explicitamente não alterados:** `lib/payment-providers/asaas.mjs`, contracts, finance service/jobs/payouts, webhook, API, `.env*`, `vercel.json`.

**Testes:** todos os testes de `finance-calculator`, mock de API para componentes, status/erros, role guard, CSRF, checkout sem sucesso falso, token nunca chega ao cliente e reconciliação não muda ao navegar.

## 8. Consolidação, remoção segura de CSS antigo e hardening

- Remover override antigo somente quando nenhuma rota/componente usa a classe; agrupar por módulo e verificar visual diff por viewport.
- Fazer auditoria de foco, labels, contrastes, `prefers-reduced-motion`, zoom, reduced data e performance.
- Executar testes de unidade, build, regressão API/role, Playwright/E2E e screenshot baseline com dados sintéticos.
- Fazer release gradual e manter rollback da UI sem rollback de dados.

**Arquivos candidatos:** CSS antigo, `app/page.jsx` legado e componentes duplicados, somente após busca de referências; não apagar rotas ou APIs.

## 9. Sequência de release e evidências

1. Cada etapa tem PR/commit pequeno, screenshots desktop/mobile, lista de comportamento preservado, testes executados e rollback da interface.
2. Não juntar migração de UI com troca de DB, alteração de schema, endpoint, Asaas, preço, política de inadimplência ou credencial.
3. Antes do deploy: aprovar baseline, confirmar configuração Mongo e build, preservar branch anterior.
4. Pós-deploy: smoke test por papel e status financeiros; mídia usa fontes reais aprovadas; coleta de erro não inclui CPF, segredo ou conteúdo sensível.
5. Relatório de release distingue implementado, testado, pendente e não testado; não declarar “pronto para produção” sem evidência.

## 10. Arquivos-alvo agregados

**Candidatos a serem criados:** `styles/{tokens,typography,primitives,layouts,motion}.css`; `components/ui/**`, `components/shell/**`, `components/feedback/**`, `components/media/**`; `features/{auth,dashboard,students,team,exercises,workout-plans,workout-execution,history,profile,billing,finance-admin}/**`; novas páginas em grupos de rota preservando URLs. Lista final depende do inventário do SHA aprovado.

**Candidatos a serem substituídos/reduzidos:** `app/page.jsx`, `app/globals.css`, `app/workout-plans.css`, `app/finance.css`, `app/auth-overrides.css`, `app/student-overrides.css`, `app/profile-overrides.css`, `app/body-map-overrides.css`, `app/billing/billing.css`, `components/WorkoutPlanManager.jsx`, `components/FinancialManager.jsx`, markup das páginas públicas e Billing. A substituição é progressiva; arquivos não são removidos até passar teste de uso.

**Explicitamente fora:** `lib/**` de domínio, `app/api/**`, `next.config.js`, `.env*`, `package*.json` (salvo aprovação independente de dependência), Mongo, secrets e settings Vercel.
