// Sculpt in the scan's rest coordinates so the coat, eyelids and rig stay aligned.
export function softenFace(mesh) {
  const position = mesh.geometry.attributes.position;
  const g = t => Math.exp(-t*t);
  for (let i=0; i<position.count; i++) {
    const x=position.getX(i), y=position.getY(i), z=position.getZ(i);
    if (y<.84 || z<.18) continue;
    const cheek=Math.abs(x+.055);
    const lip=g((cheek-.105)/.05)*g((y-.99)/.065)*g((z-.75)/.15);
    const brow=g((cheek-.049)/.06)*g((y-1.252)/.034)*g((z-.73)/.10);
    const crest=Math.max(0,(y-1.30)/.21)*g((x+.084)/.18)*g((z-.46)/.24);
    position.setXYZ(i,x,y+.014*lip+.009*brow-.025*crest,z-.006*brow);
  }
  position.needsUpdate=true;
  mesh.geometry.computeBoundingSphere();
}

export function restPose(bones) {
  bones.Head.rotation.set(-.068,.055,-.065);
  bones.BrowL.position.y+=.006;
  bones.BrowR.position.y+=.006;
  bones.ShoulderL.rotation.z=-.027;
  bones.ShoulderR.rotation.z=.027;
}
