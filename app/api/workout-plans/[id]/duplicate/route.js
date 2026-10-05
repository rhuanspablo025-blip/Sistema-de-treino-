import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { requireStaff } from '../../../../../lib/api-auth';
import { getDatabase } from '../../../../../lib/mongodb';
import { writeAuditLog } from '../../../../../lib/audit';

export const runtime = 'nodejs';
const idPattern = /^[0-9a-f-]{36}$/i;

export async function POST(request, { params }) {
  const access = await requireStaff();
  if (access.response) return access.response;
  try {
    const { id } = await params;
    if (!idPattern.test(id || '')) return NextResponse.json({ error: 'ID da ficha inválido.' }, { status: 400 });
    const database = await getDatabase();
    const filter = { id, active: true };
    if (access.user.role === 'trainer') filter.trainerId = access.user.id;
    const originalPlan = await database.collection('workout_plans').findOne(filter);
    if (!originalPlan) return NextResponse.json({ error: 'Ficha não encontrada.' }, { status: 404 });

    const now = new Date();
    const newPlanId = randomUUID();
    const newPlan = { ...originalPlan, id: newPlanId, trainerId: access.user.id, name: `${originalPlan.name} (Cópia)`, startDate: now.toISOString().slice(0, 10), endDate: null, createdAt: now, updatedAt: now };
    delete newPlan._id;
    await database.collection('workout_plans').insertOne(newPlan);
    const workouts = await database.collection('workouts').find({ workoutPlanId: id }).sort({ order: 1 }).toArray();
    if (workouts.length) {
      await database.collection('workouts').insertMany(workouts.map((workout) => {
        const copy = { ...workout, id: randomUUID(), workoutPlanId: newPlanId, createdAt: now, updatedAt: now, exercises: (workout.exercises || []).map((exercise) => ({ ...exercise, id: randomUUID(), createdAt: now, updatedAt: now })) };
        delete copy._id;
        return copy;
      }));
    }
    await writeAuditLog(database, { userId: access.user.id, action: 'duplicate', resource: 'workout_plan', resourceId: newPlanId, metadata: { sourcePlanId: id } });
    return NextResponse.json({ plan: newPlan, message: 'Ficha duplicada com sucesso.' }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Não foi possível duplicar a ficha.' }, { status: 500 });
  }
}
