"use client";
import {useEffect,useRef,useState} from "react";
const FTMS=0x1826;
export default function CardioConnect({onMetric}){
 const device=useRef(null),callback=useRef(onMetric),busy=useRef(false);
 callback.current=onMetric;
 const [status,setStatus]=useState("Desconectado"),[battery,setBattery]=useState(null),[connected,setConnected]=useState(false);
 useEffect(()=>()=>{device.current?.gatt?.disconnect()},[]);
 async function connect(){
 if(busy.current)return;busy.current=true;
 try{
 if(!navigator.bluetooth)throw Error("Bluetooth Web indisponível neste navegador.");
 setStatus("Selecione seu equipamento");
 const d=await navigator.bluetooth.requestDevice({filters:[{services:[FTMS]}],optionalServices:[0x180f]});device.current=d;
 d.addEventListener("gattserverdisconnected",()=>{setConnected(false);setStatus("Desconectado");setBattery(null)},{once:true});
 const g=await d.gatt.connect(),service=await g.getPrimaryService(FTMS);
 let count=0;
 for(const [uuid,bike] of [[0x2acd,false],[0x2ad2,true]]){
 try{
 const c=await service.getCharacteristic(uuid);
 await c.startNotifications();
 c.addEventListener("characteristicvaluechanged",e=>{
 const v=e.target.value;if(v.byteLength<2)return;const flags=v.getUint16(0,true);let i=2;
 function read(n){if(i+n>v.byteLength)throw Error("Invalid packet");const x=n===2?v.getUint16(i,true):v.getUint8(i)+(n===3?v.getUint8(i+1)*256+v.getUint8(i+2)*65536:0);i+=n;return x}
 try{
 if(!(flags&1))callback.current("speed",read(2)/100);
 if(flags&2)read(2);
 if(bike){if(flags&4)read(2);if(flags&8)read(2);if(flags&16)callback.current("distance",read(3)/1000);}
 else if(flags&4)callback.current("distance",read(3)/1000);
 }catch{}
 });count++;
 }catch{}
 }
 if(!count)throw Error("Equipamento sem telemetria de esteira ou bicicleta acessível.");
 try{const b=await g.getPrimaryService(0x180f),c=await b.getCharacteristic(0x2a19);setBattery((await c.readValue()).getUint8(0))}catch{}
 setConnected(true);setStatus(d.name||"Equipamento FTMS");
 }catch(e){device.current?.gatt?.disconnect();setStatus(e.message||"Falha na conexão");}finally{busy.current=false}
 }
 return <div className="connect-panel"><small>ATLASFIT CONNECT / FTMS</small><h2>Equipamento cardiovascular</h2><p role="status">{status}{battery!==null?" · Bateria "+battery+"%":""}</p><button type="button" onClick={connected?()=>device.current?.gatt?.disconnect():connect}>{connected?"Desconectar equipamento":"Buscar esteira ou bicicleta Bluetooth"}</button><p>Leitura de velocidade e distância quando transmitidas pelo equipamento. Não controla motores ou resistência. Requer Bluetooth Web e equipamento FTMS compatível.</p><style jsx>{`.connect-panel{margin-top:20px;padding:16px;border:1px solid var(--border);border-radius:14px;background:var(--surface)}.connect-panel h2{margin:8px 0}.connect-panel button{background:var(--brand);color:var(--brand-foreground);border:0;border-radius:10px;padding:12px;font-weight:700}`}</style></div>
}
