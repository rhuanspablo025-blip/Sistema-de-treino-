import { NextResponse } from 'next/server';
import { requireUser } from '../../../lib/api-auth';
import { getDatabase } from '../../../lib/mongodb';
import { hasAnyRole, isAdminUser } from '../../../lib/user-roles';
import { aggregateMuscles } from '../../../lib/muscle-analytics.mjs';
export const runtime = 'nodejs';
export async function GET(request) {
  const access = await requireUser();
  if (access.response) return access.response;
  try {
    const p = new URL(request.url).searchParams;
    const studentId = p.get('studentId') || access.user.id;
    const mode = p.get('mode') || 'planned';
    const days = Number(p.get('days') || 7);
    if (!/^[0-9a-f-]{36}$/i.test(studentId) || !['planned','performed'].includes(mode) || ![7,30].includes(days)) return NextResponse.json({error:'Parâmetros inválidos.'},{status:400});
    const db = await getDatabase();
    const student = await db.collection('students').findOne({userId:studentId,active:true});
    const user = access.user;
    if (!student || !((isAdminUser(user) && user.tenantId && user.tenantId === student.tenantId) || (hasAnyRole(user,['student']) && user.id === studentId) || (hasAnyRole(user,['trainer']) && student.trainerId === user.id))) return NextResponse.json({error:'Acesso negado.'},{status:403});
    let entries = [];
    if (mode === 'planned') {
      const planId = p.get('planId');
      const filter = {studentId,active:true,deletedAt:{$exists:false}};
      if (planId) filter.id = planId;
      const plans = await db.collection('workout_plans').find(filter).sort({updatedAt:-1}).limit(1).toArray();
      if (plans.length) {
        const workouts = await db.collection('workouts').find({workoutPlanId:plans[0].id,archived:{$ne:true}}).toArray();
        entries = workouts.filter(w=>!w.isRestDay).flatMap(w=>w.exercises || []);
      }
    } else {
      const now = new Date();
      const start = new Date(now.getTime()-days*86400000);
      entries = await db.collection('workout_history').find({studentId,date:{$gte:start,$lte:now}}).toArray();
    }
    const ids = [...new Set(entries.map(e=>e.exerciseId).filter(Boolean))];
    const catalog = ids.length ? await db.collection('exercises').find({id:{$in:ids}}).toArray() : [];
    const restrictions = await db.collection('muscle_restrictions').find({studentId,active:true}).toArray();
    return NextResponse.json({restrictions:restrictions.map(({muscle,status,reason})=>({muscle,status,reason})),mode,days:mode==='performed'?days:null,...aggregateMuscles(entries,catalog,{mode})},{headers:{'Cache-Control':'private, no-store'}});
  } catch {
    return NextResponse.json({error:'Não foi possível calcular a análise muscular.'},{status:500});
  }
}
