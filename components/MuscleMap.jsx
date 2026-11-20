"use client";
const regions = {
 front:[
 ["deltoides","M75 78 Q49 72 38 108 L56 130 Q78 110 75 78"],
 ["peito","M78 82 C89 75 105 77 111 85 Q115 95 111 115 C108 133 82 132 75 118 Q68 101 78 82Z"],
 ["biceps","M57 130 Q39 121 35 147 L28 181 Q43 191 53 170Z"],
 ["antebracos","M28 185 Q43 192 42 207 L24 250 L13 245Z"],
 ["abdomen","M96 133 Q103 126 113 130 L113 150 Q103 145 96 150Z M96 154 Q104 148 113 154 L113 170 L95 170Z M95 174 L113 174 L113 188 L96 188Z M96 192 L113 192 L113 227 Q101 223 98 211Z"],
 ["obliquos","M67 119 L91 131 L90 174 L78 196 L64 169Z"],
 ["quadriceps","M76 210 Q97 217 114 210 L109 278 Q102 310 91 325 Q74 310 69 276Z"],
 ["adutores","M115 218 L109 293 L101 305 L115 259Z"],
 ["panturrilhas","M76 330 Q91 338 102 329 L96 385 L87 410 L78 384Z"]],
 back:[
 ["trapezio","M96 77 Q103 70 113 76 L113 145 L102 121 L85 83Z"],
 ["deltoides","M75 79 Q48 74 38 108 L57 129 L80 105Z"],
 ["costas","M77 106 Q89 121 103 120 L112 151 L91 192 Q78 171 66 128Z"],
 ["triceps","M57 131 Q40 120 35 147 L28 182 Q43 191 53 170Z"],
 ["antebracos","M28 185 Q43 192 42 207 L24 250 L13 245Z"],
 ["lombar","M91 175 L115 190 L115 211 L82 202Z"],
 ["gluteos","M79 208 Q90 196 103 202 L113 216 Q91 209 76 224Z M76 228 Q94 211 113 222 L113 249 Q105 266 88 258 Q72 252 76 228Z"],
 ["posterior de coxa","M73 252 Q93 265 114 252 L108 298 Q101 317 90 328 L76 304Z"],
 ["panturrilhas","M77 333 Q93 324 103 334 L99 371 L88 399 L78 374Z"]]
};
const aliases={peito:/peito|pector|chest/,costas:/costas|dors|latiss|back/,deltoides:/delto|ombro|shoulder/,biceps:/bicep/,triceps:/tricep/,antebracos:/antebr|forearm/,abdomen:/abdom|abs|core/,obliquos:/obliq/,quadriceps:/quadr|anterior de coxa/,adutores:/adut|adduct/,panturrilhas:/panturr|calf|calves|gastrocn/,trapezio:/trape|traps/,lombar:/lomb|erector|lower back/,gluteos:/glute|buttock/,"posterior de coxa":/posterior de coxa|hamstring|isquiotib/};
export default function MuscleMap({groups=[],onSelect}) {
 const max=Math.max(1,...groups.map(g=>g.primarySets+g.secondarySets*.5));
 const support = ["M95 29 Q105 19 115 22 L115 56 Q104 66 96 50Z","M100 58 L113 66 L113 76 L98 70Z","M66 135 L82 134 L91 155 L80 161 L65 151Z","M67 155 L80 165 L89 185 L79 194 L65 177Z","M79 312 Q94 315 103 327 L94 342 L82 338Z","M79 402 L91 409 L100 418 L95 432 L72 430Z","M12 248 Q22 241 30 250 L29 265 L23 269 L20 284 L16 282 L17 268 L10 282 L7 279 L12 264 L4 275 L1 271Z"];
 const outline="M116 15 C96 12 87 28 90 48 L98 67 L76 78 Q42 70 32 119 L23 176 L8 242 L12 265 L21 267 L30 246 L48 200 L62 153 L65 190 L69 240 L64 278 L75 327 L72 365 L79 414 L70 430 L93 435 L103 414 L109 370 L116 308";
 return <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:8,maxWidth:600,margin:"16px auto"}}>
 {Object.entries(regions).map(([side,paths])=><div key={side}><svg viewBox="0 0 232 445" role="group" aria-label={side==="front"?"Musculatura anterior":"Musculatura posterior"} style={{width:"100%",maxHeight:440}}>
 <g fill="#28252c" stroke="#956575" strokeWidth="1.2"><path d={outline+" L116 15Z"}/><path d={outline+" L116 15Z"} transform="translate(232 0) scale(-1 1)"/></g>
 {support.map((d,i)=><g key={i} fill="#292929" stroke="#62605e" strokeWidth=".8"><path d={d}/><path d={d} transform="translate(232 0) scale(-1 1)"/></g>)}
 {paths.map(([name,d])=>{const matches=groups.filter(g=>aliases[name].test(g.muscle));const best=matches.sort((a,b)=>(b.primarySets+b.secondarySets*.5)-(a.primarySets+a.secondarySets*.5))[0];const value=best?(best.primarySets+best.secondarySets*.5)/max:0;const fill=value>=.15?"hsl(44 96% "+(34+value*26)+"%)":"#28282a";return <g key={name} role="button" tabIndex={0} aria-label={name+(best?" "+best.primarySets+" séries primárias":" sem dados")} onClick={()=>best&&onSelect(best.muscle)} onKeyDown={e=>{if(best&&(e.key==="Enter"||e.key===" ")){e.preventDefault();onSelect(best.muscle)}}} style={{cursor:best?"pointer":"default"}}><title>{name}</title><path d={d} fill={fill} stroke={value>=.15?"#9b7937":best?"#ff939d":"#63605e"} strokeWidth={best&&value<.15?1.8:1}/><path d={d} transform="translate(232 0) scale(-1 1)" fill={fill} stroke={value>=.15?"#9b7937":best?"#ff939d":"#63605e"} strokeWidth={best&&value<.15?1.8:1}/></g>})}
 </svg><p style={{textAlign:"center",fontSize:12}}>{side==="front"?"Anterior":"Posterior"}</p></div>)}
 </div>;
}
