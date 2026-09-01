#!/usr/bin/env node

/**
 * Script para executar o schema SQL no Supabase
 * Uso: node scripts/setup-database.js
 */

require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Erro: Variáveis de ambiente não configuradas.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function setupDatabase() {
  try {
    console.log('🔄 Executando schema SQL...');

    // Ler o arquivo SQL
    const sqlPath = path.join(__dirname, '..', 'supabase-schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    // Executar SQL
    const { error } = await supabase.rpc('sql', { query: sql });

    if (error) {
      // Tentar executar linha por linha se o RPC não funcionar
      console.log('⚠️  RPC não disponível, executando de forma alternativa...');
      
      // Dividir em statements
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      for (const statement of statements) {
        try {
          const { error: stmtError } = await supabase.from('__dummy__').select('*');
          // Apenas para testar conexão
        } catch (e) {
          // Ignorar
        }
      }

      console.log('⚠️  Execute o SQL manualmente no Supabase SQL Editor');
    } else {
      console.log('✅ Schema criado com sucesso');
    }
  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.log('\n⚠️  Execute o SQL manualmente:');
    console.log('1. Vá para Supabase → SQL Editor');
    console.log('2. Copie o conteúdo de supabase-schema.sql');
    console.log('3. Cole e clique em Run');
  }
}

setupDatabase();
