import { Component, lazy, Suspense, useEffect, useRef, useState } from 'react';
import GlideSelect from './components/GlideSelect';
import LatticeLoader from './components/LatticeLoader';
import FoldText from './components/FoldText';
import { content, project, repo, release, zipName, zipHash } from './content';
const TreeEffect = lazy(() => import('./Effects').then(m => ({default:m.TreeEffect})));
const Rays = lazy(() => import('./Effects').then(m => ({default:m.Rays})));
const Gallery = lazy(() => import('./Effects').then(m => ({default:m.Gallery})));
const asset = name => new URL(`assets/${name}`, document.baseURI).href;
class EffectBoundary extends Component {
  state = { failed:false };
  static getDerivedStateFromError() { return {failed:true}; }
  render() { return this.state.failed ? this.props.fallback || null : this.props.children; }
}
function supportsWebGL() {
  try { const gl = document.createElement('canvas').getContext('webgl2'); if (!gl) return false; gl.getExtension('WEBGL_lose_context')?.loseContext(); return true; } catch { return false; }
}
function initialLanguage() { try { return localStorage.getItem(project.slug+'-language') === 'en' ? 'en' : 'pt'; } catch { return 'pt'; } }
export default function App() {
  const [language,setLanguage]=useState(initialLanguage);
  const [originalTree,setOriginalTree]=useState(false);
  const [effects,setEffects]=useState(() => !matchMedia('(prefers-reduced-motion: reduce)').matches && supportsWebGL());
  const [download,setDownload]=useState('idle');
  const [progress,setProgress]=useState(null);
  const [toast,setToast]=useState('');
  const controller=useRef(null); const toastTimer=useRef(null); const downloading=useRef(false);
  const t=content[language];
  useEffect(() => {
    document.documentElement.lang=language==='pt'?'pt-BR':'en';
    document.title=`${project.name} — ${language==='pt'?'guia e download':'guide and download'}`;
    try { localStorage.setItem(project.slug+'-language',language); } catch { /* Optional storage. */ }
  },[language]);
  useEffect(() => {
    const preference=matchMedia('(prefers-reduced-motion: reduce)');
    const change=()=>{ if(preference.matches)setEffects(false); };
    preference.addEventListener('change',change);
    return () => { preference.removeEventListener('change',change); controller.current?.abort(); clearTimeout(toastTimer.current); };
  },[]);
  async function copy(command) {
    try { await navigator.clipboard.writeText(command); setToast(t.copied); } catch { setToast(t.copyFail); }
    clearTimeout(toastTimer.current); toastTimer.current=setTimeout(()=>setToast(''),3000);
  }
  async function startDownload(event) {
    // Browser manages downloads when streaming or integrity APIs are unavailable.
    if(!window.crypto?.subtle || !window.ReadableStream)return;
    event.preventDefault(); if(downloading.current)return;
    downloading.current=true; setDownload('working');setProgress(null);
    controller.current=new AbortController();
    try {
      const response=await fetch(new URL(`downloads/${zipName}`,document.baseURI),{signal:controller.current.signal});
      if(!response.ok)throw new Error('HTTP '+response.status);
      if(!response.body)throw new Error('Missing download stream');
      const total=Number(response.headers.get('content-length'));
      const reader=response.body.getReader();const chunks=[];let received=0;
      while(true){const {done,value}=await reader.read();if(done)break;received+=value.length;if(received>5*1024*1024)throw new Error('Unexpected file size');chunks.push(value);if(total>0)setProgress(Math.min(100,Math.round(received/total*100)));}
      const blob=new Blob(chunks,{type:'application/zip'});
      const digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());
      const hex=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
      if(hex!==zipHash)throw new Error('Integrity mismatch');
      const objectURL=URL.createObjectURL(blob);const link=document.createElement('a');link.href=objectURL;link.download=zipName;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(objectURL),30000);
      setDownload('done');setProgress(100);
    } catch(error) {setDownload(error.name==='AbortError'?'idle':'error');}
    finally {downloading.current=false;controller.current=null;}
  }
  const downloadLink=(extra='')=><a data-download className={`button primary ${extra}`} href={new URL(`downloads/${zipName}`,document.baseURI).href} onClick={startDownload} aria-disabled={download==='working'}>{t.download}<span aria-hidden="true">↓</span></a>;
  const items=project.galleryFiles.map((name,i)=>({src:asset(name),alt:t.photoAlt,title:t.gallery[i][0],subtitle:t.gallery[i][1]}));
  const staticGallery=<div className="static-gallery">{items.map(item=><figure key={item.src}><a href={item.src}><img src={item.src} alt={item.alt} loading="lazy" /></a><figcaption>{item.title}<small>{item.subtitle}</small></figcaption></figure>)}</div>;
  return <>
    <a className="skip" href="#main">{t.skip}</a>
    <header className="header wrap"><a className="brand" href="#"><img src={asset(project.hero)} width="26" height="32" alt=""/>{project.name}</a><nav aria-label={language==='pt'?'Principal':'Main'}>{['recursos','instalar','usar','documentacao'].map((id,i)=><a key={id} href={`#${id}`}>{t.nav[i]}</a>)}</nav><GlideSelect value={language} onChange={setLanguage} options={[{value:'pt',label:'PT',tag:'Português'},{value:'en',label:'EN',tag:'English'}]} ariaLabel="Idioma / Language" size="lg" align="right" menuWidth={170} accentColor="#83beff" surfaceColor="#1b2531" highlightColor="#304256" textColor="#edf0e9" popDuration={effects?180:0} glideDuration={effects?220:0}/></header>
    <main id="main">
      <section className="hero wrap"><svg className="dot-field" aria-hidden="true"><defs><pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="0.8" fill={project.accent}/></pattern></defs><rect width="100%" height="100%" fill="url(#dots)"/></svg><div className="hero-copy"><p className="eyebrow">{project.name.toUpperCase()} <span>{language==='pt'?'Projeto local':'Local project'}</span></p><h1>{effects?<FoldText key={language} text={t.title} splitBy="word" duration={0.5} stagger={0.07} creaseShading={0} fontSize="inherit" fontWeight={400} color="#edf0e9"/>:t.title}</h1><p className="lead">{t.lead}</p><div className="actions">{downloadLink()}<a className="button secondary" href={repo}>{t.source} ↗</a></div><p className="small">{t.hint}</p></div><figure className="hero-tree"><img src={asset(project.hero)} alt={t.treeAlt} className="tree-fallback"/>{effects&&<EffectBoundary><Suspense fallback={null}><div className="rays hero-rays" aria-hidden="true"><Rays/></div><div className="tree-effect" aria-hidden="true"><TreeEffect src={asset(project.hero)} original={originalTree}/></div></Suspense></EffectBoundary>}<figcaption>{effects&&<button className="tree-control" type="button" aria-pressed={originalTree} onClick={()=>setOriginalTree(v=>!v)}>{originalTree?t.treeReset:t.treeAction}</button>}<span>{effects?t.treeHint:t.treeCaption}</span></figcaption></figure></section>
      <div className="strip wrap">{project.meta.split(' · ').map(item=><span key={item}>{item}</span>)}<button type="button" className="effects-toggle" onClick={()=>setEffects(value=>!value&&supportsWebGL())} aria-pressed={effects}>{t.effects}: {effects?t.on:t.off}</button></div>
      <section id="recursos" className="section wrap"><div className="heading"><h2>{t.featuresTitle}</h2><p>{t.featuresIntro}</p></div><div className="features">{t.features.map(([title,text],i)=><article key={title}><span className="number">0{i+1}</span><h3>{title}</h3><p>{text}</p></article>)}</div></section>
      <section className="gallery-section wrap"><div className="heading row"><h2>{t.galleryTitle}</h2><p>{effects?t.galleryHint:''}</p></div>{effects?<EffectBoundary fallback={staticGallery}><Suspense fallback={staticGallery}><div className="carousel-wrap"><Gallery items={items} label={t.galleryTitle}/></div></Suspense></EffectBoundary>:staticGallery}<a className="text-link" href={`${repo}/blob/main/${project.hardware}`}>{t.hardware} ↗</a></section>
      <section id="instalar" className="section wrap"><div className="heading"><h2>{t.installTitle}</h2></div><div className="install-grid"><aside><h3>{t.requirements}</h3><ul>{t.items.map(item=><li key={item}>{item}</li>)}</ul><p className="small">{t.boardWarning}</p><div className="links"><a href={`${repo}/blob/main/${project.guide}`}>{t.fullGuide} ↗</a><a href={repo}>{t.source} ↗</a></div></aside><ol className="steps">{t.steps.map(([title,text],i)=><li key={title}><span className="number">0{i+1}</span><div><h3>{title}</h3><p>{text}</p>{i===0?downloadLink('small-button'):<div className="command"><code>{t.commands[i]}</code><button type="button" data-copy={t.commands[i]} onClick={()=>copy(t.commands[i])}>{t.copy}</button></div>}</div></li>)}</ol></div><div className="notice"><p>{t.installingNote}</p><a href={`${repo}/blob/main/${project.guide}`}>{t.fullGuide} ↗</a></div></section>
      <section id="usar" className="usage"><div className="wrap section"><div className="heading"><h2>{t.usageTitle}</h2></div><div className="usage-grid">{t.usage.map(([title,text])=><article key={title}><h3>{title}</h3><p>{text}</p></article>)}</div></div>{effects&&<EffectBoundary><Suspense fallback={null}><div className="rays usage-rays" aria-hidden="true"><Rays origin="bottom-left"/></div></Suspense></EffectBoundary>}</section>
      <section id="documentacao" className="section wrap docs-grid"><div className="heading"><h2>{t.docsTitle}</h2><p>{t.docsIntro}</p><div className="links"><a href={`${repo}/blob/main/${project.hardware}`}>{t.hardware} ↗</a><a href={`${repo}/${project.slug==='ghostreply'?'tree':'blob'}/main/${project.tests}`}>{t.tests} ↗</a><a href="downloads/SHA256SUMS.txt">{t.versions} ↗</a></div></div><div className="faq">{t.questions.map(([question,answer])=><details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>
    </main>
    <footer className="wrap"><span className="brand">{project.name}</span><p>{t.footer}</p><a href={`${repo}/blob/main/docs/THIRD-PARTY.md`}>{t.licenses} ↗</a><div className="project-links"><a href="https://fwestarb.github.io/esp32-tera/">ESP32 Tera ↗</a><a href="https://fwestarb.github.io/ghostreply/">GhostReply ↗</a><a href="https://fwestarb.github.io/projeto-camera/">Projeto Câmera ↗</a></div></footer>
    {toast&&<div className="toast" role="status">{toast}</div>}
    {download!=='idle'&&<div className="download-panel" role="status" aria-live="polite"><LatticeLoader status={download} label={t.downloadWorking} doneLabel={t.downloadDone} errorLabel={t.downloadError} color="#edf0e9" doneColor="#83beff" showTimer={download==='working'} step={effects?90:100000} elapsed={effects?undefined:0}/>{download==='working'&&<><span>{progress!==null?`${progress}%`:''}</span><button onClick={()=>controller.current?.abort()}>{t.cancel}</button></>}{download==='done'&&<small>{t.verified}</small>}{download==='error'&&<a href={new URL(`downloads/${zipName}`,document.baseURI).href}>{t.downloadFallback} ↗</a>}{download!=='working'&&<button className="dismiss" aria-label={language==='pt'?'Fechar':'Close'} onClick={()=>setDownload('idle')}>×</button>}</div>}
  </>;
}
