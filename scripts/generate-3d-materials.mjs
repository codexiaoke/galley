/** 原创、无缝的细节纹理；只生成数据贴图，不改写下载素材。 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";
const directory = new URL("../examples/assets/materials/", import.meta.url);
mkdirSync(directory, { recursive: true });
const size = 512;
const crcTable = Array.from({length:256},(_,i)=>{let c=i;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc32 = bytes => {let crc=0xffffffff;for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;};
function chunk(type, bytes) {const name=Buffer.from(type),out=Buffer.alloc(bytes.length+12);out.writeUInt32BE(bytes.length,0);name.copy(out,4);bytes.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([name,bytes])),bytes.length+8);return out;}
function png(pixels) {const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=2;const rows=Buffer.alloc(size*(size*3+1));for(let y=0;y<size;y++)pixels.copy(rows,y*(size*3+1)+1,y*size*3,(y+1)*size*3);return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",header),chunk("IDAT",deflateSync(rows,{level:9})),chunk("IEND",Buffer.alloc(0))]);}
const wrap = v => (v%size+size)%size;
const hash = (x,y) => {let n=Math.imul(wrap(x)+1,374761393)^Math.imul(wrap(y)+1,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
const heights={
  brushed:(x,y)=>0.45*hash(x,0)+0.1*hash(x,y)+0.02*Math.sin(y*Math.PI/128),
  paint:(x,y)=>0.5*hash(x,y)+0.25*hash(x+1,y)+0.25*hash(x,y+1),
  rubber:(x,y)=>0.5*hash(x,y)+0.05*Math.sin(x*Math.PI/8)*Math.sin(y*Math.PI/8),
};
let sources=JSON.parse(readFileSync(new URL("sources.json",directory),"utf8")).filter(s=>s.source!=="procedural");
for(const [name,height] of Object.entries(heights)) for(const kind of ["normal","rough"]) {
  const pixels=Buffer.alloc(size*size*3);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=(y*size+x)*3;
    if(kind==="normal") {const nx=height(x-1,y)-height(x+1,y),ny=height(x,y-1)-height(x,y+1),length=Math.hypot(nx,ny,1);pixels[i]=Math.round((nx/length*0.5+0.5)*255);pixels[i+1]=Math.round((ny/length*0.5+0.5)*255);pixels[i+2]=Math.round((1/length*0.5+0.5)*255);}
    else {const value=Math.round((name==="rubber"?0.8+height(x,y)*0.2:0.6+height(x,y)*0.35)*255);pixels[i]=pixels[i+1]=pixels[i+2]=value;}
  }
  const file=`${name}-${kind}.png`,bytes=png(pixels);writeFileSync(new URL(file,directory),bytes);
  sources.push({token:`${name.toUpperCase()}_${kind.toUpperCase()}`,file,source:"procedural",generator:"scripts/generate-3d-materials.mjs",license:"project-original",sha256:createHash("sha256").update(bytes).digest("hex")});
}
writeFileSync(new URL("sources.json",directory),JSON.stringify(sources,null,2)+"\n");
