"use client";
import {useState,useId} from "react";
const regions = {
 front:[
 ["deltoides","M74 79 C63 73 49 78 44 90 C38 101 42 116 53 119 C61 120 66 109 69 100 Q76 88 74 79Z"],
 ["peito","M78 82 C89 75 105 77 111 85 Q115 95 111 115 C108 133 82 132 75 118 Q68 101 78 82Z"],
 ["biceps","M57 125 C48 123 43 135 39 147 Q34 162 32 177 Q38 184 44 174 Q56 149 57 125Z M60 128 Q63 149 49 176 L46 174 Q55 151 60 128Z"],
 ["antebracos","M30 185 Q39 183 39 197 L22 244 L17 248 Q23 220 30 185Z M25 184 Q18 205 12 241 L15 245 L29 203 Q33 187 25 184Z"],
 ["abdomen","M96 133 Q103 126 113 130 L113 150 Q103 145 96 150Z M96 154 Q104 148 113 154 L113 170 L95 170Z M95 174 L113 174 L113 188 L96 188Z M96 192 L113 192 L113 227 Q101 223 98 211Z"],
 ["obliquos","M67 123 Q72 136 72 157 L76 177 L84 193 L78 205 Q69 187 65 169Z"],
 ["quadriceps","M76 213 Q65 234 70 264 Q73 296 84 321 Q90 327 90 314 Q78 268 76 213Z M80 217 Q93 223 99 241 Q101 274 92 310 Q87 278 84 252Z M104 236 Q114 257 107 289 Q101 319 95 320 Q92 314 98 294Z"],
 ["adutores","M115 218 L109 293 L101 305 L115 259Z"],
 ["panturrilhas","M78 333 Q71 352 77 374 L85 407 Q90 410 88 393 L84 355Z M96 338 Q107 350 99 375 L91 401 L89 380Z"]],
 back:[
 ["trapezio","M96 77 Q103 70 113 76 L113 145 L102 121 L85 83Z"],
 ["deltoides","M74 79 C55 73 42 86 43 104 Q44 115 52 119 L63 103 Q75 93 74 79Z"],
 ["costas","M77 108 Q90 125 103 120 L112 148 Q101 168 91 195 Q80 179 73 155 L66 128Z M76 83 Q83 76 91 82 L101 107 Q87 115 73 104Z M69 109 Q82 122 98 113 L103 120 Q87 132 72 121Z"],
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
 back:{trapezio:["Trapézio"],deltoides:["Deltoide posterior"],costas:["Latíssimo do dorso","Infraespinal (região)","Redondo maior (região)"],triceps:["Tríceps lateral","Tríceps medial/longa"],antebracos:["Extensores do antebraço","Região radial"],lombar:["Eretores da coluna"],gluteos:["Glúteo médio (região)","Glúteo máximo"],"posterior de coxa":["Bíceps femoral","Semitendíneo","Semimembranáceo (região)"],panturrilhas:["Gastrocnêmio lateral","Gastrocnêmio medial","Região distal lateral","Região distal medial"]}
};
const legend=[["Sem séries","#85858b","#85858b"],["Baixa","#ff829c","#ff829c"],["Moderada","#399dff","#399dff"],["Alta","#26ce95","#26ce95"],["Muito alta","#ffdc45","#ffdc45"],["Restrição","#ff4055","#ff4055"]];
const score=g=>g.primarySets+g.secondarySets*.5;
const level=(n,max)=>n<=0?0:n/max<=.25?1:n/max<=.5?2:n/max<=.75?3:4;
const sublevel=(n,max,tier,restriction)=>{
 if(restriction)return {partial:0,limited:1,blocked:2}[restriction.status]??0;
 if(tier===0)return 0;
 const local=(n/max-(tier-1)*.25)/.25;
 return Math.min(2,Math.max(0,Math.ceil(local*3)-1));
};
const opacityFor=[0,.32,1];
const sublabels=["Contorno","Preenchimento suave","Preenchimento completo"];
export default function MuscleMap({groups=[],onSelect,restrictions=[]}) {
 const uid=useId().replace(/[^a-zA-Z0-9_-]/g,"");
 const [zoom,setZoom]=useState(false);
 const [selected,setSelected]=useState(null);
 const [metric,setMetric]=useState("sets");
 const [view,setView]=useState("both");
 const [filter,setFilter]=useState(null);
 const [labels,setLabels]=useState(false);
 const restrictionFor=(name,part)=>restrictions.find(r=>r&&r.active!==false&&[normalize(name),normalize(part)].includes(normalize(r.muscle)));
 const [restrictedOnly,setRestrictedOnly]=useState(false);
 const value=g=>metric==="sets"?score(g):g.attributedVolume;
 const max=Math.max(0,...groups.map(value));
 const support=["M95 32 Q98 24 106 25 L116 25 L116 64 Q108 65 103 59 L97 51 Q94 44 95 32Z","M100 63 Q105 69 113 69 L113 79 L108 76Z M99 66 L106 78 L96 75Z","M66 135 L82 134 L91 155 L80 161 L65 151Z","M72 174 L85 180 L94 204 L84 210 L72 192Z","M81 316 Q92 312 101 319 L99 333 Q95 341 88 336 L81 327Z","M82 406 L92 406 L96 416 L87 419 L78 415Z M78 420 L87 421 L84 433 L69 430Z M90 421 L97 419 L95 433 L87 434Z","M12 249 Q21 241 29 249 L31 258 Q28 266 20 266 L12 261Z M11 262 L15 266 L7 277 L4 275Z M17 267 L20 268 L15 283 L12 282Z M22 268 L25 268 L23 284 L20 284Z M27 266 L30 264 L34 277 L31 279Z"];
 const outline="M116 15 C103 13 94 19 92 30 Q88 43 94 52 L99 62 L101 70 Q88 76 76 78 C60 70 46 78 41 91 Q34 106 37 121 L29 156 Q24 169 25 181 C18 195 15 215 8 241 L10 249 L5 260 L2 271 L7 275 L13 267 L10 283 L15 286 L21 272 L20 286 L25 287 L29 270 L32 280 L36 278 L34 259 L30 247 Q42 224 47 202 L48 184 Q56 161 61 139 L64 132 Q65 162 72 186 L69 207 Q62 232 67 260 Q68 291 77 318 L76 332 Q69 352 73 374 L80 410 L77 418 L68 430 Q77 437 94 435 L99 423 L98 411 Q101 391 104 370 L103 334 Q110 312 111 285 L116 238";
 const fmt=n=>Number(n).toLocaleString("pt-BR",{maximumFractionDigits:1});
 const choose=(part,group,best,id)=>{setSelected({part,group,key:best?.muscle,id});if(best)onSelect?.(best.muscle);};
 const current=groups.find(g=>g.muscle===selected?.key);
 return <div style={{margin:"16px 0"}}>
 <div style={{display:"flex",flexWrap:"wrap",gap:8,justifyContent:"space-between"}}>
 <div aria-label="Métrica do mapa">{[["sets","Séries"],["volume","Carga externa"]].map(([k,l])=><button key={k} type="button" className="outline-button" aria-pressed={metric===k} onClick={()=>setMetric(k)}>{l}</button>)}</div>
 <button type="button" className="outline-button" aria-pressed={labels} onClick={()=>setLabels(v=>!v)}>{labels?"Ocultar índice muscular":"Índice muscular"}</button>
 <button type="button" className="outline-button" aria-pressed={zoom} onClick={()=>setZoom(v=>!v)}>{zoom?"Reduzir":"Ampliar detalhes"}</button><div aria-label="Vista anatômica">{[["both","Ambas"],["front","Frente"],["back","Costas"]].map(([k,l])=><button key={k} type="button" className="outline-button" aria-pressed={view===k} onClick={()=>setView(k)}>{l}</button>)}</div>
 </div>
 <div style={{display:"grid",gridTemplateColumns:view==="both"?"repeat(2,minmax(0,1fr))":"minmax(0,1fr)",gap:12,maxWidth:zoom?1050:760,margin:"20px auto",background:"radial-gradient(ellipse at 50% 42%,#22232a 0%,#121316 57%,#101010 85%)",borderRadius:16,padding:"14px 4px"}}>
 {Object.entries(regions).filter(([side])=>view==="both"||view===side).map(([side,paths])=><div key={side}><svg viewBox="-3 0 238 445" role="group" aria-label={side==="front"?"Musculatura anterior":"Musculatura posterior"} style={{width:"100%",height:"auto",maxHeight:zoom?800:600}}>
 <defs>
 <linearGradient id={uid+side+"body"} x1="0" x2="1" y1="0" y2=".8"><stop stopColor="#141518"/><stop offset=".48" stopColor="#383a40"/><stop offset="1" stopColor="#1a1b20"/></linearGradient>
 <linearGradient id={uid+side+"shine"} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff" stopOpacity=".24"/><stop offset=".34" stopColor="#fff" stopOpacity=".04"/><stop offset=".7" stopColor="#000" stopOpacity=".08"/><stop offset="1" stopColor="#000" stopOpacity=".42"/></linearGradient>
 <pattern id={uid+side+"fibers"} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(18)"><path d="M1 0V5" stroke="#fff" strokeOpacity=".09" strokeWidth=".42"/></pattern>
 {[-55,-30,0,25,50,80].map(angle=><pattern key={angle} id={uid+side+"fiber"+(angle+90)} width="3.4" height="9" patternUnits="userSpaceOnUse" patternTransform={"rotate("+angle+")"}><path d="M.7 -1 Q1.9 4 .7 10" fill="none" stroke="#fff" strokeOpacity=".16" strokeWidth=".32"/><path d="M2 -1 Q3.2 4 2 10" fill="none" stroke="#000" strokeOpacity=".22" strokeWidth=".38"/></pattern>)}
 <radialGradient id={uid+side+"relief"} cx="39%" cy="34%" r="72%"><stop offset="0" stopColor="#fff" stopOpacity=".21"/><stop offset=".42" stopColor="#fff" stopOpacity=".04"/><stop offset=".78" stopColor="#000" stopOpacity=".19"/><stop offset="1" stopColor="#000" stopOpacity=".58"/></radialGradient>
 </defs>
 <g fill={"url(#"+uid+side+"body)"} stroke="#55565d" strokeWidth=".85"><path d={outline+" L116 15Z"}/><path d={outline+" L116 15Z"} transform="translate(232 0) scale(-1 1)"/></g>
 {support.map((d,i)=><g key={i} fill={"url(#"+uid+side+"body)"} stroke="#64656a" strokeWidth=".65"><path d={d}/><path d={d} transform="translate(232 0) scale(-1 1)"/></g>)}
 {paths.flatMap(([name,d])=>d.match(/M[^M]+/g).map((shape,i)=>{const part=parts[side][name][i]||name;const best=groups.filter(g=>aliases[name].test(normalize(g.muscle))).sort((a,b)=>value(b)-value(a))[0];const restriction=restrictionFor(name,part);const n=best?value(best):0;const tier=restriction?5:level(n,max);const sub=sublevel(n,max,tier,restriction);const [,fill,stroke]=legend[tier];const id=side+name+i;const active=selected?.id===id;return <g key={id} role="button" tabIndex={0} aria-pressed={active} aria-label={part+"; "+(best?fmt(value(best))+" no grupo":"sem dados")} onClick={()=>choose(part,name,best,id)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();choose(part,name,best,id);}}} style={{cursor:"pointer",outlineOffset:2,opacity:active||((!restrictedOnly||restriction)&&(filter===null||filter===tier))?1:.16,transition:"opacity .2s"}}><title>{part} · {restriction?"Restrição registrada":best?"Dados do grupo "+name:"Sem dados"}</title>{[false,true].map(mirror=><g key={String(mirror)} transform={mirror?"translate(232 0) scale(-1 1)":undefined}><path d={shape} fill="#202126" stroke="#0b0c0e" strokeWidth="2.4" strokeLinejoin="round"/><path d={shape} fill={fill} fillOpacity={opacityFor[sub]} stroke="none"/><path d={shape} fill={"url(#"+uid+side+"shine)"} pointerEvents="none"/><path d={shape} fill={"url(#"+uid+side+"fiber"+(90+({peito:80,deltoides:-30,biceps:25,antebracos:25,abdomen:80,obliquos:-30,quadriceps:0,adutores:-30,panturrilhas:0,trapezio:25,costas:-30,triceps:25,lombar:0,gluteos:50,"posterior de coxa":0}[name]??0))+")"} pointerEvents="none"/><path d={shape} fill={"url(#"+uid+side+"relief)"} pointerEvents="none"/><path d={shape} fill="none" stroke="#08090a" strokeOpacity=".37" strokeWidth=".55" pointerEvents="none"/><path d={shape} fill="none" stroke={active?"#ffffff":stroke} strokeOpacity={tier===0?.72:1} strokeWidth={active?1.8:.95} strokeLinejoin="round" strokeDasharray={restriction?"3 2":undefined} style={{transition:"stroke .2s"}}/></g>)}</g>}))}
 </svg><p style={{textAlign:"center",fontWeight:600}}>{side==="front"?"Frente":"Costas"}</p></div>)}
 </div>
 <div aria-label="Legenda de intensidade relativa" style={{display:"flex",flexWrap:"wrap",gap:12,justifyContent:"center",padding:"12px 0"}}>{legend.map(([label,fill,stroke],i)=><button type="button" key={label} aria-pressed={filter===i} onClick={()=>setFilter(v=>v===i?null:i)} style={{display:"inline-flex",gap:6,alignItems:"center",fontSize:12,color:"#eee",background:filter===i?"#383838":"transparent",border:"1px solid "+(filter===i?stroke:"#333"),borderRadius:8,padding:"6px 9px",cursor:"pointer"}}><span style={{width:12,height:12,background:fill,border:"1px solid "+stroke,borderRadius:3}}/>{label}{i>0&&i<5?" ("+["","≤25%","≤50%","≤75%",">75%"][i]+")":""}</button>)}</div>
 <div style={{overflowX:"auto",marginBlock:16}}><table style={{width:"100%",minWidth:320,borderCollapse:"collapse",fontSize:12}}><thead><tr><th style={{textAlign:"left"}}>Categoria</th>{sublabels.map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{legend.map(([label,color],tier)=><tr key={label}><td style={{padding:"8px 4px",borderBottom:"1px solid #333"}}>{label}</td>{opacityFor.map((opacity,sub)=><td key={sub} style={{textAlign:"center",padding:6,borderBottom:"1px solid #333"}}><svg viewBox="0 0 40 40" width="32" height="32" aria-label={label+" "+sublabels[sub]}><path d="M18 3 Q4 5 6 18 Q9 28 20 37 Q33 22 34 14 Q34 3 18 3Z" fill={color} fillOpacity={opacity} stroke={color} strokeWidth="2" strokeDasharray={tier===5?"3 2":undefined}/></svg></td>)}</tr>)}</tbody></table></div>
 <p style={{fontSize:12,color:"#aaa"}}>Nas categorias de treino, os três preenchimentos representam terços da faixa relativa. Cinza usa contorno quando não há séries; os demais cinzas são reservados para futuros estados de disponibilidade de dados. Vermelho: contorno = restrição parcial ou não especificada; suave = limitada; sólido = bloqueada, somente mediante registro explícito.</p>
 <button type="button" className="outline-button" aria-pressed={restrictedOnly} onClick={()=>setRestrictedOnly(v=>!v)}>{restrictedOnly?"Mostrar todas as regiões":"Destacar restrições registradas"}</button>
 {!restrictions.length&&<p style={{fontSize:12,color:"#aaa"}}>Nenhuma informação de restrição fornecida ao mapa. Isso não significa ausência de lesão ou liberação para treino.</p>}
 <p style={{fontSize:12,color:"#aaa",textAlign:"center"}}>Escala relativa ao maior valor registrado no recorte. Não representa ativação fisiológica. As subdivisões usam dados do grupo quando não há medição específica.</p>
 {labels&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:12,marginBlock:16}}>{Object.entries(regions).filter(([side])=>view==="both"||side===view).map(([side,paths])=><div key={side}><h3>{side==="front"?"Frente":"Costas"}</h3>{paths.flatMap(([name,d])=>d.match(/M[^M]+/g).map((_,i)=>{const part=parts[side][name][i]||name;const best=groups.filter(g=>aliases[name].test(normalize(g.muscle))).sort((a,b)=>value(b)-value(a))[0];const tier=level(best?value(best):0,max);return <button type="button" key={name+i} onClick={()=>choose(part,name,best,side+name+i)} style={{display:"flex",alignItems:"center",gap:8,width:"100%",textAlign:"left",padding:"8px 4px",background:"transparent",color:"#eee",border:0,borderBottom:"1px solid #292929",cursor:"pointer"}}><span style={{width:10,height:10,borderRadius:3,background:legend[tier][1],border:"1px solid "+legend[tier][2],flexShrink:0}}/>{part}</button>}))}</div>)}</div>}
 {selected&&<div aria-live="polite" style={{border:"1px solid #454545",borderRadius:12,padding:16,marginTop:12}}><button type="button" className="outline-button" onClick={()=>setSelected(null)} style={{float:"right"}}>Fechar</button><strong>{selected.part}</strong><p>Grupo: {selected.group}</p>{restrictionFor(selected.group,selected.part)&&<p role="status" style={{color:"#ff788b"}}>Restrição registrada — {restrictionFor(selected.group,selected.part).reason||"consulte o profissional responsável"}.</p>}{current?<><p>{fmt(current.primarySets)} séries primárias · {fmt(current.secondarySets)} secundárias</p><p>{fmt(current.attributedVolume)} kg de volume atribuído ao grupo</p></>:<p>Sem dados classificados para este grupo no recorte.</p>}</div>}
 </div>;
}
