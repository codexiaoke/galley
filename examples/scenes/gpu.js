// Blender 建模测试。正文只引用 GLB 资产；所有零件和拆解轨迹都在模型内。
world({ background: "#0a1321", environment: "studio", environmentIntensity: 0.55,
  exposure: 1, bloom: { strength: 0.08, threshold: 2, radius: 0.25 } });
material("stageMat", { color: "#142638", metalness: 0.45, roughness: 0.35 });
material("edgeMat", { color: "#285667", metalness: 0.7, roughness: 0.3 });
geometry("platform", { kind: "box", size: [9, 0.25, 5], bevel: 0.1 });
geometry("ground", { kind: "plane", width: 100, height: 100 });
node("platform", { kind: "mesh", geometry: "platform", material: "edgeMat", position: [0, -0.16, 0] });
node("ground", { kind: "mesh", geometry: "ground", material: "stageMat", rotation: [-Math.PI / 2, 0, 0], position: [0, -0.3, 0] });
node("gpu", { kind: "model", src: "__GPU_MODEL__", animation: "GPU_Explode" });
node("camera", { kind: "camera", position: [8, 7.5, 10], target: [0, 0.8, 0], fov: 42 });
node("sky", { kind: "light", light: "hemisphere", color: "#b4d4e9", ground: "#17202a", intensity: 0.65, castShadow: false });
node("key", { kind: "light", light: "directional", color: "#d1e9ff", intensity: 2.6, position: [1, 10, 7], target: [0, 1, 0], shadowSpan: 7 });
node("rim", { kind: "light", light: "directional", color: "#ffbf84", intensity: 1.3, position: [-7, 5, -5], castShadow: false });
node("fill", { kind: "light", light: "directional", color: "#65b5e9", intensity: 1.1, position: [6, 4, -4], castShadow: false });
shot("assembled", "完整 GPU 模型", 6000);
shot("detail", "曲面与材质近景", 5000);
shot("explode", "外壳与散热组件分离", 6000);
shot("inside", "芯片与电路板", 4000);
shot("reassemble", "重新装配", 6000);
track("gpu", "animationTime", [[0, 0], [6000, 1000], [11000, 1500], [17000, 3500], [21000, 5500], [27000, 7990]]);
track("camera", "position", [[0, [8, 7.5, 10]], [6000, [3.5, 5.5, 8]], [11000, [-3.5, 5, 7.5]],
  [17000, [8, 7.5, 11]], [21000, [7, 7.8, 10]], [27000, [8, 7.5, 10]]], "smooth");
track("camera", "target", [[0, [0, 0.8, 0]], [11000, [0, 0.9, 0]], [17000, [0, 2.5, 0]], [21000, [0, 2.2, 0]], [27000, [0, 0.8, 0]]], "smooth");
