// Saar v8: records story. Calm motion, one palette. renderAt(t) is the only clock.
const C=CFG.cues,c=i=>C[i][0],sv=document.getElementById('sv'),NS='http://www.w3.org/2000/svg';
const INK='#2C3A42',CREAM='#F8F3E8',PEACH='#EFE5D2',OR='#D9823F',SAND='#E3C9A6',TEAL='#1F8378',DT='#176B62',MINT='#E2EFE9',SKY='#DCEBE5',WH='#FFFFFF',SKIN='#DDA67C',SK2='#E9BC97',KH='#A08F75',KH2='#8C7C64',WOOD='#B58C62',GREY='#8B8F90';
const CORAL_R='#C9543F';
const clamp=x=>Math.max(0,Math.min(1,x)),L=(a,b,p)=>a+(b-a)*p,seg=(t,a,d)=>clamp((t-a)/d),eo=x=>1-Math.pow(1-x,3),eio=x=>x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;
const ent=(t,a,d=.45)=>eio(seg(t,a,d));                 // calm entrance
const soft=(t,a,d=.42)=>{const x=seg(t,a,d),s=1.1;const y=x-1;return t<a?0:y*y*((s+1)*y+s)+1}; // slight overshoot only
function S(tag,attrs,parent,text){const e=document.createElementNS(NS,tag);for(const k in attrs)e.setAttribute(k,attrs[k]);if(text!=null)e.textContent=text;parent.appendChild(e);return e}
const G=(p,a={})=>S('g',a,p),O={stroke:INK,'stroke-width':6,'stroke-linejoin':'round','stroke-linecap':'round'},N={stroke:'none'};
const R=(p,x,y,w,h,f,r=0,o=O)=>S('rect',{x,y,width:w,height:h,rx:r,fill:f,...o},p),CI=(p,x,y,r,f,o=O)=>S('circle',{cx:x,cy:y,r,fill:f,...o},p),P=(p,d,f='none',o=O)=>S('path',{d,fill:f,...o},p);
const TX=(p,x,y,s,txt,f=INK,a='middle',w=600)=>S('text',{x,y,'font-size':s,fill:f,'text-anchor':a,'font-weight':w},p,txt);
const T=(e,x,y,s=1,r=0)=>e.setAttribute('transform',`translate(${x} ${y}) rotate(${r}) scale(${s})`),VIS=(e,v)=>e.style.display=v?'':'none',OP=(e,v)=>{e.style.opacity=v;e.style.display=v>0?'':'none'};
// ---- people: original designs, solid shapes with simple shading ----
const SKS='#C98C63',TEETH='#FFF8EC';
function Person(parent,o){const r=G(parent),arms=G(r),body=G(r),head=G(r),fg=G(r);
 o.dress(body);
 const hg=G(head);o.ears(hg);P(hg,o.face,SKIN,{...O,'stroke-width':6});P(hg,o.shade,SKS,{stroke:'none',opacity:.42});
 if(o.back)o.back(hg);
 const ex=o.eyeX,ey=o.eyeY,rx=o.eyeR,ry=o.eyeR*1.12;const whites=[-ex,ex].map(x=>S('ellipse',{cx:x,cy:ey,rx,ry,fill:WH,...O,'stroke-width':4},hg));
 const dots=[-ex,ex].map(x=>{const d=G(hg);T(d,x,ey);CI(d,0,0,rx*.6,'#5A3A26',N);CI(d,0,0,rx*.32,INK,N);CI(d,rx*.24,-rx*.26,rx*.17,WH,N);return d});
 const lids=[-ex,ex].map(x=>{const l=P(hg,'','none',{...O,'stroke-width':6});l.dataset.x=x;return l});
 const bL=P(hg,'','none',{stroke:o.browC,'stroke-width':o.browW,'stroke-linecap':'round'}),bR=P(hg,'','none',{stroke:o.browC,'stroke-width':o.browW,'stroke-linecap':'round'});
 o.nose(hg);const mo=P(hg,'','#5B2A2A',{...O,'stroke-width':5}),teeth=P(hg,'',TEETH,N),tongue=P(hg,'','#C8604F',N);
 if(o.top_)o.top_(hg);CI(hg,-o.chk,o.chkY,28,'#E0705A',{stroke:'none',opacity:.3});CI(hg,o.chk,o.chkY,28,'#E0705A',{stroke:'none',opacity:.3});
 const mk=()=>({up:S('path',{fill:'none',stroke:INK,'stroke-width':o.armW+12,'stroke-linecap':'round'},arms),ui:S('path',{fill:'none',stroke:o.sleeve,'stroke-width':o.armW,'stroke-linecap':'round'},arms),lo:S('path',{fill:'none',stroke:INK,'stroke-width':o.armW,'stroke-linecap':'round'},fg),li:S('path',{fill:'none',stroke:SKIN,'stroke-width':o.armW-12,'stroke-linecap':'round'},fg),h:G(fg)});
 const aL=mk(),aR=mk();[aL,aR].forEach(a=>{CI(a.h,0,0,o.hand,SKIN,{...O,'stroke-width':5});[-.5,0,.5].forEach(k=>P(a.h,`M${k*o.hand} ${-o.hand*.1}V${o.hand*.72}`,'none',{stroke:SKS,'stroke-width':4,'stroke-linecap':'round'}))});
 return{r,head,whites,lids,dots,bL,bR,mo,teeth,tongue,aL,aR,o,fg,hg}}
function arm(a,sx,sy,ex,ey,bend){const mx=(sx+ex)/2+bend,my=(sy+ey)/2+Math.abs(bend)*.7,qx=L(sx,mx,.8),qy=L(sy,my,.8),d1=`M${sx} ${sy}L${qx} ${qy}`,d2=`M${qx} ${qy}L${ex} ${ey}`;a.up.setAttribute('d',d1);a.ui.setAttribute('d',d1);a.lo.setAttribute('d',d2);a.li.setAttribute('d',d2);T(a.h,ex,ey)}
function pose(e,t,p){const o=e.o;T(e.r,p.x,p.y,p.s||1);T(e.head,p.hx||0,o.headY+(p.hy||0),1,p.tilt||0);
 const hap=p.m==='laugh'||p.closed,bl=((t*.27+(p.seed||0))%1)<.025,shut=hap||bl;e.whites.forEach(w=>w.style.display=shut?'none':'');e.dots.forEach((d,i)=>{T(d,(i?1:-1)*o.eyeX+(p.look||0)*o.eyeR*.34,o.eyeY+(p.lookY||0)*o.eyeR*.3);d.style.display=shut?'none':''});
 e.lids.forEach(l=>{const x=+l.dataset.x;l.style.display=shut?'':'none';l.setAttribute('d',hap?`M${x-o.eyeR} ${o.eyeY+6}Q${x} ${o.eyeY-o.eyeR*1.1} ${x+o.eyeR} ${o.eyeY+6}`:`M${x-o.eyeR} ${o.eyeY}H${x+o.eyeR}`)});
 const b=(p.brow||0)*11,y=o.eyeY-o.eyeR*1.75;e.bL.setAttribute('d',`M${-o.eyeX-o.eyeR*1.15} ${y+b}Q${-o.eyeX} ${y-11} ${-o.eyeX+o.eyeR*1.05} ${y-b}`);e.bR.setAttribute('d',`M${o.eyeX-o.eyeR*1.05} ${y-b}Q${o.eyeX} ${y-11} ${o.eyeX+o.eyeR*1.15} ${y+b}`);
 const m=o.mY,M={smile:`M-44 ${m}Q0 ${m+40} 44 ${m}Q0 ${m+14} -44 ${m}Z`,flat:`M-24 ${m+10}Q0 ${m+16} 24 ${m+10}Q0 ${m+20} -24 ${m+10}Z`,worry:`M-30 ${m+22}Q0 ${m} 30 ${m+22}Q0 ${m+12} -30 ${m+22}Z`,o:`M-17 ${m+14}a17 20 0 1 0 34 0a17 20 0 1 0 -34 0Z`,laugh:`M-62 ${m-4}Q0 ${m+4} 62 ${m-4}Q50 ${m+66} 0 ${m+66}Q-50 ${m+66} -62 ${m-4}Z`};
 e.mo.setAttribute('d',M[p.m||'smile']);e.teeth.setAttribute('d',p.m==='laugh'?`M-52 ${m+1}Q0 ${m+8} 52 ${m+1}L46 ${m+17}Q0 ${m+22} -46 ${m+17}Z`:'');e.tongue.setAttribute('d',p.m==='laugh'?`M-26 ${m+50}Q0 ${m+32} 26 ${m+50}Q0 ${m+66} -26 ${m+50}Z`:'');
 arm(e.aL,-o.sh,o.shY,...(p.aL||[-o.sh-40,-20]),p.bL??-44);arm(e.aR,o.sh,o.shY,...(p.aR||[o.sh+40,-20]),p.bR??44)}
// Jugaadu Lal: a round, proud shopkeeper in a waistcoat, pencil always behind one ear
const UNCLE={sleeve:CREAM,armW:58,hand:36,sh:218,shY:-232,headY:-428,eyeX:64,eyeY:-22,eyeR:27,chk:112,chkY:50,mY:112,browC:'#6D6F70',browW:17,
 dress:b=>{P(b,'M-300 30C-324 -120 -250 -292 -96 -332Q0 -352 96 -332C250 -292 324 -120 300 30Z',CREAM,{...O,'stroke-width':6});P(b,'M-300 30C-324 -120 -250 -292 -112 -330L-52 -318L-30 30Z',TEAL,{...O,'stroke-width':6});P(b,'M300 30C324 -120 250 -292 112 -330L52 -318L30 30Z',TEAL,{...O,'stroke-width':6});P(b,'M180 30C230 -60 236 -160 190 -262C282 -170 306 -70 300 30Z',DT,{stroke:'none',opacity:.55});[-240,-160,-80].forEach(y=>CI(b,0,y,9,SAND,{...O,'stroke-width':3}));R(b,-214,-168,92,12,SAND,4,{...O,'stroke-width':3});R(b,-92,-338,184,40,CREAM,16,{...O,'stroke-width':5});P(b,'M0 -324V-250','none',{stroke:SAND,'stroke-width':4})},
 ears:h=>{[-1,1].forEach(k=>{S('ellipse',{cx:k*158,cy:6,rx:28,ry:40,fill:SKIN,...O,'stroke-width':6},h);P(h,`M${k*166} -12q${k*-14} 18 0 34`,'none',{stroke:SKS,'stroke-width':5,'stroke-linecap':'round'})})},
 face:'M-154 -40C-158 -168 -80 -196 0 -196C80 -196 158 -168 154 -40C176 40 150 158 0 164C-150 158 -176 40 -154 -40Z',shade:'M70 158C150 136 172 40 152 -40C142 40 116 112 40 160Z',
 back:h=>{P(h,'M-156 -8C-176 -66 -150 -118 -112 -130C-124 -92 -128 -56 -128 -18C-136 -8 -148 -2 -156 -8Z',GREY,{...O,'stroke-width':5});P(h,'M156 -8C176 -66 150 -118 112 -130C124 -92 128 -56 128 -18C136 -8 148 -2 156 -8Z',GREY,{...O,'stroke-width':5});S('ellipse',{cx:-46,cy:-146,rx:62,ry:22,fill:'#F0C7A4',stroke:'none',transform:'rotate(-10 -46 -146)'},h);P(h,'M0 -128V-92','none',{stroke:OR,'stroke-width':12,'stroke-linecap':'round'});CI(h,0,-82,5,'#B64A33',N)},
 nose:h=>{P(h,'M-34 34C-44 2 -14 -12 0 -12C14 -12 44 2 34 34C22 52 -22 52 -34 34Z',SKIN,{...O,'stroke-width':5});S('ellipse',{cx:-10,cy:12,rx:11,ry:7,fill:'#F0C7A4',stroke:'none'},h)},
 top_:h=>{P(h,'M0 66C-30 44 -86 52 -112 74C-132 92 -158 76 -150 54C-172 92 -128 118 -96 100C-60 106 -22 96 0 82C22 96 60 106 96 100C128 118 172 92 150 54C158 76 132 92 112 74C86 52 30 44 0 66Z',INK,N);R(h,132,-108,0,0,OR);const pc=G(h);T(pc,176,-62,1,-62);R(pc,-58,-8,110,16,OR,3,{...O,'stroke-width':3});P(pc,'M52 -8L74 0L52 8Z',SAND,{...O,'stroke-width':3});[-1,1].forEach(k=>CI(h,k*64,-22,41,'none',{stroke:INK,'stroke-width':6}));P(h,'M-23 -24Q0 -36 23 -24','none',{stroke:INK,'stroke-width':6});P(h,'M-105 -22L-150 -8M105 -22L150 -8','none',{stroke:INK,'stroke-width':6})}};
// his daughter Chhutki: plaits with ribbons and a very sensible expression
const GIRL={sleeve:OR,armW:42,hand:26,sh:142,shY:-214,headY:-404,eyeX:60,eyeY:6,eyeR:30,chk:104,chkY:66,mY:96,browC:INK,browW:8,
 dress:b=>{P(b,'M-190 30C-196 -130 -170 -280 -82 -316Q0 -296 82 -316C170 -280 196 -130 190 30Z',OR,{...O,'stroke-width':6});P(b,'M-82 -316L-28 -240L0 -276L28 -240L82 -316Q0 -296 -82 -316Z',CREAM,{...O,'stroke-width':4});P(b,'M-150 -290C-60 -180 70 -100 176 -60L190 -2C60 -60 -80 -150 -176 -236Z',TEAL,{...O,'stroke-width':5})},
 ears:h=>{[-1,1].forEach(k=>CI(h,k*140,24,23,SKIN,{...O,'stroke-width':5}));[-1,1].forEach(k=>CI(h,k*140,50,7,SAND,{...O,'stroke-width':3}))},
 face:'M-140 -30C-140 -142 -70 -170 0 -170C70 -170 140 -142 140 -30C150 70 96 140 0 142C-96 140 -150 70 -140 -30Z',shade:'M60 138C120 122 148 60 138 -30C126 50 96 104 34 140Z',
 back:h=>{[-1,1].forEach(k=>{P(h,`M${k*118} 30C${k*170} 80 ${k*170} 170 ${k*142} 250`,'none',{stroke:INK,'stroke-width':42,'stroke-linecap':'round'});for(let i=0;i<4;i++)P(h,`M${k*(150+[6,12,8,-2][i])-18} ${90+i*44}q18 14 36 0`,'none',{stroke:'#55636B','stroke-width':4});P(h,`M${k*142-34} 262L${k*142} 282L${k*142+34} 262L${k*142+26} 296L${k*142} 284L${k*142-26} 296Z`,CORAL_R,{...O,'stroke-width':4})})},
 nose:h=>{P(h,'M-9 54Q0 64 9 54','none',{...O,'stroke-width':5})},
 top_:h=>{P(h,'M-142 -6C-168 -128 -82 -190 4 -180C96 -172 164 -112 142 -6C126 -48 108 -74 86 -90C50 -56 -30 -44 -92 -78C-114 -60 -130 -36 -142 -6Z',INK,N);P(h,'M-70 -142C-20 -166 40 -160 76 -136','none',{stroke:'#55636B','stroke-width':6,'stroke-linecap':'round'});CI(h,0,-58,6,CORAL_R,N)}};
// ---- the stall: canvas canopy, wooden poles, real goods ----
const world=G(sv),bg=G(world);R(bg,-100,0,1280,1560,CREAM,0,N);R(bg,-100,1180,1280,380,PEACH,0,N);for(let i=0;i<9;i++)P(bg,`M${i*135-20} 240V1500`,'none',{stroke:PEACH,'stroke-width':3});
// sky seen through the back opening
const win=G(bg);R(win,396,330,288,270,'#000',0,N);S('clipPath',{id:'wc'},bg).appendChild(S('path',{d:'M402 600V430a138 100 0 0 1 276 0V600Z'},bg));
const skyG=G(bg,{'clip-path':'url(#wc)'}),skyR=R(skyG,396,320,288,290,SKY,0,N),stars=[[440,400],[500,370],[560,430],[620,385],[650,470],[470,470],[590,500]].map(([x,y])=>CI(skyG,x,y,3.5,WH,N)),sun=CI(skyG,0,0,40,'#F1C66E',N),moon=G(skyG);CI(moon,0,0,34,'#F3EBD6',N);CI(moon,14,-8,28,'#1F2A44',N);R(skyG,396,540,288,70,KH2,0,N);[[420,44],[474,62],[540,38],[590,70],[648,48]].forEach(([x,h])=>R(skyG,x,600-h-20,46,h+20,DT,3,N));
win.remove();P(bg,'M402 600V430a138 100 0 0 1 276 0V600Z','none',{...O,'stroke-width':9,stroke:WOOD});P(bg,'M394 604H686','none',{...O,'stroke-width':11,stroke:WOOD});
const shelf=(y,x,w)=>{R(bg,x,y,w,18,WOOD,4,{...O,'stroke-width':4});[.12,.88].forEach(k=>P(bg,`M${x+w*k} ${y+18}l-12 30h24z`,WOOD,{...O,'stroke-width':4}))};
const jar=(x,y,f)=>{R(bg,x,y-108,76,108,WH,14,{...O,'stroke-width':5});R(bg,x+5,y-78,66,73,f,10,N);R(bg,x+4,y-122,68,18,WOOD,5,{...O,'stroke-width':4});R(bg,x+14,y-62,48,30,CREAM,3,N);P(bg,`M${x+22} ${y-47}h32`,'none',{stroke:INK,'stroke-width':3})};
const tin=(x,y,f)=>{R(bg,x,y-98,70,98,f,6,{...O,'stroke-width':5});R(bg,x,y-68,70,36,CREAM,0,{...O,'stroke-width':4});CI(bg,x+35,y-50,10,OR,N);S('ellipse',{cx:x+35,cy:y-98,rx:35,ry:7,fill:SAND,...O,'stroke-width':4},bg)};
const bottle=(x,y,f)=>{P(bg,`M${x+20} ${y-126}h20v22q20 10 20 30v74h-60v-74q0-20 20-30z`,f,{...O,'stroke-width':5});R(bg,x+18,y-136,24,12,OR,3,N);R(bg,x+4,y-62,52,28,CREAM,2,N)};
const pack=(x,y,f)=>{R(bg,x,y-90,84,90,f,4,{...O,'stroke-width':5});P(bg,`M${x} ${y-76}h84M${x} ${y-12}h84`,'none',{stroke:CREAM,'stroke-width':4,'stroke-dasharray':'4 6'});CI(bg,x+42,y-44,17,CREAM,N)};
shelf(560,60,320);shelf(800,60,320);shelf(1040,60,320);shelf(560,720,300);shelf(1040,720,300);
jar(80,560,OR);jar(172,560,SAND);jar(264,560,TEAL);bottle(84,800,OR);bottle(160,800,OR);tin(238,800,TEAL);pack(84,1040,TEAL);pack(176,1040,SAND);tin(270,1040,DT);
tin(740,560,TEAL);bottle(826,560,OR);jar(904,560,SAND);pack(742,1040,SAND);pack(834,1040,OR);jar(930,1040,TEAL);
const sl=G(bg);R(sl,716,660,304,104,WOOD,8,{...O,'stroke-width':5});R(sl,728,672,280,80,CREAM,4,N);TX(sl,868,732,58,'शुभ लाभ',OR,'middle',700);P(sl,'M770 660L868 626L966 660','none',{...O,'stroke-width':4});
const clk=G(bg);T(clk,300,392);CI(clk,0,0,62,WH);for(let i=0;i<12;i++)P(clk,'M0 -52V-44','none',{stroke:INK,'stroke-width':3,transform:`rotate(${i*30})`});const hM=P(clk,'M0 0V-44'),hH=P(clk,'M0 0H30');
const cal=G(bg);R(cal,750,330,150,200,WH,4,{...O,'stroke-width':4});R(cal,750,330,150,62,OR,4,N);TX(cal,825,376,34,'दिवाली',WH,'middle',700);for(let a=0;a<4;a++)for(let b=0;b<3;b++)R(cal,768+a*30,410+b*36,18,18,b==1&&a==2?OR:PEACH,2,N);
// canopy
const cn=G(world);for(let i=-1;i<9;i++){const x0=i*122,x1=120+i*92;P(cn,`M${x0} 214L${x1+18} 0H${x1+110}L${x0+122} 214Z`,i%2?TEAL:CREAM,{...O,'stroke-width':4})}R(cn,-100,206,1280,26,DT,0,N);for(let i=-1;i<13;i++)P(cn,`M${i*100} 230a50 36 0 0 0 100 0Z`,i%2?TEAL:CREAM,{...O,'stroke-width':4});
const signG=G(world);[300,780].forEach(x=>P(signG,`M${x} 226V262`,'none',{...O,'stroke-width':5}));R(signG,196,258,688,92,WOOD,10,{...O,'stroke-width':6});R(signG,208,269,664,70,CREAM,5,N);TX(signG,540,321,42,'JUGAADU LAL KIRANA STORE',DT,'middle',700);
[24,1056].forEach(x=>{R(world,x-17,226,34,1290,WOOD,4,{...O,'stroke-width':5});[320,324,328,1200,1204].forEach(y=>P(world,`M${x-17} ${y}h34`,'none',{stroke:INK,'stroke-width':3}))});
// sachet strips and a hanging balance sway from the canopy
const strips=[[78,OR],[132,TEAL],[948,SAND],[1002,OR]].map(([x,f],k)=>{const g=G(world);T(g,x,250);P(g,'M0 0V310','none',{stroke:INK,'stroke-width':3});for(let i=0;i<6;i++){R(g,-22,8+i*51,44,48,i%2?f:CREAM,3,{...O,'stroke-width':3});CI(g,0,32+i*51,7,i%2?CREAM:f,N)}return{g,x,k}});
const bal=G(world);P(bal,'M0 0V40','none',{stroke:INK,'stroke-width':4});const beam=G(bal);T(beam,0,40);P(beam,'M-74 0H74','none',{...O,'stroke-width':7});[-74,74].forEach(x=>{P(beam,`M${x} 0L${x-28} 76M${x} 0L${x+28} 76`,'none',{stroke:INK,'stroke-width':3});P(beam,`M${x-34} 76Q${x} 104 ${x+34} 76Z`,SAND,{...O,'stroke-width':4})});T(bal,540,228);VIS(bal,false);
const sh=Person(world,UNCLE),girl=Person(world,GIRL);
const pen=G(world);P(pen,'M0 0L34 -74','none',{stroke:OR,'stroke-width':10,'stroke-linecap':'round'});P(pen,'M0 0L6 -13','none',{stroke:INK,'stroke-width':10,'stroke-linecap':'round'});
const ear=G(world);R(ear,-28,-66,56,132,INK,12,N);
// counter: planks, price slate and sacks
const front=G(world);R(front,-100,1498,1280,46,SAND,0);P(front,'M-100 1510H1180','none',{stroke:WOOD,'stroke-width':3});R(front,-100,1544,1280,400,WOOD,0,N);for(let i=0;i<12;i++){const x=i*110-40;P(front,`M${x} 1544V1940`,'none',{stroke:INK,'stroke-width':4});P(front,`M${x+36} ${1600+(i%3)*60}q24 18 44 0M${x+24} ${1760-(i%4)*30}q30 -16 58 4`,'none',{stroke:'#9C7650','stroke-width':3})}R(front,-100,1544,1280,30,TEAL,0,{...O,'stroke-width':4});for(let i=0;i<24;i++)P(front,`M${i*50} 1559l14 -9l14 9l-14 9z`,SAND,N);
const bd=G(front);R(bd,300,1620,480,250,DT,10,{...O,'stroke-width':8});TX(bd,540,1680,44,'आज का भाव',CREAM,'middle',700);[['Cheeni','₹42'],['Chawal','₹58'],['Tel','₹135']].forEach(([a,b],i)=>{TX(bd,350,1740+i*48,36,a,CREAM,'start',500);TX(bd,730,1740+i*48,36,b,SAND,'end',600)});
const sackAt=(x,lab)=>{const g=G(front);P(g,`M${x} 1502C${x-20} 1420 ${x} 1370 ${x+34} 1356H${x+160}C${x+194} 1370 ${x+212} 1420 ${x+192} 1502Z`,PEACH);S('ellipse',{cx:x+96,cy:1360,rx:62,ry:15,fill:WH,...O},g);for(let i=0;i<9;i++)CI(g,x+56+i*10,1358+(i%3)*2,3,SAND,N);TX(g,x+96,1446,27,lab,KH2,'middle',700);P(g,`M${x+30} 1412h132M${x+30} 1464h132`,'none',{stroke:KH2,'stroke-width':3,'stroke-dasharray':'8 7'});return g};
const sack=sackAt(50,'CHAWAL');
const note=G(front);T(note,430,1484,1,-4);P(note,'M-130 -18L0 -24L130 -18L136 22L0 16L-136 22Z',WH);P(note,'M0 -24V16','none',{...O,'stroke-width':4});const noteL=[0,1,2].map(i=>P(note,'','none',{stroke:'#AEB6B4','stroke-width':4,'stroke-linecap':'round'}));
const puff=[0,1,2,3,4,5].map(()=>CI(world,0,0,10,WH,{stroke:SAND,'stroke-width':3}));
const glass=G(world);P(glass,'M-28 -74L-20 0H20L28 -74Z','#D3D8DA');R(glass,-24,-60,48,20,SAND,0,N);
const tea=G(front);T(tea,250,1498);P(tea,'M-24 -62L-17 0H17L24 -62Z','#D3D8DA',{...O,'stroke-width':4});R(tea,-21,-50,42,20,OR,0,N);const stm=[0,1,2].map(()=>P(front,'','none',{stroke:WH,'stroke-width':6,'stroke-linecap':'round'}));
const tel=G(front);R(tel,-78,-44,156,54,TEAL,16);CI(tel,0,-14,24,WH);for(let i=0;i<8;i++)CI(tel,Math.cos(i*.785)*15,-14+Math.sin(i*.785)*15,3,INK,N);P(tel,'M-96 -62Q0 -98 96 -62V-44H62V-56H-62V-44H-96Z',INK,N);
const rings=[0,1].map(()=>P(front,'','none',{stroke:TEAL,'stroke-width':7,'stroke-linecap':'round'}));
// ---- contacts card ----
const card=G(world);R(card,-280,-160,560,410,WH,30,{...O,'stroke-width':6});TX(card,-236,-100,40,'Distributors',TEAL,'start',700);
const CONT=[['G','Gupta ji','Sugar'],['M','Mehta ji','Oil'],['B','Biscuit Wala','Number saved 2009']].map(([a,b,d],i)=>{const g=G(card);T(g,0,-14+i*100);CI(g,-200,0,36,i==2?OR:TEAL,N);TX(g,-200,14,38,a,WH,'middle',700);TX(g,-146,-6,38,b,INK,'start',600);TX(g,-146,32,27,d,GREY,'start',500);return g});
// ---- diaries ----
const DI=[];const COL=[TEAL,SAND,OR,DT,SAND,TEAL,OR,SAND];for(let i=0;i<8;i++){const g=G(world);R(g,-100,-23,200,46,COL[i],6,{...O,'stroke-width':5});R(g,-88,-13,170,26,WH,0,{...O,'stroke-width':2});[-5,1,7].forEach(y=>P(g,`M-84 ${y}H78`,'none',{stroke:'#C9CDC9','stroke-width':2}));R(g,-100,-23,22,46,INK,4,N);R(g,20,-23,10,46,OR,0,N);DI.push(g)}
const hb=G(world);R(hb,-120,-52,240,100,WH,50);P(hb,'M-30 46L-40 84L0 46Z',WH,N);P(hb,'M-30 48L-40 84L0 48','none',O);const hbT=TX(hb,0,16,44,'Haan ji',INK);
const NAMES=['Gupta','Mehta','Rao','Shah','Khan','Jain','Patil','Nair','Das','Biscuit'];const phones=NAMES.map((n,i)=>{const g=G(world);R(g,-74,-62,148,124,WH,16,{...O,'stroke-width':5});P(g,'M-34 -26q6 -14 20 -8l10 16q2 8 -6 12q4 14 16 20q8 -6 14 -2l14 12q4 12 -10 18q-46 -2 -58 -68z',TEAL,N);TX(g,0,50,25,n,INK,'middle',600);const d=CI(g,62,-52,16,OR,{...O,'stroke-width':4});return{g,d,x:i%2?912:168,y:400+(i>>1)*176}});
const who=['Gupta ji','Mehta ji','Biscuit Wala'].map((n,i)=>{const g=G(world);P(g,'M-150 -82H150Q170 -82 170 -62V62Q170 82 150 82H30L0 112L-30 82H-150Q-170 82 -170 62V-62Q-170 -82 -150 -82Z',WH);CI(g,0,-34,30,i==2?OR:TEAL,N);TX(g,0,-22,32,n[0],WH,'middle',700);TX(g,0,28,30,n,INK);TX(g,0,70,36,'promised what?',OR,'middle',600).setAttribute('font-size',24);return g});
const big=[['Rates',220],['Quantities',860]].map(([n,x])=>{const g=G(world);R(g,-120,-164,252,336,WH,8,{...O,'stroke-width':4});R(g,-130,-170,260,340,TEAL,14);R(g,-130,-170,26,340,DT,10,N);R(g,-84,-96,190,84,WH,8,N);R(g,60,-170,14,340,OR,0,N);[120,136].forEach(y=>P(g,`M-90 ${y}H40`,'none',{stroke:'#62A79E','stroke-width':3}));TX(g,10,-40,n.length>6?32:42,n,INK);return{g,x}});
const th=G(world);S('ellipse',{cx:0,cy:0,rx:190,ry:96,fill:WH,...O},th);TX(th,0,16,50,'Payments?',OR,'middle',700);CI(th,-30,120,16,WH);CI(th,-14,160,10,WH);
const bills=[...Array(7)].map((_,i)=>{const g=G(world);R(g,-150,-190,300,380,WH,8);TX(g,0,-126,30,'BILL',GREY,'middle',700);for(let k=0;k<4;k++){P(g,`M-110 ${-70+k*52}H40`,'none',{stroke:SAND,'stroke-width':8});TX(g,114,-60+k*52,28,['₹840','₹1,260','₹390','₹2,175'][(k+i)%4],INK,'end',600)}return g});
const nomatch=G(world);R(nomatch,-270,-64,540,128,WH,12,{stroke:OR,'stroke-width':10});TX(nomatch,0,22,60,'DOES NOT MATCH',OR,'middle',700);
const dusk=R(world,-100,0,1280,1960,'#22314A',0,{stroke:'none',opacity:0});
const wire=P(world,'M41 350Q300 480 540 400Q780 480 1039 350','none',{stroke:INK,'stroke-width':4}),BPOS=[[110,392],[220,428],[330,446],[440,428],[640,428],[750,446],[860,428],[970,392]];const pool=S('ellipse',{cx:540,cy:1250,rx:560,ry:500,fill:'#F3C27A',stroke:'none'},world),lit=G(world),BULBS=BPOS.map(([x,y])=>{CI(lit,x,y+14,46,'#F3C27A',{stroke:'none',opacity:.16});CI(lit,x,y+14,26,'#F3C27A',{stroke:'none',opacity:.28});return CI(lit,x,y+14,13,'#FFE9B8',N)});BPOS.forEach(([x,y])=>{P(world,`M${x} ${y-6}v10`,'none',{stroke:INK,'stroke-width':5});CI(world,x,y+14,12,'none',{stroke:INK,'stroke-width':3})});
bills.forEach(g=>world.appendChild(g));world.appendChild(nomatch);world.appendChild(th);
// small phone in her hand; becomes the big phone
const sp=G(world);R(sp,-52,-96,104,192,INK,16,N);R(sp,-42,-82,84,164,WH,6,N);const ic=(p,s)=>{const g=G(p);T(g,0,0,s);R(g,-100,-100,200,200,TEAL,46,N);P(g,'M-60 -44q0-14 14-14h92q14 0 14 14v66q0 14-14 14h-72l-28 24 4-24q-10-2-10-14z',CREAM,N);P(g,'M-40 -30h62M-40 -8h50M-40 14h30','none',{stroke:INK,'stroke-width':8,'stroke-linecap':'round'});P(g,'M6 14l14 13 26-26','none',{stroke:OR,'stroke-width':10,'stroke-linecap':'round','stroke-linejoin':'round'});return g};ic(sp,.32);
// ---- the big phone ----
const ph=G(sv);R(ph,-325,-560,650,1120,INK,72,N);R(ph,-305,-540,610,1080,WH,54,N);R(ph,-305,-540,610,120,TEAL,50,N);R(ph,-305,-470,610,50,TEAL,0,N);const pHead=TX(ph,0,-462,38,'Call with Gupta ji',WH);
const s9=G(ph);[['Jugaadu Lal',-210],['Gupta ji',-40]].forEach(([n,y],i)=>{const g=G(s9);R(g,-260,y-64,520,128,MINT,22,N);TX(g,-226,y+12,40,n,INK,'start');const k=TX(g,226,y+12,34,'✓ Agreed',TEAL,'end',700);k.setAttribute('class','ag'+i)});const rec=G(s9);R(rec,-260,110,520,120,TEAL,60,N);CI(rec,-190,170,14,WH,N);TX(rec,20,184,40,'Record started',WH);
const s10=G(ph);TX(s10,0,-350,34,'Gnani Prisma · Live',TEAL,'middle',700);const bars=[...Array(24)].map((_,i)=>S('rect',{x:-266+i*23.5,width:11,rx:5,fill:TEAL},s10));
const LINES=[['Jugaadu · Hindi','Paanch carton cheeni bhejiye.',1],['Gupta · English','Certainly, at the usual rate.',0],['Jugaadu · Marathi','दोन डबे तेल पाहिजेत.',1],['Gupta · Hinglish','Done ji, Friday delivery.',0]].map(([a,b,l],i)=>{const g=G(s10);R(g,-262,-58,524,116,l?MINT:PEACH,20,N);TX(g,-234,-16,25,a,GREY,'start',500);TX(g,-234,28,33,b,INK,'start',600);return g});
const s11=G(ph);TX(s11,0,-340,44,'Order record',INK,'middle',700);const RW=[['Distributor','Gupta ji'],['Sugar','5 cartons'],['Oil','2 tins'],['Rate','As agreed'],['Delivery','Friday']].map(([a,b],i)=>{const g=G(s11);T(g,0,-250+i*86);TX(g,-250,14,36,a,GREY,'start',500);TX(g,250,14,38,b,INK,'end',600);P(g,'M-250 40H250','none',{stroke:PEACH,'stroke-width':4});return g});
const STP=[0,1].map(i=>{const g=G(s11);R(g,-126,-44,252,88,'none',12,{stroke:TEAL,'stroke-width':7});TX(g,0,16,40,(i?'Gupta':'Jugaadu')+' ✓',TEAL,'middle',700);return g});
// ---- the sheet ----
const xl=G(sv);R(xl,-470,-330,940,680,WH,20,{...O,'stroke-width':6});R(xl,-470,-330,940,84,TEAL,20,N);R(xl,-470,-280,940,34,TEAL,0,N);TX(xl,-434,-272,36,'Excel',WH,'start',700);TX(xl,434,-272,30,'All distributors',WH,'end',500);
const HD=[-440,-150,120,300];['Distributor','Item','Qty','Rate'].forEach((h,i)=>TX(xl,HD[i],-204,29,h,GREY,'start',600));P(xl,'M-470 -184H470','none',{stroke:SAND,'stroke-width':4});
const DATA=[['Gupta ji','Sugar','5','₹1,600'],['Mehta ji','Oil','8','₹700'],['Biscuit Wala','Biscuits','12','₹240'],['Rao Traders','Rice','20','₹1,150'],['Shah & Sons','Tea','6','₹980'],['Khan Agencies','Soap','10','₹320']].map((r,i)=>{const g=G(xl);T(g,0,-136+i*80);r.forEach((v,k)=>TX(g,HD[k],10,31,v,INK,'start',k?500:600));P(g,'M-470 36H470','none',{stroke:PEACH,'stroke-width':3});return g});
// ---- many into one ----
const net=G(sv),iris=S('circle',{cx:540,cy:800,r:0,fill:DT},net),lines=G(net),nodes=[];for(let i=0;i<64;i++){const a=i*2.399,r=250+((i*37)%100)/100*640,x=540+Math.cos(a)*r*.86,y=800+Math.sin(a)*r*(Math.sin(a)>0?.66:1);nodes.push({x,y,l:S('path',{d:`M${x} ${y}L540 800`,stroke:MINT,'stroke-width':2.5,fill:'none'},lines),d:CI(net,x,y,10+(i%3)*4,i%5?MINT:SAND,N),p:CI(net,x,y,7,WH,N)})}
const eI=G(net);ic(eI,1.15);const t1=TX(net,540,1490,70,'A million distributors.',WH,'middle',600),t2=TX(net,540,1580,70,'One platform.',SAND,'middle',700),eN=TX(net,540,1010,150,'Saar',WH,'middle',700),eS=G(net);R(eS,-250,-60,500,120,WH,60,N);TX(eS,0,22,62,'Coming soon',DT,'middle',600);
function renderAt(t){
 const push=L(1,1.07,eio(seg(t,0,c(2)))),inPh=t>=c(9)-.1&&t<c(12)+.2;
 T(world,540-540*push,0,push);
 const KF=[[0,[255,240,200],0,[220,235,229]],[c(3),[230,150,70],.05,[246,226,178]],[c(5),[217,120,60],.13,[238,165,115]],[c(6)+.8,[52,50,100],.3,[86,84,130]],[c(7),[24,38,74],.44,[31,42,68]],[c(8)-.1,[24,38,74],.44,[31,42,68]],[c(8)+1.1,[255,240,200],0,[220,235,229]]];
 let ki=0;while(ki<KF.length-2&&t>KF[ki+1][0])ki++;const kq=seg(t,KF[ki][0],Math.max(.01,KF[ki+1][0]-KF[ki][0])),mix=(a,b)=>a.map((v,i)=>Math.round(L(v,b[i],kq))),rgb=a=>`rgb(${a.join(',')})`;
 dusk.setAttribute('fill',rgb(mix(KF[ki][1],KF[ki+1][1])));dusk.style.opacity=L(KF[ki][2],KF[ki+1][2],kq);skyR.setAttribute('fill',rgb(mix(KF[ki][3],KF[ki+1][3])));
 const night=clamp(L(KF[ki][2],KF[ki+1][2],kq)/.44),dayArc=seg(t,0,c(6)+.6),nxt=t>c(8)-.1?seg(t,c(8)-.1,1.2):0;sun.setAttribute('cx',L(430,650,dayArc));sun.setAttribute('cy',L(400,590,dayArc*dayArc)-(1-dayArc)*30);sun.style.opacity=t<c(6)+1?1:nxt;if(nxt>0){sun.setAttribute('cx',430);sun.setAttribute('cy',L(600,410,nxt))}
 T(moon,L(650,480,seg(t,c(6),2.6)),L(560,420,seg(t,c(6),2.6)),1);moon.style.opacity=seg(t,c(6)+.6,.8)*(1-seg(t,c(8)-.1,.8));stars.forEach((x,i)=>x.style.opacity=night*(.6+.4*Math.sin(t*3+i*2)));
 VIS(lit,night>0);lit.style.opacity=clamp(night*1.4);BULBS.forEach((b,i)=>b.style.opacity=.85+.15*Math.sin(t*7+i*1.7));VIS(pool,false);
 strips.forEach(o=>T(o.g,o.x,250,1,Math.sin(t*1.1+o.k)*1.3));stm.forEach((m,i)=>{const a=(t*.5+i*.33)%1;m.setAttribute('d',`M${240+i*10} ${1432-a*70}q${Math.sin(a*6)*12} -12 0 -24`);m.style.opacity=(1-a)*.75});
 const clockT=t<c(7)?t*t*.9:c(7)*c(7)*.9+(t-c(7))*20;hM.setAttribute('transform',`rotate(${clockT*6})`);hH.setAttribute('transform',`rotate(${clockT*.5+200})`);
 const SH_Y=1520;let write=false,onPhone=false,p={x:540,y:SH_Y,s:1.2,look:0,m:'smile',brow:0,seed:.1,tilt:Math.sin(t*.8)*1.2};
 const b1=t>=c(1)&&t<c(2),b3=t>=c(3)&&t<c(4),b4=t>=c(4)&&t<c(5),b5=t>=c(5)&&t<c(6),b6=t>=c(6)&&t<c(7);
 if(t<c(1)){const pat=t>3.5?Math.abs(Math.sin((t-3.5)*5))*26:0,w=t<3.3;p.aR=w?[-96+Math.sin(t*2.1)*50,-20+Math.sin(t*9)*5]:[-96,-22-pat];p.closed=t>3.9;p.m=t>3.9?'laugh':'smile';p.look=-.4;p.lookY=w?.9:0;p.hy=w?10:0;p.tilt=w?-3:0;write=w}
 else if(b1){const q=t-c(1);p.x=L(540,650,ent(t,c(1),.5));p.look=-1;p.tilt=-3;p.aL=[L(-235,-290,ent(t,c(1)+.3)),L(-20,-250,ent(t,c(1)+.3))];p.bL=-60;if(t>c(1)+4.2){p.m='laugh';p.closed=true}}
 else if(t<c(3)){p.x=L(650,540,ent(t,c(2),.5));p.look=-.4;p.lookY=.9;p.hy=10;p.brow=.2;p.aR=[-96+Math.sin(t*2.3)*54,-20+Math.sin(t*9)*5];write=true}
 else if(b3){const n=Math.sin((t-c(3))*Math.PI*3.2);p.hy=Math.max(0,n)*16;p.tilt=Math.sin(t*2)*5;p.look=Math.sin(t*1.5);p.aR=[186,-470];p.bR=120;p.m=n>0?'o':'smile';onPhone=true}
 else if(b4){p.aL=[-310,-300+Math.sin(t*2)*8];p.aR=[310,-300+Math.sin(t*2)*8];p.bL=-70;p.bR=70;p.m='flat';p.brow=.7;p.tilt=-4}
 else if(b5){p.look=0;p.lookY=-1;p.m='worry';p.brow=.8;p.aR=[120,-370];p.bR=90}
 else if(b6){const d=ent(t,c(6)+1.4);p.look=0;p.lookY=.6;p.m=d>.5?'worry':'o';p.brow=.9;p.hy=d*18;p.y=SH_Y+d*16;p.tilt=d*-3}
 else if(t<c(9)){const u=ent(t,c(8)-.2,.6);p.x=720;p.look=-1;p.lookY=L(.7,0,u);p.m=u>.5?'smile':'worry';p.brow=L(.9,0,u);p.hy=L(18,0,u);p.aL=[L(-235,-310,u),L(-20,-280,u)];p.bL=-60}
 else if(t>=c(12)-.1){const u=ent(t,c(12)+.2);p.y=1560;p.s=.92;p.look=0;p.lookY=-.8;const sp2=Math.sin((t-c(12))*1.6);p.closed=sp2>.5;p.m=sp2>.5?'laugh':'smile';p.aR=[240,-260];p.bR=60}
 pose(sh,t,p);VIS(sh.r,!inPh&&t<c(13)+.8);
 VIS(pen,write);if(write)T(pen,p.x+p.aR[0]*p.s-8,p.y+p.aR[1]*p.s-6,1,0);VIS(ear,onPhone);if(onPhone)T(ear,p.x+p.aR[0]*p.s+22,p.y+p.aR[1]*p.s+14,1,8);
 noteL.forEach((l,i)=>{const q=seg((t%6.4)+(t<c(3)?0:0),i*1.9,1.9);l.setAttribute('d',`M-114 ${-8+i*11}L${-114+96*q} ${-8+i*11}`)});
 puff.forEach((d,i)=>{const a=seg(t,3.55+i*.05,.9);VIS(d,a>0&&a<1);d.setAttribute('cx',430+Math.cos(i*1.05-.4)*a*150);d.setAttribute('cy',1470-Math.abs(Math.sin(i*1.05+.5))*a*130);d.setAttribute('r',8+a*16);d.style.opacity=1-a});
 VIS(glass,t>=c(12)-.1&&t<c(13)+.8);T(glass,540+240*.92*push,1560-260*.92,1.1);
 // the notebook he is proud of
 VIS(note,t<c(3)+.2);note.style.opacity=1-seg(t,c(3),.2);
 // contacts
 const cp=ent(t,c(1)+.1,.45)*(1-ent(t,c(2)-.25,.3));OP(card,cp);T(card,300-(1-cp)*40,640,.95);CONT.forEach((g,i)=>g.style.opacity=seg(t,c(1)+.5+[0,1.3,2.6][i],.3));
 // diaries pile up either side
 DI.forEach((g,i)=>{const a=c(2)+.3+i*.34,x=i%2?860:240,yy=1478-Math.floor(i/2)*48,q=seg(t,a,.3);VIS(g,t>=a&&t<c(6)+.1);T(g,x+(i%4)*6,L(1240,yy,q*q),push,(i%3-1)*1.5);g.style.opacity=(1-seg(t,c(3)-.2,.3))*1+seg(t,c(4)+.1,.2)*0});
 // ten calls and a very patient man
 const pp=seg(t,c(3)-.1,.3)*(1-seg(t,c(4)-.25,.25));phones.forEach((o,i)=>{const on=(t*2.2+i*.37)%1<.5;VIS(o.g,pp>0);o.g.style.opacity=pp;T(o.g,o.x,o.y,1.05,on?Math.sin(t*38)*3:0);o.d.style.opacity=on?1:.15});
 const hn=t>=c(3)+1.7&&t<c(4)-.2;VIS(hb,hn);if(hn){const m=Math.floor((t-c(3)-1.7)/.62);T(hb,m%2?680:400,600,soft(t,c(3)+1.7+m*.62,.2));hbT.textContent='Haan ji'}
 const rg=t>c(2)+2.2&&t<c(4)-.2;T(tel,860,1496,1,rg?Math.sin(t*30)*1.5:0);rings.forEach((r,i)=>{const a=(t*1.6+i*.5)%1,q=60+a*90;r.setAttribute('d',`M${860+q} ${1416-q*.4}Q${860+q*1.25} ${1456} ${860+q} ${1496-q*.1}`);r.style.opacity=rg?1-a:0});
 // who promised what
 who.forEach((g,i)=>{const p2=soft(t,c(4)+.3+i*.35)*(1-ent(t,c(5)-.25,.25));OP(g,Math.min(1,Math.max(0,p2)));T(g,[210,540,870][i],[470,350,470][i],Math.max(0,p2))});
 // diaries and a memory
 big.forEach((b,i)=>{const p2=ent(t,c(5)+.1+i*.7)*(1-ent(t,c(6)-.2,.25));OP(b.g,p2);T(b.g,b.x,L(1120,920,p2),1,i?4:-4)});const tp=soft(t,c(5)+2.4)*(1-ent(t,c(6)-.2,.25));OP(th,Math.min(1,Math.max(0,tp)));T(th,540,500,Math.max(0,tp));
 // bills
 bills.forEach((g,i)=>{const a=c(6)+.1+i*.14,q=seg(t,a,.85),fl=1-q;VIS(g,t>=a&&t<c(7)+.1);g.style.opacity=1-seg(t,c(7)-.2,.25);const bx=[250,830,330,760,420,690,540][i],by=[560,520,760,740,620,640,830][i];T(g,bx+Math.sin(q*9+i)*70*fl,L(-260,by,q),1,[-8,7,5,-6,9,-4,2][i]+Math.sin(q*8+i*2)*22*fl)});
 const nm=t>=c(6)+1.45;VIS(nomatch,nm&&t<c(7));if(nm){const q=seg(t,c(6)+1.45,.14);T(nomatch,540,700,L(1.5,1,q),-5);nomatch.style.opacity=q*(1-seg(t,c(7)-.2,.2))}
 // daughter
 const gi=ent(t,c(7)-.3,.7),gv=t>=c(7)-.3&&t<c(9)+.2;VIS(girl.r,gv);pose(girl,t,{x:L(-220,270,gi),y:1525,s:1.1,look:1,m:'smile',seed:.4,aR:[188,-300],bR:50,tilt:3});
 VIS(sp,gv);T(sp,L(-220,270,gi)+188*1.1,1525-300*1.1-70,L(.9,1,gi),6);
 // the big phone
 const r=ent(t,c(9)-.1,.6),o2=ent(t,c(12)-.15,.5);VIS(ph,inPh);T(ph,540,L(2300,890,r)+o2*1600,1.1);
 VIS(s9,t<c(10)+.2);VIS(s10,t>=c(10)-.1&&t<c(11)+.2);VIS(s11,t>=c(11)-.1);
 pHead.textContent=t<c(10)?'Call with Gupta ji':t<c(11)?'Live call':'Saved';
 s9.style.opacity=1-seg(t,c(10)-.1,.2);s10.style.opacity=seg(t,c(10)-.1,.2)*(1-seg(t,c(11)-.1,.2));s11.style.opacity=seg(t,c(11)-.1,.2);
 [0,1].forEach(i=>{const e=document.getElementsByClassName('ag'+i)[0];e.style.opacity=seg(t,c(9)+.9+i*.9,.25)});rec.style.opacity=seg(t,c(9)+2.7,.3);
 bars.forEach((b,i)=>{const h=10+56*Math.abs(Math.sin(t*(5+i%4)+i*1.2));b.setAttribute('height',h);b.setAttribute('y',-270-h/2)});
 LINES.forEach((g,i)=>{const a=c(10)+.5+i*1.35,q=ent(t,a,.35);g.style.opacity=q;T(g,0,-150+i*134+(1-q)*20)});
 RW.forEach((g,i)=>g.style.opacity=seg(t,c(11)+.1+i*.28,.25));STP.forEach((g,i)=>{const a=c(11)+1.9+i*.8,q=seg(t,a,.12);g.style.opacity=q;T(g,i?146:-146,280,L(1.5,1,q),i?4:-4)});
 // the sheet fills up
 const xp=ent(t,c(12)-.05,.5)*(1-ent(t,c(13)-.2,.3));OP(xl,xp);T(xl,540,L(560,600,xp),1);DATA.forEach((g,i)=>g.style.opacity=seg(t,c(12)+.5+i*.42,.25));
 // many into one
 const ir=ent(t,c(13)-.2,.8);VIS(net,ir>0);iris.setAttribute('r',ir*1300);
 const out=ent(t,c(14)-.15,.5);nodes.forEach((n,i)=>{const a=c(13)+.2+i*.022,q=ent(t,a,.3),fl=((t*.7+i*.13)%1);n.d.style.opacity=q*(1-out);n.l.style.opacity=q*.28*(1-out);n.p.setAttribute('cx',L(n.x,540,fl));n.p.setAttribute('cy',L(n.y,800,fl));n.p.style.opacity=q*(1-out)*.9});
 const ip=soft(t,c(13)+.1,.5);T(eI,540,L(800,690,ent(t,c(14)-.1,.5)),Math.max(0,ip));t1.style.opacity=ent(t,c(13)+.3,.4)*(1-out);t2.style.opacity=ent(t,c(13)+1.2,.4)*(1-out);
 eN.style.opacity=ent(t,c(14),.4);const es=ent(t,c(15),.4);eS.style.opacity=es;T(eS,540,1190+(1-es)*16);
}
