import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import atlas from '../../public/forge/atlasfit.webp';
import webplus from '../../public/forge/webplus.webp';
import symbol from '../../public/brand/atlasfit-symbol.jpeg';
import gym from '../../public/forge/gym.webp';
import jacket from '../../public/forge/jacket.webp';
import normal from '../../public/forge/casting-normal.webp';
import rough from '../../public/forge/casting-roughness.webp';
import { createEquipment } from './equipment';
import { FORGE_DURATION } from '../../lib/forge-experience.mjs';

function smooth(t) {
  t = THREE.MathUtils.clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}

function release(root) {
  const resources = new Set();
  root.traverse(({ geometry, material, shadow }) => {
    shadow?.dispose();
    if (geometry) resources.add(geometry);
    for (const mat of [].concat(material || [])) {
      for (const value of Object.values(mat)) if (value?.isTexture) resources.add(value);
      resources.add(mat);
    }
  });
  for (const resource of resources) resource.dispose();
}

function workshop(scene, small) {
  // Soft contact shadow on the floor directly underneath the suspended weights.
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const shadow = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
  shadow.addColorStop(0, 'rgba(0,0,0,.92)');
  shadow.addColorStop(1, 'transparent');
  ctx.fillStyle = shadow;
  ctx.fillRect(0, 0, 64, 64);
  const sm = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(c),
    transparent: true,
    depthWrite: false,
  });
  for (const z of [0, -8]) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(5, 3), sm);
    plane.position.set(0, -2.899, z);
    plane.rotation.x = -Math.PI / 2;
    scene.add(plane);
  }
  const count = small ? 18 : 50,
    values = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    values.set(
      [Math.sin(i * 397) * 8, Math.sin(i * 619 + 1) * 4, -3 + Math.sin(i * 211) * 7],
      i * 3,
    );
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(values, 3));
  scene.add(
    new THREE.Points(
      g,
      new THREE.PointsMaterial({ size: 0.014, color: 0xd9a357, opacity: 0.45, transparent: true }),
    ),
  );
}

export function mountStudio(host, { intro, onReady, onTime, onFailure }) {
  const small = host.clientWidth < 680 || (navigator.hardwareConcurrency || 4) <= 4;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111012);
  scene.fog = new THREE.FogExp2(0x181419, 0.052);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.035, 90);
  const renderer = new THREE.WebGLRenderer({
    antialias: !small,
    powerPreference: 'low-power',
    alpha: false,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.25 : 1.65));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  host.appendChild(renderer.domElement);
  let closed = false,
    frame = 0,
    observer,
    target,
    last = null,
    elapsed = 0;
  const textures = [];
  function dispose() {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(frame);
    observer?.disconnect();
    document.removeEventListener('visibilitychange', resume);
    renderer.domElement.removeEventListener('webglcontextlost', lost);
    release(scene);
    target?.dispose();
    textures.forEach((t) => t.dispose());
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  }
  function lost(e) {
    e.preventDefault();
    dispose();
    onFailure();
  }
  let draw;
  function resume() {
    cancelAnimationFrame(frame);
    last = null;
    if (!closed && !document.hidden && draw) frame = requestAnimationFrame(draw);
  }
  renderer.domElement.addEventListener('webglcontextlost', lost);
  document.addEventListener('visibilitychange', resume);
  async function start() {
    const loader = new THREE.TextureLoader();
    const assets = await Promise.all(
      [atlas.src, webplus.src, symbol.src, gym.src, jacket.src, normal.src, rough.src].map(
        async (url) => {
          const texture = await loader.loadAsync(url);
          if (closed) texture.dispose();
          else textures.push(texture);
          return texture;
        },
      ),
    );
    if (closed) return;
    const room = new RoomEnvironment(),
      pmrem = new THREE.PMREMGenerator(renderer);
    try {
      target = pmrem.fromScene(room, 0.035);
    } finally {
      room.dispose();
      pmrem.dispose();
    }
    const panorama = assets[3];
    panorama.colorSpace = THREE.SRGBColorSpace;
    panorama.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = panorama;
    scene.backgroundBlurriness = 0.018;
    scene.backgroundIntensity = 0.16;
    scene.backgroundRotation.y = 0.9;
    scene.environment = target.texture;
    scene.environmentIntensity = 0.52;
    assets[4].colorSpace = THREE.SRGBColorSpace;
    workshop(scene, small);
    const { equipment, rotors, stack } = createEquipment(small ? 60 : 96, {
      atlas: assets[0],
      web: assets[1],
      symbol: assets[2],
      jacket: assets[4],
      normal: assets[5],
      rough: assets[6],
    });
    scene.add(equipment);
    renderer.shadowMap.enabled = !small;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    equipment.traverse((part) => {
      if (part.isMesh) {
        part.castShadow = !part.material.transparent;
        part.receiveShadow = true;
      }
    });
    const key = new THREE.SpotLight(0xffcd89, 240, 35, 0.85, 0.72, 2);
    key.position.set(-4, 5, 3.8);
    key.castShadow = !small;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.normalBias = 0.012;
    scene.add(key, key.target);
    const fill = new THREE.DirectionalLight(0xb5c9dd, 1.2);
    fill.position.set(3, 1, 3);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffa12e, 5);
    rim.position.set(2, 3, -5);
    scene.add(rim);
    let distance = 10;
    function resize() {
      const w = host.clientWidth,
        h = host.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      distance = Math.max(1, 1.06 / camera.aspect);
    }
    observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    const eye = new THREE.Vector3(),
      focus = new THREE.Vector3(),
      wide = new THREE.Vector3(),
      aim = new THREE.Vector3();
    let shown = false;
    draw = (now) => {
      if (closed || document.hidden) return;
      if (last !== null) elapsed += (now - last) / 1000;
      last = now;
      const t = elapsed;
      const portrait = camera.aspect < 1;
      wide
        .set(portrait ? -2.65 : -5.2, portrait ? 1.3 : 1.75, portrait ? 8.55 : 7.4)
        .multiplyScalar(distance);
      aim.set(portrait ? -0.1 : -0.48, -0.15, -1.8);
      eye.copy(wide);
      focus.copy(aim);
      if (intro) {
        const reveal = smooth((t - 0.45) / 2.65),
          align = smooth((t - 4.9) / 1.25),
          dive = smooth((t - 6.1) / 0.8);
        eye.set(-1.46, 1.17, 1.12).lerp(wide, reveal);
        focus.set(-1.14, 0.85, 0.12).lerp(aim, reveal);
        eye.lerp(new THREE.Vector3(0, 0, 2.25), align);
        eye.z = THREE.MathUtils.lerp(eye.z, -1.6, dive);
        focus.lerp(new THREE.Vector3(0, 0, -3.6), dive);
        stack.position.z = -12 * smooth((t - 4.7) / 1.9);
        key.intensity = 9 + 231 * smooth(t / 1.4);
        key.position.x = -5 + 1 * smooth(t / 2);
      }
      equipment.position.y = 0.025 * Math.sin(t * 0.55) * (intro ? 1 - smooth((t - 4) / 2) : 1);
      for (const rotor of rotors) rotor.rotation.z = (t * Math.PI * 2) / 27;
      camera.position.copy(eye);
      camera.lookAt(focus);
      if (!intro || t < 7.5) renderer.render(scene, camera);
      if (!shown) {
        shown = true;
        onReady();
      }
      if (intro) onTime(t);
      if (!closed && (!intro || t < FORGE_DURATION)) frame = requestAnimationFrame(draw);
    };
    resume();
  }
  start().catch(() => {
    if (!closed) {
      dispose();
      onFailure();
    }
  });
  return dispose;
}
