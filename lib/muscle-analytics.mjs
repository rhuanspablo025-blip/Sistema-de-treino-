// External load volume, not physiological muscle activation.
const numeric = value => value !== null && value !== undefined && String(value).trim() !== '' && /^\d+(\.\d+)?$/.test(String(value).trim()) && Number.isFinite(Number(value)) ? Number(value) : null;
const key = value => typeof value === 'string' ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase() : '';
const names = values => [...new Set((Array.isArray(values) ? values : [values]).map(key).filter(Boolean))];
export function aggregateMuscles(entries, catalog, { mode = 'planned' } = {}) {
  const lookup = new Map(catalog.map(e => [e.id, e]));
  const groups = new Map();
  const totals = { sets: 0, volume: 0, unknownVolumeSets: 0, unclassifiedSets: 0 };
  for (const entry of entries) {
    const exercise = lookup.get(entry.exerciseId);
    const explicit = names(exercise?.primaryMuscles);
    const primary = explicit.length ? explicit : names(exercise?.muscleGroup);
    const secondary = names(exercise?.secondaryMuscles).filter(m => !primary.includes(m));
    const sets = mode === 'performed' ? (Array.isArray(entry.sets) ? entry.sets.map(s => ({ count: 1, reps: numeric(s.repetitions), load: numeric(s.load) })) : []) : [{ count: numeric(entry.sets), reps: numeric(entry.repetitions), load: numeric(entry.load) }];
    for (const s of sets) {
      if (!Number.isInteger(s.count) || s.count <= 0) continue;
      const volume = s.reps === null || s.load === null ? null : s.count * s.reps * s.load;
      totals.sets += s.count;
      if (volume === null) totals.unknownVolumeSets += s.count; else totals.volume += volume;
      if (!primary.length) totals.unclassifiedSets += s.count;
      for (const [muscles, role] of [[primary, 'primary'], [secondary, 'secondary']]) {
        for (const muscle of muscles) {
          const row = groups.get(muscle) || { muscle, primarySets: 0, secondarySets: 0, attributedVolume: 0, exercises: new Set() };
          row[role + 'Sets'] += s.count;
          if (role === 'primary' && volume !== null) row.attributedVolume += volume / muscles.length;
          if (exercise?.name) row.exercises.add(exercise.name);
          groups.set(muscle, row);
        }
      }
    }
  }
  return { totals, groups: [...groups.values()].map(g => ({...g, exercises: [...g.exercises]})).sort((a,b) => b.primarySets - a.primarySets || b.secondarySets - a.secondarySets) };
}
