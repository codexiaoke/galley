// 这是文章内容示例：初始化脚本会把它存入正文，播放器不会导入本文件。
// 材质、灯光和资源地址都属于作者内容。__...__ 只用于例稿导入时绑定媒体库。
world({background:"#080f1a",environment:"studio",environmentIntensity:0.25,exposure:0.95,fog:{color:"#080f1a",near:55,far:150},bloom:{strength:0.12,threshold:2.5,radius:0.35}});
const palette={floor:"#526c80",wall:"#253c50",dark:"#111f2c",rubber:"#141a20",joint:"#475966",steel:"#829aab",white:"#38627a",orange:"#ef762b",yellow:"#ddac42",blue:"#16435f",teal:"#32aab1",light:"#d2e8ff",cyan:"#36b5eb",green:"#5be4ad",wood:"#82715f"};
node("camera",{kind:"camera",position:[-24,16,23],target:[-4,1,0]});
node("sky",{kind:"light",light:"hemisphere",color:"#97b9d9",ground:"#101823",intensity:0.45,castShadow:false});
node("sun",{kind:"light",light:"directional",color:"#d1e5ff",intensity:2.0,position:[-10,26,12],target:[0,0,2]});
node("fill",{kind:"light",light:"directional",color:"#4d96da",intensity:1.2,position:[10,9,-15],castShadow:false});
node("rim",{kind:"light",light:"directional",color:"#ffc591",intensity:1.0,position:[-18,10,-5],target:[-3,1,0],castShadow:false});
const floor=material("floor",{color:palette.floor,map:"__FLOOR_COLOR__",normalMap:"__FLOOR_NORMAL__",roughnessMap:"__FLOOR_ROUGH__",normalScale:[0.24,0.24],repeat:[22,16],metalness:0.12,roughness:0.6,clearcoat:0.5,clearcoatRoughness:0.28});
const wall=material("wall",{color:palette.wall,roughness:0.78,normalMap:"__PAINT_NORMAL__",normalScale:[0.15,0.15],repeat:[12,4]});
const dark=material("dark",{color:palette.dark,metalness:0.7,roughness:0.35,normalMap:"__PAINT_NORMAL__",normalScale:[0.15,0.15]});
const rubber=material("rubber",{color:palette.rubber,metalness:0,roughness:0.95,normalMap:"__RUBBER_NORMAL__",roughnessMap:"__RUBBER_ROUGH__",normalScale:[0.5,0.5],repeat:[3,3]});
const steel=material("steel",{color:palette.steel,metalness:0.98,roughness:0.48,normalMap:"__BRUSHED_NORMAL__",roughnessMap:"__BRUSHED_ROUGH__",normalScale:[0.25,0.25],repeat:[2,8],anisotropy:0.65,anisotropyRotation:Math.PI/2});
const painted=(id,color)=>material(id,{color,metalness:0.25,roughness:0.5,normalMap:"__PAINT_NORMAL__",roughnessMap:"__PAINT_ROUGH__",normalScale:[0.2,0.2],repeat:[3,3],clearcoat:0.65,clearcoatRoughness:0.22});
const white=painted("white",palette.white),orange=painted("orange",palette.orange),blue=painted("blue",palette.blue),teal=painted("teal",palette.teal);
const yellow=material("yellow",{color:palette.yellow,roughness:0.65,metalness:0.1});
const lamp=material("light",{color:palette.light,emissive:palette.light,emissiveIntensity:2.2,roughness:0.35});
const cyan=material("cyan",{color:palette.cyan,emissive:palette.cyan,emissiveIntensity:1.6,roughness:0.25});
const windowGlass=material("window",{color:"#26455d",emissive:"#2a6796",emissiveIntensity:0.18,metalness:0.6,roughness:0.2,clearcoat:1,clearcoatRoughness:0.08});
const green=material("green",{color:palette.green,emissive:palette.green,emissiveIntensity:1.6});
const wood=material("wood",{color:palette.wood,roughness:0.88,normalMap:"__RUBBER_NORMAL__",normalScale:[0.1,0.1],repeat:[2,5]});
const joint=material("joint",{color:palette.joint,metalness:0.9,roughness:0.38});
const tread=material("tread",{color:"#718ba1",map:"__PLATE_COLOR__",normalMap:"__PLATE_NORMAL__",roughnessMap:"__PLATE_ROUGH__",metalnessMap:"__PLATE_METAL__",metalness:1,roughness:0.65,normalScale:[0.7,0.7],repeat:[3,2]});
const cube=geometry("cube",{kind:"box"}),cylinder=geometry("cylinder",{kind:"cylinder",segments:32}),sphere=geometry("sphere",{kind:"sphere",segments:20});
let serial=0;const scene=null;
const makeGroup=()=>node("group"+(++serial),{kind:"group"});
const fixed=makeGroup();
const mesh=(parent,geometry,material,position,scale)=>node("part"+(++serial),{kind:"mesh",parent:parent?parent.id:undefined,geometry,material,position,scale});
const roundedShapes={};
const box=(parent,material,pos,scale)=>{
  const shortest=Math.min(...scale);
  if(![white,orange,blue,teal,dark].includes(material)||shortest<0.14)return mesh(parent,cube,material,pos,scale);
  const key=scale.join("_");
  if(!roundedShapes[key])roundedShapes[key]=geometry("bevel"+Object.keys(roundedShapes).length,{kind:"box",size:scale,bevel:Math.min(0.045,shortest*0.16)});
  return mesh(parent,roundedShapes[key],material,pos,[1,1,1]);
};
const tube=(parent,material,pos,radius,length)=>mesh(parent,cylinder,material,pos,[radius,length,radius]);
function linkPose(a,b,width,depth=width){const d=b.map((v,i)=>v-a[i]),length=Math.hypot(...d),direction=d.map(v=>v/length);let q=[direction[2],0,-direction[0],1+direction[1]],norm=Math.hypot(...q);if(norm<0.0001)q=[1,0,0,0];else q=q.map(v=>v/norm);return {position:a.map((v,i)=>(v+b[i])/2),scale:[width,length,depth],quaternion:q};}
const beam=(parent,material,a,b,width,depth=width)=>{const m=box(parent,material,a,[1,1,1]);Object.assign(m,linkPose(a,b,width,depth));return m;};
const FACTORY_SHOTS = [
  { title: "\u9001\u6599", text: "\u5DE5\u4EF6\u6CBF\u6EDA\u7B52\u8F93\u9001\u7EBF\u8FDB\u5165\u673A\u5668\u4EBA\u5DE5\u4F5C\u7AD9\u3002", duration: 6e3 },
  { title: "\u673A\u68B0\u81C2\u8F6C\u8FD0", text: "\u5939\u722A\u5939\u4F4F\u6258\u76D8\uFF0C\u62AC\u5347\u3001\u8F6C\u79FB\uFF0C\u518D\u653E\u5230\u538B\u88C5\u5DE5\u4F4D\u3002", duration: 8e3 },
  { title: "\u81EA\u52A8\u538B\u88C5", text: "\u538B\u88C5\u5934\u4E0B\u964D\uFF0C\u628A\u4E0A\u76D6\u538B\u5165\u58F3\u4F53\uFF0C\u968F\u540E\u56DE\u5230\u5B89\u5168\u9AD8\u5EA6\u3002", duration: 7e3 },
  { title: "\u89C6\u89C9\u68C0\u6D4B", text: "\u5DE5\u4EF6\u7A7F\u8FC7\u84DD\u8272\u68C0\u6D4B\u5149\u5E55\uFF0C\u901A\u8FC7\u68C0\u67E5\u540E\u4EAE\u8D77\u7EFF\u8272\u6307\u793A\u706F\u3002", duration: 7e3 },
  { title: "\u5206\u6D41", text: "\u4FA7\u63A8\u673A\u6784\u5C06\u5DE5\u4EF6\u9001\u5165\u652F\u7EBF\uFF0C\u6EDA\u7B52\u628A\u5B83\u9001\u4E0A\u8FD0\u8F93\u5C0F\u8F66\u3002", duration: 6e3 },
  { title: "\u65E0\u4EBA\u8FD0\u8F93", text: "\u8FD0\u8F93\u5C0F\u8F66\u5E26\u7740\u6210\u54C1\u6CBF\u8F66\u95F4\u901A\u9053\u9A76\u5411\u4ED3\u50A8\u533A\u3002", duration: 8e3 },
  { title: "\u6574\u7EBF\u5168\u666F", text: "\u955C\u5934\u5347\u8D77\uFF0C\u56DE\u770B\u9001\u6599\u3001\u8F6C\u8FD0\u3001\u538B\u88C5\u3001\u68C0\u6D4B\u3001\u5206\u6D41\u548C\u4ED3\u50A8\u7684\u5B8C\u6574\u4EA7\u7EBF\u3002", duration: 8e3 }
];
const FACTORY_DURATION = FACTORY_SHOTS.reduce((sum, shot) => sum + shot.duration, 0);
const clamp = (t) => Math.max(0, Math.min(1, t));
const smooth = (t) => {
  const p = clamp(t);
  return p * p * (3 - 2 * p);
};
const mix = (a, b, t) => a + (b - a) * t;
const vector = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
function path(keys, t) {
  const end = keys.findIndex((key) => key.at > t);
  if (end < 0) return [...keys[keys.length - 1].value];
  if (end === 0) return [...keys[0].value];
  const a = keys[end - 1], b = keys[end];
  return vector(a.value, b.value, smooth((t - a.at) / (b.at - a.at)));
}
const SHOULDER = [-5, 1.4, -3];
const ROBOT_LENGTHS = [2.6, 2.4];
function factoryRobot(wrist) {
  const dx = wrist[0] - SHOULDER[0], dy = wrist[1] - SHOULDER[1], dz = wrist[2] - SHOULDER[2];
  const radial = Math.hypot(dx, dz), distance = Math.hypot(radial, dy);
  const [upper, lower] = ROBOT_LENGTHS;
  const angle = Math.atan2(dy, radial) + Math.acos(Math.max(-1, Math.min(1, (upper * upper + distance * distance - lower * lower) / (2 * upper * distance))));
  const reach = upper * Math.cos(angle);
  const elbow = [SHOULDER[0] + reach * dx / radial, SHOULDER[1] + upper * Math.sin(angle), SHOULDER[2] + reach * dz / radial];
  return { shoulder: SHOULDER, elbow, wrist };
}
function cart(t) {
  const p = smooth((t - 34e3) / 8e3), q = 1 - p;
  const x = q ** 3 * 12 + 3 * q * q * p * 15 + 3 * q * p * p * 20 + p ** 3 * 20;
  const z = q ** 3 * 6.3 + 3 * q * q * p * 6.3 + 3 * q * p * p * 8 + p ** 3 * 13;
  const dx = 3 * q * q * 3 + 6 * q * p * 5;
  const dz = 6 * q * p * 1.7 + 3 * p * p * 5;
  return { position: [x, 0, z], yaw: Math.atan2(dx, dz) };
}
const PRODUCT_TRANSFER = [
  { at: 6e3, value: [-7, 1.3, 0] },
  { at: 7400, value: [-7, 1.3, 0] },
  { at: 8800, value: [-7, 2.8, 0] },
  { at: 10800, value: [-3, 2.8, 0.35] },
  { at: 12400, value: [-3, 1.3, 0] }
];
const CAMERA = [
  { at: 0, value: [-24, 16, 23] },
  { at: 6e3, value: [-16, 8, 12] },
  { at: 1e4, value: [-10, 6, 6] },
  { at: 14e3, value: [-7, 5, 7] },
  { at: 21e3, value: [3, 5.8, 8] },
  { at: 28e3, value: [9, 4.5, 8] },
  { at: 34e3, value: [18, 6.5, 14.3] },
  { at: 42e3, value: [26, 6.5, 21] },
  { at: 5e4, value: [31, 20, 32] }
];
const TARGET = [
  { at: 0, value: [-4, 1, 0] },
  { at: 6e3, value: [-9, 1.4, 0] },
  { at: 1e4, value: [-5, 2, 0] },
  { at: 14e3, value: [-3, 1.5, 0] },
  { at: 21e3, value: [-3, 2.1, 0] },
  { at: 28e3, value: [4, 1.7, 0] },
  { at: 34e3, value: [12, 1.3, 6.3] },
  { at: 42e3, value: [20, 1.3, 13] },
  { at: 5e4, value: [2, 1, 3] }
];
function factoryFrame(ms) {
  const t = Math.max(0, Math.min(FACTORY_DURATION, ms));
  const agv = cart(t);
  let product;
  if (t < 6e3) product = [mix(-14, -7, smooth(t / 6e3)), 1.3, 0];
  else if (t < 14e3) product = path(PRODUCT_TRANSFER, t);
  else if (t < 21e3) product = [-3, 1.3, 0];
  else if (t < 28e3) product = [mix(-3, 6, smooth((t - 21e3) / 7e3)), 1.3, 0];
  else if (t < 31e3) product = [mix(6, 12, smooth((t - 28e3) / 3e3)), 1.3, 0];
  else if (t < 34e3) product = path([
    { at: 31e3, value: [12, 1.3, 0] },
    { at: 31300, value: [12, 1.3, 0] },
    { at: 32300, value: [12, 1.3, 1.5] },
    { at: 34e3, value: [12, 1.3, 6.3] }
  ], t);
  else product = [agv.position[0], 1.3, agv.position[2]];
  const park = [-5, 3, -1];
  let wrist = park;
  if (t >= 6e3 && t < 7400) wrist = vector(park, [-7, 2, 0], smooth((t - 6e3) / 1e3));
  else if (t >= 7400 && t < 12400) wrist = [product[0], product[1] + 0.7, product[2]];
  else if (t >= 12400 && t < 14e3) wrist = vector([-3, 2, 0], park, smooth((t - 12800) / 1200));
  const jaw = t < 6e3 || t >= 14e3 ? 0.95 : 0.95 - 0.31 * smooth((t - 7e3) / 400) + 0.31 * smooth((t - 12400) / 400);
  const pressPhase = (t - 14e3) / 7e3;
  const press = smooth((pressPhase - 0.1) / 0.25) * (1 - smooth((pressPhase - 0.65) / 0.2));
  const pusherZ = t < 31300 ? mix(-0.9, -0.665, smooth((t - 31e3) / 300)) : t < 32300 ? product[2] - 0.665 : mix(0.835, -0.9, smooth((t - 32300) / 700));
  return {
    time: t,
    product,
    productYaw: t >= 34e3 ? agv.yaw - Math.PI / 2 : 0,
    assembled: t >= 17850,
    robot: factoryRobot(wrist),
    jaw,
    press,
    pusherZ,
    agv,
    scanned: t >= 26300,
    scan: t >= 24700 && t < 26700,
    camera: path(CAMERA, t),
    target: t >= 34e3 && t < 42e3 ? [agv.position[0], 1.3, agv.position[2]] : path(TARGET, t)
  };
}
box(fixed, floor, [2, -0.18, 3], [66, 0.3, 49]).castShadow = false;
for (let x = -30; x <= 34; x += 4) box(fixed, dark, [x, -0.023, 3], [0.025, 0.012, 49]).castShadow = false;
for (let z = -20; z <= 26; z += 4) box(fixed, dark, [2, -0.023, z], [66, 0.012, 0.025]).castShadow = false;
box(fixed, wall, [1, 4.7, -12], [58, 9.4, 0.4]);
box(fixed, blue, [1, 1.2, -11.75], [58, 2.4, 0.1]);
for (let x = -26; x <= 28; x += 6) {
  box(fixed, steel, [x, 5, -11.4], [0.42, 10, 0.42]);
  box(fixed, dark, [x, 9.9, -2.3], [0.3, 0.4, 18.5]);
  box(fixed, dark, [x, 8.9, -2.3], [0.16, 0.16, 18.5]);
  for (let z = -10; z < 6; z += 3) beam(fixed, steel, [x, 8.9, z], [x, 9.9, z + 3], 0.1);
  box(fixed, lamp, [x, 9.65, -1], [0.18, 0.08, 10]);
  if (x < 28) {
    box(fixed, dark, [x + 3, 6.3, -11.72], [4.8, 3.2, 0.1]);
    box(fixed, windowGlass, [x + 3, 6.3, -11.65], [4.55, 2.95, 0.08]);
    box(fixed, white, [x + 3, 6.3, -11.56], [0.08, 3, 0.12]);
    box(fixed, white, [x + 3, 6.3, -11.56], [4.6, 0.08, 0.12]);
  }
}
for (const z of [4.2, 8.5]) box(fixed, yellow, [-2, 3e-3, z], [44, 0.016, 0.1]).castShadow = false;
for (const x of [17.7, 22.3]) box(fixed, yellow, [x, 3e-3, 12], [0.1, 0.016, 16]).castShadow = false;
for (let x = -20; x <= 14; x += 3) box(fixed, white, [x, 5e-3, 6.35], [1.1, 0.014, 0.07]).castShadow = false;
for (let x = -21; x <= -15; x += 0.65) {
  const stripe = box(fixed, yellow, [x, 7e-3, 2.8], [0.3, 0.016, 1.1]);
  stripe.rotation[1] = -0.5;
  stripe.castShadow = false;
}
const rollerMeshes = [];
function conveyor(x, z, length, turn = false) {
  const group = makeGroup();
  group.position = [x, 0, z];
  group.rotation[1] = turn ? Math.PI / 2 : 0;
  group.parent = fixed ? fixed.id : void 0;
  for (const side of [-1, 1]) {
    box(group, white, [0, 0.98, side * 0.92], [length + 0.2, 0.3, 0.16]);
    box(group, orange, [0, 1.14, side * 1.01], [length + 0.2, 0.035, 0.025]);
    for (let a = -length / 2 + 0.4; a < length / 2; a += 2.6) {
      box(group, dark, [a, 0.48, side * 0.78], [0.14, 0.95, 0.14]);
      box(group, rubber, [a, 0.05, side * 0.78], [0.35, 0.1, 0.35]);
    }
  }
  const count = Math.floor(length / 0.34);
  for (let i = 0; i < count; i++) {
    const a = -length / 2 + (i + 0.5) * length / count;
    const roller = tube(group, steel, [a, 1.06, 0], 0.14, 1.7);
    roller.rotation[0] = Math.PI / 2;
  }
  for (let a = -length / 2 + 1; a < length / 2; a += 2.4) {
    const driver = makeGroup();
    driver.position = [a, 1.06, 0];
    driver.parent = group ? group.id : void 0;
    const marker = box(driver, dark, [0, 0.14, 0], [0.025, 0.015, 1.65]);
    rollerMeshes.push(marker);
  }
  box(group, blue, [length / 2 - 0.6, 0.7, -1.12], [0.7, 0.38, 0.38]);
}
conveyor(-12.5, 0, 11);
conveyor(3.75, 0, 14.3);
conveyor(14.45, 0, 2.7);
conveyor(12, 3.1, 4.3, true);
box(fixed, dark, [12, 0.87, 0], [2.2, 0.3, 1.8]);
for (let x = 11.15; x < 13; x += 0.34) {
  const roller = tube(fixed, steel, [x, 1.06, 0], 0.14, 1.7);
  roller.rotation[0] = Math.PI / 2;
}
for (const x of [11.45, 12, 12.55]) box(fixed, rubber, [x, 1.17, 0.1], [0.16, 0.08, 2]);
box(fixed, white, [-3, 0.55, -1.75], [3.4, 1.1, 1.1]);
for (const x of [-4.3, -1.7]) {
  box(fixed, blue, [x, 2.65, -1.15], [0.42, 5.3, 0.6]);
  tube(fixed, steel, [x, 2.7, -0.7], 0.11, 4.5);
}
box(fixed, blue, [-3, 5.1, -0.25], [3.2, 0.6, 2.4]);
tube(fixed, dark, [-3, 4.95, 0], 0.35, 1.3);
const ram = makeGroup();
ram.parent = scene ? scene.id : void 0;
const piston = tube(ram, steel, [0, 0, 0], 0.18, 1);
box(ram, orange, [0, 0, 0], [1.6, 0.28, 1.25]);
tube(ram, dark, [0, -0.22, 0], 0.49, 0.18);
const pressCap = tube(ram, teal, [0, -0.36, 0], 0.46, 0.12);
box(fixed, dark, [-3, 0.75, 0], [2.2, 0.42, 1.7]);
function cabinet(x, z) {
  box(fixed, white, [x, 1.35, z], [1.2, 2.7, 0.8]);
  box(fixed, dark, [x, 1.9, z + 0.41], [0.8, 0.55, 0.03]);
  box(fixed, cyan, [x, 1.9, z + 0.435], [0.67, 0.38, 0.02]);
  for (let i = 0; i < 4; i++) box(fixed, steel, [x, 0.5 + i * 0.13, z + 0.42], [0.7, 0.035, 0.02]);
  tube(fixed, green, [x + 0.3, 2.95, z], 0.085, 0.2);
}
cabinet(-0.6, -2.5);
cabinet(6, -2.7);
cabinet(-10, -5.3);
for (let x = -9; x <= 0; x += 1.5) {
  box(fixed, yellow, [x, 1.25, -4.8], [0.08, 2.5, 0.08]);
  if (x < 0) {
    for (let h = 0.5; h <= 2.4; h += 0.38) box(fixed, dark, [x + 0.75, h, -4.8], [1.5, 0.018, 0.018]);
    for (let a = 0.25; a < 1.5; a += 0.25) box(fixed, dark, [x + a, 1.45, -4.8], [0.018, 1.95, 0.018]);
  }
}
tube(fixed, dark, [-5, 0.2, -3], 0.95, 0.4);
tube(fixed, orange, [-5, 0.8, -3], 0.55, 1);
const robotUpper = box(scene, orange, [0, 0, 0], [1, 1, 1]);
const robotLower = box(scene, orange, [0, 0, 0], [1, 1, 1]);
const robotJoints = Array.from({ length: 3 }, (_, i) => mesh(scene, sphere, joint, [0, 0, 0], [i === 1 ? 0.39 : 0.3, 0.34, 0.34]));
const gripper = makeGroup();
gripper.parent = scene ? scene.id : void 0;
box(gripper, steel, [0, 0, 0], [1.65, 0.2, 0.5]);
const fingers = [-1, 1].map((side) => {
  const finger = makeGroup();
  finger.parent = gripper ? gripper.id : void 0;
  box(finger, dark, [0, -0.33, 0], [0.13, 0.65, 0.4]);
  box(finger, rubber, [-side * 0.06, -0.59, 0], [0.16, 0.14, 0.45]);
  return finger;
});
for (const z of [-1.3, 2.3]) box(fixed, white, [4, 2.15, z], [0.22, 4.3, 0.25]);
box(fixed, white, [4, 4.15, 0.5], [0.65, 0.35, 4]);
box(fixed, dark, [4, 3.8, 0], [0.5, 0.3, 0.7]);
tube(fixed, steel, [4, 3.58, 0], 0.16, 0.15);
for (const z of [-1.06, 1.06]) box(fixed, cyan, [4, 2.4, z], [0.1, 2, 0.055]);
const scanMaterial = material("scanMaterial",{color:palette.cyan,unlit:true,opacity:0.16,side:"double"});
const scan = box(scene, scanMaterial, [4, 2.05, 0], [0.02, 1.85, 1.94]);
scan.castShadow = false;
const scanLamp = tube(scene, cyan, [4, 4.5, 1.1], 0.12, 0.25);
const passLamp = tube(scene, green, [4, 4.5, 1.1], 0.12, 0.25);
box(fixed, blue, [12, 0.7, -1.7], [1.8, 1.4, 0.7]);
const pusher = makeGroup();
pusher.parent = scene ? scene.id : void 0;
box(pusher, orange, [0, 0, 0], [1.5, 0.42, 0.13]);
const pushRod = tube(pusher, steel, [0, 0, -0.6], 0.09, 1.2);
pushRod.rotation[0] = Math.PI / 2;
function product(parent) {
  const g = makeGroup();
  g.parent = parent ? parent.id : void 0;
  box(g, dark, [0, 0, 0], [1.2, 0.2, 1.2]);
  box(g, steel, [0, 0.12, 0], [1.03, 0.05, 1.03]);
  tube(g, steel, [0, 0.32, 0], 0.44, 0.36);
  tube(g, dark, [0, 0.51, 0], 0.35, 0.018);
  for (const x of [-0.43, 0.43]) for (const z of [-0.43, 0.43]) tube(g, joint, [x, 0.17, z], 0.045, 0.05);
  const cap = makeGroup();
  cap.parent = g.id;
  cap.position = [0, 0.55, 0];
  tube(cap, teal, [0, 0, 0], 0.46, 0.1);
  tube(cap, steel, [0, 0.08, 0], 0.12, 0.1);
  return { group: g, cap };
}
const hero = product(scene);
const queue = Array.from({ length: 2 }, () => product(scene));
queue.forEach((p) => {
  p.cap.visible = false;
});
const agv = makeGroup();
agv.parent = scene ? scene.id : void 0;
box(agv, white, [0, 0.48, 0], [2.1, 0.65, 2.65]);
box(agv, blue, [0, 0.84, 0], [1.9, 0.1, 2.4]);
box(agv, orange, [0, 0.28, 1.34], [1.7, 0.12, 0.05]);
box(agv, cyan, [0, 0.65, 1.35], [1.7, 0.04, 0.035]);
tube(agv, dark, [0, 0.87, 1.28], 0.14, 0.12);
for (let x = -0.75; x <= 0.76; x += 0.3) {
  const r = tube(agv, steel, [x, 1.06, 0], 0.14, 2.25);
  r.rotation[0] = Math.PI / 2;
}
const wheels = [];
for (const x of [-1.03, 1.03]) for (const z of [-0.8, 0.8]) {
  const wheel = tube(agv, rubber, [x, 0.28, z], 0.28, 0.18);
  wheel.rotation[2] = Math.PI / 2;
  wheels.push(wheel);
  const hub = tube(agv, steel, [x * 1.08, 0.28, z], 0.12, 0.04);
  hub.rotation[2] = Math.PI / 2;
}
function pallet(x, y, z, width = 1.7) {
  for (let i = -2; i <= 2; i++) box(fixed, wood, [x + i * width / 5, y + 0.18, z], [width / 6, 0.12, 1.5]);
  for (const a of [-0.55, 0.55]) box(fixed, wood, [x, y + 0.08, z + a], [width, 0.16, 0.18]);
}
for (let x = -20; x < -11; x += 3) {
  pallet(x, 0, -5.5);
  for (let y = 0; y < 3; y++) box(fixed, blue, [x, 0.6 + y * 0.65, -5.5], [1.5, 0.58, 1.35]);
}
for (const center of [8, 16, 24]) {
  for (const x of [center - 2.7, center + 2.7]) for (const z of [-10, -7.8]) box(fixed, blue, [x, 3.5, z], [0.18, 7, 0.18]);
  for (const y of [0.35, 2.55, 4.75]) {
    box(fixed, orange, [center, y, -8.9], [5.6, 0.16, 2.5]);
    for (const dx of [-1.6, 0, 1.6]) {
      pallet(center + dx, y + 0.1, -8.9, 1.4);
      box(fixed, wood, [center + dx, y + 1.05, -8.9], [1.2, 1.35, 1.4]);
      box(fixed, white, [center + dx, y + 1.05, -8.18], [0.05, 1.35, 0.015]);
    }
  }
}
for (const x of [17, 23]) {
  box(fixed, yellow, [x, 0.5, 16], [0.15, 1, 0.15]);
  pallet(x, 0, 18);
  box(fixed, wood, [x, 1, 18], [1.5, 1.5, 1.35]);
}

// 机台旁的防滑钢板和嵌入式指示灯，使用同一材质资源定义。
for(const x of [-3,4,12]){
  box(fixed,tread,[x,0.025,2.7],[2.5,0.045,1.25]).castShadow=false;
  box(fixed,cyan,[x,0.06,2.04],[2.2,0.025,0.025]).castShadow=false;
}
// 冷色工作灯和暖色机器人工作区。
node("robotFill",{kind:"light",light:"point",color:"#ffb178",position:[-6,4,2.5],intensity:16,distance:9,castShadow:false});
node("inspectionFill",{kind:"light",light:"point",color:"#49baff",position:[4,3.5,0.5],intensity:12,distance:7,castShadow:false});

FACTORY_SHOTS.forEach((s,i)=>shot("station"+i,s.title,s.duration,s.text));
animate(function(t){
 const f=factoryFrame(t),out={camera:{position:f.camera,target:f.target}};
 const put=(n,props)=>out[n.id]=props;
 put(hero.group,{position:f.product,rotation:[0,f.productYaw,0]}); put(hero.cap,{visible:f.assembled});
 queue.forEach((p,i)=>put(p.group,{position:[-16-i*2+Math.min(1,t/6000)*2,1.3,0]}));
 put(robotUpper,linkPose(f.robot.shoulder,f.robot.elbow,0.48,0.65));put(robotLower,linkPose(f.robot.elbow,f.robot.wrist,0.36,0.45));
 [f.robot.shoulder,f.robot.elbow,f.robot.wrist].forEach((pos,i)=>put(robotJoints[i],{position:pos}));
 put(gripper,{position:f.robot.wrist});fingers.forEach((finger,i)=>put(finger,{position:[(i?1:-1)*f.jaw,0,0]}));
 const ramY=3.75-f.press*1.54,pistonLength=4.6-ramY;
 put(ram,{position:[-3,ramY,0]});put(pressCap,{visible:!f.assembled});put(piston,{position:[0,pistonLength/2,0],scale:[0.18,pistonLength,0.18]});
 put(pusher,{position:[12,1.6,f.pusherZ]});put(scan,{visible:f.scan});put(scanLamp,{visible:!f.scanned});put(passLamp,{visible:f.scanned});
 put(agv,{position:f.agv.position,rotation:[0,f.agv.yaw,0]});
 wheels.forEach(w=>put(w,{rotation:[0,t/200,Math.PI/2]}));rollerMeshes.forEach(m=>out[m.parent]={rotation:[0,0,t/200]});
 return out;
});
