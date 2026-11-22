import * as THREE from 'three';

// Axles run along Z. All dimensions use the same scale: an Olympic plate
// has a 450 mm outer diameter and a 50 mm bore.
const radius = 2.25;
const bore = 0.25;
const tau = 2 * Math.PI;

function grain(knurled) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const data = ctx.createImageData(256, 256);
  let seed = 1946;
  function random() {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const v = knurled
        ? 130 + 46 * Math.cos(((x + y) * Math.PI) / 8) + 46 * Math.cos(((x - y) * Math.PI) / 8)
        : 160 + 78 * random();
      const i = (y * 256 + x) * 4;
      data.data.set([v, v, v, 255], i);
    }
  }
  ctx.putImageData(data, 0, 0);
  if (!knurled) {
    for (let i = 0; i < 110; i++) {
      const x = random() * 256,
        y = random() * 256;
      ctx.strokeStyle = 'rgba(255,249,231,.38)';
      ctx.lineWidth = random() * 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + random() * 16, y + random() * 6);
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function material(color, metalness, roughness, options = {}) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness, ...options });
}

function mesh(parent, geo, mat, z = 0) {
  const part = new THREE.Mesh(geo, mat);
  part.position.z = z;
  parent.add(part);
  return part;
}

function ring(parent, r, thickness, mat, z, segments) {
  return mesh(parent, new THREE.TorusGeometry(r, thickness, 8, segments), mat, z);
}

function lathe(parent, profile, mat, segments) {
  const geo = new THREE.LatheGeometry(
    profile.map(([r, z]) => new THREE.Vector2(r, z)),
    segments,
  );
  geo.rotateX(Math.PI / 2);
  return mesh(parent, geo, mat);
}

// Machined handholds are curved through-holes, including a bevel on each lip.
function handhold(angle, padding = 0, path = new THREE.Path()) {
  const near = 1.31 - padding,
    far = 1.76 + padding,
    end = 0.32;
  const mid = (near + far) / 2,
    rounding = (far - near) / 2;
  path.absarc(0, 0, far, angle - end, angle + end, false);
  path.absarc(
    mid * Math.cos(angle + end),
    mid * Math.sin(angle + end),
    rounding,
    angle + end,
    angle + end + Math.PI,
    false,
  );
  path.absarc(0, 0, near, angle + end, angle - end, true);
  path.absarc(
    mid * Math.cos(angle - end),
    mid * Math.sin(angle - end),
    rounding,
    angle - end + Math.PI,
    angle - end + tau,
    false,
  );
  return path;
}

function plateOutline(r, reveal) {
  const shape = new THREE.Shape();
  if (reveal) {
    // Stepped break in the rubber jacket. A smaller cast insert remains visible below it.
    shape.absarc(0, 0, r, -0.37, tau - 0.78, false);
    shape.lineTo(1.82 * Math.cos(-0.75), 1.82 * Math.sin(-0.75));
    shape.lineTo(1.75 * Math.cos(-0.55), 1.75 * Math.sin(-0.55));
    shape.lineTo(1.85 * Math.cos(-0.4), 1.85 * Math.sin(-0.4));
    shape.closePath();
  } else shape.absarc(0, 0, r, 0, tau, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, bore + 0.07, 0, tau, true);
  shape.holes.push(hole);
  for (const a of [Math.PI / 6, (5 * Math.PI) / 6, (3 * Math.PI) / 2])
    shape.holes.push(handhold(a));
  return shape;
}

function extrude(shape, depth, bevel, segments) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    curveSegments: segments / 4,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelThickness: bevel,
    bevelSize: bevel,
  });
  const { position, uv, normal } = geo.attributes;
  for (let i = 0; i < uv.count; i++) {
    const x = position.getX(i),
      y = position.getY(i);
    if (Math.abs(normal.getZ(i)) > 0.45) uv.setXY(i, 0.5 + x / 4.58, 0.5 + y / 4.58);
    else uv.setXY(i, (Math.atan2(y, x) + Math.PI) / tau, position.getZ(i) + 0.25);
  }
  return geo;
}

function lettering() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.textAlign = 'center';
  ctx.fillStyle = '#c5baa4';
  ctx.font = 'bold 166px Arial';
  ctx.fillText('20', 256, 153);
  ctx.font = 'bold 66px Arial';
  ctx.fillText('KG', 256, 231);
  return new THREE.CanvasTexture(canvas);
}

function decal(parent, texture, width, height, x, y, z) {
  texture.colorSpace = THREE.SRGBColorSpace;
  const mat = material(0xffffff, 0.25, 0.43, {
    map: texture,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const badge = mesh(parent, new THREE.PlaneGeometry(width, height), mat, z);
  badge.position.set(x, y, z);
}

export function createEquipment(segments, logos) {
  const equipment = new THREE.Group(),
    stack = new THREE.Group(),
    hero = new THREE.Group();
  equipment.add(stack, hero);
  const noise = grain(false),
    grip = grain(true);
  grip.repeat.set(12, 4);
  const rubber = material(0xffffff, 0.28, 0.65, {
    map: logos.jacket,
    normalMap: logos.normal,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughnessMap: logos.rough,
    bumpMap: noise,
    bumpScale: 0.014,
  });
  const graphite = material(0x737171, 0.86, 0.39, {
    normalMap: logos.normal,
    roughnessMap: logos.rough,
  });
  const satin = material(0xaab1ba, 0.94, 0.26);
  const gold = material(0xd99b33, 0.84, 0.29);
  const blue = material(0x223d63, 0.64, 0.4);
  const gripSteel = material(0x96918c, 0.91, 0.36, { bumpMap: grip, bumpScale: 0.013 });
  const sleeve = lathe(
    stack,
    [
      [0, -10.1],
      [0.23, -10.1],
      [0.23, -7.6],
      [0.28, -7.55],
      [0.14, -7.48],
      [0.14, -1.2],
      [0.31, -1.16],
      [0.31, -1.04],
      [0.235, -1],
      [0.235, 1.22],
      [0.215, 1.26],
      [0, 1.26],
    ],
    satin,
    segments,
  );
  sleeve.geometry.computeBoundingSphere();
  lathe(
    stack,
    [
      [0.143, -6.8],
      [0.143, -5.05],
    ],
    gripSteel,
    segments,
  );
  lathe(
    stack,
    [
      [0.143, -3.7],
      [0.143, -1.9],
    ],
    gripSteel,
    segments,
  );
  lathe(
    stack,
    [
      [0.236, 0.65],
      [0.307, 0.68],
      [0.307, 0.94],
      [0.236, 0.97],
    ],
    graphite,
    segments,
  );
  lathe(
    stack,
    [
      [0.307, 0.71],
      [0.309, 0.73],
      [0.309, 0.86],
      [0.307, 0.88],
    ],
    gripSteel,
    segments,
  );
  for (let i = 0; i < 12; i++) ring(stack, 0.236, 0.0035, graphite, 0.32 + i * 0.023, segments);
  for (const z of [0.69, 0.89, 1.19])
    ring(stack, z === 1.19 ? 0.229 : 0.307, 0.012, gold, z, segments);
  decal(stack, logos.symbol, 0.32, 0.24, 0, 0, 1.264);

  const rotors = [hero];
  const weight = lettering();
  const core = extrude(plateOutline(radius - 0.08, false), 0.084, 0.018, segments);
  const jackets = new Map();
  function plate(group, main, band, depth) {
    mesh(group, core, graphite, -0.04);
    const key = main ? 'hero' : depth;
    if (!jackets.has(key))
      jackets.set(key, extrude(plateOutline(radius, main), depth, 0.036, segments));
    const jacket = jackets.get(key);
    mesh(group, jacket, rubber, 0.018);
    const back = mesh(group, jacket, rubber, -0.018);
    back.rotation.y = Math.PI;
    const front = depth + 0.055;
    // Sidewall inlay follows the intact circumference of the cutaway.
    const trim = mesh(
      group,
      new THREE.TorusGeometry(radius + 0.023, 0.024, 8, segments, main ? tau - 0.43 : tau),
      band,
      depth * 0.55,
    );
    trim.rotation.z = -0.37;
    const lip = mesh(
      group,
      new THREE.TorusGeometry(radius - 0.105, 0.016, 8, segments, main ? tau - 0.5 : tau),
      band,
      front - 0.003,
    );
    lip.rotation.z = -0.35;
    ring(group, 0.69, 0.021, graphite, front, segments);
    lathe(
      group,
      [
        [bore, -front],
        [bore + 0.11, -front],
        [bore + 0.15, front],
        [bore + 0.11, front + 0.035],
        [bore + 0.013, front + 0.035],
        [bore, front],
        [bore, -front],
      ],
      satin,
      segments,
    );
    ring(group, bore + 0.14, 0.013, gold, front + 0.018, segments);
    if (!main) return;
    // Cast a continuous raised lip around each actual handhold.
    for (const angle of [Math.PI / 6, (5 * Math.PI) / 6, (3 * Math.PI) / 2]) {
      const ridge = handhold(angle, 0.075, new THREE.Shape());
      ridge.holes.push(handhold(angle));
      mesh(group, extrude(ridge, 0.019, 0.018, segments), rubber, front - 0.005);
    }
    lathe(
      group,
      [
        [0.4, front],
        [0.63, front],
        [0.6, front + 0.037],
        [0.42, front + 0.06],
        [0.4, front],
      ],
      graphite,
      segments,
    );
    decal(
      group,
      logos.atlas,
      1.98,
      (1.98 * logos.atlas.image.height) / logos.atlas.image.width,
      0,
      1.11,
      front + 0.012,
    );
    decal(
      group,
      logos.web,
      0.94,
      (0.94 * logos.web.image.height) / logos.web.image.width,
      0,
      -0.89,
      front + 0.012,
    );
    for (const side of [-1, 1])
      decal(group, weight, 0.69, 0.345, side * 1.49, -0.09, front + 0.018);
    for (let i = 0; i < 6; i++) {
      const a = (i * tau) / 6;
      const bolt = mesh(
        group,
        new THREE.CylinderGeometry(0.043, 0.043, 0.016, 6),
        satin,
        front + 0.008,
      );
      bolt.rotation.x = Math.PI / 2;
      bolt.position.x = 0.56 * Math.cos(a);
      bolt.position.y = 0.56 * Math.sin(a);
    }
  }
  plate(hero, true, gold, 0.13);
  for (const [z, scale, band, depth] of [
    [-0.43, 0.96, blue, 0.13],
    [-0.84, 0.91, gold, 0.12],
    [-7.7, 0.91, blue, 0.12],
    [-8.12, 0.96, gold, 0.13],
    [-8.56, 1, graphite, 0.14],
  ]) {
    const group = new THREE.Group();
    group.position.z = z;
    group.scale.setScalar(scale);
    stack.add(group);
    rotors.push(group);
    plate(group, false, band, depth);
  }
  return { equipment, stack, rotors };
}
