import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../lib/api-auth';
import { getDatabase } from '../../../lib/mongodb';
import { writeAuditLog } from '../../../lib/audit';

export const runtime = 'nodejs';
const defaults = { id: 'academy', academyName: 'Atlas Training', unitName: 'Unidade Centro', phone: '', email: '', timezone: 'America/Sao_Paulo' };
const clean = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';

export async function GET() {
  const access = await requireAdmin();
  if (access.response) return access.response;
  try {
    const settings = await (await getDatabase()).collection('app_settings').findOne({ id: 'academy' });
    return NextResponse.json({ settings: { ...defaults, ...(settings || {}) } });
  } catch {
    return NextResponse.json({ error: 'Não foi possível carregar as configurações.' }, { status: 500 });
  }
}

export async function PUT(request) {
  const access = await requireAdmin();
  if (access.response) return access.response;
  try {
    const payload = await request.json();
    const settings = {
      ...defaults,
      academyName: clean(payload.academyName, 100),
      unitName: clean(payload.unitName, 100),
      phone: clean(payload.phone, 40),
      email: clean(payload.email, 160),
      timezone: ['America/Sao_Paulo', 'America/Manaus', 'America/Belem', 'America/Fortaleza', 'America/Cuiaba', 'America/Recife'].includes(payload.timezone) ? payload.timezone : defaults.timezone,
      updatedAt: new Date(), updatedBy: access.user.id,
    };
    if (settings.academyName.length < 2 || settings.unitName.length < 2) return NextResponse.json({ error: 'Informe o nome da academia e da unidade.' }, { status: 400 });
    const database = await getDatabase();
    await database.collection('app_settings').updateOne({ id: 'academy' }, { $set: settings, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
    await writeAuditLog(database, { userId: access.user.id, action: 'update', resource: 'app_settings', resourceId: 'academy' });
    return NextResponse.json({ settings: { ...settings, id: 'academy' } });
  } catch {
    return NextResponse.json({ error: 'Não foi possível salvar as configurações.' }, { status: 500 });
  }
}
