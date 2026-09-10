#!/usr/bin/env node

/**
 * Script para criar um usuário ADM no Supabase
 * Uso: node scripts/create-admin-user.js
 */

require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_NAME = process.env.ADMIN_NAME || 'Administrador';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('❌ Erro: Variáveis de ambiente não configuradas.');
  console.error('   Configure NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL e ADMIN_PASSWORD no arquivo .env.local');
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

    console.log('✅ Usuário criado na autenticação');

    // Criar perfil
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: authData.user.id,
        full_name: ADMIN_NAME,
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
    console.log('   Email:', ADMIN_EMAIL);
    console.log('   Role: admin');
    console.log('\n   Você pode fazer login em http://localhost:3000/login');
  } catch (error) {
    console.error('❌ Erro inesperado:', error);
    process.exit(1);
  }
}

createAdminUser();
