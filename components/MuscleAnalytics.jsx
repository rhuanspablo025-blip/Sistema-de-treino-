"use client";
import { useEffect, useState } from "react";
const fmt = n => Number(n).toLocaleString("pt-BR",{maximumFractionDigits:1});
export default function MuscleAnalytics({studentId,planId}) {
 const [mode,setMode]=useState("planned");
 const [days,setDays]=useState(7);
 const [state,setState]=useState({loading:true});
 const [selected,setSelected]=useState(null);
 useEffect(()=>{
  const controller=new AbortController();
  const params=new URLSearchParams({mode,days:String(days)});
  if(studentId) params.set("studentId",studentId);
  if(planId) params.set("planId",planId);
  setState({loading:true});setSelected(null);
  fetch("/api/muscle-analytics?"+params,{signal:controller.signal,cache:"no-store"})
   .then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||"Falha na consulta");return data;})
   .then(data=>{if(!controller.signal.aborted)setState({data});})
   .catch(error=>{if(!controller.signal.aborted)setState({error:error.message});});
  return ()=>controller.abort();
 },[studentId,planId,mode,days]);
 const data=state.data;
 const max=Math.max(1,...(data?.groups||[]).map(g=>g.primarySets));
 const active=data?.groups.find(g=>g.muscle===selected);
 return <section aria-label="Análise muscular" style={{background:"#15171b",color:"#f5f5f5",border:"1px solid #34363c",borderRadius:18,padding:"clamp(16px,3vw,28px)",marginBlock:20}}>
  <header><small style={{color:"#f6ce50"}}>ATLAS · DISTRIBUIÇÃO DE TREINO</small><h2>Análise muscular</h2><p>Distribuição de séries e volume de carga externa.</p></header>
  <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBlock:16}}>
   {[["planned","Planejado"],["performed","Realizado"]].map(([v,label])=><button key={v} type="button" className="outline-button" aria-pressed={mode===v} onClick={()=>setMode(v)}>{label}</button>)}
   {mode==="performed"&&[7,30].map(v=><button key={v} type="button" className="outline-button" aria-pressed={days===v} onClick={()=>setDays(v)}>{v} dias</button>)}
  </div>
  {state.loading&&<p role="status">Carregando análise…</p>}
  {state.error&&<p role="alert">{state.error}</p>}
  {data&&<><div style={{display:"flex",gap:24,flexWrap:"wrap"}}><div><small>Séries</small><h3>{fmt(data.totals.sets)}</h3></div><div><small>Volume registrado</small><h3>{fmt(data.totals.volume)} kg</h3></div></div>
  {!data.groups.length&&<p>Nenhum grupo muscular classificado neste recorte.</p>}
  {data.groups.map(g=><button type="button" key={g.muscle} aria-pressed={selected===g.muscle} onClick={()=>setSelected(g.muscle)} style={{display:"block",width:"100%",textAlign:"left",background:"transparent",color:"inherit",border:0,padding:"10px 0",cursor:"pointer"}}>
   <span style={{display:"flex",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}><strong style={{textTransform:"capitalize"}}>{g.muscle}</strong><span>{g.primarySets} primárias · {g.secondarySets} secundárias</span></span>
   <span style={{display:"block",height:7,background:"#38383d",borderRadius:8,marginTop:8}}><span style={{display:"block",height:"100%",width:(g.primarySets/max*100)+"%",background:"#f6ce50",borderRadius:8}}/></span>
  </button>)}
  {active&&<div aria-live="polite"><h3>{active.muscle}</h3><p>Volume atribuído: {fmt(active.attributedVolume)} kg</p><p>{active.exercises.join(" · ")||"Sem exercícios identificados"}</p></div>}
  {!!data.totals.unknownVolumeSets&&<p>{data.totals.unknownVolumeSets} séries sem volume calculável.</p>}
  {!!data.totals.unclassifiedSets&&<p>{data.totals.unclassifiedSets} séries sem classificação muscular.</p>}
  <small>As séries por músculo podem se sobrepor. O volume atribuído é uma divisão contábil, não uma medida de ativação fisiológica.</small></>}
 </section>;
}
