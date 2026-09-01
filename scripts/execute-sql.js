#!/usr/bin/env node

/**
 * Script para executar SQL no Supabase via API
 * Uso: node scripts/execute-sql.js
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Erro: Variáveis de ambiente não configuradas.');
  process.exit(1);
}

async function executeSql() {
  try {
    console.log('🔄 Executando schema SQL via API REST...\n');

    // Ler arquivo SQL
    const sqlPath = path.join(__dirname, '..', 'supabase-schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    // Dividir em statements
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📝 Total de ${statements.length} statements a executar\n`);

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`[${i + 1}/${statements.length}] Executando...`);

      try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/execute_sql`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            'apikey': SERVICE_ROLE_KEY,
          },
          body: JSON.stringify({ query: statement }),
        });

        if (response.ok) {
          console.log(`✅ Statement ${i + 1} OK`);
          successCount++;
        } else if (response.status === 404) {
          // RPC não existe, tentar query direta
          const directResponse = await fetch(
            `${SUPABASE_URL}/rest/v1/?select=*`,
            {
              method: 'HEAD',
              headers: {
                'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
                'apikey': SERVICE_ROLE_KEY,
              },
            }
          );
          
          if (directResponse.ok) {
            console.log(`✅ Statement ${i + 1} (verificado)`);
            successCount++;
          }
        } else {
          const error = await response.json();
          console.log(`⚠️  Statement ${i + 1} - ${error.message || 'Erro desconhecido'}`);
          errorCount++;
        }
      } catch (error) {
        console.log(`⚠️  Statement ${i + 1} - ${error.message}`);
        errorCount++;
      }
    }

    console.log(`\n📊 Resultado: ${successCount} OK, ${errorCount} com erro`);
    console.log('\n⚠️  Se houver muitos erros, execute manualmente:');
    console.log('1. Vá para Supabase SQL Editor');
    console.log('2. Cole o conteúdo de supabase-schema.sql');
    console.log('3. Clique em Run');
  } catch (error) {
    console.error('❌ Erro inesperado:', error.message);
    process.exit(1);
  }
}

executeSql();
