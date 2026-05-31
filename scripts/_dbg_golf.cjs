const puppeteer=require('puppeteer-core');
const {pathToFileURL}=require('url');const path=require('path');const fs=require('fs');
const cands=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
let chrome=cands.find(c=>fs.existsSync(c));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
const b=await puppeteer.launch({executablePath:chrome,headless:'new',args:['--no-sandbox','--disable-gpu','--mute-audio','--window-size=1280,800']});
const p=await b.newPage();await p.setViewport({width:1280,height:800});
const errs=[];p.on('pageerror',e=>errs.push(String(e.message||e)));p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await p.goto(pathToFileURL(path.resolve('games/golf/index.html')).href,{waitUntil:'domcontentloaded'});
await sleep(1200);
await p.evaluate(()=>{ startCourse(); showScreen('none'); });
await sleep(100);

// 1) Real drag-putt on hole 1: aim from ball toward cup (pull left)
const fb=await p.evaluate(()=>{
  const fx=G.ball.x, fy=G.ball.y;
  const sx=view.ox+fx*view.scale, sy=view.oy+fy*view.scale;
  return {sx,sy,bx:fx,by:fy};
});
await p.mouse.move(fb.sx,fb.sy); await p.mouse.down();
await p.mouse.move(fb.sx-150,fb.sy,{steps:8}); // pull back left => launch right toward cup
await p.mouse.up();
await sleep(120);
const afterPutt=await p.evaluate(()=>({moving:G.ball.moving,vx:Math.round(G.ball.vx),vy:Math.round(G.ball.vy),strokes:G.strokes[0]}));
console.log('PUTT',JSON.stringify(afterPutt));

// 2) water penalty test: load hole 3 (has water), drop ball into water
await p.evaluate(()=>{ loadHole(2); G.state='play'; });
await sleep(50);
const waterRes=await p.evaluate(()=>{
  const w=G.hole.water[0];
  G.strokes[2]=1; G.lastRest={x:G.hole.tee.x,y:G.hole.tee.y};
  G.ball.x=w.x+w.w/2; G.ball.y=w.y+w.h/2; G.ball.vx=100; G.ball.vy=0; G.ball.moving=true;
  tickBall(1/60);
  return {strokes:G.strokes[2], bx:Math.round(G.ball.x), by:Math.round(G.ball.y), tee:[G.hole.tee.x,G.hole.tee.y], moving:G.ball.moving};
});
console.log('WATER',JSON.stringify(waterRes));

// 3) bumper boost test: hole 1 bumper
await p.evaluate(()=>{ loadHole(0); G.state='play'; });
await sleep(30);
const bump=await p.evaluate(()=>{
  const bp=G.hole.bumpers[0];
  G.ball.x=bp.x-bp.r-8; G.ball.y=bp.y; G.ball.vx=200; G.ball.vy=0; G.ball.moving=true;
  let speeds=[];
  for(let i=0;i<8;i++){ tickBall(1/60); speeds.push(Math.round(Math.hypot(G.ball.vx,G.ball.vy))); }
  return {speeds, vx:Math.round(G.ball.vx)};
});
console.log('BUMPER',JSON.stringify(bump));

console.log('ERRORS',JSON.stringify(errs));
await b.close();
})();
