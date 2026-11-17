// 数据的四个空间由作者定义；播放器不内置矩阵、切片或计算区。
world({background:"#152234",exposure:1.2});
geometry("cell",{kind:"box",size:[0.65,0.65,0.65]});
geometry("platform",{kind:"box",size:[8,0.2,7]});
material("floor",{color:"#293c53",metalness:0.3});
for(let z=0;z<4;z++)material("layer"+z,{color:["#91b4e2","#40cfff","#7bd6bb","#e4b47b"][z],metalness:0.4,roughness:0.3});
for(let i=0;i<4;i++)node("stage"+i,{kind:"mesh",geometry:"platform",material:"floor",position:[i*12,-2.5,0]});
node("camera",{kind:"camera",position:[8,7,11],target:[0,0,0]});
node("key",{kind:"light",light:"directional",position:[15,20,10],intensity:3});
["矩阵","堆叠","分层","选择切片","逐列聚合","计算结果","全景"].forEach((title,i)=>shot("phase"+i,title,5000));
for(let z=0;z<4;z++)for(let y=0;y<4;y++)for(let x=0;x<6;x++){
 const id="cell"+z+"_"+y+"_"+x,base=[x-2.5,y-1.5,z-1.5];
 node(id,{kind:"mesh",geometry:"cell",material:"layer"+z,position:base});
 track(id,"scale",[[0,z===0?[1,1,0.1]:[0,0,0]],[5000,z===0?[1,1,0.1]:[0,0,0]],[9000,[1,1,1]],[22000,[1,1,1]],[25000,z===1?[0,0,0]:[1,1,1]]],"smooth");
 if(z===1)track(id,"position",[[0,base],[15000,base],[19000,[x+9.5,y-1.5,0]],[21000,[x+9.5,y-1.5,0]],[25000,[x+21.5,0,0]]],"smooth");
}
for(let x=0;x<6;x++){
 const height=(34+x)/10,id="result"+x;
 node(id,{kind:"mesh",geometry:"cell",material:"layer1",position:[x+33.5,-2.3+height/2,0],scale:[1,height/0.65,1]});
 track(id,"visible",[[0,false],[25000,true]],"step");
}
track("camera","position",[[0,[8,7,11]],[15000,[8,7,11]],[20000,[19,6,10]],[25000,[31,6,10]],[30000,[43,6,10]],[35000,[25,22,36]]],"smooth");
track("camera","target",[[0,[0,0,0]],[15000,[0,0,0]],[20000,[12,0,0]],[25000,[24,0,0]],[30000,[36,0,0]],[35000,[18,0,0]]],"smooth");
