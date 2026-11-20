"use client";

import { useMemo, useState } from "react";
import { BACK_MUSCLES, FRONT_MUSCLES } from "body-muscles";

const GROUPS = ["Glúteos", "Costas", "Peito", "Ombros", "Quadríceps", "Posterior de coxa", "Braços", "Abdômen", "Panturrilhas"];

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function muscleGroup(value) {
  const name = normalize(value);
  if (/glut/.test(name)) return "Glúteos";
  if (/costas|dorsal|latissim|romboid|trapez|lombar|erector/.test(name)) return "Costas";
  if (/peito|peitoral|chest/.test(name)) return "Peito";
  if (/ombro|deltoid|shoulder/.test(name)) return "Ombros";
  if (/posterior|isquiotib|hamstring|femoral/.test(name)) return "Posterior de coxa";
  if (/quadricep|coxa|perna|adutor|leg/.test(name)) return "Quadríceps";
  if (/bicep|tricep|braco|antebraco|forearm/.test(name)) return "Braços";
  if (/abdom|core|obliqu|serrato/.test(name)) return "Abdômen";
  if (/panturr|gemeo|soleo|calf/.test(name)) return "Panturrilhas";
  return null;
}

function regionGroup(id) {
  if (/gluteus/.test(id)) return "Glúteos";
  if (/lats|lower-back|spine|traps/.test(id)) return "Costas";
  if (/chest/.test(id)) return "Peito";
  if (/shoulder|deltoid/.test(id)) return "Ombros";
  if (/hamstrings/.test(id)) return "Posterior de coxa";
  if (/quads|adductors|hip-flexor/.test(id)) return "Quadríceps";
  if (/biceps|triceps|forearm/.test(id)) return "Braços";
  if (/abs|obliques|serratus/.test(id)) return "Abdômen";
  if (/calves|tibialis/.test(id)) return "Panturrilhas";
  return null;
}

function formatVolume(kilograms) {
  if (!kilograms) return "sem carga calculável";
  if (kilograms >= 1000) return `${(kilograms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} t`;
  return `${Math.round(kilograms).toLocaleString("pt-BR")} kg`;
}

function Figure({ view, muscles, activeGroups, selectedGroup, onSelect }) {
  return <figure className="anatomy-figure">
    <svg viewBox={view === "front" ? "0 0 35 93" : "37 0 35 93"} role="img" aria-label={view === "front" ? "Mapa muscular de frente" : "Mapa muscular de costas"}>
      {muscles.map((muscle) => {
        const group = regionGroup(muscle.id);
        const state = group === selectedGroup ? "selected" : activeGroups.has(group) ? "active" : "rest";
        return <path key={muscle.id} d={muscle.path} className={`anatomy-region anatomy-region--${state}`} data-group={group || undefined} onClick={group ? () => onSelect(group) : undefined}>
          <title>{group ? `${muscle.name} · ${group}` : muscle.name}</title>
        </path>;
      })}
    </svg>
    <figcaption>{view === "front" ? "Frente" : "Costas"}</figcaption>
  </figure>;
}

export default function MuscleAnatomy({ exercises = [], history = [], groups = null, mode = "planned", days = 30 }) {
  const [selected, setSelected] = useState(null);
  const rows = useMemo(() => {
    if (groups) {
      const byGroup = new Map();
      for (const item of groups) {
        const group = muscleGroup(item.muscle);
        if (!group) continue;
        const current = byGroup.get(group) || { name: group, sets: 0, volume: 0 };
        current.sets += Math.max(0, Number(item.primarySets) || 0) + .5 * Math.max(0, Number(item.secondarySets) || 0);
        current.volume += Math.max(0, Number(item.attributedVolume) || 0);
        byGroup.set(group, current);
      }
      return GROUPS.map((group) => byGroup.get(group)).filter(Boolean).sort((a, b) => b.sets - a.sets);
    }
    const byGroup = new Map();
    const exerciseGroups = new Map();
    for (const item of exercises) {
      const group = muscleGroup(item.exercise?.muscleGroup) || muscleGroup(item.exercise?.primaryMuscles?.[0]) || muscleGroup(item.exercise?.name);
      if (!group) continue;
      const current = byGroup.get(group) || { name: group, sets: 0, volume: 0 };
      current.sets += Math.max(0, Number(item.sets) || 0);
      byGroup.set(group, current);
      exerciseGroups.set(String(item.exerciseId), group);
    }
    const since = Date.now() - 30 * 86400000;
    for (const record of history) {
      if (new Date(record.date).getTime() < since) continue;
      const group = exerciseGroups.get(String(record.exerciseId));
      if (!group) continue;
      const current = byGroup.get(group);
      current.volume += (record.sets || []).reduce((sum, set) => sum + Math.max(0, Number(set.repetitions) || 0) * Math.max(0, Number(set.load) || 0), 0);
    }
    return GROUPS.map((group) => byGroup.get(group)).filter(Boolean).sort((a, b) => b.sets - a.sets);
  }, [exercises, history, groups]);
  const activeGroups = useMemo(() => new Set(rows.map((row) => row.name)), [rows]);
  const selectedGroup = selected && activeGroups.has(selected) ? selected : rows[0]?.name;
  const maxSets = Math.max(1, ...rows.map((row) => row.sets));

  return <section className="muscle-anatomy" aria-labelledby="muscle-anatomy-heading">
    <div className="muscle-anatomy__heading">
      <div><span className="muscle-anatomy__eyebrow">MAPA MUSCULAR</span><h2 id="muscle-anatomy-heading">Anatomia do treino</h2><p>Os destaques mostram os grupos da sua ficha atual.</p></div>
      <div className="muscle-anatomy__legend"><span><i className="muscle-anatomy__gold" /> Em foco</span><span><i className="muscle-anatomy__coral" /> Na ficha</span></div>
    </div>
    <div className="muscle-anatomy__figures">
      <Figure view="front" muscles={FRONT_MUSCLES} activeGroups={activeGroups} selectedGroup={selectedGroup} onSelect={setSelected} />
      <Figure view="back" muscles={BACK_MUSCLES} activeGroups={activeGroups} selectedGroup={selectedGroup} onSelect={setSelected} />
    </div>
    <div className="muscle-anatomy__volume">
      <div className="muscle-anatomy__volume-heading"><strong>Volume por grupo muscular</strong><span>{groups ? mode === "performed" ? `Séries e carga registradas em ${days} dias` : "Séries e carga estimadas da ficha" : "Séries da ficha · carga dos últimos 30 dias"}</span></div>
      {rows.length ? rows.map((row) => <button type="button" className={`muscle-anatomy__row${selectedGroup === row.name ? " is-selected" : ""}`} onClick={() => setSelected(row.name)} key={row.name} aria-pressed={selectedGroup === row.name}>
        <span className="muscle-anatomy__row-label"><strong>{row.name}</strong><span>{row.sets.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} {groups ? "séries eq." : row.sets === 1 ? "série" : "séries"} · {formatVolume(row.volume)}</span></span>
        <span className="muscle-anatomy__track"><span style={{ width: `${Math.max(4, row.sets / maxSets * 100)}%` }} /></span>
      </button>) : <p className="muscle-anatomy__empty">Adicione exercícios à ficha para visualizar os músculos trabalhados.</p>}
    </div>
  </section>;
}
