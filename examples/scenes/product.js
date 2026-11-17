// 同一播放器的第二份内容：三维产品拆解。模型占位地址由初始化脚本替换为媒体库实际地址。
world({background:"#101b2d",environment:"studio",environmentIntensity:1.1,exposure:1.2,bloom:{strength:0.18,threshold:1.2,radius:0.3}});
geometry("base",{kind:"cylinder",top:3.2,bottom:3.3,height:0.2,segments:64});
geometry("ring",{kind:"torus",radius:1.55,tube:0.07,segments:64});
geometry("bolt",{kind:"cylinder",top:0.08,bottom:0.08,height:0.7,segments:16});
material("platform",{color:"#182739",map:"__TEXTURE__",repeat:[8,8],metalness:0.7,roughness:0.3});
material("accent",{color:"#49cfff",emissive:"#49cfff",emissiveIntensity:2,metalness:0.5,roughness:0.2});
material("metal",{color:"#d0dfeb",metalness:0.9,roughness:0.23});
node("stage",{kind:"mesh",geometry:"base",material:"platform",position:[0,-0.5,0]});
node("assembly",{kind:"group"});
node("housing",{kind:"model",src:"__MODEL__",parent:"assembly",position:[0,0.6,0]});
node("seal",{kind:"mesh",geometry:"ring",material:"accent",parent:"assembly",position:[0,1.3,0],rotation:[Math.PI/2,0,0]});
node("cover",{kind:"model",src:"__MODEL__",parent:"assembly",position:[0,1.55,0],scale:[0.9,0.22,0.9]});
for(let i=0;i<6;i++) {
 const a=i*Math.PI/3,x=1.15*Math.cos(a),z=1.15*Math.sin(a);
 node("bolt"+i,{kind:"mesh",geometry:"bolt",material:"metal",parent:"assembly",position:[x,1.9,z]});
 track("bolt"+i,"position",[[0,[x,1.9,z]],[2500,[x,1.9,z]],[6500,[x,4.1,z]],[9000,[x,4.1,z]],[12000,[x,1.9,z]]],"smooth");
}
node("camera",{kind:"camera",position:[7,5,8],target:[0,1.5,0],fov:40});
node("key",{kind:"light",light:"directional",color:"#b6dcff",position:[4,8,6],intensity:4,shadowSpan:6});
node("rim",{kind:"light",light:"directional",color:"#ff9a51",position:[-6,4,-3],intensity:3,castShadow:false});
shot("closed","完整产品",2500,"展示金属壳体与密封结构。");
shot("exploded","结构拆解",6500,"上盖、密封圈和螺栓沿装配轴分离。");
shot("assembled","重新装配",3000,"零件回到各自的装配位置。");
track("cover","position",[[0,[0,1.55,0]],[2500,[0,1.55,0]],[6500,[0,3.4,0]],[9000,[0,3.4,0]],[12000,[0,1.55,0]]],"smooth");
track("seal","position",[[0,[0,1.3,0]],[2500,[0,1.3,0]],[6500,[0,2.6,0]],[9000,[0,2.6,0]],[12000,[0,1.3,0]]],"smooth");
track("camera","position",[[0,[7,5,8]],[6500,[-6,5,8]],[12000,[7,5,8]]],"smooth");
track("camera","target",[[0,[0,1.5,0]],[6500,[0,1.8,0]],[12000,[0,1.5,0]]],"smooth");
