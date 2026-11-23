// Artist reference circumferences in cm for the two neutral meshes.
// These ratios drive an illustration, not an estimate of lean mass.
export const bodyFields = [
  ['height', 'Altura', 'cm', 174, 163], ['weight', 'Peso', 'kg'],
  ['neck', 'Pescoço', 'cm', 38, 33], ['shoulder', 'Contorno dos ombros', 'cm', 110, 98],
  ['chest', 'Tórax', 'cm', 96, 88], ['waist', 'Cintura', 'cm', 82, 73],
  ['hip', 'Quadril', 'cm', 96, 97],
  ...[['arm', 'Braço', 32, 27], ['forearm', 'Antebraço', 26, 23],
      ['thigh', 'Coxa', 54, 52], ['leg', 'Panturrilha', 36, 34]]
    .flatMap(([key, label, male, female]) => [
      [key + 'Left', label + (key === 'thigh' || key === 'leg' ? ' esquerda' : ' esquerdo'), 'cm', male, female],
      [key + 'Right', label + (key === 'thigh' || key === 'leg' ? ' direita' : ' direito'), 'cm', male, female],
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

export function shapeRatios(values = {}, sex) {
  const ratios = {};
  for (const [key, , , male, female] of bodyFields) {
    if (!male) continue;
    const value = Number(values[key]);
    ratios[key] = Number.isFinite(value) && value > 0
      ? Math.min(1.55, Math.max(.65, value / (sex === 'female' ? female : male))) : 1;
  }
  return ratios;
}
