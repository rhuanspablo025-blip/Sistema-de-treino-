export const SYSTEM_DOCUMENTATION = `# Referência do sistema

Este documento descreve a finalidade das áreas e as regras principais implementadas no Atlas Training. É uma referência para entender o sistema, não um tutorial de operação.

## Visão geral

O sistema reúne cadastro de pessoas, gestão de alunos e professores, fichas de treino, acompanhamento do aluno e controle financeiro interno. Uma conta pode acumular mais de um perfil, mantendo um único login.

## Pessoas, perfis e acessos

Cada pessoa tem uma conta de acesso e pode ter um ou mais perfis: aluno, professor/personal, administrador ou desenvolvedor. O perfil define as áreas disponíveis e o tipo de dado que a pessoa pode administrar.

- Administradores e o proprietário podem administrar cadastros, configurações, fichas e documentação.
- Desenvolvedores têm acesso às áreas administrativas previstas para a equipe, mas a documentação deste sistema fica restrita a administradores e ao proprietário.
- Professores trabalham com alunos relacionados à sua conta. Contas com perfil administrativo também possuem o escopo amplo de administração.
- Alunos vinculados a um professor consultam a ficha. Alunos avulsos, sem professor responsável, podem manter a própria ficha na visão de aluno.
- Contas podem ser ativadas, inativadas ou excluídas logicamente. A exclusão lógica preserva o histórico associado.

## Áreas do sistema

### Visão geral

Resume os cadastros, as fichas e a biblioteca de exercícios, além de oferecer atalhos para as principais áreas de gestão.

### Cadastros

Mantém pessoas e credenciais em um único diretório. Reúne perfis múltiplos, informações de aluno ou professor, vínculo entre aluno e professor, situação da conta e acesso permanente ao financeiro para contas administrativas autorizadas.

### Fichas de treino

Organiza fichas por aluno e por dias de treino. Uma ficha pode conter exercícios, séries, repetições, carga, descanso, duração, método e observações. A área também reúne modelos reutilizáveis e a biblioteca de exercícios.

Alterações de ficha exigem confirmação por senha. O acesso de professor é limitado aos alunos relacionados a ele; a administração tem escopo administrativo. O aluno vinculado consulta a ficha sem editá-la. O aluno avulso pode editar a própria ficha na visão do aluno.

### Biblioteca de exercícios

Guarda os exercícios disponíveis para montar fichas, incluindo detalhes e instruções. Exercícios podem ser mantidos na biblioteca ou inativados sem removê-los dos registros históricos que os utilizam.

### Visão do aluno

Apresenta a ficha e o acompanhamento de treino da conta selecionada. Inclui histórico de execução e informações de perfil corporal, conforme os dados registrados para o aluno.

### Financeiro

É um controle administrativo interno de planos, assinaturas, cobranças, recebimentos, acessos e histórico financeiro. A administração pode registrar recebimentos manualmente por período, definir vencimentos e regras de acesso e conceder acesso permanente a contas selecionadas.

Um recebimento manual atualiza o acesso relacionado e pode gerar uma notificação para a conta. Avisos de vencimento são avaliados quando a pessoa autentica, se houver uma cobrança futura pendente. A referência ou observação do recebimento é textual; não há anexação de comprovante de arquivo.

### Configurações

Guarda identificação e contatos da academia, unidade e fuso horário. Esses dados são usados na identificação do espaço de trabalho.

### Documentação

Esta área de referência resume módulos, dados, permissões e limites atuais. Ela é apresentada somente a administradores e ao proprietário; a API que fornece o texto aplica a mesma restrição.

## Dados e histórico

Contas, perfis de aluno e professor, planos de treino, exercícios, histórico de treino, notificações, configurações da academia e registros financeiros são persistidos no banco MongoDB. O cadastro de uma pessoa e seus papéis são conceitos distintos: os papéis habilitam funções, enquanto os dados de aluno ou professor guardam as relações e informações específicas de cada perfil.

## Limites atuais

- O financeiro registra pagamentos manualmente; checkout e pagamento online não estão habilitados.
- A rotina agendada de geração automática de cobranças e bloqueio por inadimplência está desativada. Portanto, a gestão de vencimentos não deve ser entendida como uma cobrança recorrente automática.
- A baixa manual aceita método e referência em texto, sem upload de comprovante.
- O aviso de vencimento depende da existência de cobrança pendente e é verificado no acesso da conta.
- A sessão usa cookie HTTP-only e pode durar até 30 dias com a opção de permanência ou 8 horas sem ela.
- A recuperação de senha por e-mail não está implementada; redefinições dependem da administração.`;
