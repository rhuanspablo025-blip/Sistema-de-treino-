"use client";
const regions = {
 front:[
 ["deltoides","M75 78 Q49 72 38 108 L56 130 Q78 110 75 78"],
 ["peito","M78 80 Q100 76 116 91 L116 120 Q94 132 66 111Z"],
 ["biceps","M57 130 Q39 121 35 147 L28 181 Q43 191 53 170Z"],
 ["antebracos","M28 185 Q43 192 42 207 L24 250 L13 245Z"],
 ["abdomen","M97 126 L116 125 L116 145 L95 146Z M95 150 L116 149 L116 172 L94 169Z M94 174 L116 176 L116 207 L99 192Z"],
 ["obliquos","M67 119 L91 131 L90 174 L78 196 L64 169Z"],
 ["quadriceps","M76 210 Q97 217 114 210 L109 278 Q102 310 91 325 Q74 310 69 276Z"],
 ["adutores","M115 218 L109 293 L101 305 L115 259Z"],
 ["panturrilhas","M76 330 Q91 338 102 329 L96 385 L87 410 L78 384Z"]],
 back:[
 ["trapezio","M102 67 L116 65 L116 151 L84 118 L76 83Z"],
 ["deltoides","M75 79 Q48 74 38 108 L57 129 L80 105Z"],
 ["costas","M80 115 L115 153 L115 190 L78 173 L62 126Z"],
 ["triceps","M57 131 Q40 120 35 147 L28 182 Q43 191 53 170Z"],
 ["antebracos","M28 185 Q43 192 42 207 L24 250 L13 245Z"],
 ["lombar","M91 175 L115 190 L115 211 L82 202Z"],
 ["gluteos","M79 207 Q98 199 116 215 L115 250 Q95 265 73 244Z"],
 ["posterior de coxa","M73 252 Q93 265 114 252 L108 298 Q101 317 90 328 L76 304Z"],
 ["panturrilhas","M77 333 Q93 324 103 334 L99 371 L88 399 L78 374Z"]]
};
const aliases={peito:/peito|pector|chest/,costas:/costas|dors|latiss|back/,deltoides:/delto|ombro|shoulder/,biceps:/bicep/,triceps:/tricep/,antebracos:/antebr|forearm/,abdomen:/abdom|abs|core/,obliquos:/obliq/,quadriceps:/quadr|anterior de coxa/,adutores:/adut|adduct/,panturrilhas:/panturr|calf|calves|gastrocn/,trapezio:/trape|traps/,lombar:/lomb|erector|lower back/,gluteos:/glute|buttock/,"posterior de coxa":/posterior de coxa|hamstring|isquiotib/};
export default function MuscleMap({groups=[],onSelect}) {
 const max=Math.max(1,...groups.map(g=>g.primarySets+g.secondarySets*.5));
 const outline="M116 15 C96 12 87 28 90 48 L98 67 L76 78 Q42 70 32 119 L23 176 L8 242 L12 265 L21 267 L30 246 L48 200 L62 153 L65 190 L69 240 L64 278 L75 327 L72 365 L79 414 L70 430 L93 435 L103 414 L109 370 L116 308";
 return <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:8,maxWidth:600,margin:"16px auto"}}>
 {Object.entries(regions).map(([side,paths])=><div key={side}><svg viewBox="0 0 232 445" role="group" aria-label={side==="front"?"Musculatura anterior":"Musculatura posterior"} style={{width:"100%",maxHeight:440}}>
 <g fill="#28252c" stroke="#956575" strokeWidth="1.2"><path d={outline+" L116 15Z"}/><path d={outline+" L116 15Z"} transform="translate(232 0) scale(-1 1)"/></g>
 {paths.map(([name,d])=>{const matches=groups.filter(g=>aliases[name].test(g.muscle));const best=matches.sort((a,b)=>(b.primarySets+b.secondarySets*.5)-(a.primarySets+a.secondarySets*.5))[0];const value=best?(best.primarySets+best.secondarySets*.5)/max:0;const fill=value?"hsl("+(24+value*27)+" 94% "+(35+value*27)+"%)":"#393039";return <g key={name} role="button" tabIndex={0} aria-label={name+(best?" "+best.primarySets+" séries primárias":" sem dados")} onClick={()=>best&&onSelect(best.muscle)} onKeyDown={e=>{if(best&&(e.key==="Enter"||e.key===" ")){e.preventDefault();onSelect(best.muscle)}}} style={{cursor:best?"pointer":"default"}}><title>{name}</title><path d={d} fill={fill} stroke="#bd7b91" strokeWidth=".8"/><path d={d} transform="translate(232 0) scale(-1 1)" fill={fill} stroke="#bd7b91" strokeWidth=".8"/></g>})}
 </svg><p style={{textAlign:"center",fontSize:12}}>{side==="front"?"Anterior":"Posterior"}</p></div>)}
 </div>;
}
