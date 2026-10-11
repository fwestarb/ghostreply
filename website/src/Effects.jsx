import { project } from './content';
import { useState } from 'react';
import HalftoneReveal from './components/HalftoneReveal';
import SideRays from './components/SideRays';
import FlexCarousel from './components/FlexCarousel';
export function TreeEffect({ src, original = false }) {
  const [ready, setReady] = useState(false);
  return <div className="effect-surface" data-ready={ready}><HalftoneReveal src={src} onReady={()=>setReady(true)} fit="contain" mode="mono" paperColor={project.background} inkColor={project.accent} cellSize={5} reverse={original} revealRadius={145} linger={0.6} intro={false} clickBurst /></div>;
}
export function Rays({ origin = 'top-right' }) {
  return <SideRays speed={0.65} rayColor1="#437cad" rayColor2={project.accent} intensity={1.8} spread={1.7} origin={origin} opacity={0.65} saturation={0.6} />;
}
export function Gallery({ items, label }) {
  return <FlexCarousel items={items} preset="arch" intro="rise" cardHeight={0.68} gap={30} squeeze={0.06} dispersion={0.4} bend={0.34} focusOnClick captions captureWheel={false} ariaLabel={label} />;
}
