import * as THREE from 'three';
import { softenFace, restPose } from './coach-expression.mjs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import gym from '../../public/forge/gym.webp';
import coat from './coat.jpg';
import roughness from './roughness.jpg';
import symbol from '../../public/brand/atlasfit-symbol.jpeg';

export function mountMascot(host, onVisible, onLost) {
  const mobile = host.clientWidth < 700;
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.25 : 1.65));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.04, 25);
  const canvas = renderer.domElement;
  let disposed = false,
    frame = 0,
    visible = true,
    elapsed = 0,
    previous,
    animate;
  const cleanups = [];
  function listen(target, event, callback) {
    target.addEventListener(event, callback);
    cleanups.push(() => target.removeEventListener(event, callback));
  }
  function schedule() {
    cancelAnimationFrame(frame);
    previous = undefined;
    if (!disposed && animate && visible && !document.hidden) frame = requestAnimationFrame(animate);
  }
  function resize() {
    const w = host.clientWidth,
      h = host.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    const distance = Math.max(2.35, 1.62 / camera.aspect);
    camera.position.set(-0.08 - distance * 0.16, 1.18, 0.31 + distance * 0.987);
    camera.lookAt(-0.08, 0.94, 0.31);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  const size = new ResizeObserver(resize);
  size.observe(host);
  resize();
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    schedule();
  });
  observer.observe(host);
  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    size.disconnect();
    observer.disconnect();
    cleanups.splice(0).forEach((fn) => fn());
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  }
  function fail() {
    if (!disposed) {
      dispose();
      onLost();
    }
  }
  listen(canvas, 'webglcontextlost', (e) => {
    e.preventDefault();
    fail();
  });
  listen(document, 'visibilitychange', schedule);
  function track(resource) {
    if (disposed) resource.dispose();
    else cleanups.push(() => resource.dispose());
    return resource;
  }
  async function load() {
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) =>
      url.endsWith('/coat.jpg') ? coat.src : url.endsWith('/roughness.jpg') ? roughness.src : url,
    );
    const [gltf, environment, badge] = await Promise.all([
      new GLTFLoader(manager)
        .loadAsync(new URL('./silverback.glb', import.meta.url).href)
        .then((asset) => {
          const resources = new Set();
          asset.scene.traverse((object) => {
            if (object.geometry) resources.add(object.geometry);
            if (object.skeleton) resources.add(object.skeleton);
            for (const mat of [].concat(object.material || [])) {
              resources.add(mat);
              Object.values(mat)
                .filter((v) => v?.isTexture)
                .forEach((t) => resources.add(t));
            }
          });
          resources.forEach(track);
          return asset;
        }),
      new THREE.TextureLoader().loadAsync(gym.src).then(track),
      new THREE.TextureLoader().loadAsync(symbol.src).then(track),
    ]);
    if (disposed) return;
    environment.colorSpace = THREE.SRGBColorSpace;
    environment.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = environment;
    scene.environmentIntensity = 0.56;
    scene.backgroundRotation.y = scene.environmentRotation.y = 1.6;
    scene.add(gltf.scene, new THREE.HemisphereLight(0xffebcf, 0x64544a, 1.75));
    function light(color, intensity, x, y, z) {
      const lamp = new THREE.DirectionalLight(color, intensity);
      lamp.position.set(x, y, z);
      scene.add(lamp);
    }
    light(0xfff3e4, 2.2, -1.7, 2.4, 1.8);
    light(0xffc78d, 2.9, 1.6, 2, -1);
    light(0xd8e2ef, 1.25, 0.8, 0.7, 1.7);
    badge.colorSpace = THREE.SRGBColorSpace;
    const bones = {};
    gltf.scene.traverse((o) => {
      if (o.isBone) bones[o.name] = o;
      if (o.isSkinnedMesh) {
        softenFace(o);
        if (o.material.name === 'Material_0' && !o.material.map)
          throw new Error('Coat texture unavailable');
        if (o.material.name === 'Material_0') {
          o.material.onBeforeCompile = (shader) => {
            shader.uniforms.atlasSymbol = { value: badge };
            shader.vertexShader =
              'varying vec3 restPosition;\n' +
              shader.vertexShader.replace(
                '#include <begin_vertex>',
                '#include <begin_vertex>\nrestPosition=position;',
              );
            shader.fragmentShader =
              'varying vec3 restPosition;uniform sampler2D atlasSymbol;\n' +
              shader.fragmentShader.replace(
                '#include <map_fragment>',
                `
              #include <map_fragment>
              vec3 p=restPosition;
              float side=abs(p.x+.10);
              float neck=1.08+.18*clamp(side/.25,0.,1.)-.17*clamp((p.z-.14)/.25,0.,1.);
              float arm=.16+.15*clamp((.79-p.y)/.24,0.,1.)+.13*clamp((.23-p.z)/.28,0.,1.);
              float seam=min(min(neck-p.y,arm-side),min(min(p.y-.46,p.z+.42),.47-p.z));
              if(seam>0.){
                float weave=.95+.035*sin(p.x*2700.)*sin(p.y*2000.);
                diffuseColor.rgb=mix(vec3(.29,.16,.038),vec3(.009,.010,.012),smoothstep(.006,.01,seam))*weave;
                vec2 uv=(p.xy-vec2(-.195,.785))/vec2(.19,.105);
                if(p.z>.22 && all(greaterThan(uv,vec2(0.))) && all(lessThan(uv,vec2(1.)))){
                  vec3 printColor=texture2D(atlasSymbol,vec2(.12,.22)+uv*vec2(.76,.56)).rgb;
                  diffuseColor.rgb=mix(diffuseColor.rgb,printColor,smoothstep(.008,.035,max(max(printColor.r,printColor.g),printColor.b)));
                }
              }else if(p.z>.31 && abs(p.y - (1.326 + .045*(p.z-.55))) < .026){
                float h = p.y - (1.326 + .045*(p.z-.55));
                float stitch = smoothstep(.001,.003,abs(h+.018));
                diffuseColor.rgb=mix(vec3(.46,.255,.065),vec3(.028,.024,.021),stitch)
                  * (.96+.04*sin(p.x*1400.)*sin(p.y*1800.));
              }else{
                diffuseColor.rgb=mix(vec3(dot(diffuseColor.rgb,vec3(.2126,.7152,.0722))),diffuseColor.rgb,.70)*.95;
              }
            `,
              );
          };
        }
        o.frustumCulled = false;
        if (o.material.map) {
          o.material.bumpMap = o.material.map;
          o.material.map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        }
        o.material.bumpScale = 0.00085;
        o.material.metalness = 0;
        o.material.roughness = 0.92;
        o.material.needsUpdate = true;
      }
    });
    restPose(bones);
    const eyes = [];
    for (const [x, z] of [
      [-0.105, 0.755],
      [-0.005, 0.741],
    ]) {
      const eye = new THREE.Group();
      eye.position.set(x + 0.1, 1.216 - 1.05, z - 0.42);
      bones.Head.add(eye);
      function lens(radius, color, depth, scale) {
        const m = new THREE.Mesh(
          track(new THREE.SphereGeometry(radius, 20, 12)),
          track(new THREE.MeshPhysicalMaterial({ color, roughness: 0.22, clearcoat: 0.78 })),
        );
        m.scale.set(...scale);
        m.position.z = depth;
        eye.add(m);
      }
      lens(0.0125, 0x504037, 0, [1.14, 0.66, 0.68]);
      lens(0.007, 0x825736, 0.007, [1, 0.9, 0.37]);
      lens(0.0042, 0x130e0c, 0.009, [1, 1, 0.48]);
      lens(0.0014, 0xfff2de, 0.011, [1, 0.75, 0.38]);
      eye.children.at(-1).position.x = -.002;
      eye.children.at(-1).position.y = .002;
      eyes.push(eye);
    }
    const pointer = new THREE.Vector2();
    const canFollow = matchMedia('(pointer:fine)').matches;
    if (canFollow)
      listen(window, 'pointermove', (e) =>
        pointer.set((2 * e.clientX) / innerWidth - 1, 1 - (2 * e.clientY) / innerHeight),
      );
    let blinkAt = 2.8,
      first = true;
    const baseY = bones.Chest.position.y,
      lidY = bones.LidL.position.y;
    animate = (now) => {
      if (disposed) return;
      if (mobile && previous !== undefined && now - previous < 32) {
        frame = requestAnimationFrame(animate);
        return;
      }
      const dt = previous === undefined ? 0 : Math.min(0.1, (now - previous) / 1000);
      previous = now;
      elapsed += dt;
      const t = elapsed,
        breathe = Math.sin(t * 1.27 + 0.11 * Math.sin(t * 0.41)),
        soften = 1 - Math.exp(-dt * 2.5);
      const focus = document.activeElement?.name;
      const gazeX = focus === 'password' ? 0 : focus === 'username' ? 0.75 : pointer.x;
      const gazeY = focus === 'password' ? 0 : pointer.y;
      bones.Chest.scale.set(1 + 0.007 * breathe, 1 + 0.009 * breathe, 1 + 0.013 * breathe);
      bones.Chest.position.y = baseY + 0.002 * breathe;
      bones.Head.rotation.y +=
        (0.055 + 0.065 * gazeX + 0.024 * Math.sin(t * 0.32) - bones.Head.rotation.y) * soften;
      bones.Head.rotation.x +=
        (-0.068 - 0.034 * gazeY + 0.013 * Math.sin(t * 0.43) - bones.Head.rotation.x) * soften;
      bones.Head.rotation.z = -.065 + .012 * Math.sin(t * .55);
      bones.Jaw.rotation.x = .002 * (1 + breathe);
      bones.ShoulderL.rotation.z = -.027 + 0.011 * breathe;
      bones.ShoulderR.rotation.z = .027 - 0.011 * breathe;
      bones.ForearmR.rotation.x = 0.008 * Math.sin(t * 0.64);
      bones.ForearmL.rotation.x = 0.006 * Math.sin(t * 0.51);
      if (t > blinkAt + 0.22) blinkAt = t + 3 + Math.random() * 3.2;
      const blink = Math.sin(Math.PI * THREE.MathUtils.clamp((t - blinkAt) / 0.22, 0, 1));
      bones.LidL.position.y = bones.LidR.position.y = lidY - 0.009 * blink;
      bones.BrowL.rotation.z = 0.018 * Math.sin(t * 0.56);
      bones.BrowR.rotation.z = -0.014 * Math.sin(t * 0.47);
      for (const eye of eyes) {
        eye.rotation.y += (0.22 * gazeX - eye.rotation.y) * soften;
        eye.scale.y = 1 - 0.94 * blink;
      }
      renderer.render(scene, camera);
      if (first) {
        first = false;
        onVisible();
      }
      frame = requestAnimationFrame(animate);
    };
    schedule();
  }
  load().catch(fail);
  return dispose;
}
