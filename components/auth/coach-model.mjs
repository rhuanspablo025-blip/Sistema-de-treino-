import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Rounded toy-like forms, grouped around the pivots used by the login animation.
export function createCoach() {
  const root = new THREE.Group();
  const group = (parent, x=0, y=0, z=0) => {
    const g = new THREE.Group();
    g.position.set(x,y,z);
    parent.add(g);
    return g;
  };
  const material = (color,roughness=.78) => new THREE.MeshStandardMaterial({color,roughness});
  const coat = material('#504342'), tuft = material('#594946'), face = material('#bf957a'),
    muzzle = material('#d3af91'), blush = material('#bb8772'), nose = material('#52403b'),
    ink = material('#322725'), jersey = material('#242933'), band = material('#e2a63a'),
    piping = material('#ffe0a0'), white = material('#fff2dc',.36), iris = material('#986538',.25),
    pupil = material('#281e1d',.18);
  const shine = new THREE.MeshBasicMaterial({color:'#fff8eb'});
  const sphere = new THREE.SphereGeometry(1,32,24);
  function oval(g,mat,x,y,z,w,h,d,tilt=0) {
    const o = new THREE.Mesh(sphere,mat);
    o.position.set(x,y,z); o.scale.set(w,h,d); o.rotation.z=tilt; g.add(o); return o;
  }
  function line(g,mat,coords,r) {
    const path = new THREE.CatmullRomCurve3(coords.map(p=>new THREE.Vector3(...p)));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(path,24,r,10,false),mat));
    for(const point of [coords[0],coords.at(-1)]) oval(g,mat,...point,r,r,r);
  }
  const chest=group(root,0,1.07,0);
  oval(chest,jersey,0,-.05,0,.59,.67,.41);
  oval(chest,jersey,0,.18,-.03,.66,.46,.41);
  oval(chest,coat,0,.57,0,.29,.22,.27);
  line(chest,band,[[-.36,.43,.27],[-.22,.33,.35],[0,.3,.39],[.22,.33,.35],[.36,.43,.27]],.025);
  // The A and barbell are raised enamel on the front of the jersey.
  line(chest,band,[[-.12,-.04,.421],[0,.14,.425],[.12,-.04,.421]],.028);
  line(chest,piping,[[-.18,.006,.428],[0,.006,.445],[.18,.006,.428]],.013);
  for(const sign of [-1,1]) {
    for(let i=0;i<2;i++) oval(chest,band,sign*(.16+.038*i),.006,.426,.015,.062-.014*i,.019);
    oval(root,jersey,sign*.28,.51,-.02,.31,.31,.32);
    oval(root,coat,sign*.31,.27,0,.205,.225,.20);
    oval(root,jersey,sign*.31,.139,.092,.244,.145,.326);
    oval(root,band,sign*.31,.066,.11,.245,.05,.315);
  }
  const head=group(chest,0,.98,.035);
  oval(head,coat,0,.09,-.015,.585,.576,.474);
  for(const s of [-1,1]) {
    oval(head,coat,s*.535,.115,-.015,.155,.181,.115,-s*.15);
    oval(head,blush,s*.57,.12,.075,.087,.113,.041,-s*.17);
    oval(head,tuft,s*.436,-.058,.155,.16,.217,.145,-s*.20);
    oval(head,face,s*.173,.15,.334,.275,.26,.16,-s*.10);
  }
  for(const [x,y,tilt] of [[-.14,.62,.55],[.016,.645,.42],[.14,.614,.29]])
    oval(head,tuft,x,y,-.055,.09,.105,.125,-tilt);
  const eyes=[];
  for(const s of [-1,1]) {
    const eye=group(head,s*.188,.175,.469);
    oval(eye,white,0,0,0,.121,.142,.063);
    oval(eye,iris,-s*.010,-.002,.051,.080,.096,.030);
    oval(eye,pupil,-s*.010,.002,.074,.052,.067,.018);
    oval(eye,shine,-.028,.043,.089,.022,.025,.008);
    oval(eye,shine,.018,-.02,.092,.009,.010,.004);
    eyes.push(eye);
    line(head,coat,[[s*.085,.348,.435],[s*.174,.377,.428],[s*.277,.35,.397]],.026);
  }
  oval(head,muzzle,0,-.146,.352,.353,.234,.204);
  for(const s of [-1,1]) oval(head,muzzle,s*.20,-.055,.382,.177,.139,.133);
  oval(head,nose,0,.009,.49,.158,.094,.085);
  for(const s of [-1,1]) oval(head,ink,s*.061,.005,.56,.033,.021,.014,s*.22);
  line(head,ink,[[-.208,-.158,.502],[-.137,-.194,.529],[0,-.215,.544],[.137,-.194,.529],[.208,-.151,.505]],.012);
  // Relaxed arm and an open hand raised at shoulder height.
  oval(chest,coat,-.589,.108,-.005,.23,.351,.238,-.34);
  oval(chest,tuft,-.728,-.27,.058,.19,.282,.192,-.13);
  oval(chest,face,-.752,-.525,.097,.133,.16,.125);
  for(let i=0;i<3;i++) oval(chest,face,-.825+i*.065,-.59,.151,.038,.088,.046);
  oval(chest,face,-.651,-.506,.19,.052,.092,.065,-.30);
  oval(chest,coat,.60,.16,-.01,.234,.31,.235,.6);
  const wave=group(chest,.778,.065,.035);
  oval(wave,tuft,.106,.215,.04,.156,.274,.164,-.40);
  oval(wave,band,.189,.414,.066,.133,.074,.132,-.24);
  const hand=group(wave,.216,.527,.08);
  hand.rotation.z=-.13;
  oval(hand,face,0,0,0,.156,.154,.082);
  for(const [x,y,len,tilt] of [[-.100,.118,.095,.17],[-.036,.153,.111,.045],[.039,.145,.104,-.09],[.105,.104,.087,-.23]])
    oval(hand,face,x,y,.002,.037,len,.044,tilt);
  oval(hand,face,-.145,.005,.028,.052,.101,.056,.74);
  head.rotation.z=-.055;
  wave.rotation.z=-.055;
  // Batch fixed parts by material within each articulated group.
  const disposables=new Set([sphere]);
  for(const pivot of [root,chest,head,...eyes,wave,hand]) {
    const batches=new Map();
    for(const mesh of [...pivot.children].filter(child=>child.isMesh)) {
      mesh.updateMatrix();
      const geo=mesh.geometry.clone().applyMatrix4(mesh.matrix);
      if(!batches.has(mesh.material)) batches.set(mesh.material,[]);
      batches.get(mesh.material).push(geo);
      disposables.add(mesh.geometry); pivot.remove(mesh);
    }
    for(const [mat,parts] of batches) {
      const geometry=mergeGeometries(parts);
      pivot.add(new THREE.Mesh(geometry,mat)); parts.forEach(g=>g.dispose());
    }
  }
  disposables.forEach(g=>g.dispose());
  return {root,chest,head,eyes,wave};
}
