import * as THREE from "three";
import { Resvg } from "@resvg/resvg-js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { OWNER } from "../src/core/actor";
import type { Db } from "../src/core/db/client";
import { listMedia, saveMedia } from "../src/core/services/media";

/** Blender 资产经正常媒体入口上传，正文保存不可变的媒体地址。 */
export function bindLabGpu(db: Db, source: string) {
  if (!source.includes("__GPU_MODEL__")) return source;
  const bytes = readFileSync("examples/assets/gpu/gpu-module.glb");
  const originalName = `${createHash("sha256").update(bytes).digest("hex").slice(0, 12)}-gpu-module.glb`;
  const row = listMedia(db).find((item) => item.originalName === originalName)
    ?? saveMedia(db, OWNER, { bytes, originalName, alt: "Blender 制作的可拆解 GPU 样机", family: "model" });
  return source.replaceAll("__GPU_MODEL__", `/media/${row.name}`);
}

/** 实验用模型也经过与站长上传完全相同的媒体入口。 */
export function labAssets(db: Db) {
  const existing=listMedia(db);
  const upload=(name:string,bytes:()=>Uint8Array,alt:string)=>{
    const found=existing.find((m)=>m.originalName===name);
    if(found)return found.url;
    return `/media/${saveMedia(db,OWNER,{bytes:bytes(),originalName:name,alt}).name}`;
  };
  const model=upload("lab-product-housing.glb",()=>{
    const geometry=new THREE.CylinderGeometry(1.5,1.6,1.25,48);
    const chunks:Buffer[]=[],views:{buffer:number;byteOffset:number;byteLength:number}[]=[],accessors:object[]=[];
    let size=0;
    const attribute=(values:ArrayLike<number>,components:number,indices=false)=>{
      const array=indices?new Uint32Array(values):new Float32Array(values),bytes=Buffer.from(array.buffer);
      views.push({buffer:0,byteOffset:size,byteLength:bytes.length});chunks.push(bytes);size+=bytes.length;
      const min=Array.from({length:components},()=>Infinity),max=min.map(()=>-Infinity);
      for(let i=0;i<values.length;i++){min[i%components]=Math.min(min[i%components],values[i]);max[i%components]=Math.max(max[i%components],values[i]);}
      accessors.push({bufferView:views.length-1,componentType:indices?5125:5126,count:values.length/components,type:components===1?"SCALAR":`VEC${components}`,min,max});
      return accessors.length-1;
    };
    const position=attribute(geometry.getAttribute("position").array,3),normal=attribute(geometry.getAttribute("normal").array,3),index=attribute(geometry.index!.array,1,true);
    const content={asset:{version:"2.0",generator:"Galley local content experiment"},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:position,NORMAL:normal},indices:index,material:0}]}],materials:[{pbrMetallicRoughness:{baseColorFactor:[0.35,0.5,0.64,1],metallicFactor:0.85,roughnessFactor:0.25}}],buffers:[{byteLength:size}],bufferViews:views,accessors};
    const json=Buffer.from(JSON.stringify(content)),padding=Buffer.alloc((4-json.length%4)%4,0x20),jsonChunk=Buffer.concat([json,padding]),bin=Buffer.concat(chunks),header=Buffer.alloc(12),jsonHeader=Buffer.alloc(8),binHeader=Buffer.alloc(8);
    header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+jsonChunk.length+8+bin.length,8);
    jsonHeader.writeUInt32LE(jsonChunk.length,0);jsonHeader.writeUInt32LE(0x4e4f534a,4);binHeader.writeUInt32LE(bin.length,0);binHeader.writeUInt32LE(0x004e4942,4);
    geometry.dispose();return Buffer.concat([header,jsonHeader,jsonChunk,binHeader,bin]);
  },"产品演示的金属壳体");
  const texture=upload("lab-brushed-panel.png",()=>new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="#3e5168"/><path d="M0 0H128M0 32H128M0 64H128M0 96H128" stroke="#4b627a" stroke-width="1"/></svg>').render().asPng(),"金属底座细纹贴图");
  return {model,texture};
}
