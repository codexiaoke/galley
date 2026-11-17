/** 作者函数只在 QuickJS 中执行；输出为可验证、可序列化的场景和轨迹。 */
export const SCENE3D_PRELUDE = String.raw`
"use strict";
var __world = {}, __geometries = [], __materials = [], __nodes = [], __shots = [], __tracks = [], __animations = [];
function world(options) { __world = options; }
function geometry(id, options) { var item = Object.assign({}, options, { id: id }); __geometries.push(item); return id; }
function material(id, options) { var item = Object.assign({}, options, { id: id }); __materials.push(item); return id; }
function node(id, options) {
  var item = Object.assign({ position: [0,0,0], rotation: [0,0,0], scale: [1,1,1] }, options, { id: id });
  if (item.parent && typeof item.parent === "object") item.parent = item.parent.id;
  __nodes.push(item); return item;
}
function shot(id, title, duration, text) { __shots.push({ id: id, title: title, duration: duration, text: text || "" }); }
function track(target, property, keys, interpolation) {
  __tracks.push({ target: typeof target === "string" ? target : target.id, property: property, times: keys.map(function(k){return k[0];}), values: keys.map(function(k){return k[1];}), interpolation: interpolation || "linear" });
}
function animate(fn) { if (typeof fn !== "function") throw Error("animate 需要一个时间函数"); __animations.push(fn); }
function __finish3d() {
  var duration = __shots.reduce(function(sum,s){return sum+s.duration;},0);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 180000) throw Error("先用 shot 定义有效的时间轴，最长 180 秒。");
  var sampled = {}, count = Math.ceil(duration*30/1000);
  for (var i=0;i<=count;i++) {
    var t = Math.min(duration,i*1000/30);
    for (var fn of __animations) {
      var changes = fn(t);
      for (var id of Object.keys(changes)) for(var prop of Object.keys(changes[id])) {
        var key=id+"."+prop;
        if(!sampled[key]) sampled[key]={target:id,property:prop,times:[],values:[],interpolation:prop==="visible"?"step":"linear"};
        sampled[key].times.push(t); sampled[key].values.push(Array.isArray(changes[id][prop]) ? changes[id][prop].slice() : changes[id][prop]);
      }
    }
  }
  for(var key of Object.keys(sampled)) __tracks.push(sampled[key]);
  return JSON.stringify({world:__world,geometries:__geometries,materials:__materials,nodes:__nodes,shots:__shots,tracks:__tracks});
}
`;
