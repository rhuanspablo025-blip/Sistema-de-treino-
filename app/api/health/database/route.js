import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/api-auth';
import { getDatabase } from '../../../../lib/mongodb';

export const runtime = 'nodejs';

export async function GET() {
  const access = await requireAdmin();
  if (access.response) return access.response;
  try {
    const database = await getDatabase();
    await database.command({ ping: 1 });
    return NextResponse.json({ status: 'ok', database: database.databaseName });
  } catch {
    return NextResponse.json({ status: 'error', error: 'Não foi possível conectar ao banco de dados.' }, { status: 503 });
  }
}
