import { NextResponse } from 'next/server';
import { requireUser, requireStaff } from '../../../lib/api-auth';
import {
  deleteWorkoutPlan,
  listWorkoutPlans,
  parseWorkoutPlanRequest,
  saveWorkoutPlan,
  updateWorkoutPlanFields,
  workoutPlanErrorResponse,
} from '../../../lib/workout-plan-service';

export const runtime = 'nodejs';

export async function GET(request) {
  const access = await requireUser();
  if (access.response) return access.response;
  try { return NextResponse.json(await listWorkoutPlans(access.user, request)); }
  catch (error) { return workoutPlanErrorResponse(error, 'Não foi possível carregar as fichas.'); }
}

export async function POST(request) {
  const access = await requireStaff();
  if (access.response) return access.response;
  try {
    const payload = await parseWorkoutPlanRequest(request);
    return NextResponse.json(await saveWorkoutPlan(access.user, payload, true), { status: 201 });
  } catch (error) { return workoutPlanErrorResponse(error, 'Não foi possível criar a ficha.'); }
}

export async function PUT(request) {
  const access = await requireStaff();
  if (access.response) return access.response;
  try {
    const payload = await parseWorkoutPlanRequest(request);
    return NextResponse.json(await saveWorkoutPlan(access.user, payload));
  } catch (error) { return workoutPlanErrorResponse(error, 'Não foi possível salvar a ficha.'); }
}

export async function PATCH(request) {
  const access = await requireStaff();
  if (access.response) return access.response;
  try {
    const payload = await parseWorkoutPlanRequest(request);
    return NextResponse.json(await updateWorkoutPlanFields(access.user, payload));
  } catch (error) { return workoutPlanErrorResponse(error, 'Não foi possível atualizar a ficha.'); }
}

export async function DELETE(request) {
  const access = await requireStaff();
  if (access.response) return access.response;
  try {
    const id = new URL(request.url).searchParams.get('id');
    return NextResponse.json(await deleteWorkoutPlan(access.user, id));
  } catch (error) { return workoutPlanErrorResponse(error, 'Não foi possível excluir a ficha.'); }
}
