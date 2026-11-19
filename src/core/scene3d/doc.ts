export const SCENE3D_API_DOC = `
### 三维场景作者接口
在 :::scene3d{title="场景名称"} 中只放一个 js 代码块。新增或修改场景只需保存文章正文，不改播放器、不重新构建。以这个组件作为唯一演示内容时，演示页只有全屏三维画面；辅助文字可以放进 :::article。与普通章节混排时，三维场景自动独占全屏演示页，前后章节保持 PPT 排版，按同一时间线推近进入、拉远返回；无需额外的全屏标记。

脚本在服务端 QuickJS 沙箱运行，无网络、DOM、文件和 Node API。返回的数据与轨迹经校验后交给播放器；不要 import Three.js，也不在浏览器执行作者代码。

- world({background:"#162334",environment:"studio",environmentIntensity:0.6,exposure:1,fog:{color:"#162334",near:30,far:150},bloom:{strength:0.25,threshold:1,radius:0.4}})。environment 可为 none；fog、bloom 可省略。
- geometry(id,{kind:"box",size:[1,1,1],bevel:0.03})（bevel 可省略，倒角不能超过最短边的一半）；还支持 sphere(radius,segments)、cylinder(top,bottom,height,segments)、plane(width,height)、torus(radius,tube,segments)、tube(points,radius,segments)。
- material(id,{color:"#aabbcc",metalness:0.8,roughness:0.25,emissive:"#33aaff",emissiveIntensity:0.5,opacity:1,side:"front",unlit:false})。贴图字段 map、normalMap、roughnessMap、metalnessMap 引用 /media/ 图片；repeat:[1,1] 控制平铺次数，normalScale:[1,1] 控制法线凹凸强度（可减至 0.1 避免过重）。clearcoat:0.5、clearcoatRoughness:0.15 表示喷漆外层的透明涂层；anisotropy:0.6、anisotropyRotation:0 表示拉丝金属的方向性反光。map 按 sRGB 读取，其余贴图按线性数据读取。颜色必须 #RRGGBB。
- node(id,{kind:"group"}) 创建组；其他节点可 parent:"组编号"。position、rotation、scale 为三元数组，旋转单位弧度，quaternion 为 [x,y,z,w]。visible、castShadow、receiveShadow 可设置。
- node(id,{kind:"mesh",geometry:"几何编号",material:"材质编号"})。
- node(id,{kind:"model",src:"/media/模型.glb",animation:"片段名称"})。在后台媒体库或 upload_model 上传自包含 GLB，最大 10 MB。支持 GLB 自带材质、内嵌贴图和动画；animation 可省略。外部资源、Draco/KTX2 压缩资源暂不支持。资源地址必须完整写在代码中，不能拼接，否则无法追踪引用。
- node("camera",{kind:"camera",position:[6,4,8],target:[0,1,0],fov:45})，有且只有一台相机。
- node(id,{kind:"light",light:"hemisphere",color:"#ffffff",ground:"#223344",intensity:2})。light 还可 directional、point；定向光支持 target、shadowSpan；点光支持 distance。
- shot("稳定编号","镜头名",4000,"画面说明") 定义时间轴。时间单位毫秒；镜头名、说明供工坊编辑，不叠加在画面上。讲稿仍在工坊撰写。
- track("物体编号","position",[[0,[0,0,0]],[4000,[4,0,0]]],"smooth")；插值 linear、smooth、step。属性包括 position、rotation、quaternion、scale、visible；相机 target；模型 animationTime（GLB 片段的毫秒位置）；材质 emissiveIntensity。
- animate(function(t){return {物体编号:{position:[Math.sin(t/1000),0,0]}}}) 用纯时间函数写复杂联动，沙箱按 30fps 编译轨迹；只返回要变化的属性，每个属性只能有一条轨迹。关键帧适合简单运动，时间函数适合计算运动。

编号使用英文字母开头，随后字母数字、下划线或短横线，最多 48 字符。上限：180 秒、32 镜头、4000 节点、256 几何体、128 材质、256 轨迹。动画不依赖累计运行状态，因此预览、后退和逐帧导出一致。
保存前会检查语法、编号引用、父子循环、时间轴、资源存在性。
`;
