import { requireUser } from '../../../../../../lib/api-auth';
import { getTursoClient } from '../../../../../../lib/mongodb';
import { createHistoryGetHandler } from '../../../../../../lib/identity-relationship-history-handler.mjs';

export const runtime = 'nodejs';
export const GET = createHistoryGetHandler({ requireUserFn: requireUser, getClient: getTursoClient });
