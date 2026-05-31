const path=require('path');const {pathToFileURL}=require('url');
const fs=require('fs');
const CHROME=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
let chrome=CHROME.find(c=>fs.existsSync(c));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
const pup=require('puppeteer-core');
const b=await pup.launch({executablePath:chrome,headless:'new',args:['--no-sandbox','--disable-gpu','--mute-audio']});
const p=await b.newPage();
const pageErr=[];p.on('pageerror',e=>pageErr.push(String(e.message||e)));
const abs=path.resolve('games/racer/index.html');
await p.goto(pathToFileURL(abs).href,{waitUntil:'domcontentloaded',timeout:20000});
await sleep(1200);
await p.keyboard.press('Enter');
await sleep(3400);

// Step the car checkpoint-by-checkpoint from Node, re-reading nextCP each step.
let steps=0, lapAtStart=null;
const cpCount=await p.evaluate(()=>Game.T.CP_COUNT);
lapAtStart=await p.evaluate(()=>Game.car.lap);
for(let i=0;i<cpCount+3;i++){
  await p.evaluate(()=>{
    const cp=Game.T.checkpoints[Game.car.nextCP % Game.T.checkpoints.length];
    Game.car.x=cp.x; Game.car.y=cp.y; Game.car.vx=0; Game.car.vy=0;
  });
  await sleep(80); // let a couple of fixed-timestep ticks process this checkpoint
  steps++;
}
const out=await p.evaluate(()=>({
  lap:Game.car.lap, lastLap:Game.car.lastLap,
  ls:localStorage.getItem('arcade:racer'),
}));
console.log(JSON.stringify({pageErr,lapAtStart,steps,cpCount,out},null,2));
await b.close();
})();
