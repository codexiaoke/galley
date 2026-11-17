// 从矩阵到张量：整个例子属于可保存、可替换的文章内容。
world({background:"#162337",exposure:1.2});
geometry("cell",{kind:"box",size:[0.8,0.8,0.8]});
for(let z=0;z<3;z++) material("layer"+z,{color:["#79b5ff","#42ddc5","#ffb16b"][z],metalness:0.3,roughness:0.3});
node("tensor",{kind:"group"});
node("camera",{kind:"camera",position:[8,6,10],target:[0,0,0]});
node("key",{kind:"light",light:"directional",position:[4,8,5],intensity:3});
["平面矩阵","堆叠为张量","旋转观察","抽出切片","放回整体"].forEach((title,i)=>shot("phase"+i,title,5000));
for(let z=0;z<3;z++)for(let y=0;y<3;y++)for(let x=0;x<4;x++){
 const id="cell"+z+"_"+y+"_"+x,position=[x-1.5,y-1,z-1];
 node(id,{kind:"mesh",parent:"tensor",geometry:"cell",material:"layer"+z,position});
 track(id,"scale",[[0,z===0?[1,1,0.1]:[0,0,0]],[5000,z===0?[1,1,0.1]:[0,0,0]],[9000,[1,1,1]]],"smooth");
 if(z===1)track(id,"position",[[0,position],[15000,position],[18500,[x+3.5,y-1,z-1]],[22000,[x+3.5,y-1,z-1]],[25000,position]],"smooth");
}
track("tensor","rotation",[[0,[0,0,0]],[10000,[0,0,0]],[15000,[0,0.9,0]],[25000,[0,0.9,0]]],"smooth");
