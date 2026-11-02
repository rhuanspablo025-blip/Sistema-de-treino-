const ALIASES = [
  [/abdominal.*v.?up|v.?up/i, ['jackknife sit-up', 'band v-up']],
  [/abdominal.*bicicleta|bicicleta|bicycle crunch/i, ['band bicycle crunch']],
  [/abdominal.*canivete|canivete|jackknife/i, ['jackknife sit-up', 'band jack knife sit-up']],
  [/abdominal.*crunch|crunch floor/i, ['crunch floor']],
  [/abdominal.*declinado/i, ['decline crunch', 'decline sit up']],
  [/abdominal.*infra.*reverso|abdominal.*reverso/i, ['reverse crunch', 'cable reverse crunch']],
  [/abdominal.*m[aá]quina/i, ['lever seated crunch', 'lever seated crunch v. 2', 'cable seated crunch']],
  [/abdominal.*polia/i, ['cable standing crunch', 'cable kneeling crunch', 'cable seated crunch']],
  [/cadeira flexora|mesa flexora/i, ['seated leg curl', 'lever seated leg curl', 'lying leg curl', 'lever lying leg curl']],
  [/cadeira extensora/i, ['leg extension', 'lever leg extension']],
  [/caminhada.*fazendeiro|farmer/i, ['farmer walk', 'farmers walk', 'single arm farmer walk', 'farmer carry']],
  [/caminhada lateral.*mini.?band|lateral band walk/i, ['lateral band walk', 'band side walk', 'resistance band side walk']],
  [/chest press.*convergente|convergente.*chest press/i, ['machine chest press', 'lever chest press', 'chest press']],
  [/clam.?shell/i, ['clamshell', 'side lying clam']],
  [/coice.*tr[ií]ceps|tr[ií]ceps.*kickback/i, ['triceps kickback', 'cable triceps kickback', 'dumbbell kickback']],
  [/tr[ií]ceps.*pol(i|e)y|pol(i|e)y.*tr[ií]ceps/i, ['triceps pushdown', 'cable triceps pushdown']],
  [/desenvolvimento.*halter/i, ['dumbbell shoulder press', 'seated dumbbell press']],
  [/supino.*inclinado/i, ['incline bench press', 'incline dumbbell press']],
  [/supino/i, ['barbell bench press', 'bench press']],
  [/agachamento.*b[uú]lgaro/i, ['bulgarian split squat', 'dumbbell bulgarian split squat', 'barbell bulgarian split squat']],
  [/agachamento.*caixa/i, ['box squat', 'barbell box squat']],
  [/agachamento.*mini.?band/i, ['band squat', 'banded squat']],
  [/agachamento.*pausa/i, ['paused squat', 'pause squat']],
  [/agachamento.*frontal/i, ['barbell front squat', 'dumbbell front squat']],
  [/agachamento.*goblet/i, ['goblet squat', 'dumbbell goblet squat']],
  [/agachamento.*hack/i, ['hack squat', 'barbell hack squat']],
  [/agachamento.*parede/i, ['wall squat', 'wall sit']],
  [/agachamento.*smith/i, ['smith squat', 'smith machine squat']],
  [/agachamento.*sum[oô]/i, ['sumo squat', 'barbell sumo squat', 'dumbbell sumo squat']],
  [/agachamento.*livre/i, ['barbell squat', 'squat']],
  [/agachamento/i, ['barbell squat', 'squat']],
  [/leg.?press/i, ['leg press']],
  [/puxada.*frente/i, ['lat pulldown', 'cable pulldown']],
  [/remada.*curvada/i, ['bent over row', 'barbell row']],
  [/remada.*baixa/i, ['seated cable row', 'cable row']],
  [/rosca.*martelo/i, ['hammer curl', 'dumbbell hammer curl']],
  [/rosca/i, ['barbell curl', 'dumbbell curl']],
  [/eleva[cç][aã]o lateral/i, ['dumbbell lateral raise', 'lateral raise']],
  [/panturrilha/i, ['standing calf raise', 'calf raise']],
  [/levantamento terra/i, ['deadlift', 'barbell deadlift']],
];

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function findAnimation(exercise, records) {
  const name = exercise?.name || exercise?.exerciseName || '';
  const normalizedName = normalize(name);
  if (!normalizedName) return null;

  const alias = ALIASES.find(([pattern]) => pattern.test(name))?.[1] || [];
  const candidates = records.filter((item) =>
    item?.animation?.frames?.length >= 2 &&
    item.mediaStatus !== 'instructions-only'
  );

  for (const term of [normalizedName, ...alias.map(normalize)]) {
    const exact = candidates.find((item) => normalize(item.name) === term);
    if (exact) return exact;
  }

  const targetTokenSets = [name, ...alias]
    .map((term) => new Set(normalize(term).split(' ').filter((word) => word.length > 2)))
    .filter((tokens) => tokens.size >= 2);
  let best = null;
  let bestScore = 0;
  for (const item of candidates) {
    const itemTokens = new Set(normalize(item.name).split(' ').filter((word) => word.length > 2));
    if (itemTokens.size < 2) continue;
    for (const targetTokens of targetTokenSets) {
      let overlap = 0;
      for (const token of itemTokens) if (targetTokens.has(token)) overlap++;
      if (overlap < 2 || overlap < targetTokens.size) continue;
      const score = overlap / Math.max(itemTokens.size, targetTokens.size);
      if (score > bestScore) { best = item; bestScore = score; }
    }
  }
  return bestScore >= 0.75 ? best : null;
}
