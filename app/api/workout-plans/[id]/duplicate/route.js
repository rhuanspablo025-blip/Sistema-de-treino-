import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { requireStaff } from '../../../../../lib/api-auth';
import { getDatabase, getMongoClient } from '../../../../../lib/mongodb';
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
    const filter = { id, deletedAt: { $exists: false } };
    if (access.user.role === 'trainer') filter.trainerId = access.user.id;
    const originalPlan = await database.collection('workout_plans').findOne(filter);
    if (!originalPlan) return NextResponse.json({ error: 'Ficha não encontrada.' }, { status: 404 });

    const now = new Date();
    const newPlanId = randomUUID();
    const newPlan = { ...originalPlan, id: newPlanId, trainerId: access.user.role === 'trainer' ? access.user.id : originalPlan.trainerId, name: `${originalPlan.name} (Cópia)`, startDate: now.toISOString().slice(0, 10), endDate: null, active: true, createdAt: now, updatedAt: now };
    delete newPlan._id;
    const workouts = await database.collection('workouts').find({ workoutPlanId: id, archived: { $ne: true } }).sort({ order: 1 }).toArray();
    const copies = workouts.map((workout) => {
      const copy = { ...workout, id: randomUUID(), workoutPlanId: newPlanId, archived: false, createdAt: now, updatedAt: now, exercises: (workout.exercises || []).map((exercise) => ({ ...exercise, id: randomUUID(), createdAt: now, updatedAt: now })) };
      delete copy._id;
      return copy;
    });
    const session = (await getMongoClient()).startSession();
    try {
      await session.withTransaction(async () => {
        await database.collection('workout_plans').insertOne(newPlan, { session });
        if (copies.length) await database.collection('workouts').insertMany(copies, { session });
        await writeAuditLog(database, { userId: access.user.id, action: 'duplicate', resource: 'workout_plan', resourceId: newPlanId, metadata: { sourcePlanId: id }, session });
      });
    } finally {
      await session.endSession();
    }
    return NextResponse.json({ plan: newPlan, message: 'Ficha duplicada com sucesso.' }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Não foi possível duplicar a ficha.' }, { status: 500 });
  }
}
