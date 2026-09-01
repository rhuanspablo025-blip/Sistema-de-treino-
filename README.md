# Atlas Training

Sistema web para gestão de alunos e fichas de treino de uma academia.

## Rodar localmente

```bash
npm install
npm run dev
```

Depois, abra `http://localhost:3000`.

## Publicar na Vercel

1. Suba este repositório para o GitHub.
2. Importe o repositório em [vercel.com](https://vercel.com).
3. Mantenha o framework como **Next.js** e publique.

## Autenticação e banco

A base de autenticação usa Supabase. Crie um projeto no Supabase, execute `supabase-schema.sql` no SQL Editor e crie os usuários em **Authentication > Users**. Depois, promova o administrador na tabela `profiles`:

```sql
update public.profiles set role = 'admin' where id = 'UUID_DO_ADMIN';
```

Configure estas variáveis localmente em `.env.local` e também na Vercel:

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-anon
SUPABASE_SERVICE_ROLE_KEY=sua-chave-service-role

# Opcional: somente para você testar o perfil corporal avançado
NEXT_PUBLIC_PROFILE_DEV=false
```

`SUPABASE_SERVICE_ROLE_KEY` é usada somente pelas rotas do servidor para criar, editar e excluir usuários. Nunca a exponha no navegador.

Com as variáveis presentes, as rotas ficam protegidas e o login usa sessão segura por cookies. O nome exibido é `Rhuan` e o usuário de acesso é `Rpss2`. No Supabase, cadastre o usuário com o e-mail técnico `rpss2@atlas.training`; o e-mail fica oculto na interface. Para o acesso total do dev, defina a claim `app_metadata.role = dev` no usuário Rhuan. O schema inclui `body_measurements`, que guarda o histórico de medidas. Defina `NEXT_PUBLIC_PROFILE_DEV=true` apenas no seu ambiente de desenvolvimento para abrir o perfil corporal avançado. Para usuários comuns, a área aparece como “Perfil em desenvolvimento”.
