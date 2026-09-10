#!/usr/bin/env node

/**
 * Script para criar usuário ADM usando SQL direto
 * Uso: node scripts/create-admin-user-sql.js
 */

require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_NAME = process.env.ADMIN_NAME || 'Administrador';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
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
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: {
        full_name: ADMIN_NAME,
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
          full_name: ADMIN_NAME,
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
    console.log('   Nome:', ADMIN_NAME);
    console.log('   Email:', ADMIN_EMAIL);
    console.log('   Role: admin');
    console.log('\n📧 Você pode fazer login em http://localhost:3000/login');
  } catch (error) {
    console.error('❌ Erro inesperado:', error.message);
    process.exit(1);
  }
}

createAdminUserSQL();
