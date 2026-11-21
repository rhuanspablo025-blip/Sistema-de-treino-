import { NextResponse } from 'next/server';
import { requireUser } from '../../../../../lib/api-auth';
import { getTursoClient } from '../../../../../lib/mongodb';
import { resolveAuthenticatedIdentity } from '../../../../../lib/identity-authorization.mjs';
import { rejectRelationshipInvite } from '../../../../../lib/identity-relationships.mjs';
export const runtime='nodejs';
export async function POST(request){const access=await requireUser();if(access.response)return access.response;try{const body=await request.json();if(typeof body?.credential!=='string')return NextResponse.json({error:'Convite invalido.'},{status:400});const client=await getTursoClient(),actor=await resolveAuthenticatedIdentity(client,access.user);return NextResponse.json(await rejectRelationshipInvite(client,actor,body.credential));}catch(e){return NextResponse.json({error:e.status?e.message:'Nao foi possivel rejeitar o convite.'},{status:e.status||500});}}
