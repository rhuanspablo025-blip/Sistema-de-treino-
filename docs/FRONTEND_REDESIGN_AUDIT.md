# Auditoria do Frontend e Redesign

**Status:** diagnóstico técnico para aprovação, sem implementação.  
**Data:** 2026-11-13  
**Regra de escopo:** manter MongoDB Atlas e os contratos existentes; esta auditoria não autoriza alteração de UI ou de lógica.

## 1. Fontes e limite do diagnóstico

Foram lidos os arquivos do workspace aberto e cruzados com a árvore `main` e o histórico GitHub do repositório `rhuanspablo025-blip/Sistema-de-treino-`. O checkout virtual aberto e a `main` remota não são o mesmo snapshot: a árvore aberta contém `lib/mongodb.js` com `MongoClient`, o CSS global atual e uma página raiz monolítica; a `main` remota inclui commits posteriores com rotas/componentes de mídia, novas rotas administrativas e um commit de migração do runtime para Turso (`0e3e4cf`). O proprietário confirmou que MongoDB Atlas é o banco real; portanto, esta proposta preserva MongoDB e não recomenda executar nem repetir a migração remota.

O checkout não pôde ser inspecionado com Git local porque o workspace é `vscode-vfs://` e não existe checkout físico em `C:\Users\Usuario\source\repos`. O histórico foi consultado pela página pública de commits; onde o arquivo remoto diverge do arquivo aberto, os documentos indicam isso expressamente. Não foi feita conexão com banco nem lido/impresso `.env.local`.

## 2. Stack e forma atual da interface

- Next.js App Router, React, JavaScript/JSX, CSS autoral e Node.js >= 20.9; `package.json` usa dependências `next`, `react` e `react-dom` como `latest` no snapshot aberto.
- Interface centrada em `app/page.jsx`: hidrata dados pelo cliente, mantém o shell, navegação e experiências staff/aluno em um único componente extenso.
- Dois componentes de domínio predominantes no checkout aberto: `components/WorkoutPlanManager.jsx` e `components/FinancialManager.jsx`.
- O shell atual é composto por sidebar, topbar, breadcrumbs, banner financeiro e conteúdo condicionado por estado local. A navegação principal usa botões e `adminView`, não rotas dedicadas por módulo.
- `app/layout.jsx` importa `globals.css`, `workout-plans.css` e `finance.css`. `globals.css` importa overrides de aluno, perfil, mapa corporal e autenticação.
- A tipografia atual é DM Sans + Space Grotesk via Google Fonts; ícones são glifos Unicode embrulhados em `SimpleIcon` no `app/page.jsx`.

## 3. Inventário de telas e rotas

### Rotas de interface observadas no checkout aberto

| Rota | Perfil/estado atual | Dados e comportamento a preservar |
| --- | --- | --- |
| `/` | Staff vê gestão e aluno vê área de treino; admins/staff podem alternar para visão de aluno | Dados reais de dashboard, alunos, fichas, exercícios, medidas, histórico e logout; não confundir modo de prévia com papel autorizado |
| `/login` | Visitante | Login username/senha, erros, loading, limite de tentativas e links de cadastro/recuperação |
| `/register` | Visitante/aluno | Cadastro público cria somente papel `student`; campos e validações existentes |
| `/forgot-password` | Visitante | Informa que redefinição é feita pelo administrador; não promete fluxo de e-mail inexistente |
| `/billing` | Usuário autenticado | Faturas da própria conta, Pix, boleto, checkout de cartão hospedado pelo Asaas, status e restrição de acesso |
| `/privacy` | Público | Política de privacidade existente |

A árvore `main` também lista rotas privadas/API para documentação, configurações e limpeza, mas não prova que todas têm uma tela frontend correspondente. Manter as rotas que existem; não criar páginas vazias para completar uma navegação.

### Rotas de API encontradas

| Endpoint | Métodos confirmados no checkout aberto | Limite de domínio |
| --- | --- | --- |
| `/api/auth/login` | POST | Username/senha e sessão |
| `/api/auth/logout` | POST | Invalidação do cookie |
| `/api/auth/register` | POST | Cadastro público de aluno |
| `/api/dashboard` | GET | Visão de dados permitida pelo papel e escopo |
| `/api/users` | GET, POST, PATCH, DELETE | Gestão de usuários; role, vínculos e histórico |
| `/api/exercises` | GET, POST, PATCH, DELETE | Catálogo compartilhado, soft delete quando em uso |
| `/api/workout-plans` | GET, POST, PUT, PATCH, DELETE | Fichas e dias; validação e transações Mongo |
| `/api/workout-plans/[id]` | GET | Detalhes da ficha (rota presente na árvore) |
| `/api/workout-plans/[id]/duplicate` | POST | Duplicação de ficha |
| `/api/workouts` | GET, POST | Dias e treinos vinculados |
| `/api/workout-exercises` | GET e operações conforme implementação da rota | Prescrições do treino |
| `/api/workout-history` | GET, POST | Histórico de séries executadas; limite atual de consulta 200 |
| `/api/body-measurements` | GET/POST na árvore; conferir métodos no snapshot alvo | Medidas e evolução corporal |
| `/api/health/database` | GET | Verificação de conexão sem revelar segredo |
| `/api/finance/[resource]` | GET, POST, PUT, PATCH, DELETE | Superadmin, CSRF nas mutações, recursos financeiros |
| `/api/finance/checkout` | POST | Checkout da cobrança própria, protegido por autenticação e same-origin |
| `/api/finance/my-account` | GET | Faturas/assinaturas e acessos do usuário autenticado |
| `/api/finance/webhook/[provider]` | POST | Webhook de provedor; autenticação, dedupe e conciliação |
| `/api/finance/cron/daily` | GET | Job protegido por `CRON_SECRET` |

Na `main` remota foram vistos ainda `/api/exercises/demos`, `/api/documentation`, `/api/settings`, `/api/maintenance/cleanup`, `/api/workout-templates` e rotas de CRUD de templates. Elas não constam na árvore aberta inicialmente; devem ser reconciliadas com o commit aprovado antes de migração visual.

## 4. Auditoria dos arquivos visuais

| Arquivo | Responsabilidade atual | Direção de reconstrução |
| --- | --- | --- |
| `app/page.jsx` | Shell, navegação, dashboards, gerenciamento resumido, perfil corporal e execução de aluno; estado e lógica misturados | Substituir por composição de shell + rotas/áreas e componentes de domínio; preservar chamadas e regras através de adaptadores |
| `app/globals.css` | Tokens implícitos, estilo global, shell e grande parte do layout | Substituir por tokens semânticos, reset, tipografia, foco e padrões globais |
| `app/workout-plans.css` | Lista, editor, cards, dias, tabela de detalhes, responsividade e impressão | Reconstruir com componentes de ficha e estilos de domínio; preservar impressão e teclado |
| `app/finance.css` | Overrides pontuais de cobrança e avisos | Absorver no módulo financeiro novo sem alterar estados/regra de acesso |
| `app/student-overrides.css` | Execução, gráficos, cards, responsividade e perfil de aluno | Reconstruir como experiência mobile-first de treino e progresso |
| `app/profile-overrides.css` | Formulário de medidas e histórico | Reconstruir mantendo medidas, unidades, persistência e exportação existentes |
| `app/body-map-overrides.css` | Ilustração SVG corporal e marcadores | Reavaliar desenho e alternativa acessível; manter apenas se os valores continuarem sendo os mesmos do backend |
| `app/auth-overrides.css` | Login, registro, cartão, foco e breakpoints | Recriar as telas públicas sem mudar autenticação ou mensagens de negócio |
| `app/billing/billing.css` | Superfície financeira de usuário | Reconstruir estados/faturas e ações já permitidas; não declarar pagamento aprovado no retorno do checkout |
| `app/layout.jsx` | CSS global e metadata | Ajustar apenas quando o novo shell e tokens forem aprovados; não alterar headers/configuração por conveniência visual |
| `app/login/page.jsx`, `register/page.jsx`, `forgot-password/page.jsx` | Formulários públicos independentes | Substituir markup/estilo mantendo endpoint, campos, validação, loading, erro e sucesso |
| `app/billing/page.jsx` | Área de cobranças autenticadas | Reorganizar apresentação mantendo o fluxo e o contrato atual |
| `app/privacy/page.jsx` | Política estática | Apenas atualizar apresentação; conteúdo legal exige revisão do proprietário |
| `components/WorkoutPlanManager.jsx` | Biblioteca, editor, detalhes, filtros, ordenação e operações da ficha | Dividir em componentes do módulo, sem alterar API nem estrutura de dados |
| `components/FinancialManager.jsx` | 12 seções do proprietário do SaaS | Dividir views reutilizáveis mantendo endpoint, autorização e ações existentes |
| `components/ExerciseAnimation.jsx` | Existe na `main` remota, não no checkout virtual aberto | Reconciliar a versão antes de redesenhar; preservar fontes, licenças, matching, poster, controles e fallback |
| CSS e páginas em `main` posteriores | Há histórico de media, templates, configuração e documentação | Não assumir que estão disponíveis no checkout alvo até sincronização aprovada |

## 5. Problemas visuais e de interação verificáveis

- `app/page.jsx` contém shell, visão administrativa, modo aluno, perfil, gráficos e formulários. Esse acoplamento aumenta o risco de regressão e limita renderização por rota/perfil.
- Sidebar inclui “Configurações” que hoje mostra mensagem de indisponibilidade; o botão de notificações também mostra mensagem estática. Não transformar isso em fluxo fictício.
- Topbar exibe data literal (“Sexta, 14 de junho”), e o dashboard/visão de aluno contém rótulos operacionais não derivados de consulta (por exemplo, status “Em dia” e lembrete de água). Novo dashboard deve usar dado real ou remover esses indicadores sob aprovação.
- Ícones atuais incluem caracteres e símbolos genéricos, sem biblioteca visual centralizada.
- CSS tem seletores e tokens concentrados em um arquivo extenso, overrides em cascata e estilos por módulo; a consistência depende da ordem de importação.
- Há estados de loading/erro/empty em alguns módulos, mas não existe contrato global comum para eles.
- Listas de usuários/exercícios/fichas têm limites e paginação distintos; o frontend não deve trocar paginação server-side por filtragem de todos os registros no browser.
- Editor oferece alternativa a arrastar usando botões de subir/descer; preservar essa alternativa ao reorganizar UX.
- UI de execução armazena campos localmente e envia uma gravação do exercício com séries/repetições/carga inferidas do prescrito. Não mudar a granularidade ou o significado do histórico sem autorização de produto.

## 6. Componentes que devem ser reconstruídos

### Shell e navegação

`AppShell`, `SidebarDesktop`, `MobileNavigation`, `Topbar`, `Breadcrumbs`, `RoleContext`, `UserMenu`, `PageHeader`, `AccessNotice`, `RouteLoadingBoundary` e `ToastRegion`. A navegação deve ser montada a partir do papel real e não permitir que a alternância de prévia do staff conceda acesso.

### Domínios

- **Admin:** `AdminDashboard`, `StudentDirectory`, `StudentEditor`, `StudentProfile`, `StaffDirectory`, `StaffEditor`, `ExerciseLibrary`, `ExerciseEditor`, `WorkoutPlanDirectory`, `WorkoutPlanEditor`, `Audit/Settings` somente para rotas existentes.
- **Professor:** `TrainerDashboard`, `AssignedStudentList`, `TrainerStudentProfile`, `WorkoutPlanEditor` e `ExercisePicker`; vínculos continuam validados no servidor.
- **Aluno:** `StudentHome`, `TodayWorkout`, `WorkoutExecution`, `ExerciseStep`, `SetEntry`, `RestTimer` somente se viável com contratos atuais, `WorkoutCompletion` apenas se houver entidade/endpoint real, `WorkoutHistory`, `BodyMeasurements`.
- **Mídia:** `ExerciseMedia`, `ExerciseVideoPlayer`, `ExerciseAnimation`, `MediaAttribution`, `MediaUnavailable`; reaproveitar os dados existentes e manter lazy loading.
- **Financeiro:** `BillingAccount`, `InvoiceList`, `InvoiceDetails`, `CheckoutActions`, `PaymentStatus`, `AsaasCheckoutLink`, `FinanceAdminDashboard`, `Plan/Subscription/Invoice/Payment/Payout` views. Não reconstruir o gateway.
- **Base:** `Button`, `IconButton`, `TextInput`, `PasswordInput`, `Textarea`, `Select`, `SearchField`, `Badge`, `Avatar`, `Tabs`, `Table`, `Pagination`, `Dialog`, `Drawer`, `Alert`, `Toast`, `Skeleton`, `EmptyState`, `ErrorState`, `ConfirmDialog`.

## 7. Preservação de contratos e ordem de decisão

1. Tratar MongoDB Atlas e collections atuais como fonte oficial, conforme proprietário.
2. Não alterar `lib/models.js`, `lib/mongodb.js`, índices, collections, APIs, auth, serviço financeiro ou payloads como parte do redesign.
3. Antes do primeiro componente visual, reconciliar o checkout com o SHA aprovado e obter inventário read-only do catálogo de produção; não exportar conteúdo sensível ao documento.
4. Usar testes/fixtures mascarados para UI; não semear dados fictícios em produção.
5. Implementar migração de UI por módulo atrás de contratos estáveis, com validação visual e funcional antes de retirar a tela anterior.
6. Aprovar separadamente qualquer endpoint novo, novo estado de treino, fluxo de pagamento, política de retenção ou alteração de dados.

## 8. Aprovações em aberto

- SHA/branch que será a base definitiva da implementação; a árvore virtual auditada diverge de `main`.
- Identidade oficial/logo e permissão para introduzir uma nova marca de produto.
- Se “configurações” e notificações devem continuar como indisponíveis ou ganhar escopo próprio.
- Se o modo de prévia staff→aluno permanece, e como deve ser rotulado.
- Se telas futuras de sessão completa/cronômetro são apenas apresentação sobre fluxo atual ou exigem evolução funcional separada.
