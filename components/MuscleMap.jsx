"use client";
import {useState} from "react";
const regions = {
 front:[
 ["deltoides","M74 79 C63 73 49 78 44 90 C38 101 42 116 53 119 C61 120 66 109 69 100 Q76 88 74 79Z"],
 ["peito","M78 82 C89 75 105 77 111 85 Q115 95 111 115 C108 133 82 132 75 118 Q68 101 78 82Z"],
 ["biceps","M57 125 C48 123 43 135 39 147 Q34 162 32 177 Q38 184 44 174 Q56 149 57 125Z M60 128 Q63 149 49 176 L46 174 Q55 151 60 128Z"],
 ["antebracos","M30 185 Q39 183 39 197 L22 244 L17 248 Q23 220 30 185Z M25 184 Q18 205 12 241 L15 245 L29 203 Q33 187 25 184Z"],
 ["abdomen","M96 133 Q103 126 113 130 L113 150 Q103 145 96 150Z M96 154 Q104 148 113 154 L113 170 L95 170Z M95 174 L113 174 L113 188 L96 188Z M96 192 L113 192 L113 227 Q101 223 98 211Z"],
 ["obliquos","M67 119 L91 131 L90 174 L78 196 L64 169Z"],
 ["quadriceps","M76 213 Q65 234 70 264 Q73 296 84 321 Q90 327 90 314 Q78 268 76 213Z M80 217 Q93 223 99 241 Q101 274 92 310 Q87 278 84 252Z M104 236 Q114 257 107 289 Q101 319 95 320 Q92 314 98 294Z"],
 ["adutores","M115 218 L109 293 L101 305 L115 259Z"],
 ["panturrilhas","M78 333 Q71 352 77 374 L85 407 Q90 410 88 393 L84 355Z M96 338 Q107 350 99 375 L91 401 L89 380Z"]],
 back:[
 ["trapezio","M96 77 Q103 70 113 76 L113 145 L102 121 L85 83Z"],
 ["deltoides","M74 79 C55 73 42 86 43 104 Q44 115 52 119 L63 103 Q75 93 74 79Z"],
 ["costas","M77 106 Q89 121 103 120 L112 151 L91 192 Q78 171 66 128Z"],
 ["triceps","M57 124 Q45 124 40 137 L37 155 Q49 149 57 124Z M38 159 Q47 150 51 149 Q49 169 37 181 L32 178Z"],
 ["antebracos","M30 185 Q39 183 39 197 L22 244 L17 248 Q23 220 30 185Z M25 184 Q18 205 12 241 L15 245 L29 203 Q33 187 25 184Z"],
 ["lombar","M91 175 L115 190 L115 211 L82 202Z"],
 ["gluteos","M79 208 Q90 196 103 202 L113 216 Q91 209 76 224Z M76 228 Q94 211 113 222 L113 249 Q105 266 88 258 Q72 252 76 228Z"],
 ["posterior de coxa","M74 254 Q66 270 73 296 L82 322 Q88 327 85 308 L80 279Z M86 261 Q99 266 104 257 L101 290 L93 325 Q88 313 92 290Z M108 257 L110 278 L102 310 L99 301Z"],
 ["panturrilhas","M88 331 Q76 339 75 359 Q75 379 82 384 Q88 381 88 367Z M92 331 Q104 341 104 360 Q103 380 96 384 Q90 381 92 365Z M82 389 Q87 385 89 391 L89 415 L85 410Z M94 389 Q100 386 99 394 L91 415 L92 396Z"]]
};
const normalize = value => String(value).normalize("NFD").replace(/\p{Diacritic}/gu,"").toLowerCase();
const aliases={peito:/peito|pector|chest/,costas:/costas|dors|latiss|back/,deltoides:/delto|ombro|shoulder/,biceps:/bicep/,triceps:/tricep/,antebracos:/antebr|forearm/,abdomen:/abdom|abs|core/,obliquos:/obliq/,quadriceps:/quadr|anterior de coxa/,adutores:/adut|adduct/,panturrilhas:/panturr|calf|calves|gastrocn/,trapezio:/trape|traps/,lombar:/lomb|erector|lower back/,gluteos:/glute|buttock/,"posterior de coxa":/posterior de coxa|hamstring|isquiotib/};
const parts = {
 front:{deltoides:["Deltoide anterior"],peito:["Peitoral maior"],biceps:["Bíceps braquial","Braquial"],antebracos:["Flexores do antebraço","Braquiorradial"],abdomen:["Reto abdominal superior","Reto abdominal médio","Reto abdominal inferior","Reto abdominal distal"],obliquos:["Oblíquo externo"],quadriceps:["Vasto lateral","Reto femoral","Vasto medial"],adutores:["Adutores da coxa"],panturrilhas:["Região tibial anterior","Região lateral da perna"]},
 back:{trapezio:["Trapézio"],deltoides:["Deltoide posterior"],costas:["Latíssimo do dorso"],triceps:["Tríceps lateral","Tríceps medial/longa"],antebracos:["Extensores do antebraço","Região radial"],lombar:["Eretores da coluna"],gluteos:["Glúteo médio (região)","Glúteo máximo"],"posterior de coxa":["Bíceps femoral","Semitendíneo","Semimembranáceo (região)"],panturrilhas:["Gastrocnêmio lateral","Gastrocnêmio medial","Região distal lateral","Região distal medial"]}
};
const legend=[["Sem séries","#28282a","#777"],["Baixa","#332326","#ff929f"],["Moderada","#3185d6","#8ac9ff"],["Alta","#21a587","#76f0ce"],["Muito alta","#ffe064","#ffe99c"]];
const score=g=>g.primarySets+g.secondarySets*.5;
const level=(n,max)=>n<=0?0:n/max<=.25?1:n/max<=.5?2:n/max<=.75?3:4;
export default function MuscleMap({groups=[],onSelect,restrictions=[]}) {
 const [selected,setSelected]=useState(null);
 const [metric,setMetric]=useState("sets");
 const [view,setView]=useState("both");
 const [filter,setFilter]=useState(null);
 const [labels,setLabels]=useState(false);
 const restrictionFor=(name,part)=>restrictions.find(r=>r&&r.active!==false&&[normalize(name),normalize(part)].includes(normalize(r.muscle)));
 const [restrictedOnly,setRestrictedOnly]=useState(false);
 const value=g=>metric==="sets"?score(g):g.attributedVolume;
 const max=Math.max(0,...groups.map(value));
 const support=["M95 29 Q105 19 115 22 L115 56 Q104 66 96 50Z","M100 58 L113 66 L113 76 L98 70Z","M66 135 L82 134 L91 155 L80 161 L65 151Z","M67 155 L80 165 L89 185 L79 194 L65 177Z","M79 312 Q94 315 103 327 L94 342 L82 338Z","M79 402 L91 409 L100 418 L95 432 L72 430Z","M12 248 Q22 241 30 250 L29 265 L23 269 L20 284 L16 282 L17 268 L10 282 L7 279 L12 264 L4 275 L1 271Z"];
 const outline="M116 15 C96 12 87 28 90 48 L98 67 L76 78 Q42 70 32 119 L23 176 L8 242 L12 265 L21 267 L30 246 L48 200 L62 153 L65 190 L69 240 L64 278 L75 327 L72 365 L79 414 L70 430 L93 435 L103 414 L109 370 L116 308";
 const fmt=n=>Number(n).toLocaleString("pt-BR",{maximumFractionDigits:1});
 const choose=(part,group,best,id)=>{setSelected({part,group,key:best?.muscle,id});if(best)onSelect?.(best.muscle);};
 const current=groups.find(g=>g.muscle===selected?.key);
 return <div style={{margin:"16px 0"}}>
 <div style={{display:"flex",flexWrap:"wrap",gap:8,justifyContent:"space-between"}}>
 <div aria-label="Métrica do mapa">{[["sets","Séries"],["volume","Carga externa"]].map(([k,l])=><button key={k} type="button" className="outline-button" aria-pressed={metric===k} onClick={()=>setMetric(k)}>{l}</button>)}</div>
 <button type="button" className="outline-button" aria-pressed={labels} onClick={()=>setLabels(v=>!v)}>{labels?"Ocultar índice muscular":"Índice muscular"}</button>
 <div aria-label="Vista anatômica">{[["both","Ambas"],["front","Frente"],["back","Costas"]].map(([k,l])=><button key={k} type="button" className="outline-button" aria-pressed={view===k} onClick={()=>setView(k)}>{l}</button>)}</div>
 </div>
 <div style={{display:"grid",gridTemplateColumns:view==="both"?"repeat(2,minmax(0,1fr))":"minmax(0,1fr)",gap:12,maxWidth:650,margin:"20px auto"}}>
 {Object.entries(regions).filter(([side])=>view==="both"||view===side).map(([side,paths])=><div key={side}><svg viewBox="0 0 232 445" role="group" aria-label={side==="front"?"Musculatura anterior":"Musculatura posterior"} style={{width:"100%",height:"auto",maxHeight:510}}>
 <g fill="#202020" stroke="#494744" strokeWidth="1.2"><path d={outline+" L116 15Z"}/><path d={outline+" L116 15Z"} transform="translate(232 0) scale(-1 1)"/></g>
 {support.map((d,i)=><g key={i} fill="#292929" stroke="#62605e" strokeWidth=".8"><path d={d}/><path d={d} transform="translate(232 0) scale(-1 1)"/></g>)}
 {paths.flatMap(([name,d])=>d.match(/M[^M]+/g).map((shape,i)=>{const part=parts[side][name][i]||name;const best=groups.filter(g=>aliases[name].test(normalize(g.muscle))).sort((a,b)=>value(b)-value(a))[0];const tier=level(best?value(best):0,max);const [,baseFill,baseStroke]=legend[tier];const restriction=restrictionFor(name,part);const fill=restriction?"#a52c49":tier===1?"#28282a":tier===2?"#203d58":baseFill;const stroke=restriction?"#ff526a":baseStroke;const id=side+name+i;const active=selected?.id===id;return <g key={id} role="button" tabIndex={0} aria-pressed={active} aria-label={part+"; "+(best?fmt(value(best))+" no grupo":"sem dados")} onClick={()=>choose(part,name,best,id)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();choose(part,name,best,id);}}} style={{cursor:"pointer",outlineOffset:2,opacity:active||((!restrictedOnly||restriction)&&(filter===null||filter===tier))?1:.16,transition:"opacity .2s"}}><title>{part} · {restriction?"Restrição registrada":best?"Dados do grupo "+name:"Sem dados"}</title>{[false,true].map(mirror=><path key={String(mirror)} d={shape} transform={mirror?"translate(232 0) scale(-1 1)":undefined} fill={fill} stroke={active?"#ffffff":stroke} strokeWidth={active?2:1.2} strokeLinejoin="round" strokeDasharray={restriction?"3 2":undefined} style={{transition:"fill .2s, stroke .2s"}}/>)}</g>}))}
 </svg><p style={{textAlign:"center",fontWeight:600}}>{side==="front"?"Frente":"Costas"}</p></div>)}
 </div>
 <div aria-label="Legenda de intensidade relativa" style={{display:"flex",flexWrap:"wrap",gap:12,justifyContent:"center",padding:"12px 0"}}>{legend.map(([label,fill,stroke],i)=><button type="button" key={label} aria-pressed={filter===i} onClick={()=>setFilter(v=>v===i?null:i)} style={{display:"inline-flex",gap:6,alignItems:"center",fontSize:12,color:"#eee",background:filter===i?"#383838":"transparent",border:"1px solid "+(filter===i?stroke:"#333"),borderRadius:8,padding:"6px 9px",cursor:"pointer"}}><span style={{width:12,height:12,background:fill,border:"1px solid "+stroke,borderRadius:3}}/>{label}{i>0?" ("+["","≤25%","≤50%","≤75%",">75%"][i]+")":""}</button>)}</div>
 <div style={{display:"flex",flexWrap:"wrap",gap:10,justifyContent:"center",marginBlock:12}}>{[["#28282a","#ff929f","Somente contorno · baixa"],["#203d58","#8ac9ff","Preenchimento suave · moderada"],["#21a587","#76f0ce","Preenchimento sólido · alta ou muito alta"],["#a52c49","#ff526a","Vermelho tracejado · lesão ou restrição registrada"]].map(([fill,stroke,label])=><span key={label} style={{display:"inline-flex",gap:7,alignItems:"center",fontSize:12}}><span style={{width:18,height:18,background:fill,border:"2px "+(fill==="#a52c49"?"dashed":"solid")+" "+stroke,borderRadius:4}}/>{label}</span>)}</div>
 <button type="button" className="outline-button" aria-pressed={restrictedOnly} onClick={()=>setRestrictedOnly(v=>!v)}>{restrictedOnly?"Mostrar todas as regiões":"Destacar restrições registradas"}</button>
 {!restrictions.length&&<p style={{fontSize:12,color:"#aaa"}}>Nenhuma informação de restrição fornecida ao mapa. Isso não significa ausência de lesão ou liberação para treino.</p>}
 <p style={{fontSize:12,color:"#aaa",textAlign:"center"}}>Escala relativa ao maior valor registrado no recorte. Não representa ativação fisiológica. As subdivisões usam dados do grupo quando não há medição específica.</p>
 {labels&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:12,marginBlock:16}}>{Object.entries(regions).filter(([side])=>view==="both"||side===view).map(([side,paths])=><div key={side}><h3>{side==="front"?"Frente":"Costas"}</h3>{paths.flatMap(([name,d])=>d.match(/M[^M]+/g).map((_,i)=>{const part=parts[side][name][i]||name;const best=groups.filter(g=>aliases[name].test(normalize(g.muscle))).sort((a,b)=>value(b)-value(a))[0];const tier=level(best?value(best):0,max);return <button type="button" key={name+i} onClick={()=>choose(part,name,best,side+name+i)} style={{display:"flex",alignItems:"center",gap:8,width:"100%",textAlign:"left",padding:"8px 4px",background:"transparent",color:"#eee",border:0,borderBottom:"1px solid #292929",cursor:"pointer"}}><span style={{width:10,height:10,borderRadius:3,background:legend[tier][1],border:"1px solid "+legend[tier][2],flexShrink:0}}/>{part}</button>}))}</div>)}</div>}
 {selected&&<div aria-live="polite" style={{border:"1px solid #454545",borderRadius:12,padding:16,marginTop:12}}><button type="button" className="outline-button" onClick={()=>setSelected(null)} style={{float:"right"}}>Fechar</button><strong>{selected.part}</strong><p>Grupo: {selected.group}</p>{restrictionFor(selected.group,selected.part)&&<p role="status" style={{color:"#ff788b"}}>Restrição registrada — {restrictionFor(selected.group,selected.part).reason||"consulte o profissional responsável"}.</p>}{current?<><p>{fmt(current.primarySets)} séries primárias · {fmt(current.secondarySets)} secundárias</p><p>{fmt(current.attributedVolume)} kg de volume atribuído ao grupo</p></>:<p>Sem dados classificados para este grupo no recorte.</p>}</div>}
 </div>;
}
