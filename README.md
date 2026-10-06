# Atlas Training

Sistema web para gestão de alunos e fichas de treino de uma academia, com autenticação própria e MongoDB Atlas.

## Configuração local

1. Instale Node.js 20.9 ou superior e execute `npm install`.
2. Crie um cluster no MongoDB Atlas, um usuário de banco e libere o IP do ambiente que executará o app.
3. Copie `.env.example` para `.env.local` e preencha `MONGODB_URI` com a URI do usuário de aplicação.
4. Para criar o primeiro administrador, preencha `ADMIN_USERNAME`, `ADMIN_PASSWORD` e `ADMIN_NAME` localmente e execute `npm run admin:create`.
5. Para criar o usuário mestre de desenvolvimento, configure `DEV_USERNAME`, `DEV_PASSWORD` (mínimo 8 caracteres) e `DEV_NAME`, então execute `npm run dev:create`.
6. Inicie com `npm run dev` e abra `http://localhost:3000`.

O login usa somente username, único e sem distinção entre maiúsculas e minúsculas. São aceitos de 3 a 30 caracteres: letras ASCII, números, hífen e sublinhado, sem espaços. O cadastro público cria contas ativas de aluno; a tela de cadastro informa se o username já está em uso. Perfis administrativos e de professor são criados somente por usuários autorizados. O `id` UUID é a identidade da aplicação usada por sessões e relações (`userId`); o `_id` automático do Mongo permanece como chave interna do documento.

## Publicar na Vercel

1. Importe este repositório no painel da Vercel e mantenha o framework **Next.js**.
2. Em **Settings > Environment Variables**, configure `MONGODB_URI`.
3. Faça redeploy após salvar as variáveis. O MongoDB é acessado somente pelo servidor; a URI não deve usar prefixo `NEXT_PUBLIC_`.

O banco é fixado pelo código como `sistema_treino`; a chave de sessão é derivada no servidor da URI privada e não precisa de outra variável. Rotacionar a URI invalida as sessões atuais. No Atlas, o usuário da aplicação deve ter somente a role integrada `readWrite` no banco `sistema_treino`; não use `atlasAdmin` nem acesso a todos os recursos. Configure uma regra de rede apropriada para a Vercel. Não publique a URI no repositório.

A senha pode ser redefinida por um administrador na tela de gerenciamento de usuários. Não há recuperação por e-mail, pois e-mail não é exigido nem usado como identificador de conta.

Após iniciar e entrar com uma conta administradora, consulte `/api/health/database` para confirmar a conexão. A resposta não inclui a URI nem credenciais.

## Fichas de treino

Os metadados da ficha ficam em `workout_plans`; cada dia semanal é um documento em `workouts` ligado por `workoutPlanId`, e sua lista ordenada de prescrições referencia o catálogo compartilhado `exercises` por `exerciseId`. Séries, repetições, carga, intervalo, tempo, método e observações ficam na prescrição do dia. Criação e edição salvam ficha e dias em transação; dias removidos com histórico são arquivados, e a exclusão da ficha é lógica para preservar registros de treino e auditoria.

## Migração dos dados existentes

A alteração do código não copia automaticamente dados do Supabase. Antes de desativá-lo, exporte usuários, fichas e medidas e migre-os para `users`, `students`, `trainers`, `exercises`, `workout_plans`, `workouts`, `workout_history` e `audit_logs`. Os usuários devem conter `id`, `name`, `username`, `passwordHash`, `role`, `active`, `createdAt` e `updatedAt`; senhas existentes precisam ser redefinidas, nunca importadas em texto puro. Na inicialização, contas antigas convertem o trecho anterior ao `@` em username. Contas sem username válido ou com colisão recebem um username determinístico `usuario-...`, registrado no log da aplicação, e os campos de e-mail são removidos.

A aplicação armazena senhas com bcrypt e usa cookie HTTP-only assinado para as sessões. A política de privacidade está em `/privacy`; revise os dados de contato do controlador antes de usar dados pessoais reais.
