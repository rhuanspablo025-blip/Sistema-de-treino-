import { NextResponse } from 'next/server';
import { requireUser } from '../../../lib/api-auth';
import { assertWorkoutPlanEditor } from '../../../lib/workout-permissions';
import {
  deleteWorkoutPlan, listWorkoutPlans, parseWorkoutPlanRequest,
  saveWorkoutPlan, updateWorkoutPlanFields, workoutPlanErrorResponse,
} from '../../../lib/workout-plan-service';

export const runtime = 'nodejs';

export async function GET(request) {
  const access = await requireUser();
  if (access.response) return access.response;
  try { return NextResponse.json(await listWorkoutPlans(access.user, request)); }
  catch (error) { return workoutPlanErrorResponse(error, 'Não foi possível carregar as fichas.'); }
}

export async function POST(request) {
  const access = await requireUser();
  if (access.response) return access.response;
  try {
    const payload = await parseWorkoutPlanRequest(request);
    await assertWorkoutPlanEditor(access.user, null, payload.confirmPassword, payload.studentId);
    return NextResponse.json(await saveWorkoutPlan(access.user, payload, true), { status: 201 });
  } catch (error) { return workoutPlanErrorResponse(error, 'Não foi possível criar a ficha.'); }
}

export async function PUT(request) {
  const access = await requireUser();
  if (access.response) return access.response;
  try {
    const payload = await parseWorkoutPlanRequest(request);
    await assertWorkoutPlanEditor(access.user, payload.id, payload.confirmPassword, payload.studentId);
    return NextResponse.json(await saveWorkoutPlan(access.user, payload));
  } catch (error) { return workoutPlanErrorResponse(error, 'Não foi possível salvar a ficha.'); }
}

export async function PATCH(request) {
  const access = await requireUser();
  if (access.response) return access.response;
  try {
    const payload = await parseWorkoutPlanRequest(request);
    await assertWorkoutPlanEditor(access.user, payload.id, payload.confirmPassword);
    return NextResponse.json(await updateWorkoutPlanFields(access.user, payload));
  } catch (error) { return workoutPlanErrorResponse(error, 'Não foi possível atualizar a ficha.'); }
}

export async function DELETE(request) {
  const access = await requireUser();
  if (access.response) return access.response;
  try {
    const { confirmPassword } = await request.json();
    const id = new URL(request.url).searchParams.get('id');
    await assertWorkoutPlanEditor(access.user, id, confirmPassword);
    return NextResponse.json(await deleteWorkoutPlan(access.user, id));
  } catch (error) { return workoutPlanErrorResponse(error, 'Não foi possível excluir a ficha.'); }
}
