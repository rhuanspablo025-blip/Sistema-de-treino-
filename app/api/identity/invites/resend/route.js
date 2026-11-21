import { NextResponse } from 'next/server';
import { requireUser } from '../../../../../lib/api-auth';
import { getTursoClient } from '../../../../../lib/mongodb';
import { resolveAuthenticatedIdentity, requirePersonalAccess } from '../../../../../lib/identity-authorization.mjs';
import { resendRelationshipInvite } from '../../../../../lib/identity-relationships.mjs';
import { sendRelationshipInvite } from '../../../../../lib/identity-delivery.mjs';
export const runtime='nodejs';
export async function POST(request){const access=await requireUser();if(access.response)return access.response;try{const client=await getTursoClient(),actor=requirePersonalAccess(await resolveAuthenticatedIdentity(client,access.user)),{id}=await request.json();return NextResponse.json(await resendRelationshipInvite(client,actor,id,(payload)=>sendRelationshipInvite(payload)));}catch(e){return NextResponse.json({error:e.status?e.message:'Nao foi possivel reenviar o convite.'},{status:e.status||500});}}
