import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '../../../../lib/api-auth';
import { getDatabase } from '../../../../lib/mongodb';

export const runtime = 'nodejs';

const DAY_MS = 24 * 60 * 60 * 1000;
const AUDIT_RETENTION_DAYS = 30;
const NOTIFICATION_RETENTION_DAYS = 30;
const DELETED_TEMPLATE_RETENTION_DAYS = 30;

export async function POST() {
  const access = await requireSuperAdmin();
  if (access.response) return access.response;

  try {
    const database = await getDatabase();
    const now = new Date();
    const auditCutoff = new Date(now.getTime() - AUDIT_RETENTION_DAYS * DAY_MS);
    const notificationCutoff = new Date(now.getTime() - NOTIFICATION_RETENTION_DAYS * DAY_MS);
    const templateCutoff = new Date(now.getTime() - DELETED_TEMPLATE_RETENTION_DAYS * DAY_MS);

    const [authAttempts, auditLogs, notifications, templates] = await Promise.all([
      database.collection('auth_attempts').deleteMany({ expiresAt: { $lte: now } }),
      database.collection('audit_logs').deleteMany({ timestamp: { $lte: auditCutoff } }),
      database.collection('notifications').deleteMany({ readAt: { $type: 'date' }, createdAt: { $lte: notificationCutoff } }),
      database.collection('workout_templates').deleteMany({ deletedAt: { $lte: templateCutoff } }),
    ]);

    return NextResponse.json({
      ok: true,
      retentionDays: { auditLogs: AUDIT_RETENTION_DAYS, readNotifications: NOTIFICATION_RETENTION_DAYS, deletedWorkoutTemplates: DELETED_TEMPLATE_RETENTION_DAYS },
      removed: { expiredLoginAttempts: authAttempts.deletedCount, oldAuditLogs: auditLogs.deletedCount, oldReadNotifications: notifications.deletedCount, oldDeletedWorkoutTemplates: templates.deletedCount },
    });
  } catch {
    return NextResponse.json({ error: 'Não foi possível executar a limpeza de dados temporários.' }, { status: 500 });
  }
}
