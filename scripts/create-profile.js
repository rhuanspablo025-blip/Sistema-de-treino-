#!/usr/bin/env node

/**
 * Script para criar perfil do usuário ADM existente
 */

require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Erro: Variáveis de ambiente não configuradas.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function createProfileForUser() {
  try {
    console.log('🔄 Buscando usuário existente...');

    // Buscar usuário por email
    const { data: users, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      console.error('❌ Erro ao listar usuários:', listError.message);
      process.exit(1);
    }

    const user = users?.users?.find(u => u.email === 'rhuandesa611@gmail.com');
    
    if (!user) {
      console.error('❌ Usuário rhuandesa611@gmail.com não encontrado');
      process.exit(1);
    }

    console.log(`✅ Usuário encontrado: ${user.id}`);

    // Criar perfil
    console.log('🔄 Criando perfil...');
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        full_name: 'Rpss2',
        role: 'admin',
      })
      .select()
      .single();

    if (profileError) {
      console.error('❌ Erro ao criar perfil:', profileError.message);
      console.error('   Detalhes:', profileError);
      process.exit(1);
    }

    console.log('✅ Perfil criado com sucesso');

    console.log('\n🎉 Usuário ADM está pronto!');
    console.log('─'.repeat(40));
    console.log('📧 Email: rhuandesa611@gmail.com');
    console.log('🔐 Senha: Rrp24a09#');
    console.log('👤 Nome: Rpss2');
    console.log('🛡️  Role: admin');
    console.log('─'.repeat(40));
    console.log('\n🌐 Acesse: http://localhost:3000/login');
  } catch (error) {
    console.error('❌ Erro inesperado:', error.message);
    process.exit(1);
  }
}

createProfileForUser();
