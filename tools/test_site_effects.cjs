const {chromium}=require('playwright');
const fs=require('fs');const path=require('path');const assert=require('assert/strict');
(async()=>{
 const root=process.env.PROJECT_ROOT||path.resolve(__dirname,'..');
 const b=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
 try{
  const p=await b.newPage({viewport:{width:1440,height:1000}});
  await p.goto(process.env.PROJECT_SITE_URL);
  await p.waitForFunction(()=>document.querySelector('.effect-surface')?.dataset.ready==='true');
  const fontFaces=await p.evaluate(async()=>{const faces=await Promise.all([document.fonts.load('400 32px Oi'),document.fonts.load('400 16px "STIX Two Text"')]);return faces.map(group=>group.map(face=>({family:face.family,status:face.status})));});
  assert.ok(fontFaces.every(group=>group.length>0&&group.every(face=>face.status==='loaded')));
  await p.waitForTimeout(1300);await p.mouse.move(5,5);await p.waitForTimeout(850);
  const canvas=p.locator('.tree-effect canvas');const before=await canvas.screenshot();const box=await canvas.boundingBox();
  await p.mouse.move(box.x+box.width*.55,box.y+box.height*.45);await p.waitForTimeout(550);
  assert.notDeepEqual(before,await canvas.screenshot());
  const out=path.join(root,'private-backups');fs.mkdirSync(out,{recursive:true});
  await p.screenshot({path:path.join(out,'hero-visual.png')});
  await p.locator('.flex-carousel').scrollIntoViewIfNeeded();await p.waitForTimeout(1600);
  await p.screenshot({path:path.join(out,'gallery-visual.png')});
  await p.locator('.effects-toggle').click();await p.waitForFunction(()=>Array.from(document.querySelectorAll('.static-gallery img')).every(e=>e.complete&&e.naturalWidth>0));
  await p.setViewportSize({width:390,height:844});await p.locator('.hero').scrollIntoViewIfNeeded();await p.screenshot({path:path.join(out,'mobile-visual.png')});
  const report={url:process.env.PROJECT_SITE_URL,fontFaces,shaderPixelsChangeOnPointer:true,threeGalleryImagesLoaded:true};
  fs.writeFileSync(path.join(root,'docs/TESTE-EFEITOS.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
