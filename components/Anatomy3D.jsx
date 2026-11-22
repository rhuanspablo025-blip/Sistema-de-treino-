"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Atlas 3D (Open Anatomy 3D) — visualização progressiva.
 * Assets CC BY 4.0. Crédito obrigatório no rodapé do mapa.
 * Three.js é carregado somente quando o usuário seleciona o modo 3D.
 */
const MODEL_BASE = "/models/open-anatomy-3d/";
const COLORS = ["#85858b", "#ff829c", "#399dff", "#26ce95", "#ffdc45", "#ff4055"];

const MUSCLE_MATCH = [
  ["Glúteos", /glute|piriform/i],
  ["Costas", /back_muscles|trapez|rhomboid|erector|latiss|rotator_cuff/i],
  ["Peito", /pector|chest|intercostal/i],
  ["Ombros", /deltoid|shoulder_muscles/i],
  ["Quadríceps", /quadricep|adductor|iliopsoas/i],
  ["Posterior de coxa", /hamstring/i],
  ["Braços", /upper_arm|forearm|hand_muscles/i],
  ["Abdômen", /abdomin|pelvic_floor/i],
  ["Panturrilhas", /calf|shin_muscles/i],
];

function muscleCategory(name) {
  return MUSCLE_MATCH.find(([, pattern]) => pattern.test(name))?.[0] ?? null;
}
function groupCategory(name) {
  const value = String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/glut/.test(value)) return "Glúteos";
  if (/costas|dorsal|latissim|romboid|trapez|lombar/.test(value)) return "Costas";
  if (/peito|peitoral|chest/.test(value)) return "Peito";
  if (/ombro|deltoid/.test(value)) return "Ombros";
  if (/posterior|isquiotib|hamstring|femoral/.test(value)) return "Posterior de coxa";
  if (/quadricep|coxa|perna|adutor|vasto/.test(value)) return "Quadríceps";
  if (/bicep|tricep|braco|antebraco|braquial/.test(value)) return "Braços";
  if (/abdom|core|obliqu|serrato/.test(value)) return "Abdômen";
  if (/panturr|gemeo|soleo|gastrocn|calf/.test(value)) return "Panturrilhas";
  return null;
}

export default function Anatomy3D({ groups = [], restrictions = [], metric = "sets", selected, onSelect, filter, isolated, restrictedOnly, zoom = false }) {
  const canvas = useRef(null);
  const controller = useRef(null);
  const [sex, setSex] = useState("male");
  const [status, setStatus] = useState("Carregando anatomia 3D…");
  const [problem, setProblem] = useState(false);

  useEffect(() => {
    let disposed = false;
    let renderer, scene, camera, controls, model, animation, resizeObserver;
    const materials = [];
    const originals = new Map();
    const meshes = [];
    const root = canvas.current;
    setProblem(false);
    setStatus("Carregando modelo muscular 3D…");
    if (!root) return undefined;

    async function boot() {
      try {
        const [THREE, { GLTFLoader }, { OrbitControls }, { MeshoptDecoder }] = await Promise.all([
          import("three"),
          import("three/examples/jsm/loaders/GLTFLoader.js"),
          import("three/examples/jsm/controls/OrbitControls.js"),
          import("three/examples/jsm/libs/meshopt_decoder.module.js"),
        ]);
        if (disposed) return;
        scene = new THREE.Scene();
        scene.background = new THREE.Color("#121418");
        camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
        camera.position.set(0, 1, 4.5);
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.7;
        renderer.domElement.setAttribute("aria-label", "Modelo muscular humano tridimensional. Arraste para girar.");
        root.appendChild(renderer.domElement);
        scene.add(new THREE.HemisphereLight("#ffffff", "#48546b", 3));
        const key = new THREE.DirectionalLight("#fff2d7", 3.4);
        key.position.set(3, 6, 5);
        scene.add(key);
        const rim = new THREE.DirectionalLight("#7ea2ff", 2);
        rim.position.set(-4, 3, -5);
        scene.add(rim);
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.075;
        controls.enablePan = false;
        controls.minDistance = 0.65;
        controls.maxDistance = 6;
        controls.target.set(0, 0.9, 0);
        const loader = new GLTFLoader();
        loader.setMeshoptDecoder(MeshoptDecoder);
        const asset = MODEL_BASE + (sex === "male" ? "anatomy-male.glb" : "anatomy-female.glb");
        const response = await fetch(asset, { method: "HEAD", cache: "no-cache" });
        if (!response.ok) throw new Error("Asset 3D não disponível: " + response.status + " " + asset);
        const gltf = await loader.loadAsync(asset);
        if (disposed) return;
        model = gltf.scene;
        scene.add(model);
        model.traverse((object) => {
          // A camada muscular fica visível; pele, órgãos, vasos e ossos não obstruem a seleção.
          if (object.parent === model && /^(skin|skeleton|organs|vessels|nerves)$/i.test(object.name)) object.visible = false;
          if (object.isMesh) {
            // GLB primitives are often unnamed: resolve the nearest named muscle ancestor.
            let owner = object;
            while (owner && owner !== model && !muscleCategory(owner.name)) owner = owner.parent;
            object.userData.anatomyCategory = owner ? muscleCategory(owner.name) : null;
            // Omit invisible non-muscle layers when picking; preserve native geometry and groups.
            object.userData.isMuscle = Boolean(object.userData.anatomyCategory);
            if (object.userData.isMuscle) meshes.push(object);
            const source = object.material;
            const material = Array.isArray(source) ? source.map((m) => m.clone()) : source.clone();
            object.material = material;
            (Array.isArray(material) ? material : [material]).forEach(m => materials.push(m));
            originals.set(object, (Array.isArray(material) ? material : [material]).map(m => m.color?.clone()));
          }
        });
        const box = new THREE.Box3().setFromObject(model);
        if (box.isEmpty()) throw new Error("Modelo anatômico sem geometria visível");
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        controls.target.copy(center);
        camera.position.set(center.x, center.y + size.y * 0.04, center.z + Math.max(2.5, size.y * 1.65));
        camera.near = 0.01;
        camera.far = 100;
        camera.updateProjectionMatrix();
        controls.update();
        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();
        let down = null;
        const onDown = (e) => { down = { x: e.clientX, y: e.clientY }; };
        const onUp = (event) => {
          if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) return;
          const bounds = renderer.domElement.getBoundingClientRect();
          pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
          raycaster.setFromCamera(pointer, camera);
          const hit = raycaster.intersectObjects(meshes.filter(m => m.visible && m.parent?.visible), false)
            .find(i => i.object.userData.anatomyCategory);
          if (hit) controller.current?.select?.(hit.object.userData.anatomyCategory, hit.object.name);
        };
        renderer.domElement.addEventListener("pointerdown", onDown);
        renderer.domElement.addEventListener("pointerup", onUp);
        const resize = () => {
          const width = Math.max(1, root.clientWidth);
          const height = Math.max(1, root.clientHeight);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height, false);
        };
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(root);
        resize();
        const animate = () => {
          if (disposed) return;
          controls.update();
          renderer.render(scene, camera);
          animation = requestAnimationFrame(animate);
        };
        animate();
        controller.current = {
          select: onSelect,
          apply(data) {
            const perCategory = new Map();
            for (const group of data.groups) {
              const category = groupCategory(group.muscle);
              if (!category) continue;
              const score = data.metric === "sets" ? Number(group.primarySets || 0) + Number(group.secondarySets || 0) * .5 : Number(group.attributedVolume || 0);
              perCategory.set(category, Math.max(score, perCategory.get(category) || 0));
            }
            const highest = Math.max(0, ...perCategory.values());
            for (const mesh of meshes) {
              const category = mesh.userData.anatomyCategory;
              const score = perCategory.get(category) || 0;
              const restricted = data.restrictions.some(r => r?.active !== false && groupCategory(r.muscle) === category);
              const ratio = highest ? score / highest : 0;
              const tier = restricted ? 5 : !score ? 0 : ratio <= .25 ? 1 : ratio <= .5 ? 2 : ratio <= .75 ? 3 : 4;
              const fade = Boolean((data.filter !== null && tier !== data.filter) || (data.restrictedOnly && !restricted) || (data.isolated && data.selected && category !== data.selected));
              const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
              mats.forEach((mat, index) => {
                if (mat.color) {
                  const original = originals.get(mesh)?.[index];
                  if (original) mat.color.copy(original);
                  if (category && tier > 0) mat.color.set(COLORS[tier]);
                  if (category && data.selected === category) mat.color.set("#ffe59a");
                  if (fade) mat.color.multiplyScalar(.2);
                }
              });
            }
          },
          zoomIn() { camera.position.sub(controls.target).multiplyScalar(.8).add(controls.target); },
          zoomOut() { camera.position.sub(controls.target).multiplyScalar(1.25).add(controls.target); },
          reset() { camera.position.set(center.x, center.y + size.y * .04, center.z + Math.max(2.5, size.y * 1.65)); controls.target.copy(center); controls.update(); },
        };
        setStatus("");
        setProblem(false);
      } catch (error) {
        if (!disposed) { setProblem(true); setStatus("Não foi possível carregar o modelo 3D. Utilize a visualização 2D."); }
        console.error("Atlas Fit: erro ao carregar Open Anatomy 3D", error);
      }
    }
    boot();
    return () => {
      disposed = true;
      cancelAnimationFrame(animation);
      resizeObserver?.disconnect();
      controls?.dispose();
      if (model) model.traverse((obj) => { if (obj.isMesh) obj.geometry?.dispose(); });
      materials.forEach(m => m.dispose());
      renderer?.dispose();
      renderer?.domElement?.remove();
      controller.current = null;
    };
  }, [sex]);

  useEffect(() => {
    if (controller.current) {
      controller.current.select = onSelect;
      controller.current.apply({ groups, restrictions, metric, selected, filter, isolated, restrictedOnly });
    }
  }, [groups, restrictions, metric, selected, filter, isolated, restrictedOnly, status, onSelect]);

  return <div className="atlas-anatomy3d">
    <div className="atlas-anatomy3d__controls">
      <div className="muscle-anatomy__segmented" aria-label="Modelo corporal">
        <button type="button" aria-pressed={sex === "male"} onClick={() => setSex("male")}>Masculino</button>
        <button type="button" aria-pressed={sex === "female"} onClick={() => setSex("female")}>Feminino</button>
      </div>
      <button type="button" className="muscle-anatomy__tool" onClick={() => controller.current?.zoomIn()}>Aproximar</button>
      <button type="button" className="muscle-anatomy__tool" onClick={() => controller.current?.zoomOut()}>Afastar</button>
      <button type="button" className="muscle-anatomy__tool" onClick={() => controller.current?.reset()}>Centralizar</button>
    </div>
    <div ref={canvas} className="atlas-anatomy3d__canvas" aria-label="Visualizador anatômico 3D" />
    {status && <p role={problem ? "alert" : "status"} className="atlas-anatomy3d__status">{status}</p>}
    <p className="atlas-anatomy3d__help">Arraste para girar · Use os controles para aproximar · Clique em um músculo para selecionar o grupo.</p>
    <small className="atlas-anatomy3d__credit">Open Anatomy 3D — modelos adaptados de BodyParts3D (DBCLS), Human Reference Atlas (HuBMAP) e MakeHuman. Licença CC BY 4.0. Uso educacional, não diagnóstico.</small>
  </div>;
}
