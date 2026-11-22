"use client";

import { useId, useMemo, useState } from "react";
import dynamic from "next/dynamic";

const Anatomy3D = dynamic(() => import("./Anatomy3D"), { ssr: false, loading: () => <p className="muscle-anatomy__status">Preparando visualizador 3D…</p> });
import { BACK_MUSCLES, FRONT_MUSCLES } from "body-muscles";

const CATEGORIES = ["Glúteos", "Costas", "Peito", "Ombros", "Quadríceps", "Posterior de coxa", "Braços", "Abdômen", "Panturrilhas"];
const LEVELS = ["Sem séries", "Baixa", "Moderada", "Alta", "Muito alta", "Restrição"];
const LEVEL_COLORS = ["#85858b", "#ff829c", "#399dff", "#26ce95", "#ffdc45", "#ff4055"];

const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const number = (value) => Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const volume = (value) => value >= 1000 ? `${number(value / 1000)} t` : `${number(value)} kg`;

function categoryFor(value) {
  const name = normalize(value);
  if (/glut/.test(name)) return "Glúteos";
  if (/costas|dorsal|latissim|romboid|trapez|lombar|erector|redondo maior|infraespinal/.test(name)) return "Costas";
  if (/peito|peitoral|chest/.test(name)) return "Peito";
  if (/ombro|deltoid|shoulder/.test(name)) return "Ombros";
  if (/posterior|isquiotib|hamstring|femoral/.test(name)) return "Posterior de coxa";
  if (/quadricep|coxa|perna|adutor|leg|vasto/.test(name)) return "Quadríceps";
  if (/bicep|tricep|braco|antebraco|braquial|forearm/.test(name)) return "Braços";
  if (/abdom|core|obliqu|serrato/.test(name)) return "Abdômen";
  if (/panturr|gemeo|soleo|calf|gastrocn/.test(name)) return "Panturrilhas";
  return null;
}

function regionInfo(id) {
  if (/knee/.test(id)) return ["Quadríceps", /joelho|knee/];
  if (/elbow|hand/.test(id)) return ["Braços", /cotovelo|mao|punho|elbow|hand/];
  if (/neck|nape/.test(id)) return ["Ombros", /pescoco|nuca|neck|nape/];
  if (/gluteus/.test(id)) return ["Glúteos", /glut/];
  if (/traps/.test(id)) return ["Costas", /trapez|traps/];
  if (/lats/.test(id)) return ["Costas", /costas|dorsal|latissim|redondo maior/];
  if (/lower-back|spine/.test(id)) return ["Costas", /lombar|erector|infraespinal|costas/];
  if (/chest/.test(id)) return ["Peito", /peito|peitoral|chest/];
  if (/shoulder|deltoid/.test(id)) return ["Ombros", /ombro|deltoid|shoulder/];
  if (/hamstrings/.test(id)) return ["Posterior de coxa", /posterior|isquiotib|hamstring|femoral/];
  if (/quads/.test(id)) return ["Quadríceps", /quadricep|vasto|anterior de coxa|perna/];
  if (/adductors|hip-flexor/.test(id)) return ["Quadríceps", /adutor|coxa|perna/];
  if (/biceps/.test(id)) return ["Braços", /bicep|braquial|braco/];
  if (/triceps/.test(id)) return ["Braços", /tricep|braco/];
  if (/forearm/.test(id)) return ["Braços", /antebraco|forearm|braquiorradial/];
  if (/abs/.test(id)) return ["Abdômen", /abdom|core|reto/];
  if (/obliques|serratus/.test(id)) return ["Abdômen", /obliqu|serrato|abdom|core/];
  if (/calves|tibialis/.test(id)) return ["Panturrilhas", /panturr|gemeo|soleo|calf|gastrocn|tibial/];
  return [null, null];
}

function regionLabel(id) {
  const side = id.endsWith("-left") ? " esquerdo" : id.endsWith("-right") ? " direito" : "";
  const label = /gluteus-medius/.test(id) ? "Glúteo médio" : /gluteus-maximus/.test(id) ? "Glúteo máximo" :
    /lats/.test(id) ? "Latíssimo dorsal" : /traps/.test(id) ? "Trapézio" : /lower-back/.test(id) ? "Lombar" :
    /deltoid|shoulder/.test(id) ? "Deltoide" : /chest-upper/.test(id) ? "Peitoral superior" : /chest-lower/.test(id) ? "Peitoral inferior" :
    /biceps/.test(id) ? "Bíceps" : /triceps/.test(id) ? "Tríceps" : /forearm/.test(id) ? "Antebraço" :
    /abs/.test(id) ? "Reto abdominal" : /obliques/.test(id) ? "Oblíquo" : /serratus/.test(id) ? "Serrátil" :
    /hamstrings/.test(id) ? "Posterior de coxa" : /quads/.test(id) ? "Quadríceps" : /adductors/.test(id) ? "Adutores" :
    /calves/.test(id) ? "Panturrilha" : /tibialis/.test(id) ? "Tibial anterior" : /hip-flexor/.test(id) ? "Flexores do quadril" :
    /knee/.test(id) ? "Joelho" : /elbow/.test(id) ? "Cotovelo" : /hand/.test(id) ? "Mão" : /neck|nape/.test(id) ? "Pescoço" :
    /spine/.test(id) ? "Coluna" : /face/.test(id) ? "Rosto" : /head/.test(id) ? "Cabeça" : /foot/.test(id) ? "Pé" : id;
  return `${label}${side}`;
}

function getRegionData(muscle, groups, restrictions, metric, max) {
  const [category, alias] = regionInfo(muscle.id);
  if (!category) return { category: null, score: 0, tier: 0 };
  const matches = groups.filter((item) => alias.test(normalize(item.muscle)));
  const group = matches.sort((a, b) => (b.primarySets || 0) - (a.primarySets || 0))[0] || groups.find((item) => categoryFor(item.muscle) === category);
  const score = group ? metric === "sets" ? Number(group.primarySets || 0) + Number(group.secondarySets || 0) * .5 : Number(group.attributedVolume || 0) : 0;
  const restriction = restrictions.find((item) => item?.active !== false && (alias.test(normalize(item.muscle)) || categoryFor(item.muscle) === category));
  const ratio = max > 0 ? score / max : 0;
  const tier = restriction ? 5 : score <= 0 ? 0 : ratio <= .25 ? 1 : ratio <= .5 ? 2 : ratio <= .75 ? 3 : 4;
  return { category, group, score, ratio, tier, restriction };
}

function Figure({ side, muscles, groups, restrictions, metric, max, selected, onSelect, filter, isolated, restrictedOnly, uid }) {
  const shown = muscles.map((muscle) => ({ muscle, ...getRegionData(muscle, groups, restrictions, metric, max) }));
  return <figure className="anatomy-figure">
    <svg viewBox={side === "front" ? "0 0 35 93" : "37 0 35 93"} role="group" aria-label={side === "front" ? "Musculatura anterior" : "Musculatura posterior"}>
      <defs>
        <linearGradient id={`${uid}-${side}-rest`} x1="0" y1="0" x2=".8" y2="1"><stop stopColor="#303137"/><stop offset="1" stopColor="#202126"/></linearGradient>
      </defs>
      {shown.map(({ muscle, category, group, tier, restriction }) => {
        const focused = selected === category;
        const active = tier > 0 && tier < 5;
        const dimmed = (filter !== null && filter !== tier) || (restrictedOnly && !restriction) || (isolated && selected && category !== selected);
        const filled = active;
        const label = `${regionLabel(muscle.id)}${group ? ` · ${group.muscle}` : " · sem séries"}${restriction ? " · restrição registrada" : ""}`;
        return <g key={muscle.id} className={`anatomy-muscle${dimmed ? " is-dimmed" : ""}${focused ? " is-focused" : ""}`} role={category ? "button" : undefined} tabIndex={category ? 0 : undefined} aria-label={category ? label : undefined} aria-pressed={category ? focused : undefined} onClick={category ? () => onSelect(category, muscle.id) : undefined} onKeyDown={category ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(category, muscle.id); } } : undefined}>
          <title>{label}</title>
          <path d={muscle.path} className="anatomy-muscle__base" fill={`url(#${uid}-${side}-rest)`} stroke={LEVEL_COLORS[tier]} strokeWidth={restriction ? .35 : focused ? .25 : active ? .2 : .12} strokeDasharray={restriction ? ".7 .35" : undefined} />
          {filled && <path d={muscle.path} className="anatomy-muscle__fill" fill={LEVEL_COLORS[tier]} fillOpacity={focused ? .82 : .66} pointerEvents="none" />}
          {restriction && <path d={muscle.path} className="anatomy-muscle__restriction" fill="#fa5360" fillOpacity={restriction.status === "blocked" ? .62 : restriction.status === "limited" ? .28 : .08} stroke="#ff6071" strokeWidth=".32" strokeDasharray=".7 .35" pointerEvents="none" />}
        </g>;
      })}
    </svg>
    <figcaption>{side === "front" ? "Frente" : "Costas"}</figcaption>
  </figure>;
}

export default function MuscleAnatomy({ groups = [], restrictions = [], totals, mode = "planned", onModeChange, days = 7, onDaysChange, isDraft = false, loading = false, error = "" }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [metric, setMetric] = useState("sets");
  const [renderMode, setRenderMode] = useState("3d");
  const [view, setView] = useState("both");
  const [zoom, setZoom] = useState(false);
  const [selected, setSelected] = useState("auto");
  const [region, setRegion] = useState(null);
  const [isolated, setIsolated] = useState(false);
  const [restrictedOnly, setRestrictedOnly] = useState(false);
  const [filter, setFilter] = useState(null);
  const [showIndex, setShowIndex] = useState(false);

  const rows = useMemo(() => {
    const categories = new Map();
    for (const item of groups) {
      const category = categoryFor(item.muscle);
      if (!category) continue;
      const row = categories.get(category) || { name: category, sets: 0, load: 0, primary: 0, secondary: 0, exercises: new Set() };
      row.primary += Number(item.primarySets || 0);
      row.secondary += Number(item.secondarySets || 0);
      row.sets += Number(item.primarySets || 0) + Number(item.secondarySets || 0) * .5;
      row.load += Number(item.attributedVolume || 0);
      for (const name of item.exercises || []) row.exercises.add(name);
      categories.set(category, row);
    }
    return CATEGORIES.map((name) => categories.get(name)).filter(Boolean).sort((a, b) => b.sets - a.sets);
  }, [groups]);
  const focus = selected === "auto" ? rows[0]?.name || null : selected && rows.some((row) => row.name === selected) ? selected : null;
  const focusedRow = rows.find((row) => row.name === focus);
  const allMuscles = [...FRONT_MUSCLES, ...BACK_MUSCLES];
  const selectedMuscle = allMuscles.find((item) => item.id === region);
  const max = Math.max(0, ...groups.map((group) => metric === "sets" ? Number(group.primarySets || 0) + Number(group.secondarySets || 0) * .5 : Number(group.attributedVolume || 0)));
  const maxRow = Math.max(1, ...rows.map((row) => metric === "sets" ? row.sets : row.load));
  const choose = (category, id = null) => { setSelected(category); setRegion(id); };
  const anatomy = { groups, restrictions, metric, max, selected: focus, onSelect: choose, filter, isolated, restrictedOnly, uid };

  return <section className={`muscle-anatomy${zoom ? " muscle-anatomy--zoom" : ""}`} aria-label="Análise muscular">
    <div className="muscle-anatomy__heading"><div><span className="muscle-anatomy__eyebrow">ATLAS · DISTRIBUIÇÃO DE TREINO</span><h2>Anatomia do treino</h2><p>Séries, carga externa e grupos musculares em um só mapa.</p></div><div className="muscle-anatomy__legend"><span>Cores por intensidade da ficha</span>{restrictions.length > 0 && <span><i className="muscle-anatomy__red" /> Restrição</span>}</div></div>
    <div className="muscle-anatomy__toolbar" aria-label="Controles do mapa muscular">
      <div className="muscle-anatomy__segmented" aria-label="Período">{(isDraft ? [["planned", "Prévia da ficha"]] : [["planned", "Planejado"], ["performed", "Realizado"]]).map(([value, label]) => <button type="button" key={value} aria-pressed={mode === value} onClick={() => onModeChange?.(value)}>{label}</button>)}{mode === "performed" && [7, 30].map((value) => <button type="button" key={value} aria-pressed={days === value} onClick={() => onDaysChange?.(value)}>{value} dias</button>)}</div>
      <div className="muscle-anatomy__segmented" aria-label="Métrica">{[["sets", "Séries"], ["volume", "Carga externa"]].map(([value, label]) => <button type="button" key={value} aria-pressed={metric === value} onClick={() => setMetric(value)}>{label}</button>)}</div>
      <div className="muscle-anatomy__segmented" aria-label="Visualização">{[["3d", "Corpo 3D"], ["2d", "Mapa 2D"]].map(([value, label]) => <button key={value} type="button" aria-pressed={renderMode === value} onClick={() => setRenderMode(value)}>{label}</button>)}</div>
      {renderMode === "2d" && <div className="muscle-anatomy__segmented" aria-label="Vista">{[["both", "Ambas"], ["front", "Frente"], ["back", "Costas"]].map(([value, label]) => <button type="button" key={value} aria-pressed={view === value} onClick={() => setView(value)}>{label}</button>)}</div>}
      {renderMode === "2d" && <button type="button" className="muscle-anatomy__tool" aria-pressed={zoom} onClick={() => setZoom((value) => !value)}>{zoom ? "Reduzir" : "Ampliar"}</button>}
      <button type="button" className="muscle-anatomy__tool" aria-pressed={showIndex} onClick={() => setShowIndex((value) => !value)}>Índice muscular</button>
    </div>
    {loading && <p className="muscle-anatomy__status" role="status">Carregando análise muscular…</p>}
    {error && <p className="muscle-anatomy__status" role="alert">{error}</p>}
    {renderMode === "3d" ? <Anatomy3D groups={groups} restrictions={restrictions} metric={metric} selected={focus} onSelect={choose} filter={filter} isolated={isolated} restrictedOnly={restrictedOnly} /> : <div className="muscle-anatomy__figures" data-view={view}>
      {(view === "both" || view === "front") && <Figure side="front" muscles={FRONT_MUSCLES} {...anatomy} />}
      {(view === "both" || view === "back") && <Figure side="back" muscles={BACK_MUSCLES} {...anatomy} />}
    </div>}
    <div className="muscle-anatomy__filters" aria-label="Filtrar intensidade">{LEVELS.map((label, index) => <button type="button" key={label} aria-pressed={filter === index} onClick={() => setFilter((current) => current === index ? null : index)}><i data-level={index} />{label}</button>)}</div>
    <div className="muscle-anatomy__options"><button type="button" className="muscle-anatomy__tool" disabled={!focus} aria-pressed={isolated} onClick={() => setIsolated((value) => !value)}>{isolated ? "Mostrar corpo completo" : "Isolar grupo em foco"}</button><button type="button" className="muscle-anatomy__tool" disabled={!restrictions.length} aria-pressed={restrictedOnly} onClick={() => setRestrictedOnly((value) => !value)}>{restrictedOnly ? "Mostrar todas as regiões" : "Destacar restrições"}</button></div>
    {showIndex && <div className="muscle-anatomy__index"><strong>Índice muscular</strong><div>{allMuscles.filter((item) => regionInfo(item.id)[0]).map((item) => <button type="button" key={item.id} onClick={() => choose(regionInfo(item.id)[0], item.id)}>{regionLabel(item.id)}</button>)}</div></div>}
    <div className="muscle-anatomy__volume"><div className="muscle-anatomy__volume-heading"><strong>Volume por grupo muscular</strong><span>{mode === "performed" ? `Séries e carga registradas em ${days} dias` : "Séries e carga estimadas da ficha"}</span></div>{rows.length ? rows.map((row) => <button type="button" className={`muscle-anatomy__row${focus === row.name ? " is-selected" : ""}`} onClick={() => choose(row.name)} key={row.name} aria-pressed={focus === row.name}><span className="muscle-anatomy__row-label"><strong>{row.name}</strong><span>{number(row.sets)} séries eq. · {volume(row.load)}</span></span><span className="muscle-anatomy__track"><span style={{ width: `${Math.max(4, (metric === "sets" ? row.sets : row.load) / maxRow * 100)}%` }} /></span></button>) : <p className="muscle-anatomy__empty">Adicione exercícios à ficha para visualizar os músculos trabalhados.</p>}</div>
    {focusedRow && <div className="muscle-anatomy__detail" aria-live="polite"><div><span className="muscle-anatomy__eyebrow">EM FOCO</span><h3>{selectedMuscle ? regionLabel(selectedMuscle.id) : focusedRow.name}</h3><p>{number(focusedRow.primary)} séries primárias · {number(focusedRow.secondary)} secundárias · {volume(focusedRow.load)} de carga atribuída</p>{focusedRow.exercises.size > 0 && <small>Exercícios: {[...focusedRow.exercises].join(" · ")}</small>}</div><button type="button" onClick={() => { setSelected(null); setRegion(null); setIsolated(false); }}>Limpar seleção</button></div>}
    <div className="muscle-anatomy__footnote">{totals && <span>{number(totals.sets)} séries · {volume(totals.volume)} de volume externo{totals.unknownVolumeSets ? ` · ${number(totals.unknownVolumeSets)} séries sem carga calculável` : ""}{totals.unclassifiedSets ? ` · ${number(totals.unclassifiedSets)} séries sem classificação` : ""}</span>}<small>Séries equivalentes = primárias + 50% das secundárias. Grupos podem se sobrepor. A cor e o volume visual não medem ativação fisiológica.{!restrictions.length ? " Nenhuma restrição informada não significa liberação para treino." : " Restrições exibidas vêm de registros explícitos."}</small></div>
  </section>;
}
