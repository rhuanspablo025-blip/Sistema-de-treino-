import { NextResponse } from 'next/server';
import { createClient } from '@libsql/client';
import { requireUser } from '../../../lib/api-auth';
export const runtime='nodejs';
const modes=['Esteira','Bicicleta','Elíptico','Escada','Remo','Corrida'];
let client, initialized;
async function db(){
 if(!client)client=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
 if(!initialized)initialized=client.execute('CREATE TABLE IF NOT EXISTS cardio_sessions (user_id TEXT NOT NULL, id TEXT NOT NULL, mode TEXT NOT NULL, duration INTEGER NOT NULL, recorded_at INTEGER NOT NULL, distance REAL, speed REAL, heart REAL, PRIMARY KEY(user_id,id))').catch(e=>{initialized=null;throw e});
 await initialized;return client;
}
export async function GET(){
 const a=await requireUser();if(a.response)return a.response;
 try{const d=await db();const r=await d.execute({sql:'SELECT id,mode,duration AS time,recorded_at AS date,distance,speed,heart FROM cardio_sessions WHERE user_id=? ORDER BY recorded_at DESC LIMIT 100',args:[a.user.id]});return NextResponse.json({sessions:r.rows},{headers:{'Cache-Control':'private, no-store'}})}catch{return NextResponse.json({error:'Falha ao carregar histórico.'},{status:500})}
}
export async function POST(request){
 const a=await requireUser();if(a.response)return a.response;
 try{
 const p=await request.json();
 const metric=(v,max)=>v==null||v===''?null:typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max?v:NaN;
 const distance=metric(p.distance,1000),speed=metric(p.speed,150),heart=metric(p.heart,250);
 if(typeof p.id!=='string'||!/^[a-zA-Z0-9-]{1,64}$/.test(p.id)||!modes.includes(p.mode)||!Number.isInteger(p.time)||p.time<1||p.time>86400||!Number.isSafeInteger(p.date)||p.date<0||p.date>Date.now()+60000||[distance,speed,heart].some(Number.isNaN))return NextResponse.json({error:'Sessão inválida.'},{status:400});
 const d=await db();await d.execute({sql:'INSERT INTO cardio_sessions(user_id,id,mode,duration,recorded_at,distance,speed,heart) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,id) DO NOTHING',args:[a.user.id,p.id,p.mode,p.time,p.date,distance,speed,heart]});return NextResponse.json({ok:true});
 }catch{return NextResponse.json({error:'Falha ao salvar sessão.'},{status:500})}
}
