import { bodyFields } from './body-shape.mjs';

const clamp = x => Math.max(0, Math.min(1, x));
const ramp = (a,b,x) => { const t = clamp((x-a)/(b-a)); return t*t*(3-2*t); };
const band = (y,a,b,c,d) => ramp(a,b,y)*(1-ramp(c,d,y));

// Coordinates are fractions of standing height in the original unposed mesh.
function zone(x, y, z, female) {
  const width = Math.abs(x), side = x >= 0 ? 'Left' : 'Right';
  const armAxis = female ? .125 - .055*(y-.54) : .151 - .18*(y-.54);
  const armLine = armAxis - (female ? .027 : .032);
  const arm = y > .415 && y < .81 && width > armLine;
  const ankle = female ? .083 : .056;
  const legAxis = Math.sign(x) * (ankle + (.05-ankle)*ramp(.16,.48,y));
  const weights = {};
  let category, cloth, accent = false;
  if (arm) {
    const elbow = ramp(.57,.64,y);
    weights['arm'+side] = elbow*band(y,.56,.61,.745,.8);
    weights['forearm'+side] = (1-elbow)*band(y,.46,.50,.61,.65);
    weights.shoulder = band(y,.70,.76,.81,.84);
    category = y > .745 ? 'Ombros' : y > .49 ? 'Braços' : null;
    cloth = y > .70 ? 'jersey' : y < .49 ? 'skin' : 'sleeve';
    accent = (y > .696 && y < .707) || (y > .493 && y < .505);
    return { category, cloth, accent, weights, axis: Math.sign(x)*armAxis };
  }
  if (y < .47) {
    weights['leg'+side] = band(y,.055,.135,.21,.29);
    weights['thigh'+side] = band(y,.22,.31,.415,.49);
    weights.hip = ramp(.395,.49,y)*.6;
    category = y < .075 ? null : y < .265 ? 'Panturrilhas' : z > -.012 ? 'Quadríceps' : 'Posterior de coxa';
    cloth = y < .068 ? 'shoe' : y < .12 ? 'sock' : y < .363 ? 'sleeve' : 'shorts';
    accent = (y < .024 && y > .013) || (y > .362 && y < .371) || (y > .37 && width > .087 && y < .47);
    return { category, cloth, accent, weights, axis: legAxis };
  }
  weights.hip = band(y,.38,.46,.52,.59);
  weights.waist = band(y,.50,.565,.60,.675);
  weights.chest = band(y,.59,.68,.755,.83);
  weights.shoulder = band(y,.70,.775,.82,.855)*ramp(.027,.10,width);
  weights.neck = band(y,.815,.85,.871,.896);
  category = y > .838 ? null : y < .54 && z < -.01 ? 'Glúteos' : y < .54 ? null :
    z < -.018 ? 'Costas' : y < .665 ? 'Abdômen' : y > .755 && width > .074 ? 'Ombros' : 'Peito';
  const collar = .813 + .023*ramp(0,.055,width);
  cloth = y > collar ? 'skin' : y < .553 ? 'shorts' : 'jersey';
  if ((y > .53 && y < .55) || (y > .934 && y < .95)) cloth = 'belt';
  // A gold piping line follows the chest yoke and the side of the shorts.
  accent = (y < collar && y > collar-.008) || (z > 0 && Math.abs(y-(.714+.22*width)) < .004)
    || (width > .087 && y < .53);
  return { category, cloth, accent, weights, axis: 0 };
}

export function dressAthlete(THREE, mesh, sex) {
  const geo = mesh.geometry;
  geo.computeBoundingBox();
  const height = geo.boundingBox.max.y - geo.boundingBox.min.y;
  const pos = geo.attributes.position;
  const fields = bodyFields.map(([key]) => key).filter(key => !['weight','height'].includes(key));
  const offsets = Object.fromEntries(fields.map(field => [field,new Float32Array(pos.count*3)]));
  const palette = Object.fromEntries(Object.entries({
    jersey:'#353d44', sleeve:'#4b5156', shorts:'#242a32', belt:'#12161b',
    sock:'#cad1cf', shoe:'#414343', skin:'#b98b71', trim:'#eab951',
  }).map(([key,hex]) => [key,new THREE.Color(hex)]));
  const zones = [];
  for (let i=0; i<pos.count; i++) {
    const x=pos.getX(i)/height, y=(pos.getY(i)-geo.boundingBox.min.y)/height, z=pos.getZ(i)/height;
    const { axis, weights, ...surface } = zone(x,y,z,sex==='female');
    zones.push(surface);
    for (const [field,weight] of Object.entries(weights)) {
      offsets[field][3*i] = (x-axis)*height*weight;
      offsets[field][3*i+2] = z*height*weight;
    }
  }
  geo.morphTargetsRelative = true;
  geo.morphAttributes.position = fields.map(field => new THREE.Float32BufferAttribute(offsets[field],3));
  mesh.updateMorphTargets();
  const colors = new THREE.Float32BufferAttribute(new Float32Array(pos.count*3),3);
  geo.setAttribute('color',colors);
  mesh.material.dispose();
  mesh.material = new THREE.MeshStandardMaterial({vertexColors:true,roughness:.82,metalness:.08});
  const scratch = new THREE.Color();
  return {
    categoryAt(hit) { return zones[hit.face.a]?.category ?? zones[hit.face.b]?.category ?? zones[hit.face.c]?.category; },
    shape(ratios, approach) {
      fields.forEach((key,i) => {
        mesh.morphTargetInfluences[i] = approach(mesh.morphTargetInfluences[i],ratios[key]-1);
      });
    },
    paint(styles) {
      for (let i=0; i<zones.length; i++) {
        const { category, cloth, accent } = zones[i], style = styles.get(category);
        scratch.copy(palette[accent ? 'trim' : cloth]);
        if (style && !accent) scratch.lerp(style.color, style.tier ? .78 : .11);
        if (style?.fade) scratch.multiplyScalar(.29);
        else if (style?.selected) scratch.multiplyScalar(1.16);
        colors.setXYZ(i,scratch.r,scratch.g,scratch.b);
      }
      colors.needsUpdate=true;
    },
  };
}
