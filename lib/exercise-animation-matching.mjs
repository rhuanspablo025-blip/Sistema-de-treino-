const ALIASES = [
  [/abdominal.*v.?up|v.?up/i, ['jackknife sit-up', 'band v-up']],
  [/abdominal.*bicicleta|bicicleta|bicycle crunch/i, ['band bicycle crunch']],
  [/abdominal.*canivete|canivete|jackknife/i, ['jackknife sit-up', 'band jack knife sit-up']],
  [/abdominal.*crunch|crunch floor/i, ['crunch floor']],
  [/abdominal.*declinado/i, ['decline crunch', 'decline sit up']],
  [/abdominal.*infra.*reverso|abdominal.*reverso/i, ['reverse crunch', 'cable reverse crunch']],
  [/abdominal.*m[aá]quina/i, ['lever seated crunch', 'lever seated crunch v. 2', 'cable seated crunch']],
  [/abdominal.*polia/i, ['cable standing crunch', 'cable kneeling crunch', 'cable seated crunch']],
  [/abdu[cç][aã]o de quadril.*deitado/i, ['side hip abduction']],
  [/afundo|passada caminhando/i, ['dumbbell lunge', 'barbell lunge', 'forward lunge (male)']],
  [/avan[cç]o.*lateral/i, ['barbell lateral lunge']],
  [/avan[cç]o.*reverso/i, ['dumbbell rear lunge', 'barbell rear lunge']],
  [/arnold press/i, ['dumbbell arnold press']],
  [/barra fixa.*neutra/i, ['pull up (neutral grip)']],
  [/barra fixa.*supinada/i, ['chin-up', 'reverse grip pull-up']],
  [/barra fixa/i, ['pull-up']],
  [/bird dog/i, ['bird dog']],
  [/bom dia|good morning/i, ['barbell good morning', 'barbell seated good morning']],
  [/box jump/i, ['box jump']],
  [/burpee/i, ['burpee']],
  [/cadeira abdutora/i, ['lever seated hip abduction']],
  [/cadeira adutora/i, ['lever seated hip adduction']],
  [/dead bug/i, ['dead bug']],
  [/eleva[cç][aã]o de joelhos.*barra/i, ['hanging knee raise', 'hanging leg raise']],
  [/eleva[cç][aã]o de joelhos.*paralela/i, ['captains chair knee raise', 'knee raise on parallel bars']],
  [/hip thrust na m[aá]quina/i, ['lever hip thrust']],
  [/monster walk|caminhada.*mini.?band/i, ['band side walk', 'resistance band side walk']],
  [/mountain climber/i, ['mountain climber']],
  [/panturrilha.*donkey/i, ['donkey calf raise', 'lever donkey calf raise']],
  [/panturrilha.*sentada/i, ['lever seated calf raise', 'barbell seated calf raise']],
  [/pallof press/i, ['band horizontal pallof press', 'band vertical pallof press']],
  [/passada caminhando/i, ['dumbbell lunge', 'barbell lunge', 'forward lunge (male)']],
  [/prancha.*eleva[cç][aã]o de perna/i, ['reverse plank with leg lift']],
  [/prancha.*toque no ombro/i, ['kneeling plank tap shoulder (male)']],
  [/prancha lateral/i, ['side plank']],
  [/prancha isom[eé]trica/i, ['front plank', 'forearm plank']],
  [/avan[cç]o.*hack.*invertido|agachamento.*hack.*invertido/i, ['reverse hack squat']],
  [/agachamento frontal.*halteres/i, ['dumbbell front squat']],
  [/cadeira flexora|mesa flexora/i, ['seated leg curl', 'lever seated leg curl', 'lying leg curl', 'lever lying leg curl']],
  [/cadeira extensora/i, ['lever leg extension', 'leg extension']],
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
  [/cadeira extensora/i, ['lever leg extension']],
  [/crossover alto/i, ['cable upper chest crossovers']],
  [/crossover baixo/i, ['cable decline fly', 'cable one arm decline chest fly']],
  [/crossover m[eé]dio/i, ['cable standing up straight crossovers']],
  [/crossover/i, ['cable standing up straight crossovers']],
  [/crucifixo.*inclinado/i, ['dumbbell incline fly', 'cable incline fly']],
  [/crucifixo.*inverso/i, ['dumbbell rear lateral raise']],
  [/crucifixo.*polia/i, ['cable standing up straight crossovers', 'cable one arm decline chest fly']],
  [/crucifixo/i, ['dumbbell fly']],
  [/eleva[cç][aã]o lateral.*polia/i, ['cable lateral raise']],
  [/eleva[cç][aã]o lateral.*m[aá]quina/i, ['lever lateral raise']],
  [/extens[aã]o de joelho com el[aá]stico/i, ['resistance band leg extension']],
  [/leg press.*45/i, ['sled 45 degrees leg press', 'sled 45° leg press (side pov)']],
  [/leg press.*unilateral/i, ['lever horizontal one leg press', 'sled 45 degrees one leg press']],
  [/pullover/i, ['dumbbell pullover', 'cable pullover']],
  [/puxada.*(aberta|frontal)|puxada na frente/i, ['cable lat pulldown full range of motion', 'reverse grip machine lat pulldown']],
  [/remada.*baixa/i, ['cable seated row', 'cable low seated row']],
  [/remada.*(serrote|unilateral)/i, ['dumbbell one arm bent-over row', 'cable one arm bent over row']],
  [/remada.*curvada/i, ['barbell bent over row', 'dumbbell bent over row']],
  [/rosca scott|rosca preacher/i, ['lever preacher curl', 'dumbbell preacher curl', 'barbell preacher curl']],
  [/supino.*halteres/i, ['dumbbell bench press']],
  [/supino.*inclinado.*halteres/i, ['dumbbell incline bench press']],
  [/supino.*declinado.*halteres/i, ['dumbbell decline bench press']],
  [/supino.*inclinado/i, ['barbell incline bench press', 'dumbbell incline bench press']],
  [/supino.*declinado/i, ['barbell decline bench press', 'dumbbell decline bench press']],
  [/supino.*(pegada fechada|fechado)/i, ['barbell close-grip bench press', 'smith close-grip bench press']],
  [/supino.*m[aá]quina|press horizontal/i, ['lever chest press', 'cable seated chest press']],
  [/tr[ií]ceps.*pulley|tr[ií]ceps.*corda/i, ['cable triceps pushdown (v-bar)', 'cable overhead triceps extension (rope attachment)']],
];

const DATA_URL = 'https://cdn.jsdelivr.net/gh/ozansozuozgit/flow-exercise-dataset@main/data/exercises.json';
let datasetPromise;

export function loadExerciseAnimationDataset() {
  if (!datasetPromise) {
    datasetPromise = fetch(DATA_URL, { cache: 'force-cache' })
      .then((response) => {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then((data) => {
        if (!Array.isArray(data)) throw new Error('Formato inválido do catálogo.');
        return data;
      })
      .catch((error) => {
        datasetPromise = null;
        throw error;
      });
  }
  return datasetPromise;
}

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function findAnimation(exercise, records) {
  const name = exercise?.name || exercise?.exerciseName || '';
  const normalizedName = normalize(name);
  if (!normalizedName) return null;

  const matchingAliases = ALIASES
    .filter(([pattern]) => pattern.test(name))
    .sort((left, right) => right[0].source.length - left[0].source.length)
  const mostSpecificPatternLength = matchingAliases[0]?.[0].source.length || 0;
  const alias = matchingAliases
    .filter(([pattern]) => pattern.source.length === mostSpecificPatternLength)
    .flatMap(([, terms]) => terms);
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
