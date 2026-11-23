export const bodyFields = [
  ['height', 'Altura', 'cm'], ['weight', 'Peso', 'kg'],
  ['neck', 'Pescoço', 'cm'], ['shoulder', 'Contorno dos ombros', 'cm'],
  ['chest', 'Tórax', 'cm'], ['waist', 'Cintura', 'cm'],
  ['hip', 'Quadril', 'cm'],
  ...[['arm', 'Braço'], ['forearm', 'Antebraço'],
      ['thigh', 'Coxa'], ['leg', 'Panturrilha']]
    .flatMap(([key, label]) => [
      [key + 'Left', label + (key === 'thigh' || key === 'leg' ? ' esquerda' : ' esquerdo'), 'cm'],
      [key + 'Right', label + (key === 'thigh' || key === 'leg' ? ' direita' : ' direito'), 'cm'],
    ]),
];

export function currentMeasures(records = []) {
  const result = {};
  for (const item of [...records].sort((a, b) => new Date(b.measuredAt) - new Date(a.measuredAt))) {
    for (const [key] of bodyFields) {
      if (!(key in result) && Number(item[key]) > 0) result[key] = Number(item[key]);
    }
  }
  return result;
}
