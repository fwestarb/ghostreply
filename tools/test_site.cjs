// Run against the built website with Playwright and Microsoft Edge available.
const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
(async()=>{
 const url=process.env.PROJECT_SITE_URL||'http://127.0.0.1:8809/';
 const raw=fs.readFileSync(path.resolve(__dirname,'../website/src/content.js'),'utf8');const cfg=JSON.parse(raw.split('export const project=')[1].split(';')[0]);const text=JSON.parse(raw.split('export const content=')[1].trim().replace(/;$/,''));
 const output=path.resolve(__dirname,'../private-backups/site-check-v2');fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
 try {
  const context=await browser.newContext({permissions:['clipboard-read','clipboard-write'],acceptDownloads:true});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  assert.equal((await page.goto(url)).status(),200);
  await page.waitForFunction(()=>document.querySelector('.effect-surface')?.dataset.ready==='true');
  async function language(value){await page.getByRole('combobox',{name:'Idioma / Language',exact:true}).click();await page.getByRole('option',{name:value==='en'?/EN English/:/PT Português/}).click();await page.waitForFunction(lang=>document.documentElement.lang===lang,value==='en'?'en':'pt-BR');}
  await page.evaluate(()=>Promise.all([document.fonts.load('400 32px Oi'),document.fonts.load('400 16px \"STIX Two Text\"')]));
  assert.match(await page.locator('h1').evaluate(e=>getComputedStyle(e).fontFamily),/Oi/);
  await page.locator('.tree-control').click();assert.equal(await page.locator('.tree-control').getAttribute('aria-pressed'),'true');await page.locator('.tree-control').click();
  await language('en');assert.ok((await page.locator('h1').innerText()).includes(text.en.title));
  await page.reload();assert.equal(await page.locator('html').getAttribute('lang'),'en');
  await page.getByRole('combobox',{name:'Idioma / Language',exact:true}).click();await page.keyboard.press('Escape');assert.equal(await page.getByRole('combobox',{name:'Idioma / Language',exact:true}).getAttribute('aria-expanded'),'false');
  const layouts=[];
  for(const lang of ['pt','en']){await language(lang);for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`${lang} ${width} overflow`);layouts.push({language:lang,width,overflow:false});}}
  await language('pt');await page.locator('[data-copy]').first().click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),text.pt.commands[1]);
  await page.locator('summary').first().click();assert.equal(await page.locator('details').first().getAttribute('open'),'');
  await page.locator('.flex-carousel').scrollIntoViewIfNeeded();await page.locator('.flex-carousel').focus();await page.keyboard.press('ArrowRight');await page.waitForFunction(title=>document.querySelector('.flex-carousel__live')?.textContent.includes(title),text.pt.gallery[1][0]);
  await page.keyboard.press('Enter');await page.keyboard.press('Escape');
  await page.waitForTimeout(600);const box=await page.locator('.flex-carousel').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);const before=await page.evaluate(()=>scrollY);await page.mouse.wheel(0,250);await page.waitForTimeout(400);assert.ok(await page.evaluate(()=>scrollY)>before);
  await page.locator('#usar').scrollIntoViewIfNeeded();await page.waitForTimeout(700);assert.ok(await page.locator('.usage-rays canvas').count()>0);
  assert.equal(await page.evaluate(()=>[document.documentElement,document.body,document.querySelector('.hero'),document.querySelector('.usage')].every(e=>getComputedStyle(e).backgroundImage==='none')),true);
  await page.locator('.effects-toggle').click();assert.equal(await page.locator('canvas').count(),0);await page.waitForFunction(()=>Array.from(document.querySelectorAll('.static-gallery img')).every(e=>e.complete&&e.naturalWidth>0));assert.equal(await page.locator('.static-gallery img').evaluateAll(es=>es.every(e=>e.complete&&e.naturalWidth>0)),true);
  await page.locator('.effects-toggle').click();await page.waitForFunction(()=>document.querySelector('.effect-surface')?.dataset.ready==='true');
  await page.evaluate(()=>document.activeElement?.blur());await page.screenshot({path:path.join(output,'desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,'mobile.png'),fullPage:true});await page.setViewportSize({width:1440,height:1000});
  const glob='**/downloads/*.zip';await page.route(glob,async route=>{const response=await route.fetch();await new Promise(r=>setTimeout(r,450));await route.fulfill({response});});
  const pending=page.waitForEvent('download');await page.locator('[data-download]').first().click();await page.locator('.lattice-loader[data-status="working"]').waitFor();const download=await pending;
  const hash=createHash('sha256').update(fs.readFileSync(await download.path())).digest('hex');assert.equal(hash,cfg.zipHash);assert.equal(download.suggestedFilename(),cfg.zipName);assert.match(await page.locator('.download-panel').innerText(),/SHA-256 verificado/);await page.locator('.dismiss').click();await page.unroute(glob);
  // Reject a corrupt HTTP-200 response instead of delivering an unchecked file.
  await page.route(glob,r=>r.fulfill({status:200,body:'corrupt archive',contentType:'application/zip'}));await page.locator('[data-download]').first().click();await page.locator('.lattice-loader[data-status="error"]').waitFor();await page.locator('.dismiss').click();await page.unroute(glob);
  await page.route(glob,r=>r.abort('failed'));await page.locator('[data-download]').first().click();await page.locator('.lattice-loader[data-status="error"]').waitFor();await page.locator('.dismiss').click();await page.unroute(glob);
  await page.route(glob,async r=>{await new Promise(done=>setTimeout(done,700));try{await r.continue();}catch{}});await page.locator('[data-download]').first().click();await page.getByRole('button',{name:'Cancelar',exact:true}).click();await page.locator('.download-panel').waitFor({state:'detached'});await page.unroute(glob);
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.querySelectorAll('canvas').length===0);assert.equal(await page.locator('canvas').count(),0);assert.equal(await page.locator('.effects-toggle').getAttribute('aria-pressed'),'false');
  const fallback=await context.newPage();await fallback.addInitScript(()=>{HTMLCanvasElement.prototype.getContext=function(){return null;};});await fallback.goto(url);await fallback.locator('.static-gallery').waitFor();assert.equal(await fallback.locator('canvas').count(),0);await fallback.waitForFunction(()=>document.querySelector('.tree-fallback')?.complete&&document.querySelector('.tree-fallback')?.naturalWidth>0);assert.equal(await fallback.locator('.tree-fallback').evaluate(e=>e.complete&&e.naturalWidth>0),true);
  assert.deepEqual(errors,[]);const report={url,http:200,fonts:true,interactiveSymbol:true,layouts,languagePersistence:true,selectorKeyboard:true,clipboard:true,faq:true,webglComponents:true,galleryKeyboard:true,verticalScroll:true,solidBackground:true,download:{sha256:hash,verified:true,loader:true,corruptFileRejected:true,networkFailureHandled:true,cancellation:true},reducedMotion:true,noWebGLFallback:true,javascriptErrors:errors};fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
