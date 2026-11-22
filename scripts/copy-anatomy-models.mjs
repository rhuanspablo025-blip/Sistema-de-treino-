import { copyFile, mkdir, stat } from "node:fs/promises";
import { resolve, join } from "node:path";

const origin = resolve("node_modules/open-anatomy-3d/models");
const target = resolve("public/models/open-anatomy-3d");
await mkdir(target, { recursive: true });
for (const file of ["anatomy-male.glb", "anatomy-female.glb"]) {
  const source = join(origin, file);
  const size = (await stat(source)).size;
  if (size < 500_000) throw new Error("Invalid anatomy model: " + file);
  await copyFile(source, join(target, file));
  console.log("[AtlasFit 3D] Local model ready:", file, size, "bytes");
}
