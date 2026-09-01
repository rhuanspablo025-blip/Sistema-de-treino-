#!/usr/bin/env node

/**
 * Script para criar usuário ADM usando SQL direto
 * Uso: node scripts/create-admin-user-sql.js
 */

require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Erro: Variáveis de ambiente não configuradas.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function createAdminUserSQL() {
  try {
    console.log('🔄 Criando usuário ADM via SQL...');

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

    const userId = authData.user.id;
    console.log('✅ Usuário criado na autenticação');
    console.log(`   ID: ${userId}`);

    // Aguardar um pouco para o cache atualizar
    console.log('⏳ Aguardando cache do Supabase...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Criar perfil usando insert direto
    console.log('🔄 Criando perfil...');
    
    let profileError = null;
    try {
      // Tentar insert direto
      const { error } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          full_name: 'Rpss2',
          role: 'admin',
          active: true,
        });
      profileError = error;
    } catch (e) {
      profileError = e;
    }

    if (profileError) {
      console.error('❌ Erro ao criar perfil:', profileError.message);
      // Tentar deletar usuário
      await supabase.auth.admin.deleteUser(userId);
      process.exit(1);
    }

    console.log('✅ Perfil criado com sucesso');

    console.log('\n🎉 Usuário ADM criado com sucesso!');
    console.log('   Nome: Rpss2');
    console.log('   Email: rhuandesa611@gmail.com');
    console.log('   Senha: Rrp24a09#');
    console.log('   Role: admin');
    console.log('\n📧 Você pode fazer login em http://localhost:3000/login');
  } catch (error) {
    console.error('❌ Erro inesperado:', error.message);
    process.exit(1);
  }
}

createAdminUserSQL();
