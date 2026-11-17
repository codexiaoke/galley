import { invalid } from "../errors";
/** GLB 自包含：浏览器加载模型时不能再去获取作者提供的外部资源。 */
export function validateGlb(bytes: Uint8Array) {
  const fail = (): never => { throw invalid("模型必须是有效的 GLB 2.0，缓冲和贴图需内嵌，不能引用外部文件。"); };
  if (bytes.length < 20) fail();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0,true)!==0x46546c67 || view.getUint32(4,true)!==2 || view.getUint32(8,true)!==bytes.length) fail();
  let offset=12, json: Record<string,unknown> | undefined, binaryBytes=0;
  while(offset<bytes.length) {
    if(offset+8>bytes.length) fail();
    const length=view.getUint32(offset,true),type=view.getUint32(offset+4,true); offset+=8;
    if(length%4 || offset+length>bytes.length) fail();
    if(type===0x4e4f534a) {
      if(json || offset!==20) fail();
      try {json=JSON.parse(new TextDecoder().decode(bytes.subarray(offset,offset+length)));} catch {fail();}
    } else if(type===0x004e4942) { if(binaryBytes) fail(); binaryBytes=length; } else fail();
    offset+=length;
  }
  if(!json || (json.asset as {version?:string})?.version!=="2.0") fail();
  const check=(value:unknown):void => {
    if(!value || typeof value!=="object") return;
    for(const [key,child] of Object.entries(value)) {
      if(key==="uri" && (typeof child!=="string" || !/^data:(?:image\/(?:png|jpeg|webp)|application\/octet-stream);base64,[A-Za-z0-9+/=]+$/.test(child))) fail();
      check(child);
    }
  };
  check(json);
  const buffers=json!.buffers as {byteLength:number;uri?:string}[] | undefined;
  if(buffers && (!Array.isArray(buffers) || buffers.some((b) => !Number.isInteger(b.byteLength) || b.byteLength<0 || (!b.uri && b.byteLength>binaryBytes)))) fail();
}
