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

## Financeiro SaaS

O painel Financeiro é autorizado no backend somente quando `users.role` é `SUPER_ADMIN` e o username é `rhuanspablo025`. Configure a conta existente uma única vez com `npm run super-admin:setup`; para uma conta nova, defina `SUPER_ADMIN_PASSWORD` somente no ambiente local seguro. A senha não é versionada, e a role não pode ser atribuída pelas APIs normais de usuários.

As collections financeiras são `billing_plans`, `subscriptions`, `invoices`, `payments`, `payment_webhooks`, `payment_provider_customers`, `billing_rules`, `access_blocks` e `financial_ledger`. O job diário em `/api/finance/cron/daily` exige `CRON_SECRET`; configure esse segredo também na Vercel para o agendamento de `vercel.json`. Cobranças são calculadas no servidor em centavos. O adapter do provedor valida a autenticação oficial do webhook e converte seu payload para o contrato interno; o core concilia pagamento externo, fatura, pagador, valor e moeda com idempotência.

O provider padrão continua `unconfigured`; Asaas fica disponível somente quando `PAYMENT_PROVIDER=asaas`, `PAYMENT_ENVIRONMENT=sandbox` ou `production`, `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` estão configurados no servidor. As URLs base são fixas no adapter: `https://api-sandbox.asaas.com/v3` e `https://api.asaas.com/v3`, respectivamente. Nunca use uma chave de produção no sandbox ou o contrário.

O adapter Asaas segue a documentação oficial: cria cobranças por Pix e boleto, obtém QR Pix/linha digitável e redireciona cartão para a `invoiceUrl` hospedada pelo Asaas. Nenhum dado de cartão passa ou fica no app. O Asaas exige nome e CPF/CNPJ para criar o cliente; o documento só é enviado na criação, não é gravado no Mongo nem em auditoria. O ID externo do pagador é armazenado em `payment_provider_customers`, separado por ambiente. A chave fica em `ASAAS_API_KEY`; não copie valores para `.env.example` ou Git.

Cadastre na conta Asaas o webhook `https://sistemadetreino.vercel.app/api/finance/webhook/asaas`, versão 3, com token `authToken` de 32 a 255 caracteres igual a `ASAAS_WEBHOOK_TOKEN`. Selecione ao menos `PAYMENT_CREATED`, `PAYMENT_UPDATED`, `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_DELETED`, `PAYMENT_REFUNDED`, `PAYMENT_PARTIALLY_REFUNDED`, `PAYMENT_CHARGEBACK_REQUESTED`, `PAYMENT_CHARGEBACK_DISPUTE`, `PAYMENT_AWAITING_CHARGEBACK_REVERSAL` e `PAYMENT_RECEIVED_IN_CASH_UNDONE`. Cadastre esse token como secret na Vercel; o endpoint valida o header oficial `asaas-access-token`, armazena o ID idempotente do evento e concilia `payment.externalReference`, ID, customer, valor e tipo de cobrança. Eventos não utilizados são auditados e reconhecidos; estornos parciais e chargebacks vão para revisão.

Para acompanhar o repasse automático, selecione também `TRANSFER_CREATED`, `TRANSFER_PENDING`, `TRANSFER_IN_BANK_PROCESSING`, `TRANSFER_BLOCKED`, `TRANSFER_DONE`, `TRANSFER_FAILED` e `TRANSFER_CANCELLED` no mesmo webhook.

No Asaas, configure e valide a conta de recebimento Bradesco pelo onboarding da própria conta Asaas. A API deste app integra com Asaas, não com o banco Bradesco diretamente; não armazene dados bancários neste projeto. Configure também `CRON_SECRET` na Vercel para o job diário. O retorno do checkout nunca liquida faturas: somente eventos Asaas autenticados podem fazê-lo.

Para repasse automático, configure `ASAAS_AUTO_PAYOUT_ENABLED=true` e `ASAAS_PAYOUT_BANK_ACCOUNT_JSON` como secrets na Vercel. O JSON usa os campos oficiais de transferência bancária Asaas: `bank.code`, `ownerName`, `cpfCnpj`, `agency`, `account`, `accountDigit` e `bankAccountType`; `ownerBirthDate` somente quando exigido por titularidade divergente. Os dados são enviados à API do Asaas e não são guardados no Mongo nem na auditoria. O app transfere o `netValue` do evento `PAYMENT_RECEIVED`, uma vez por pagamento, e acompanha `TRANSFER_DONE`, `TRANSFER_FAILED` e `TRANSFER_CANCELLED`. O repasse permanece desativado até ambos os secrets serem configurados. Tarifas de transferência podem alterar o líquido creditado no Bradesco; timeouts ficam em revisão e não são reenviados automaticamente.
