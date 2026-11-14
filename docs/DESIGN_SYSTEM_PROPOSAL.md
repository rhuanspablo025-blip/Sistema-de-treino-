# Proposta de Design System

**Estado:** proposta para aprovação; não implementada.  
**Objetivo:** criar uma identidade SaaS fitness B2B própria, com superfícies eficientes para operação e uma execução de treino mobile-first.

## 1. Direção visual

**Conceito:** “Performance precisa”: ritmo editorial de um produto de treino, mas com precisão de software operacional. Usar grade tipográfica, espaços de trabalho claros, informação densa e controles de estado explícitos. A marca deve parecer software profissional de gestão de academia, não um site promocional nem uma tela de academia genérica.

- Layout claro como padrão, com contraste alto e superfícies neutras. Não implementar tema escuro nesta fase sem capacidade de manter paridade funcional.
- Grafite e branco mineral como base; verde profundo identifica ação de progresso/treino; amarelo cítrico é destaque de marca/ação primária; coral reservado para aviso/erro ou ênfase curta; azul é informação. Cor não será a única indicação de status.
- Sem gradiente decorativo constante, glassmorphism, sombras de cartões flutuantes ou cards aninhados. Cartões somente para itens repetidos, editor e detalhe agrupado.
- Fotos/ilustrações de exercício somente quando reais, licenciadas e diretamente relacionadas. Em gestão, priorizar dado e hierarquia sobre imagem decorativa.

## 2. Tokens candidatos

Valores iniciais de proposta, a validar por contraste WCAG 2.2 AA em texto e controles. Não alterar CSS antes da aprovação.

| Token | Valor proposto | Uso |
| --- | --- | --- |
| `--color-canvas` | `#F4F6F2` | Fundo geral claro |
| `--color-surface` | `#FFFFFF` | Conteúdo e formulários |
| `--color-surface-muted` | `#E9EEE9` | Agrupamento leve/controles secundários |
| `--color-ink` | `#1D2722` | Texto primário |
| `--color-ink-muted` | `#5D6A62` | Texto secundário |
| `--color-ink-disabled` | `#87928B` | Desabilitado; validar contraste e nunca usar para conteúdo essencial |
| `--color-border` | `#D5DDD6` | Separadores e contornos |
| `--color-brand` | `#B8E84B` | Destaque de marca, ativo e ações de alta prioridade com texto escuro |
| `--color-brand-strong` | `#8FBF2D` | Hover/active do destaque; validar contraste |
| `--color-training` | `#176447` | Progresso/ação de treino e estados positivos |
| `--color-training-soft` | `#E4F1E9` | Fundo de sucesso/treino |
| `--color-warning` | `#9B5B12` | Aviso, sempre com ícone/texto |
| `--color-warning-soft` | `#FFF2D7` | Superfície de aviso |
| `--color-danger` | `#B33D36` | Erro/ação destrutiva |
| `--color-danger-soft` | `#FCEAE6` | Fundo de erro |
| `--color-info` | `#315F7A` | Informação e ajuda |
| `--color-focus` | `#1F6FEB` | Foco visível, outline com espessura mínima 2px |
| `--overlay` | `rgb(18 27 22 / 56%)` | Modal/drawer |

## 3. Tipografia

- **Display e headings:** Sora, pesos 500/600/700, com fallback local. Usar em títulos de página e pequenos indicadores editoriais, sem tracking negativo.
- **Interface/body:** Source Sans 3, pesos 400/500/600/700, legível em tabelas, formulários e telas densas.
- **Dados monoespaçados:** IBM Plex Mono para IDs curtos, valores técnicos e timestamps quando a precisão exigir; não para texto comum.
- Escala de referência: 12, 14, 16, 20, 24, 30, 36px. H1 de tela administrativa limitado a 30-36px; título de painel 18-22px; corpo 14-16px; metadados 12-13px.
- Line-height sugerido: 1.45-1.6 para corpo; 1.15-1.3 em títulos; altura mínima de linha 20px para texto 14px.
- Fontes remotas precisam de estratégia aprovada: self-host/Next Font se apropriado, ou fallback robusto; verificar CSP/performance e não tornar a UI dependente de rede de terceiros.

## 4. Grid, espaçamento e superfícies

- Base de espaçamento: 4px; ritmo principal 8/12/16/24/32/40/48.
- Conteúdo de gestão até 1440px, com largura adaptada à tabela e área de trabalho; coluna de texto limitada a 72ch.
- Sidebar desktop 248px expandida e 72px compacta; viewport mobile usa drawer/sheet acessível. Não fixar larguras que provoquem overflow.
- Radius: 4px para controles, 6px para painel/card e 8px somente para modal grande; evitar excesso de formas arredondadas.
- Sombras discretas e funcionais somente para overlay/elevation; bordas e hierarquia tipográfica resolvem estrutura.
- Tabelas operacionais usam linhas e agrupamentos, não cada linha como card. Em viewport estreita priorizar coluna ou converter para lista com os mesmos dados.

## 5. Componentes e estados

### Base

`Button` (primary/secondary/quiet/danger/loading/disabled), `IconButton` com tooltip/aria-label, `TextInput`, `PasswordInput`, `SearchInput`, `Textarea`, `Select`, `Checkbox`, `Radio`, `Switch`, `Badge`, `Avatar`, `Tabs`, `Table`, `Pagination`, `FilterBar`, `Dialog`, `Drawer`, `DropdownMenu`, `Tooltip`, `Toast`, `Alert`, `Skeleton`, `EmptyState`, `ErrorState`, `ConfirmDialog`, `PageHeader`, `Breadcrumbs`, `FocusRing`.

### Domínio

`StudentStatus`, `TrainerStatus`, `SubscriptionStatus`, `InvoiceStatus`, `PaymentStatus`, `ExerciseCard`, `ExerciseMedia`, `ExerciseVideoPlayer`, `WorkoutCard`, `WorkoutExerciseRow`, `WorkoutPlanEditor`, `WorkoutProgress`, `MeasurementField`, `PaymentMethodActions`, `InvoiceSummary`.

### Estados obrigatórios para componente com dados/ação

- Normal, hover, pressed, focus-visible, disabled, busy/loading.
- Erro associado por id/aria-describedby, sucesso somente depois de resposta persistida, vazio e acesso negado quando aplicável.
- Semântico e textual: status nunca será cor somente. Botões destrutivos pedem confirmação conforme consequência real.
- Alvos de toque de pelo menos 44x44px em mobile; foco volta ao acionador em modal/drawer.

## 6. Navegação e composição por perfil

- Admin: navegação operacional para dashboard, alunos, equipe, biblioteca, fichas, histórico, configurações e financeiro somente para papel que já possui a permissão real.
- Professor: alunos vinculados, detalhes do aluno, fichas e biblioteca; não mostrar cadastros/financeiro de proprietário.
- Aluno: home do treino atual, sessão, histórico e perfil/medidas, no contrato que existe hoje.
- Visitante: login, cadastro público de estudante, recuperação informativa e privacidade.
- Items sem rota/ação real devem permanecer indisponíveis ou ser removidos do menu após aprovação, nunca apresentados como funcionais.

## 7. Motion e microinterações

- Transições de 120-180ms para navegação curta, expand/collapse, toast e feedback; easing padrão suave, sem atraso antes de ação.
- Animação de progresso deve refletir valor real salvo; sem contagem fake ou gráfico animado com dados inventados.
- Respeitar `prefers-reduced-motion`; em execução de treino não animar conteúdo essencial e não usar movimento contínuo decorativo.
- Skeleton tem forma e dimensões do conteúdo; não mascarar rede lenta com animação infinita.
- Modal/drawer com entrada breve e foco controlado. Evitar dependência de animação grande se CSS nativo for suficiente.

## 8. Acessibilidade e responsividade

- Semântica HTML, labels explícitos, teclado completo, foco visível, leitura por leitor de tela e mensagens de estado com `role=status/alert` apenas conforme necessidade.
- Contraste WCAG 2.2 AA; verificar combinações de texto pequeno, badge, outline, estados disabled e status coloridos.
- `prefers-reduced-motion`, zoom 200%, navegação sem mouse e alternativa por botões ao drag-and-drop.
- Viewports obrigatórias: 360, 390, 768, 1024, 1366 e 1600px. Sem overflow horizontal acidental; tabela deve possuir alternativa mobile.
- Diálogos respeitam viewport e safe-area, rolagem própria e botão de fechar acessível.

## 9. Não objetivos da proposta

- Não redesenhar marca/logo oficial sem confirmação do proprietário.
- Não inventar dashboards, faturamento, retenção, alunos, treinos ou estados financeiros.
- Não ativar modo escuro, tradução de conteúdo comercial, notificações reais ou novas páginas de configuração como parte do tema.
- Não introduzir migração de CSS que também altere APIs, autorização, schemas Mongo ou adapter Asaas.
- Não instalar biblioteca de ícones/animação sem auditoria de bundle, licença e compatibilidade; decidir no planejamento de implementação.

## 10. Critérios de aprovação

Aprovar identidade, cores, tipografia, densidade, navegação por perfil e escopo das páginas antes de tokens/código. O aceite do documento não é aceite dos hexes finais nem autorização para alterar dados/funcionalidades; após aprovação, fazer protótipo visual limitado do shell e validar com usuários antes da migração dos módulos.
