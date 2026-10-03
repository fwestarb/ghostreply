/**
 * GhostReply - Spring
 * Utilitário de física de spring para as poucas animações que precisam
 * de movimento real (Dock, press de botão, entrada de modal/toast).
 *
 * NOTA: a ideia original era vendorizar o Motion One como um arquivo
 * local, sem build step. Na prática, nem o pacote "motion" nem
 * "@motionone/dom" publicam mais uma build standalone para <script> —
 * só ESM/CJS com imports entre vários pacotes internos, que quebram
 * sem um bundler. Em vez de forçar isso (ou de puxar um bundle de CDN
 * em runtime, proibido pela política do Manifest V3), este arquivo é
 * uma implementação própria e pequena do mesmo tipo de física
 * (oscilador harmônico amortecido) — sem dependência de terceiros.
 */

// Integra um spring (posição -> alvo) quadro a quadro via
// requestAnimationFrame, chamando onUpdate a cada passo. Retorna uma
// função para cancelar a animação antes de ela terminar.
const animateSpring = (onUpdate, options = {}) => {
  const { from = 0, to = 1, stiffness = 260, damping = 24, mass = 1, onComplete } = options;

  let position = from;
  let velocity = 0;
  let lastTime = null;
  let rafId = null;
  let cancelado = false;

  const step = (now) => {
    if (cancelado) return;
    if (lastTime === null) lastTime = now;

    const dt = Math.min((now - lastTime) / 1000, 0.032);
    lastTime = now;

    const forcaSpring = -stiffness * (position - to);
    const forcaAmortecimento = -damping * velocity;
    const aceleracao = (forcaSpring + forcaAmortecimento) / mass;

    velocity += aceleracao * dt;
    position += velocity * dt;

    const acomodado = Math.abs(to - position) < 0.001 && Math.abs(velocity) < 0.001;
    if (acomodado) {
      onUpdate(to);
      onComplete?.();
      return;
    }

    onUpdate(position);
    rafId = requestAnimationFrame(step);
  };

  rafId = requestAnimationFrame(step);

  return () => {
    cancelado = true;
    if (rafId) cancelAnimationFrame(rafId);
  };
};

// Atalho para o caso mais comum: animar uma propriedade CSS transform
// (scale/translateY) de um elemento até um valor-alvo com spring.
const springTransform = (el, { prop = 'scale', from, to, ...options }) => {
  const start = from !== undefined ? from : Number(el.dataset[`spring${prop}`] || (prop === 'scale' ? 1 : 0));

  return animateSpring(
    (valor) => {
      el.dataset[`spring${prop}`] = valor;
      const partes = {
        scale: `scale(${valor})`,
        translateY: `translateY(${valor}px)`
      };
      el.style.transform = partes[prop] || '';
    },
    { ...options, from: start, to }
  );
};
