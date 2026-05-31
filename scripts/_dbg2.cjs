const puppeteer=require('puppeteer-core');
const {pathToFileURL}=require('url');const path=require('path');const fs=require('fs');
const cands=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
let chrome=cands.find(c=>fs.existsSync(c));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
const b=await puppeteer.launch({executablePath:chrome,headless:'new',args:['--no-sandbox','--disable-gpu','--mute-audio']});
const p=await b.newPage();await p.setViewport({width:1280,height:800});
await p.goto(pathToFileURL(path.resolve('games/golf/index.html')).href,{waitUntil:'domcontentloaded'});
await sleep(1200);
await p.evaluate(()=>{ startCourse(); showScreen('none'); });
await sleep(80);
const r=await p.evaluate(()=>{
  const c=G.hole.cup; G.ball.x=c.x;G.ball.y=c.y;G.ball.vx=0;G.ball.vy=20;G.ball.moving=true;
  // manually run one tick
  tickBall(1/60);
  return {state:G.state,moving:G.ball.moving,bx:G.ball.x,by:G.ball.y,cup:[c.x,c.y,c.r]};
});
console.log(JSON.stringify(r));
await b.close();
})();
