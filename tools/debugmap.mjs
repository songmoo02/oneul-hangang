import { sampleField, heightFromField, BRIDGE_AXES, bankN, bankS, PLAZA_POINTS, pathSDF } from '../src/world/field.js';
import { LANDMARKS, toWorld } from '../src/world/geo.js';
import fs from 'fs';
const x0=-2400,x1=2400,z0=-1200,z1=1100, step=4;
const W=Math.floor((x1-x0)/step), H=Math.floor((z1-z0)/step);
const buf=Buffer.alloc(W*H*3); const f={};
const t0=Date.now();
for(let j=0;j<H;j++)for(let i=0;i<W;i++){
  const x=x0+i*step,z=z0+j*step; sampleField(x,z,f); const h=heightFromField(f,x,z);
  let r,g,b;
  if(f.d<0){r=40;g=90;b=150+Math.max(-60,f.d);}
  else if(f.zone<=1){ if(f.d<5){r=150;g=150;b=140} else if(f.d<f.w){r=90;g=160;b=70; if(f.d>6&&f.d<9.4){r=220;g=210;b=190} if(f.d>12&&f.d<16.4){r=70;g=70;b=75}} else if(f.d<f.w+14){r=60;g=110;b=50} else if(f.d<f.w+38){r=50;g=50;b=55} else {r=120;g=118;b=115} }
  else if(f.zone===2){ r=60+h*12;g=150;b=80 } else if(f.zone===3){r=70;g=130;b=60} else {r=140;g=180;b=90}
  if(pathSDF(x,z)<0 && f.d>0){r=230;g=220;b=200}
  const k=(j*W+i)*3; buf[k]=r;buf[k+1]=g;buf[k+2]=b;
}
console.log('field ms', Date.now()-t0, 'cells', W*H, 'segs', bankN.n, bankS.n);
const dot=(x,z,c,rad=2)=>{const i=Math.round((x-x0)/step),j=Math.round((z-z0)/step);for(let a=-rad;a<=rad;a++)for(let b2=-rad;b2<=rad;b2++){const ii=i+a,jj=j+b2;if(ii<0||jj<0||ii>=W||jj>=H)continue;const k=(jj*W+ii)*3;buf[k]=c[0];buf[k+1]=c[1];buf[k+2]=c[2];}};
for(const b of BRIDGE_AXES){ let sw0=-1,sw1=-1; for(let s=0;s<=b.L;s+=1){const x=b.ax+b.dx*s,z=b.az+b.dz*s; dot(x,z,[255,60,60],0); sampleField(x,z,f); if(f.d<0){ if(sw0<0)sw0=s; sw1=s; } }
  console.log(b.id,'L',b.L.toFixed(0),'axisWater',b.sW0,b.sW1,'water',sw0,sw1,'riverWidth',(sw1-sw0), 'start x,z',b.ax.toFixed(0),b.az.toFixed(0)); }
for(const [k,v] of Object.entries(LANDMARKS)){const p=toWorld(v[0],v[1]); sampleField(p.x,p.z,f); console.log(k,p.x.toFixed(0),p.z.toFixed(0),'d',f.d.toFixed(0),'w',f.w.toFixed(0),'zone',f.zone); dot(p.x,p.z,[255,255,0],3);}
fs.writeFileSync('/tmp/map.rgb',buf); fs.writeFileSync('/tmp/map.json',JSON.stringify({W,H}));
