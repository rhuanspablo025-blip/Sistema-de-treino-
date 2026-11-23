"use client";

import { dressAthlete } from "../lib/athlete-surface.mjs";
import { shapeRatios } from "../lib/body-shape.mjs";
import { useEffect, useRef, useState } from "react";

/**
 * Atlas 3D (Open Anatomy 3D) — visualização progressiva.
 * Assets CC BY 4.0. Crédito obrigatório no rodapé do mapa.
 * Three.js é carregado somente quando o usuário seleciona o modo 3D.
 */
const MODEL_BASE = "/models/open-anatomy-3d/";
const COLORS = ["#85858b", "#ff829c", "#399dff", "#26ce95", "#ffdc45", "#ff4055"];

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

export default function Anatomy3D({ measurements, groups = [], restrictions = [], metric = "sets", selected, onSelect, filter = null, isolated, restrictedOnly, }) {
  const canvas = useRef(null);
  const controller = useRef(null);
  const [rotating, setRotating] = useState(false);
  const [sex, setSex] = useState("male");
  const [status, setStatus] = useState("Preparando o atleta…");
  const [problem, setProblem] = useState(false);

  useEffect(() => {
    let disposed = false;
    let renderer, scene, camera, controls, model, animation, resizeObserver;
    const materials = [];
    const scenery = [];
    let print;
    const root = canvas.current;
    setProblem(false);
    setStatus("Carregando o atleta 3D…");
    if (!root) return undefined;

    async function boot() {
      try {
        const [THREE, { GLTFLoader }, { OrbitControls }] = await Promise.all([
          import("three"),
          import("three/examples/jsm/loaders/GLTFLoader.js"),
          import("three/examples/jsm/controls/OrbitControls.js"),
        ]);
        if (disposed) return;
        scene = new THREE.Scene();

        camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
        camera.position.set(0, 1, 4.5);
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.15;
        renderer.domElement.setAttribute("aria-label", "Atleta com uniforme de treino. Arraste para girar.");
        root.appendChild(renderer.domElement);
        scene.add(new THREE.HemisphereLight("#fff2de", "#625e60", 1.65));
        const key = new THREE.DirectionalLight("#fff1da", 2.65);
        key.position.set(3, 6, 5);
        scene.add(key);
        const rim = new THREE.DirectionalLight("#ffca75", 3);
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
        const asset = MODEL_BASE + (sex === "male" ? "anatomy-male.glb" : "anatomy-female.glb") + "?kit=training-v1";
        // Validate the actual binary response: auth redirects may otherwise return HTTP 200 HTML.
        const response = await fetch(asset, { cache: "force-cache", redirect: "error" });
        if (!response.ok) throw new Error("Arquivo GLB indisponível (HTTP " + response.status + ")");
        const bytes = await response.arrayBuffer();
        const signature = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength));
        if (signature.length !== 4 || String.fromCharCode(...signature) !== "glTF") {
          throw new Error("Resposta inválida para " + asset + ": esperado GLB, não HTML/JSON.");
        }
        const gltf = await loader.parseAsync(bytes, asset);
        if (disposed) return;
        model = gltf.scene;
        scene.add(model);
        const athlete = model.getObjectByName("Athlete");
        if (!athlete?.isMesh) throw Error("Superfície do atleta indisponível.");
        const surface = dressAthlete(THREE, athlete, sex);
        // Project the jersey print in rest coordinates so it stretches with the fabric.
        const jersey = document.createElement("canvas");
        jersey.width = 512; jersey.height = 128;
        const ink = jersey.getContext("2d");
        ink.fillStyle = "#f8e9c6";
        ink.textAlign = "center";
        ink.font = "italic 900 90px system-ui, sans-serif";
        ink.fillText("ATLAS FIT", 256, 96, 490);
        print = new THREE.CanvasTexture(jersey);
        print.colorSpace = THREE.SRGBColorSpace;
        const bodyHeight = athlete.geometry.boundingBox.max.y;
        athlete.material.onBeforeCompile = shader => {
          shader.uniforms.jerseyPrint = { value: print };
          shader.uniforms.bodyHeight = { value: bodyHeight };
          shader.vertexShader = "varying vec3 kitPoint; uniform float bodyHeight;\n" +
            shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nkitPoint = position/bodyHeight;");
          shader.fragmentShader = "varying vec3 kitPoint; uniform sampler2D jerseyPrint;\n" +
            shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
              vec2 stamp = (kitPoint.xy - vec2(-0.058,0.737))/vec2(0.116,0.029);
              if (kitPoint.z > 0.018 && all(greaterThanEqual(stamp,vec2(0.0))) && all(lessThanEqual(stamp,vec2(1.0)))) {
                vec4 ink = texture2D(jerseyPrint,stamp);
                diffuseColor.rgb = mix(diffuseColor.rgb,ink.rgb,ink.a*0.94);
              }`);
        };
        materials.push(athlete.material);
        surface.paint(new Map());
        const deck = new THREE.Mesh(new THREE.CylinderGeometry(.47,.49,.045,72),
          new THREE.MeshStandardMaterial({ color:"#24272b",roughness:.84,metalness:.18 }));
        deck.position.y=-.029;
        const edge = new THREE.Mesh(new THREE.TorusGeometry(.45,.003,8,96),
          new THREE.MeshStandardMaterial({ color:"#c99239",roughness:.5 }));
        edge.rotation.x=-Math.PI/2;
        edge.position.y=-.005;
        scene.add(deck,edge);
        scenery.push(deck,edge);
        let ratios = shapeRatios({}, sex);
        let settling = false;
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
        controls.autoRotateSpeed = 0.65;
        const box = athlete.geometry.boundingBox.clone();
        if (box.isEmpty()) throw new Error("Modelo anatômico sem geometria visível");
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        controls.target.copy(center);
        camera.position.set(center.x + .51, center.y + .11, center.z + size.y * 1.92);
        const home = camera.position.clone();
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
          const hit = raycaster.intersectObject(athlete,false)[0];
          const category = hit && surface.categoryAt(hit);
          if (category) controller.current?.select?.(category);
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
        let lastFrame = performance.now();
        const animate = () => {
          if (disposed) return;
          const now = performance.now();
          const dt = Math.min(.1, (now - lastFrame) / 1000);
          lastFrame = now;
          if (settling) {
            const mix = reducedMotion.matches ? 1 : 1 - Math.exp(-10 * dt);
            let maxDelta = 0;
            const approach = (value, target) => {
              const delta = target - value;
              maxDelta = Math.max(maxDelta, Math.abs(delta));
              return Math.abs(delta) < .00001 ? target : value + delta * mix;
            };
            model.scale.y = approach(model.scale.y, ratios.height);
            surface.shape(ratios, approach);
            settling = maxDelta > .00001;
          }
          controls.update(dt);
          renderer.render(scene, camera);
          animation = requestAnimationFrame(animate);
        };
        animate();
        controller.current = {
          shape(values) { ratios = shapeRatios(values, sex); settling = true; },
          rotate(active) { controls.autoRotate = active; },
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
            const styles = new Map();
            for (const category of ["Peito","Costas","Ombros","Braços","Abdômen","Glúteos","Quadríceps","Posterior de coxa","Panturrilhas"]) {
              const score = perCategory.get(category) || 0;
              const restricted = data.restrictions.some(r => r?.active !== false && groupCategory(r.muscle) === category);
              const ratio = highest ? score / highest : 0;
              const tier = restricted ? 5 : !score ? 0 : ratio <= .25 ? 1 : ratio <= .5 ? 2 : ratio <= .75 ? 3 : 4;
              const fade = Boolean((data.filter !== null && tier !== data.filter) || (data.restrictedOnly && !restricted) || (data.isolated && data.selected && category !== data.selected));
              styles.set(category, { tier, color: new THREE.Color(COLORS[tier]), fade, selected: data.selected === category });
            }
            surface.paint(styles);
          },
          zoomIn() { camera.position.sub(controls.target).multiplyScalar(.8).add(controls.target); },
          zoomOut() { camera.position.sub(controls.target).multiplyScalar(1.25).add(controls.target); },
          reset() { camera.position.copy(home); controls.target.copy(center); controls.update(); },
        };
        setStatus("");
        setProblem(false);
      } catch (error) {
        if (!disposed) { setProblem(true); setStatus(`Falha no modelo 3D: ${error?.message || "erro desconhecido"}. O mapa 2D continua disponível.`); }
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
      print?.dispose();
      scenery.forEach(obj => { obj.geometry.dispose(); obj.material.dispose(); });
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

  useEffect(() => { controller.current?.shape(measurements); }, [measurements, status]);
  useEffect(() => { controller.current?.rotate(rotating); }, [rotating, status]);

  return <div className="atlas-anatomy3d">
    <div className="atlas-anatomy3d__controls">
      <div className="muscle-anatomy__segmented" aria-label="Modelo corporal">
        <button type="button" aria-pressed={sex === "male"} onClick={() => setSex("male")}>Masculino</button>
        <button type="button" aria-pressed={sex === "female"} onClick={() => setSex("female")}>Feminino</button>
      </div>
      <button type="button" className="muscle-anatomy__tool" aria-pressed={rotating} onClick={() => setRotating(value => !value)}>{rotating ? "Pausar rotação" : "Girar modelo"}</button>
      <button type="button" className="muscle-anatomy__tool" onClick={() => controller.current?.zoomIn()}>Aproximar</button>
      <button type="button" className="muscle-anatomy__tool" onClick={() => controller.current?.zoomOut()}>Afastar</button>
      <button type="button" className="muscle-anatomy__tool" onClick={() => controller.current?.reset()}>Centralizar</button>
    </div>
    <div ref={canvas} className="atlas-anatomy3d__canvas" aria-label="Atleta 3D" />
    {status && <p role={problem ? "alert" : "status"} className="atlas-anatomy3d__status">{status}</p>}
    <p className="atlas-anatomy3d__help">Arraste para girar. Toque em uma região para ver o treino.</p>
    <p className="atlas-anatomy3d__help">Silhueta estimada pelas medidas cadastradas.</p>
    <details className="atlas-anatomy3d__credit"><summary>Créditos do modelo</summary>Open Anatomy 3D — modelos adaptados de BodyParts3D (DBCLS), Human Reference Atlas (HuBMAP) e MakeHuman. Licença CC BY 4.0. Adaptação visual AtlasFit.</details>
  </div>;
}
