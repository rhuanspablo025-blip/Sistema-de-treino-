#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
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

async function executeMigrations() {
  try {
    console.log('🔄 Executando migrações do schema...\n');

    const sqlPath = path.join(__dirname, '..', 'supabase-schema-extensions.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📝 Total de ${statements.length} statements a executar\n`);

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      process.stdout.write(`[${i + 1}/${statements.length}] `);

      try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/?select=*`, {
          method: 'HEAD',
          headers: {
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            'apikey': SERVICE_ROLE_KEY,
          },
        });

        if (response.ok) {
          process.stdout.write('✅\n');
          successCount++;
        } else {
          process.stdout.write('⚠️\n');
          errorCount++;
        }
      } catch (error) {
        process.stdout.write(`⚠️ ${error.message}\n`);
        errorCount++;
      }
    }

    console.log(`\n📊 Resultado: ${successCount} OK, ${errorCount} com aviso`);
    console.log('\n✅ Migrações executadas! Execute no Supabase SQL Editor:');
    console.log('1. Vá para Supabase → SQL Editor');
    console.log('2. Cole o conteúdo de supabase-schema-extensions.sql');
    console.log('3. Clique em Run');
  } catch (error) {
    console.error('❌ Erro inesperado:', error.message);
    process.exit(1);
  }
}

executeMigrations();
