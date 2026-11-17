import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { scene3dFrame } from "@/core/scene3d/frame";
import type { Scene3D } from "@/core/scene3d/schema";

/** 只解释经核心层验证的数据；这里没有案例名称、设备类型或作者代码求值。 */
export async function createScene3DWorld(canvas: HTMLCanvasElement, host: HTMLElement, data: Scene3D) {
  const offline = new URLSearchParams(location.search).get("offline") === "1";
  const renderer = new THREE.WebGLRenderer({canvas, antialias: !offline, preserveDrawingBuffer: true});
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = data.world.exposure;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(data.world.background);
  if (data.world.fog) scene.fog = new THREE.Fog(data.world.fog.color, data.world.fog.near, data.world.fog.far);
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  const objects = new Map<string, THREE.Object3D>(), mats = new Map<string, THREE.MeshPhysicalMaterial | THREE.MeshBasicMaterial>();
  const mixers = new Map<string, THREE.AnimationMixer>(), targets = new Map<string, THREE.Vector3>();
  let environment: THREE.WebGLRenderTarget | undefined, composer: EffectComposer | undefined;
  const dispose = () => {
    mixers.forEach((m) => {m.stopAllAction(); m.uncacheRoot(m.getRoot());});
    scene.traverse((o) => { if (o instanceof THREE.Light && "shadow" in o) (o as THREE.DirectionalLight).shadow?.dispose(); });
    geometries.forEach((g) => g.dispose()); materials.forEach((m) => m.dispose()); textures.forEach((t) => t.dispose());
    environment?.dispose(); composer?.passes.forEach((p) => p.dispose()); composer?.dispose(); renderer.dispose();
  };
  try {
    if (data.world.environment === "studio") {
      const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer);
      environment = pmrem.fromScene(room, 0.04); room.dispose(); pmrem.dispose();
      scene.environment = environment.texture; scene.environmentIntensity = data.world.environmentIntensity;
    }
    const geo = new Map<string, THREE.BufferGeometry>();
    for (const g of data.geometries) {
      let value: THREE.BufferGeometry;
      switch (g.kind) {
        case "box": value = g.bevel ? new RoundedBoxGeometry(...g.size, 2, g.bevel) : new THREE.BoxGeometry(...g.size); break;
        case "sphere": value = new THREE.SphereGeometry(g.radius, g.segments, Math.max(3, Math.floor(g.segments / 2))); break;
        case "cylinder": value = new THREE.CylinderGeometry(g.top, g.bottom, g.height, g.segments); break;
        case "plane": value = new THREE.PlaneGeometry(g.width, g.height); break;
        case "torus": value = new THREE.TorusGeometry(g.radius, g.tube, 12, g.segments); break;
        case "tube": value = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(g.points.map((p) => new THREE.Vector3(...p))), g.segments, g.radius, 8, false); break;
        case "buffer":
          value = new THREE.BufferGeometry(); value.setAttribute("position", new THREE.Float32BufferAttribute(g.positions, 3));
          if (g.indices) value.setIndex(g.indices);
          if (g.normals) value.setAttribute("normal", new THREE.Float32BufferAttribute(g.normals, 3)); else value.computeVertexNormals();
          if (g.uv) value.setAttribute("uv", new THREE.Float32BufferAttribute(g.uv, 2));
      }
      geo.set(g.id, value); geometries.add(value);
    }
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => {
      const parsed = new URL(url, location.origin);
      if (url.startsWith("blob:") || url.startsWith("data:")) return url;
      if (parsed.origin !== location.origin || !/^\/media\/[a-z0-9]+\.(glb|png|jpg|webp|avif)$/.test(parsed.pathname) || parsed.search || parsed.hash) throw new Error("三维资源只能来自本站媒体库");
      return url;
    });
    const textureLoader = new THREE.TextureLoader(manager);
    for (const m of data.materials) {
      const value = m.unlit ? new THREE.MeshBasicMaterial() : new THREE.MeshPhysicalMaterial({metalness:m.metalness, roughness:m.roughness, emissive:m.emissive, emissiveIntensity:m.emissiveIntensity, normalScale:new THREE.Vector2(...m.normalScale),clearcoat:m.clearcoat,clearcoatRoughness:m.clearcoatRoughness,anisotropy:m.anisotropy,anisotropyRotation:m.anisotropyRotation});
      value.color.set(m.color); value.opacity = m.opacity;
      value.transparent = m.opacity < 1 || data.tracks.some((tr) => tr.target === m.id && tr.property === "opacity");
      value.depthWrite = !value.transparent; value.side = m.side === "double" ? THREE.DoubleSide : THREE.FrontSide;
      value.lightMapIntensity = m.lightMapIntensity;
      materials.add(value); mats.set(m.id, value);
      for (const key of ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "aoMap", "lightMap"] as const) {
        if (!m[key]) continue;
        if (!(key in value)) throw new Error(`无光照材质 ${m.id} 不支持 ${key}`);
        const texture = await textureLoader.loadAsync(m[key]); textures.add(texture);
        texture.colorSpace = ["map", "emissiveMap", "lightMap"].includes(key) ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(...m.repeat);
        (value as THREE.MeshStandardMaterial)[key] = texture;
      }
    }
    const loader = new GLTFLoader(manager);
    for (const n of data.nodes) {
      let object: THREE.Object3D;
      if (n.kind === "mesh") object = new THREE.Mesh(geo.get(n.geometry!)!, mats.get(n.material!)!);
      else if (n.kind === "camera") object = new THREE.PerspectiveCamera(n.fov, 16/9, 0.05, 10000);
      else if (n.kind === "light") {
        object = n.light === "ambient" ? new THREE.AmbientLight(n.color,n.intensity) : n.light === "hemisphere" ? new THREE.HemisphereLight(n.color,n.ground,n.intensity) : n.light === "point" ? new THREE.PointLight(n.color,n.intensity,n.distance) : new THREE.DirectionalLight(n.color,n.intensity);
        if (object instanceof THREE.DirectionalLight) {
          object.target.position.set(...n.target); scene.add(object.target);
          Object.assign(object.shadow.camera,{left:-n.shadowSpan,right:n.shadowSpan,top:n.shadowSpan,bottom:-n.shadowSpan,near:0.1,far:1000});
          object.shadow.mapSize.set(2048,2048); object.shadow.normalBias=0.035; object.shadow.bias=-0.0002;
        }
      } else if (n.kind === "model") {
        const gltf = await loader.loadAsync(n.src!); object = gltf.scene;
        object.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          child.castShadow=n.castShadow; child.receiveShadow=n.receiveShadow; geometries.add(child.geometry);
          for (const m of Array.isArray(child.material) ? child.material : [child.material]) {
            materials.add(m); for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value);
          }
        });
        if (n.animation) {
          const clip = gltf.animations.find((c) => c.name === n.animation);
          if (!clip) throw new Error(`模型 ${n.id} 没有动画片段 ${n.animation}`);
          const mixer = new THREE.AnimationMixer(object); mixer.clipAction(clip).play(); mixers.set(n.id,mixer);
        }
      } else object = new THREE.Group();
      object.name=n.id; object.position.set(...n.position); object.rotation.set(...n.rotation); object.scale.set(...n.scale);
      if (n.quaternion) object.quaternion.set(...n.quaternion).normalize();
      object.visible=n.visible; object.castShadow=n.castShadow; object.receiveShadow=n.receiveShadow;
      objects.set(n.id,object); targets.set(n.id,new THREE.Vector3(...n.target));
    }
    for (const n of data.nodes) (n.parent ? objects.get(n.parent)! : scene).add(objects.get(n.id)!);
    // 不动的零件按材质合并；凡自身或祖先有轨迹，保留独立节点。
    const animated = new Set(data.tracks.map((tr) => tr.target));
    scene.updateMatrixWorld(true);
    const buckets = new Map<string,{material:THREE.Material;cast:boolean;receive:boolean;parts:THREE.BufferGeometry[]}>();
    for (const n of data.nodes) {
      const object = objects.get(n.id)!;
      if (n.kind !== "mesh" || !(object instanceof THREE.Mesh)) continue;
      let dynamic = false;
      for (let parent: THREE.Object3D | null = object; parent && parent !== scene; parent=parent.parent) if (animated.has(parent.name) || !parent.visible) dynamic=true;
      if (dynamic) continue;
      const material = object.material as THREE.Material, key = `${material.uuid}:${n.castShadow}:${n.receiveShadow}`;
      let bucket = buckets.get(key);
      if (!bucket) {bucket={material,cast:n.castShadow,receive:n.receiveShadow,parts:[]}; buckets.set(key,bucket);}
      const transformed = object.geometry.clone().applyMatrix4(object.matrixWorld);
      const part = transformed.index ? transformed.toNonIndexed() : transformed;
      if (part !== transformed) transformed.dispose();
      // 合并只需标准顶点属性；缺少 UV 的自定义几何用零值，避免属性不一致。
      if (!part.getAttribute("uv")) part.setAttribute("uv",new THREE.Float32BufferAttribute(new Float32Array(part.getAttribute("position").count*2),2));
      bucket.parts.push(part); object.removeFromParent();
    }
    for (const b of buckets.values()) {
      const geometry = mergeGeometries(b.parts); b.parts.forEach((g) => g.dispose());
      if (!geometry) throw new Error("静态几何合并失败");
      geometries.add(geometry); const mesh = new THREE.Mesh(geometry,b.material); mesh.castShadow=b.cast; mesh.receiveShadow=b.receive; scene.add(mesh);
    }
    const cameraNode = data.nodes.find((n) => n.kind === "camera")!, camera=objects.get(cameraNode.id) as THREE.PerspectiveCamera;
    if (data.world.bloom?.strength) {
      composer=new EffectComposer(renderer); composer.addPass(new RenderPass(scene,camera));
      const bloom=data.world.bloom; composer.addPass(new UnrealBloomPass(new THREE.Vector2(1,1),bloom.strength,bloom.radius,bloom.threshold)); composer.addPass(new OutputPass());
    }
    let last="";
    return {
      draw(time:number) {
        const rect=host.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio,2),width=Math.max(1,Math.round(rect.width*dpr)),height=Math.max(1,Math.round(rect.height*dpr));
        const signature=`${time}:${width}:${height}`; if(signature===last) return false; last=signature;
        if(canvas.width!==width || canvas.height!==height) {renderer.setSize(width,height,false);composer?.setSize(width,height);}
        for(const [id,props] of Object.entries(scene3dFrame(data,time))) {
          const object=objects.get(id),material=mats.get(id);
          for(const [key,value] of Object.entries(props)) {
            if(material && typeof value==="number") {Object.assign(material,{[key]:value});continue;}
            if(!object) continue;
            if(key==="position" || key==="scale") object[key].fromArray(value as number[]);
            else if(key==="rotation") object.rotation.set(...value as [number,number,number]);
            else if(key==="quaternion") object.quaternion.fromArray(value as number[]).normalize();
            else if(key==="target") targets.get(id)!.fromArray(value as number[]);
            else if(key==="animationTime") mixers.get(id)?.setTime((value as number)/1000);
            else Object.assign(object,{[key]:value});
          }
        }
        for(const [id,object] of objects) if(object instanceof THREE.DirectionalLight) object.target.position.copy(targets.get(id)!);
        camera.aspect=width/height; camera.updateProjectionMatrix(); camera.lookAt(targets.get(cameraNode.id)!);
        if(composer) composer.render(0); else renderer.render(scene,camera);
        return true;
      }, dispose,
    };
  } catch(error) {dispose();throw error;}
}
