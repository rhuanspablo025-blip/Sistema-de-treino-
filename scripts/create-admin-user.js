#!/usr/bin/env node

/**
 * Script para criar um usuário ADM no Supabase
 * Uso: node scripts/create-admin-user.js
 */

require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Erro: Variáveis de ambiente não configuradas.');
  console.error('   Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no arquivo .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function createAdminUser() {
  try {
    console.log('🔄 Criando usuário ADM...');

    // Criar usuário na autenticação
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: 'rhuandesa611@gmail.com',
      password: 'Rrp24a09#',
      email_confirm: true,
      user_metadata: {
        full_name: 'Rpss2',
      },
      app_metadata: {
        role: 'admin',
      },
    });

    if (authError) {
      console.error('❌ Erro ao criar usuário na autenticação:', authError.message);
      process.exit(1);
    }

    console.log('✅ Usuário criado na autenticação');

    // Criar perfil
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: authData.user.id,
        full_name: 'Rpss2',
        role: 'admin',
        active: true,
      })
      .select()
      .single();

    if (profileError) {
      console.error('❌ Erro ao criar perfil:', profileError.message);
      // Deletar usuário se o perfil falhar
      await supabase.auth.admin.deleteUser(authData.user.id);
      process.exit(1);
    }

    console.log('✅ Perfil criado com sucesso');
    console.log('\n🎉 Usuário ADM criado com sucesso!');
    console.log('   Email:', 'rhuandesa611@gmail.com');
    console.log('   Senha:', '(veja no formulário de login)');
    console.log('   Role: admin');
    console.log('\n   Você pode fazer login em http://localhost:3000/login');
  } catch (error) {
    console.error('❌ Erro inesperado:', error);
    process.exit(1);
  }
}

createAdminUser();
