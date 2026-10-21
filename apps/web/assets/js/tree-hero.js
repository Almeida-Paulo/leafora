// Leafora hero: the approved 04 Glifos tree, isolated from the hero laboratory.
// Fixed art direction. Opacity is composed by CSS on the artwork canvases (65%).
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
document.querySelectorAll('[data-leafora-tree]').forEach(mountTreeHero);

function mountTreeHero(scene) {
 const canvas=scene.querySelector('[data-tree-canvas]');
 const rainCanvas=scene.querySelector('[data-rain-canvas]');
 const hero=scene.closest('.hero');
 const ctx=canvas?.getContext('2d');
 const rainCtx=rainCanvas?.getContext('2d');
 if(!ctx||!rainCtx||!hero)return;
 const style=getComputedStyle(scene);
 const colors={
  ink:style.getPropertyValue('--brand-ink').trim()||'#1a1a1a',
  gray:style.getPropertyValue('--brand-gray').trim()||'#6d6d6d',
  paper:style.getPropertyValue('--paper').trim()||'#ffffff'
 };
 // Resolve the palette once, including any CSS color syntax, for raster pixels.
 const paletteCanvas=document.createElement('canvas');paletteCanvas.width=1;paletteCanvas.height=1;
 const paletteContext=paletteCanvas.getContext('2d',{willReadFrequently:true});
 paletteContext.fillStyle=colors.ink;paletteContext.fillRect(0,0,1,1);
 const INK=Array.from(paletteContext.getImageData(0,0,1,1).data).slice(0,3);
 const W=1000,H=800,windNow=.50,gust=0,rainSpeed=.38;
 let time=0,rainTime=0,frame=0,lastFrame=0,lastDraw=0,visible=false,pageActive=true;
 let rainWidth=0,rainHeight=0,rainDpr=1,copyBounds={left:0,right:0,top:0,bottom:0};
 const bayer=[0,32,8,40,2,34,10,42,48,16,56,24,50,18,58,26,12,44,4,36,14,46,6,38,60,28,52,20,62,30,54,22,3,35,11,43,1,33,9,41,51,19,59,27,49,17,57,25,15,47,7,39,13,45,5,37,63,31,55,23,61,29,53,21];
 // This is the laboratory RNG state immediately before its approved ground.
 // It reproduces the exact marks without constructing the other four styles.
 let seed=2428876510;
 function rnd(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
 const range=(a,b)=>a+(b-a)*rnd();
 const ground=[];
 for(let i=0;i<1100;i++){const u=rnd(),x=500+(rnd()+rnd()+rnd()-1.5)*183,y=708+range(-8,19);ground.push({x,y,r:range(.5,1.4),shade:Math.round(180+u*68)});}
 for(let i=0;i<62;i++)ground.push({x:range(305,730),y:range(711,731),r:range(1.4,3),shade:range(70,190)});
 const rootPath=new Path2D('M498 666 C501 693 490 714 458 731 Q487 729 513 719 Q533 728 552 724 Q574 733 599 724 Q624 730 653 733 C624 717 609 699 602 666 Z');
 const rootHit=document.createElement('canvas').getContext('2d');
 function smoothstep(a,b,v){const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);}
 let groundLayer=null;
 function drawGround(){
  if(!groundLayer){
   const source=document.createElement('canvas');source.width=560;source.height=448;
   const sourceContext=source.getContext('2d',{alpha:false,willReadFrequently:true});
   sourceContext.fillStyle='#fff';sourceContext.fillRect(0,0,560,448);
   sourceContext.scale(560/W,448/H);
   for(const g of ground){
    sourceContext.fillStyle='rgb('+[g.shade,g.shade,g.shade].join(',')+')';
    sourceContext.fillRect(g.x+58,g.y+8,g.r*1.8,g.r*.7);
   }
   groundLayer=document.createElement('canvas');groundLayer.width=560;groundLayer.height=448;
   const groundContext=groundLayer.getContext('2d');
   const pixels=groundContext.createImageData(560,448),data=sourceContext.getImageData(0,0,560,448).data;
   for(let y=Math.floor(706*.56);y<Math.ceil(742*.56);y++)for(let x=0;x<560;x++){
    const i=(y*560+x)*4,threshold=(bayer[(y&7)*8+(x&7)]+.5)/64;
    if(data[i]/255>=threshold)continue;
    pixels.data[i]=INK[0];pixels.data[i+1]=INK[1];pixels.data[i+2]=INK[2];pixels.data[i+3]=255;
   }
   groundContext.putImageData(pixels,0,0);
  }
  ctx.save();ctx.globalAlpha=1;ctx.imageSmoothingEnabled=false;
  ctx.drawImage(groundLayer,0,0,W,H);ctx.restore();
 }
// The approved 04 Glifos geometry. Every glyph belongs to a branch,
// so it travels with the tree instead of being resampled onto a fixed screen grid.
const glyphCharacters=['0','1','X','x','>','$','s','S','-','.','/'];
function glyphHash(col,row,salt){
 let h=Math.imul(col|0,374761393)^Math.imul(row|0,668265263)^Math.imul(999+salt*7919,982451653);
 h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;h=Math.imul(h,2246822519);h^=h>>>13;
 return (h>>>0)/4294967296;
}
const glyphBones=[{parent:-1,x:558,y:712,width:116,depth:0,angle:0}];
function glyphBranch(parent,x,y,width,depth){
 const p=glyphBones[parent],dx=x-p.x,dy=y-p.y;
 glyphBones.push({parent,x,y,width,depth,length:Math.hypot(dx,dy),angle:Math.atan2(dx,-dy)});
 return glyphBones.length-1;
}

// An attachment may sit along its parent's trunk segment, not only at its tip.
function glyphOrigin(bone,positions){
 const parent=glyphBones[bone.parent],end=positions[bone.parent];
 if(bone.attachment===undefined)return end;
 const start=positions[parent.parent],u=bone.attachment;
 const baseWidth=glyphBones[parent.parent].width;
 return {x:start.x+(end.x-start.x)*u,y:start.y+(end.y-start.y)*u,
  width:baseWidth+(parent.width-baseWidth)*u,turn:end.turn||0};
}
function prepareGlyphPaths(){
 for(let i=1;i<glyphBones.length;i++){
  const b=glyphBones[i],p=glyphOrigin(b,glyphBones),dx=b.x-p.x,dy=b.y-p.y;
  b.length=Math.hypot(dx,dy);b.angle=Math.atan2(dx,-dy);
  const steps=b.curve?24:1;b.path=[];
  for(let j=0;j<=steps;j++){
   const t=j/steps,a=1-t;
   const x=b.curve?a*a*a*p.x+3*a*a*t*b.curve[0]+3*a*t*t*b.curve[2]+t*t*t*b.x:p.x+dx*t;
   const y=b.curve?a*a*a*p.y+3*a*a*t*b.curve[1]+3*a*t*t*b.curve[3]+t*t*t*b.y:p.y+dy*t;
   b.path.push({x,y,width:p.width+(b.width-p.width)*t});
  }
 }
}

// Mature-tree proportions: a broad tapered trunk carries three unequal limbs.
// The leading stem continues into the crown instead of ending at a symmetric Y.
const gt1=glyphBranch(0,542,620,88,0),gt2=glyphBranch(gt1,548,475,74,0),gt3=glyphBranch(gt2,505,377,56,0);
const gt4=glyphBranch(gt3,492,306,39,1),gt5=glyphBranch(gt4,510,246,26,2),gt6=glyphBranch(gt5,455,184,15,3),gt7=glyphBranch(gt6,463,134,7,4);
const gl1=glyphBranch(gt2,436,457,56,1),gl2=glyphBranch(gl1,348,432,38,2),gl3=glyphBranch(gl2,284,402,25,3),gl4=glyphBranch(gl3,218,376,15,4),gl5=glyphBranch(gl4,152,338,7,5);
const gll1=glyphBranch(gl2,273,473,26,3),gll2=glyphBranch(gll1,203,461,16,4),gll3=glyphBranch(gll2,133,445,7,5);
const glu1=glyphBranch(gt3,419,327,34,1),glu2=glyphBranch(glu1,377,270,24,2),glu3=glyphBranch(glu2,315,232,15,3),glu4=glyphBranch(glu3,255,204,7,4);
const glm1=glyphBranch(glu2,392,217,15,3),glm2=glyphBranch(glm1,352,161,7,4);
const gr1=glyphBranch(gt2,612,431,54,1),gr2=glyphBranch(gr1,680,372,38,2),gr3=glyphBranch(gr2,720,314,25,3),gr4=glyphBranch(gr3,785,282,14,4),gr5=glyphBranch(gr4,824,240,7,5);
const grl1=glyphBranch(gr2,742,421,26,3),grl2=glyphBranch(grl1,802,397,15,4),grl3=glyphBranch(grl2,850,418,7,5);
const gru1=glyphBranch(gt4,564,283,30,2),gru2=glyphBranch(gru1,600,230,21,3),gru3=glyphBranch(gru2,653,190,13,4),gru4=glyphBranch(gru3,684,150,7,5);
const grm1=glyphBranch(gru2,551,180,13,4),grm2=glyphBranch(grm1,558,125,6,5);
const gmid1=glyphBranch(gr1,584,368,23,2),gmid2=glyphBranch(gmid1,631,320,11,3);
// Two smaller offshoots break up the lower-left bough without filling its opening.
const glRise1=glyphBranch(gl2,329,385,14,3),glRise2=glyphBranch(glRise1,294,368,5,4);
const glDrop1=glyphBranch(gll1,240,506,12,4),glDrop2=glyphBranch(glDrop1,189,524,5,5);
// The left bough now leaves the trunk about 61 units below the main fork.
// Its upward arch shares a tangent with the next section; the trunk attachment stays put.
glyphBones[gl1].attachment=.58;
glyphBones[gl1].curve=[529,482,469,457.8];
glyphBones[gl2].curve=[403,456.2,375,438];
prepareGlyphPaths();
const glyphCrowns=[];
function glyphCrown(bone,dx,dy,rx,ry,angle=0){
 const b=glyphBones[bone];glyphCrowns.push({bone,x:b.x+dx,y:b.y+dy,rx,ry,angle});
}
// Broad overlapping shoulders form one substantial crown, with a higher left
// shoulder and an extended right bough. Narrow openings still reveal its structure.
[
 [gl5,1,-10,72,58,-.2],[gl4,4,-27,81,56,-.3],[gl3,0,-12,72,53,-.3],
 [gll3,4,-12,53,45,.15],[gll2,7,-4,67,50,.2],[gll1,-5,4,61,48,-.2],
 [glu4,0,-9,82,72,-.3],[glu3,10,-17,91,70,-.25],[glm2,3,-8,87,82,-.1],
 [glm1,9,-9,87,72,-.2],[glu2,2,4,72,64,.35],
 [gt7,-6,-1,88,79,-.15],[gt6,3,-7,91,67,.15],[gt5,-1,-4,76,61,-.2],
 [grm2,-3,-7,81,75,.15],[grm1,-1,-7,86,64,.1],
 [gru4,2,-5,84,64,.2],[gru3,-4,1,88,68,.1],[gru2,9,-2,78,66,.25],
 [gr5,-7,-9,68,59,-.2],[gr4,-9,-17,85,65,-.2],[gr3,2,-1,78,68,-.25],
 [grl3,0,-20,74,63,.10],[grl2,1,-15,83,68,-.2],[grl1,2,-2,69,51,.1],
 [gmid2,1,-6,65,50,-.1],
 [glu1,-13,-12,53,34,-.5],[gru1,12,-5,62,45,.2],
 [gl2,-10,-6,54,33,.2],[gr2,20,-2,67,47,-.2],
 [glRise2,-3,-3,25,19,-.4],[glDrop2,1,-4,34,23,.1]
].forEach(args=>glyphCrown(...args));
// Only Glifos receives these left-side leaf groups. Keep the base crown list
// unchanged: Dither 2 and the original falling-leaf emitters also read it.
const glyphRenderCrowns=glyphCrowns.concat([
 [glu4,207,267,89,72,-.23],
 [glRise2,277,310,91,74,-.18],
 [glu1,343,325,70,58,-.28]
].map(([bone,x,y,rx,ry,angle])=>({bone,x,y,rx,ry,angle})));
let glyphMesh=[],glyphPitch=0;
function glyphPose(t){
 const force=windNow*2.8+gust*.40,posed=[{x:558,y:712,turn:0}];
 for(let i=1;i<glyphBones.length;i++){
  const bone=glyphBones[i],p=glyphOrigin(bone,posed);
  const flex=bone.depth===0?.0028:.012+bone.depth*.004;
  const breeze=Math.sin(t*1.05-bone.depth*.33)+.32*Math.sin(t*1.81+glyphHash(i,0,11)*2);
  const turn=p.turn+(breeze+.24)*flex*force;
  const angle=bone.angle+turn;
  posed.push({x:p.x+Math.sin(angle)*bone.length,y:p.y-Math.cos(angle)*bone.length,turn});
 }
 return posed;
}
function glyphAttach(x,y,bone,posed){
 const rest=glyphBones[bone],p=posed[bone],dx=x-rest.x,dy=y-rest.y,co=Math.cos(p.turn),si=Math.sin(p.turn);
 return {x:p.x+dx*co-dy*si,y:p.y+dx*si+dy*co};
}
function buildGlyphMesh(pitch){
 glyphPitch=pitch;glyphMesh=[];
 for(let row=Math.floor(25/pitch);row<Math.ceil(738/pitch);row++)for(let col=Math.floor(65/pitch);col<Math.ceil(940/pitch);col++){
  const x=(col+.5)*pitch,y=(row+.5)*pitch;
  let crown=null,inside=0;
  for(let k=0;k<glyphRenderCrowns.length;k++){
   const c=glyphRenderCrowns[k],dx=x-c.x,dy=y-c.y,co=Math.cos(c.angle),si=Math.sin(c.angle);
   const nx=(dx*co+dy*si)/c.rx,ny=(-dx*si+dy*co)/c.ry,angle=Math.atan2(ny,nx);
   const rim=1+.12*Math.sin(angle*3+k*1.7)+.07*Math.sin(angle*7-k);
   const fill=1-Math.hypot(nx,ny)/rim;
   if(fill>inside){inside=fill;crown=c;}
  }
  let limb=null,limbDistance=Infinity,limbWidth=0;
  for(let i=1;i<glyphBones.length;i++){
   const b=glyphBones[i];
   // Sample the actual curved wood, rather than the chord between endpoints.
   for(let j=1;j<b.path.length;j++){
    const a=b.path[j-1],z=b.path[j],vx=z.x-a.x,vy=z.y-a.y;
    const u=Math.max(0,Math.min(1,((x-a.x)*vx+(y-a.y)*vy)/(vx*vx+vy*vy)));
    const distance=Math.hypot(x-a.x-vx*u,y-a.y-vy*u),width=a.width+(z.width-a.width)*u;
    if(distance<width*.48+pitch*.18&&distance/width<limbDistance){limb=i;limbDistance=distance/width;limbWidth=width;}
   }
  }
  const root=y>=666;
  if(root){
   // Sample the cell's upper edge near the soil as well as its center.
   // This preserves shallow root tips on the coarser mobile glyph grid.
   if(!rootHit.isPointInPath(rootPath,x,y)&&
      !(y>710&&rootHit.isPointInPath(rootPath,x,y-pitch*.325)))continue;
   limb=gt1;limbWidth=116;
  }
  const woody=limb!==null&&(!crown||inside<.12||(limbWidth>40&&inside<.32));
  if(!woody&&!crown)continue;
  const keep=woody?.99:Math.min(.90,.54+inside*.75);
  if(glyphHash(col,row,1)>keep)continue;
  const bone=woody?limb:crown.bone;
  const tone=woody?.85+glyphHash(col,row,2)*.15:.49+Math.min(.40,inside*.70)+glyphHash(col,row,2)*.10;
  glyphMesh.push({x,y,bone,woody,root,tone,phase:glyphHash(col,row,5)*6.28,
   square:glyphHash(col,row,3)<(woody?.70:.40),
   char:glyphCharacters[Math.floor(glyphHash(col,row,4)*(woody?5:8))],
   gray:glyphHash(col,row,6)<(woody?.08:.23)});
 }
}
function drawGlyphLeaf(x,y,size,angle,alpha,phase){
 ctx.save();ctx.translate(x,y);ctx.rotate(angle);
 // A three-step leaf silhouette keeps its shape during the turn, even on mobile.
 ctx.scale(.58+.42*Math.abs(Math.cos(phase)),1);
 ctx.fillStyle=colors.ink;ctx.globalAlpha=alpha;
 const tile=size/4;
 ctx.fillRect(-tile,-tile*1.5,tile*2,tile);
 ctx.fillRect(-tile*2,-tile*.5,tile*4,tile);
 ctx.fillRect(-tile,tile*.5,tile*2,tile);
 ctx.fillRect(tile*.3,tile*1.5,tile*.45,tile*.7);
 ctx.fillStyle=colors.paper;ctx.globalAlpha=alpha*.62;
 ctx.fillRect(-tile*.15,-tile,tile*.35,tile*2);
 ctx.restore();
}

const glyphEmitters=[4,6,8,10,12,15,19,22,1,24,9,17];
let glyphLeaves=[],glyphLeafTime=-1;
function makeGlyphLeaf(i,posed,prewarm=false){
 const c=glyphCrowns[glyphEmitters[i]],origin=glyphAttach(c.x+c.rx*.48,c.y+c.ry*.20,c.bone,posed);
 const life=12+glyphHash(i,0,40)*5,phase=glyphHash(i,0,42)*6.28;
 const age=prewarm?glyphHash(i,0,41)*life:0,vx=8+windNow*90;
 return {x:origin.x+age*vx+Math.sin(age*1.35+phase)*8,
  y:origin.y+age*13+age*age*.48,age,life,phase,vx,vy:13+age*.96,
  size:10+glyphHash(i,0,43)*4};
}
function advanceGlyphLeaves(posed){
 const dt=time-glyphLeafTime;
 if(glyphLeafTime<0||dt<0||dt>.5){
  glyphLeaves=glyphEmitters.map((_,i)=>makeGlyphLeaf(i,posed,true));
 }else if(dt>0){
  for(let i=0;i<glyphLeaves.length;i++){
   let l=glyphLeaves[i];
   l.age+=dt;
   if(l.age>l.life){glyphLeaves[i]=makeGlyphLeaf(i,posed);continue;}
   // Wind changes velocity gradually, without relocating an already-falling leaf.
   l.vx+=(8+windNow*90+gust*32-l.vx)*Math.min(1,dt*.85);
   l.vy+=dt*.96;
   l.x+=(l.vx+Math.sin(l.age*1.35+l.phase)*13)*dt;
   l.y+=(l.vy+Math.cos(l.age*2+l.phase)*12)*dt;
  }
 }
 glyphLeafTime=time;
}

function renderGlyphs(scale,ox,oy){
 const cssScale=scale*canvas.clientWidth/canvas.width;
 const pitch=Math.max(11.5,6.4/cssScale);
 if(Math.abs(pitch-glyphPitch)>.01)buildGlyphMesh(pitch);
 const posed=glyphPose(time),square=pitch*.65;
 ctx.save();ctx.translate(ox,oy);ctx.scale(scale,scale);
 // Fine scattered ground; the trunk keeps its square/letter texture.
 drawGround();
 ctx.font='700 '+(pitch*.92)+'px ui-monospace,"SF Mono",Menlo,Consolas,monospace';
 ctx.textAlign='center';ctx.textBaseline='middle';
 // Barely visible grid stays on the paper; only the tree travels with the wind.
 for(let y=95;y<718;y+=pitch)for(let x=90;x<930;x+=pitch){
  const fade=Math.max(0,1-Math.hypot((x-510)/460,(y-390)/390));
  ctx.fillStyle=colors.ink;ctx.globalAlpha=.045*fade;
  ctx.fillRect(x-pitch*.06,y-pitch*.06,pitch*.12,pitch*.12);
 }
 for(const cell of glyphMesh){
  const p=glyphAttach(cell.x,cell.y,cell.bone,posed);
  if(cell.root){const anchor=smoothstep(666,712,cell.y);p.x+=(cell.x-p.x)*anchor;p.y+=(cell.y-p.y)*anchor;}
  const crest=Math.pow((1+Math.sin(cell.x*.010-cell.y*.006-time*.58))*.5,2);
  const shimmer=1-.08*(.5+.5*Math.sin(time*.9+cell.phase));
  const alpha=cell.tone*(1-(cell.woody?.12:.40)*crest)*shimmer;
  ctx.fillStyle=cell.gray?colors.gray:colors.ink;ctx.globalAlpha=alpha;
  if(cell.square){
   ctx.fillRect(p.x-square/2,p.y-square/2,square,square);
   ctx.globalAlpha=alpha*.14;ctx.fillStyle=colors.paper;
   ctx.fillRect(p.x-square/2,p.y+square*.35,square,square*.15);
  }else ctx.fillText(cell.char,p.x,p.y);
 }
 // Leaves bypass cell averaging. Their continuous trajectories remain readable.
 advanceGlyphLeaves(posed);
 for(const l of glyphLeaves){
  const fade=Math.max(0,Math.min(1,l.age/.4,(l.life-l.age)/1.2,(1000-l.x)/65,(748-l.y)/40));
  const size=Math.max(l.size,5.6/cssScale);
  drawGlyphLeaf(l.x,l.y,size,l.phase+l.age*.75+Math.sin(l.age*1.8)*.35,.78*fade,l.age*2.3+l.phase);
 }
 ctx.restore();
}



 function createRainField(columns,rows){
  return Array.from({length:columns*rows},(_,i)=>({
   x:(i%columns+range(.20,.80))/columns,
   y:(Math.floor(i/columns)+range(.20,.80))/rows,
   length:range(36,64),phase:range(0,6.28)
  }));
 }
 const rainFields={wide:createRainField(5,4),narrow:createRainField(2,4)};
 function renderRain(){
  rainCtx.setTransform(rainDpr,0,0,rainDpr,0,0);rainCtx.clearRect(0,0,rainWidth,rainHeight);
  const drops=rainWidth<600?rainFields.narrow:rainFields.wide;
  const spanX=rainWidth+120,spanY=rainHeight+120;
  for(const drop of drops){
   const y=((drop.y*spanY+rainTime)%spanY)-60;
   const x=((drop.x*spanX+rainTime*.34)%spanX)-60;
   const phase=x*.005-y*.004-time*.40+drop.phase*.12;
   const wave=Math.pow((1+Math.sin(phase))*.5,2);
   const edge=Math.max(0,Math.min(1,y/42,(rainHeight-y)/50));
   const underCopy=x>copyBounds.left&&x<copyBounds.right&&y>copyBounds.top&&y<copyBounds.bottom;
   const opacity=(.15+wave*.21)*edge*(underCopy?.38:1);
   const length=drop.length*(.9+rainSpeed*.25),tailX=x-length*.34,tailY=y-length;
   const gradient=rainCtx.createLinearGradient(tailX,tailY,x,y);
   const rgb=INK.join(',');
   gradient.addColorStop(0,'rgba('+rgb+',0)');
   gradient.addColorStop(.28,'rgba('+rgb+','+(opacity*.5)+')');
   gradient.addColorStop(.72,'rgba('+rgb+','+opacity+')');
   gradient.addColorStop(1,'rgba('+rgb+','+(opacity*.65)+')');
   rainCtx.strokeStyle=gradient;rainCtx.lineWidth=1.1;rainCtx.lineCap='round';
   rainCtx.beginPath();rainCtx.moveTo(tailX,tailY);rainCtx.lineTo(x,y);rainCtx.stroke();
  }
 }
 function render(){
  if(!canvas.width||!canvas.height)return;
  ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);
  const scale=Math.min(canvas.width/W,canvas.height/H);
  renderGlyphs(scale,(canvas.width-W*scale)/2,(canvas.height-H*scale)/2);
  renderRain();
 }
 function animate(now){
  frame=0;
  if(!visible||!pageActive||document.hidden||reducedMotion.matches)return;
  const dt=lastFrame?Math.min((now-lastFrame)/1000,.05):0;
  lastFrame=now;time+=dt;rainTime+=dt*(14+rainSpeed*145);
  if(now-lastDraw>=1000/30){render();lastDraw=now;}
  frame=requestAnimationFrame(animate);
 }
 function sync(){
  const moving=visible&&pageActive&&!document.hidden&&!reducedMotion.matches;
  scene.dataset.motion=moving?'running':'paused';
  if(moving&&!frame){lastFrame=0;lastDraw=0;frame=requestAnimationFrame(animate);}
  else if(!moving&&frame){cancelAnimationFrame(frame);frame=0;lastFrame=0;}
  if(visible)render();
 }
 function resize(){
  const treeBounds=canvas.getBoundingClientRect(),rainBounds=rainCanvas.getBoundingClientRect();
  if(!treeBounds.width||!treeBounds.height||!rainBounds.width||!rainBounds.height)return;
  rainDpr=Math.min(window.devicePixelRatio||1,1.75);
  canvas.width=Math.round(treeBounds.width*rainDpr);canvas.height=Math.round(treeBounds.height*rainDpr);
  rainWidth=rainBounds.width;rainHeight=rainBounds.height;
  rainCanvas.width=Math.round(rainWidth*rainDpr);rainCanvas.height=Math.round(rainHeight*rainDpr);
  const copy=hero.querySelector('.hero-copy')?.getBoundingClientRect();
  if(copy)copyBounds={left:copy.left-rainBounds.left-15,right:copy.right-rainBounds.left+15,
   top:copy.top-rainBounds.top-15,bottom:copy.bottom-rainBounds.top+15};
  render();
 }
 new ResizeObserver(resize).observe(scene);
 const copy=hero.querySelector('.hero-copy');
 if(copy)new ResizeObserver(resize).observe(copy);
 new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;sync();},{threshold:0}).observe(scene);
 reducedMotion.addEventListener('change',sync);
 document.addEventListener('visibilitychange',sync);
 window.addEventListener('pagehide',()=>{pageActive=false;sync();});
 window.addEventListener('pageshow',()=>{pageActive=true;resize();sync();});
 resize();
}
