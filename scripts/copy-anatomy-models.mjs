// Ship just the exterior mesh used by the athlete viewer.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

const target = "public/models/open-anatomy-3d";
await mkdir(target, { recursive: true });
for (const file of ["anatomy-male.glb", "anatomy-female.glb"]) {
  const bytes = await readFile(join("node_modules/open-anatomy-3d/models", file));
  const { scene } = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    .parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
  let skin;
  scene.getObjectByName("skin")?.traverse(node => { if (node.isMesh) skin = node; });
  if (!skin) throw Error("Superfície corporal ausente: " + file);
  scene.updateMatrixWorld(true);
  const geo = skin.geometry;
  const pos = geo.attributes.position;
  const point = new Vector3();
  const positions = new Float32Array(pos.count * 3);
  const normals = new Float32Array(pos.count * 3);
  const min = [Infinity, Infinity, Infinity], max = min.map(() => -Infinity);
  for (let i = 0; i < pos.count; i++) {
    point.fromBufferAttribute(pos, i).applyMatrix4(skin.matrixWorld).toArray(positions, 3*i);
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], positions[3*i+k]);
      max[k] = Math.max(max[k], positions[3*i+k]);
    }
    point.fromBufferAttribute(geo.attributes.normal, i).transformDirection(skin.matrixWorld).toArray(normals, 3*i);
  }
  const indices = Uint32Array.from(geo.index.array.subarray(0, geo.index.count));
  const bin = Buffer.concat([positions, normals, indices].map(a => Buffer.from(a.buffer)));
  const views = [positions, normals, indices].map((a, i) => ({ buffer: 0, byteOffset: i * positions.byteLength, byteLength: a.byteLength }));
  const meta = { asset: { version: "2.0", copyright: "Open Anatomy 3D / BodyParts3D / MakeHuman. CC BY 4.0" }, scene: 0, scenes: [{nodes:[0]}],
    nodes: [{ mesh: 0, name: "Athlete" }], meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2 }] }],
    buffers: [{ byteLength: bin.length }], bufferViews: views, accessors: [
      { bufferView: 0, componentType: 5126, count: pos.count, type: "VEC3", min, max },
      { bufferView: 1, componentType: 5126, count: pos.count, type: "VEC3" },
      { bufferView: 2, componentType: 5125, count: indices.length, type: "SCALAR" }] };
  const json = Buffer.from(JSON.stringify(meta));
  const padded = Buffer.alloc(Math.ceil(json.length/4)*4, 32);
  json.copy(padded);
  const header = Buffer.alloc(20), chunk = Buffer.alloc(8);
  header.write("glTF"); header.writeUInt32LE(2,4); header.writeUInt32LE(28+padded.length+bin.length,8);
  header.writeUInt32LE(padded.length,12); header.write("JSON",16);
  chunk.writeUInt32LE(bin.length); chunk.write("BIN\0",4);
  await writeFile(join(target, file), Buffer.concat([header,padded,chunk,bin]));
  console.log("AtlasFit athlete:", file, pos.count, "vertices");
}
