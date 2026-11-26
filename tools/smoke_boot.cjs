/* Headless smoke test for the real, resource-backed KURMET boot screen. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');

async function check(width,height,scale){
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({
  viewport:{width,height},deviceScaleFactor:scale,
  isMobile:width<500,hasTouch:width<500
 });
 const page=await context.newPage();
 const errors=[];
 page.on('pageerror',error=>errors.push(String(error)));
 try{
  await page.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>window.kurmetBootLoader?.finished,{timeout:50000});
  const boot=await page.evaluate(()=>{
   const loader=window.kurmetBootLoader;
   const paper=document.querySelector('#locationsModal .kurmet-locations-modal');
   return {
    completed:loader.completed,total:loader.total,failed:loader.failed,
    cards:document.querySelector('#locationsGrid')?.children.length,
    handKey:paper?.dataset.kurmetHandSize,
    handCount:paper?.querySelectorAll('canvas.kurmet-hand-foreground').length,
    handSizes:[...paper.querySelectorAll('canvas.kurmet-hand-foreground')].map(c=>[c.width,c.height]),
    bootHidden:document.getElementById('kurmet-boot-screen')?.hidden
   };
  });
  assert.equal(boot.completed,boot.total,'All tasks must settle');
  assert.equal(boot.total,12,'Tracked jobs count');
  assert.deepEqual(boot.failed,[],'Cold boot must load all required resources');
  assert.equal(boot.cards,24,'Menu cards prepared during boot');
  assert.ok(boot.handKey,'Parchment hand mask precomputed');
  assert.equal(boot.handCount,2,'Both hand-mask canvases prepared');
  assert.ok(boot.handSizes.every(d=>d[0]>0&&d[1]>0),'Hand masks have real dimensions');

  await page.locator('#kurmet-boot-continue').click({timeout:10000});
  await page.locator('#openLocations').click({timeout:10000});
  await page.waitForFunction(()=>!document.getElementById('locationsModal').hidden);
  const open=await page.evaluate(()=>{
   const paper=document.querySelector('#locationsModal .kurmet-locations-modal');
   return {key:paper.dataset.kurmetHandSize,
    cards:document.querySelector('#locationsGrid').children.length,
    canvases:[...paper.querySelectorAll('canvas.kurmet-hand-foreground')]
    .map(c=>({width:c.width,height:c.height,hidden:getComputedStyle(c).display==='none'}))}
  });
  assert.equal(open.key,boot.handKey,'First open must reuse prepared mask');
  assert.equal(open.cards,24,'First open must not rebuild a different number of cards');
  assert.ok(open.canvases.every(c=>!c.hidden),'Hand canvases visible in modal');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#locationsModal').getAttribute('hidden'),'','Locations closes on Escape');
  await page.locator('#openLocations').click({timeout:10000});
  const reopened=await page.evaluate(()=>document.querySelector('#locationsModal .kurmet-locations-modal').dataset.kurmetHandSize);
  assert.equal(reopened,boot.handKey,'Reopen keeps cached hand mask');
  await page.keyboard.press('Escape');
  await page.locator('#openMainMenu').click({timeout:10000});
  assert.equal(await page.locator('#mainMenuModal').isVisible(),true,'Main menu opens');
  await page.keyboard.press('Escape');
  await page.locator('#openPetActions').click({timeout:10000});
  assert.equal(await page.locator('#petActionsModal').isVisible(),true,'Actions menu opens');
  await page.keyboard.press('Escape');
  await page.locator('#openPetStatus').click({timeout:10000});
  assert.equal(await page.locator('#petStatusModal').isVisible(),true,'Status menu opens');
  assert.deepEqual(errors,[],'No unhandled browser runtime errors');
  console.log('PASS',JSON.stringify({width,height,scale,boot,open}));
 }finally{
  await browser.close();
 }
}
(async()=>{
 await check(390,844,2);
 await check(1024,768,1);
})().catch(error=>{console.error(error);process.exitCode=1;});
