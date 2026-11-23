import * as THREE from 'three';
import { createCoach } from './coach-model.mjs';

export function mountMascot(host, onVisible, onLost) {
  const renderer = new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  const canvas=renderer.domElement;
  host.appendChild(canvas);
  const { root,chest,head,eyes,wave }=createCoach();
  const scene=new THREE.Scene();
  root.rotation.y=-.085;
  scene.add(root,new THREE.HemisphereLight('#fff5e6','#a27c69',1.8));
  function light(color,power,x,y,z) {
    const lamp=new THREE.DirectionalLight(color,power);
    lamp.position.set(x,y,z); scene.add(lamp);
  }
  light('#fff2e2',2.35,-3,5,4);
  light('#ffd18c',2.4,3,3,-2);
  light('#d4dfed',.72,2,2,3);
  const camera=new THREE.OrthographicCamera(-2,2,2,-2,.01,20);
  camera.position.set(.13,1.59,5.5);
  camera.lookAt(.075,1.33,0);
  const pointer=new THREE.Vector2();
  let active=true,disposed=false,first=true,frame=0,last=null,t=0;
  function render(now) {
    if(disposed || !active || document.hidden) return;
    frame=requestAnimationFrame(render);
    if(last!==null && now-last<32) return;
    const dt=last===null?0:Math.min(.075,(now-last)/1000);
    last=now; t+=dt;
    const ease=1-Math.exp(-4*dt);
    const focus=document.activeElement?.name;
    const x = focus === 'password' ? -.24 : focus === 'username' ? .32 : pointer.x;
    head.rotation.y+=(.16*x+.024*Math.sin(t*.67)-head.rotation.y)*ease;
    head.rotation.x+=(-.065*pointer.y-head.rotation.x)*ease;
    head.rotation.z=-.055+.018*Math.sin(t*1.3);
    chest.position.y=1.07+.010*Math.sin(t*1.55);
    const phase=t%8.8, greeting=Math.sin(Math.PI*Math.min(1,phase/2.5))**2;
    wave.rotation.z=-.055+.21*greeting*Math.sin(phase*7.6);
    const blink=Math.max(0,1-Math.abs(t%4.9-3.5)/.118);
    for(const eye of eyes) eye.scale.y=1-.92*blink;
    renderer.render(scene,camera);
    if(first) {first=false;onVisible();}
  }
  function schedule() {
    cancelAnimationFrame(frame); last=null;
    if(active&&!document.hidden&&!disposed) frame=requestAnimationFrame(render);
  }
  function resize() {
    const {clientWidth:w,clientHeight:h}=host;
    if(!w||!h) return;
    const aspect=w/h, span=Math.max(3.2,2.38/aspect);
    camera.top=span/2; camera.bottom=-span/2;
    camera.right=span*aspect/2; camera.left=-camera.right;
    camera.updateProjectionMatrix(); renderer.setSize(w,h,false);
    schedule();
  }
  const size=new ResizeObserver(resize);
  const observer=new IntersectionObserver(([entry])=>{active=entry.isIntersecting;schedule();});
  function follow(e) {pointer.set(2*e.clientX/innerWidth-1,1-2*e.clientY/innerHeight);}
  function dispose() {
    if(disposed)return;
    disposed=true; cancelAnimationFrame(frame);size.disconnect();observer.disconnect();
    window.removeEventListener('pointermove',follow);
    document.removeEventListener('visibilitychange',schedule);
    canvas.removeEventListener('webglcontextlost',lost);
    const materials=new Set();
    root.traverse(o=>{if(o.isMesh){o.geometry.dispose();materials.add(o.material);}});
    materials.forEach(m=>m.dispose()); renderer.dispose();renderer.forceContextLoss();canvas.remove();
  }
  function lost(e) {e.preventDefault();dispose();onLost();}
  if(matchMedia('(pointer:fine)').matches) window.addEventListener('pointermove',follow,{passive:true});
  document.addEventListener('visibilitychange',schedule);
  canvas.addEventListener('webglcontextlost',lost);
  size.observe(host);observer.observe(host);resize();
  return dispose;
}
