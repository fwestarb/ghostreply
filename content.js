/**
 * GhostReply - Content Script
 * Extensao Chrome MV3, assistente de atendimento no WhatsApp Web.
 *
 * Uso interno: a extensão SUGERE respostas para um atendente humano,
 * que revisa antes de enviar. Ela nunca envia mensagem sozinha.
 *
 * Toda a IA passa pelo backend (ver api.js e background.js) — nenhuma
 * chave de API existe deste lado.
 */

// ============================================================
// SECAO 1: CONFIGURACAO E ESTADO
// ============================================================

const CONFIG = {
  MODOS: ['casual', 'confiante', 'profissional', 'direto'],
  DELAY_INJECAO: 1200,
  DEBOUNCE_CLICK: 300,
  // Depois de N varreduras sem encontrar onde injetar o botão,
  // assumimos que o WhatsApp Web mudou o HTML e avisamos em vez de
  // simplesmente não fazer nada (ver reportarFalhaDeSeletor).
  TENTATIVAS_ANTES_DE_ALERTAR: 12
};

const STATE = {
  site: null,
  modoAtual: 'profissional',
  paginaAtual: 'replies',
  painelAberto: false,
  ultimoClique: 0,
  botoesInjetados: new WeakSet(),
  ultimoTextoInserido: null,
  tentativasInjecao: 0,
  falhaDeSeletorReportada: false
};

const WHATSAPP_COMPOSE_SELECTORS = [
  'footer [data-testid="conversation-compose-box-input"]',
  'footer .x1n2onr6',
  'footer [contenteditable="true"]',
  '[data-testid="conversation-compose-box"]',
  'footer ._ak1l',
  'footer ._ak1r'
];

// ============================================================
// SECAO 2: UTILITARIOS
// ============================================================

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

const debounce = (fn, ms) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};

const getExtensionVersion = () => {
  try {
    return chrome?.runtime?.getManifest()?.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
};

/**
 * Reporta ao backend que a extensão não conseguiu se encaixar na
 * página. Isso acontece principalmente quando o WhatsApp Web muda o
 * HTML e os seletores param de casar.
 *
 * O objetivo é não falhar em silêncio: sem isso, a extensão
 * simplesmente deixaria de aparecer e só se descobriria o problema
 * quando alguém reclamasse.
 */
const reportarFalhaDeSeletor = (code, message) => {
  if (STATE.falhaDeSeletorReportada) return;
  STATE.falhaDeSeletorReportada = true;

  try {
    chrome.runtime.sendMessage(
      { type: 'LOG_CLIENT_ERROR', payload: { code, message, url: location.hostname } },
      () => void chrome.runtime.lastError
    );
  } catch {
    // service worker dormindo ou extensão recarregando: ignorar
  }

  console.warn(`[GhostReply] ${code}: ${message}`);
  mostrarAvisoFlutuante(
    'O GhostReply não conseguiu se encaixar nesta tela do WhatsApp. ' +
      'Isso costuma acontecer quando o WhatsApp Web é atualizado — recarregue a página; ' +
      'se continuar, a extensão precisa de ajuste.'
  );
};

// Aviso independente do painel: precisa aparecer justamente quando o
// botão que abre o painel não pôde ser criado.
const mostrarAvisoFlutuante = (mensagem) => {
  if (document.querySelector('.ghostreply-floating-alert')) return;

  const alerta = document.createElement('div');
  alerta.className = 'ghostreply-floating-alert';

  const texto = document.createElement('span');
  texto.textContent = mensagem;

  const fechar = document.createElement('button');
  fechar.className = 'ghostreply-floating-alert-close';
  fechar.setAttribute('aria-label', 'Fechar aviso');
  fechar.textContent = '×';
  fechar.addEventListener('click', () => alerta.remove());

  alerta.appendChild(texto);
  alerta.appendChild(fechar);
  document.body.appendChild(alerta);

  setTimeout(() => alerta.remove(), 20000);
};

// ============================================================
// SECAO 3: DETECCAO DE SITE
// ============================================================

// Só WhatsApp Web. O suporte a TikTok existia no uso pessoal original
// e foi removido: este deployment é de atendimento ao cliente.
const detectarSite = () => (location.hostname.includes('web.whatsapp.com') ? 'whatsapp' : null);

// ============================================================
// SECAO 4: CAPTURA DE CONTEUDO
// ============================================================

const capturarMensagemWhatsApp = () => {
  const todasMensagens = $$('[data-testid="msg-container"]');
  for (let i = todasMensagens.length - 1; i >= 0; i--) {
    const msg = todasMensagens[i];
    const isOutgoing = msg.closest('[data-testid="msg-out"]') ||
                       msg.querySelector('[data-testid="msg-out"]') ||
                       msg.getAttribute('data-testid') === 'msg-out';
    if (!isOutgoing) {
      const textoEl = msg.querySelector('.selectable-text, span[dir="ltr"]');
      if (textoEl) {
        const texto = textoEl.innerText?.trim();
        if (texto && texto.length > 0) return texto;
      }
    }
  }
  const ultima = todasMensagens[todasMensagens.length - 1];
  if (ultima) {
    const texto = ultima.innerText?.trim();
    if (texto) return texto.substring(0, 500);
  }
  return null;
};

const capturarHistoricoWhatsApp = (limite = 8) => {
  const todasMensagens = $$('[data-testid="msg-container"]');
  const recentes = todasMensagens.slice(-limite);
  const historico = [];

  for (const msg of recentes) {
    const isOutgoing = Boolean(
      msg.closest('[data-testid="msg-out"]') ||
      msg.querySelector('[data-testid="msg-out"]') ||
      msg.getAttribute('data-testid') === 'msg-out'
    );
    const textoEl = msg.querySelector('.selectable-text, span[dir="ltr"]');
    const texto = textoEl?.innerText?.trim();
    if (texto) historico.push({ outgoing: isOutgoing, text: texto });
  }

  return historico;
};

const capturarContexto = () => capturarMensagemWhatsApp();// ============================================================
// SECAO 5: GERACAO DE RESPOSTAS (API service functions em api.js)
// ============================================================
// SECAO 6: CONSTRUCAO DA UI
// ============================================================

const criarSVG = (d, viewBox = '0 0 24 24') => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML = d;
  return svg;
};

const ICONS = {
  sparkle: '<path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5z"/><path d="M5 16l1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/><path d="M19 16l1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/>',
  close: '<path d="M18 6L6 18M6 6l12 12"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>',
  insert: '<polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 01-4 4H4"/>',
  chat: '<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>',
  globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 010 20 15.3 15.3 0 010-20z"/>',
  edit: '<path d="M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5z"/>',
  user: '<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
  checkCircle: '<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  alertCircle: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  alertTriangle: '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  building: '<path d="M3 21h18"/><path d="M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16"/><path d="M9 7h2M9 11h2M9 15h2M13 7h2M13 11h2M13 15h2"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>'
};

// Feedback de press (pointerdown/pointerup) via spring físico real —
// aplicado por delegação de evento para não precisar tocar em cada
// função que cria um botão. Fora daqui, só o Dock anima escala.
const PRESS_FEEDBACK_SELECTOR =
  '.ghostreply-primary-btn, .ghostreply-secondary-btn, .ghostreply-danger-btn, .ghostreply-google-btn, .ghostreply-insert-btn, .ghostreply-copy-btn, .ghostreply-kb-remove';

const springCancelMap = new Map();

const springScale = (el, to, options = {}) => {
  springCancelMap.get(el)?.();
  const cancelar = springTransform(el, { prop: 'scale', to, stiffness: 300, damping: 20, mass: 0.8, ...options });
  springCancelMap.set(el, cancelar);
};

let elementoPressionado = null;

const ativarPressFeedback = (card) => {
  card.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest(PRESS_FEEDBACK_SELECTOR);
    if (!btn || btn.disabled) return;
    elementoPressionado = btn;
    springScale(btn, 0.96, { stiffness: 500, damping: 30, mass: 0.5 });
  });
};

const soltarPressFeedback = () => {
  if (!elementoPressionado) return;
  springScale(elementoPressionado, 1, { stiffness: 300, damping: 18, mass: 0.6 });
  elementoPressionado = null;
};

const setButtonLoading = (button, isLoading) => {
  button.disabled = isLoading;
  if (isLoading) {
    button.style.cursor = 'wait';
    button.style.opacity = '0.65';
  } else {
    button.style.cursor = '';
    button.style.opacity = '';
  }
};

const renderErrorMessage = (element, message) => {
  element.textContent = message;
  element.style.color = 'var(--gr-danger)';
};

let painelAtual = null;

const fecharPainel = () => {
  if (!painelAtual) return;
  painelAtual.classList.remove('visible');
  setTimeout(() => {
    painelAtual?.remove();
    painelAtual = null;
    STATE.painelAberto = false;
  }, 300);
};

const DOCK_ITEMS = [
  { id: 'replies', label: 'Respostas', icon: ICONS.chat, type: 'page' },
  { id: 'empresa', label: 'Empresa', icon: ICONS.building, type: 'page' },
  { id: 'translator', label: 'Tradutor', icon: ICONS.globe, type: 'page' },
  { id: 'grammar', label: 'Revisor', icon: ICONS.edit, type: 'page' },
  { id: 'account', label: 'Conta', icon: ICONS.user, type: 'account' }
];

const DOCK_BASE_SCALE = 1;
const DOCK_MAX_SCALE = 1.15;
const DOCK_DISTANCE = 90;

// Física de spring real por item (ver spring.js), em vez de só uma
// transição CSS — é o que dá ao Dock a sensação de "seguir" o mouse
// em vez de simplesmente saltar para a escala alvo.
const setDockItemScale = (el, escalaAlvo) => springScale(el, escalaAlvo);

const criarDockNav = (panel, content, onAccountClick) => {
  const nav = document.createElement('div');
  nav.className = 'ghostreply-dock';

  const itemEls = [];

  DOCK_ITEMS.forEach((item) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'ghostreply-dock-item';
    if (item.type === 'page' && item.id === STATE.paginaAtual) el.classList.add('active');
    el.setAttribute('aria-label', item.label);

    el.appendChild(criarSVG(item.icon));

    const labelEl = document.createElement('span');
    labelEl.className = 'ghostreply-dock-label';
    labelEl.textContent = item.label;
    el.appendChild(labelEl);

    el.addEventListener('click', () => {
      if (item.type === 'account') {
        onAccountClick();
        return;
      }
      if (STATE.paginaAtual === item.id) return;
      STATE.paginaAtual = item.id;
      itemEls.forEach((outroEl, i) => {
        outroEl.classList.toggle('active', DOCK_ITEMS[i].type === 'page' && DOCK_ITEMS[i].id === item.id);
      });
      renderCurrentPanelPage(panel, content);
    });

    itemEls.push(el);
    nav.appendChild(el);
  });

  nav.addEventListener('mousemove', (e) => {
    itemEls.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const centro = rect.left + rect.width / 2;
      const distancia = Math.abs(e.clientX - centro);
      const escala = distancia > DOCK_DISTANCE
        ? DOCK_BASE_SCALE
        : DOCK_BASE_SCALE + (DOCK_MAX_SCALE - DOCK_BASE_SCALE) * (1 - distancia / DOCK_DISTANCE);
      setDockItemScale(el, escala);
    });
  });

  nav.addEventListener('mouseleave', () => {
    itemEls.forEach((el) => setDockItemScale(el, DOCK_BASE_SCALE));
  });

  const accountEl = itemEls[itemEls.length - 1];
  return { nav, accountEl };
};

const renderCurrentPanelPage = async (panel, content) => {
  content.innerHTML = '';
  content.dataset.loaded = 'false';

  if (STATE.paginaAtual === 'replies') {
    await renderRepliesPage(content);
  } else if (STATE.paginaAtual === 'empresa') {
    await renderCompanyPage(content);
  } else if (STATE.paginaAtual === 'translator') {
    renderTranslatorPage(content);
  } else if (STATE.paginaAtual === 'grammar') {
    renderGrammarPage(content);
  }
};

const renderRepliesPage = async (container) => {
  const page = document.createElement('div');
  page.className = 'ghostreply-page';

  const textarea = document.createElement('textarea');
  textarea.className = 'ghostreply-textarea';
  textarea.placeholder = 'Digite ou edite a mensagem para responder...';
  textarea.value = capturarContexto() || '';

  const modeSelector = document.createElement('div');
  modeSelector.className = 'ghostreply-mode-selector';

  CONFIG.MODOS.forEach((modo) => {
    const btn = document.createElement('button');
    btn.className = `ghostreply-mode-btn${modo === STATE.modoAtual ? ' active' : ''}`;
    btn.textContent = modo.charAt(0).toUpperCase() + modo.slice(1);
    btn.addEventListener('click', () => {
      STATE.modoAtual = modo;
      modeSelector.querySelectorAll('.ghostreply-mode-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
    modeSelector.appendChild(btn);
  });

  const actionRow = document.createElement('div');
  actionRow.className = 'ghostreply-action-row';

  const generateButton = document.createElement('button');
  generateButton.className = 'ghostreply-primary-btn';
  generateButton.textContent = 'Gerar resposta';
  generateButton.addEventListener('click', async () => {
    setButtonLoading(generateButton, true);
    try {
      await carregarRespostasNoPainel(resultContainer, textarea.value);
    } finally {
      setButtonLoading(generateButton, false);
    }
  });

  actionRow.appendChild(generateButton);

  const resultContainer = document.createElement('div');
  resultContainer.className = 'ghostreply-response-list';

  if (!textarea.value.trim()) {
    const placeholder = document.createElement('div');
    placeholder.className = 'ghostreply-empty-state';
    placeholder.textContent = 'Nenhum texto disponível. Digite ou selecione uma mensagem para gerar respostas.';
    resultContainer.appendChild(placeholder);
  } else {
    carregarRespostasNoPainel(resultContainer, textarea.value);
  }

  page.appendChild(textarea);
  page.appendChild(modeSelector);
  page.appendChild(actionRow);
  page.appendChild(resultContainer);
  container.appendChild(page);
};

const criarOutputCard = (labelText, textoInicial, { comCopiar = false } = {}) => {
  const outputCard = document.createElement('div');
  outputCard.className = 'ghostreply-output-card';

  const label = document.createElement('div');
  label.className = 'ghostreply-output-label';
  label.textContent = labelText;

  const outputText = document.createElement('p');
  outputText.className = 'ghostreply-output-text';
  outputText.textContent = textoInicial;

  outputCard.appendChild(label);
  outputCard.appendChild(outputText);

  let copyButton = null;
  if (comCopiar) {
    const copyRow = document.createElement('div');
    copyRow.className = 'ghostreply-copy-row';

    copyButton = document.createElement('button');
    copyButton.className = 'ghostreply-copy-btn';
    copyButton.appendChild(criarSVG(ICONS.copy));
    const copyLabel = document.createElement('span');
    copyLabel.textContent = 'Copiar';
    copyButton.appendChild(copyLabel);

    copyRow.appendChild(copyButton);
    outputCard.appendChild(copyRow);
  }

  return { outputCard, outputText, copyButton };
};

const criarDropdown = (opcoes, valorInicial) => {
  const wrap = document.createElement('div');
  wrap.className = 'ghostreply-dropdown';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'ghostreply-dropdown-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  const labelEl = document.createElement('span');
  labelEl.className = 'ghostreply-dropdown-label';

  const chevron = criarSVG('<polyline points="6 9 12 15 18 9"/>');
  chevron.classList.add('ghostreply-dropdown-chevron');

  trigger.appendChild(labelEl);
  trigger.appendChild(chevron);

  const menu = document.createElement('ul');
  menu.className = 'ghostreply-dropdown-menu';
  menu.setAttribute('role', 'listbox');
  menu.hidden = true;

  const estado = { value: valorInicial };

  const atualizarSelecao = () => {
    const selecionada = opcoes.find((o) => o.value === estado.value);
    labelEl.textContent = selecionada ? selecionada.label : '';
    menu.querySelectorAll('.ghostreply-dropdown-option').forEach((el) => {
      el.classList.toggle('selected', el.dataset.value === estado.value);
    });
  };

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const estaAberto = !menu.hidden;
    menu.hidden = estaAberto;
    trigger.setAttribute('aria-expanded', String(!estaAberto));
  });

  opcoes.forEach((opcao) => {
    const item = document.createElement('li');
    item.className = 'ghostreply-dropdown-option';
    item.setAttribute('role', 'option');
    item.dataset.value = opcao.value;
    item.textContent = opcao.label;
    item.addEventListener('click', () => {
      estado.value = opcao.value;
      atualizarSelecao();
      menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    });
    menu.appendChild(item);
  });

  atualizarSelecao();
  wrap.appendChild(trigger);
  wrap.appendChild(menu);

  return {
    el: wrap,
    get value() {
      return estado.value;
    },
    set value(v) {
      estado.value = v;
      atualizarSelecao();
    }
  };
};

const criarSkeletonLinhas = (linhas = 2) => {
  const wrap = document.createElement('div');
  wrap.className = 'ghostreply-skeleton-inline';
  for (let i = 0; i < linhas; i++) {
    const linha = document.createElement('div');
    linha.className = 'ghostreply-skeleton-line';
    wrap.appendChild(linha);
  }
  return wrap;
};

const renderTranslatorPage = (container) => {
  const page = document.createElement('div');
  page.className = 'ghostreply-page';

  const textarea = document.createElement('textarea');
  textarea.className = 'ghostreply-textarea';
  textarea.placeholder = 'Digite o texto para traduzir...';

  const selectors = document.createElement('div');
  selectors.className = 'ghostreply-row';

  const options = [
    { value: 'pt', label: 'Português' },
    { value: 'en', label: 'Inglês' },
    { value: 'es', label: 'Espanhol' },
    { value: 'fr', label: 'Francês' },
    { value: 'de', label: 'Alemão' }
  ];

  const fromDropdown = criarDropdown(options, 'pt');
  const toDropdown = criarDropdown(options, 'en');

  selectors.appendChild(fromDropdown.el);
  selectors.appendChild(toDropdown.el);

  const actionRow = document.createElement('div');
  actionRow.className = 'ghostreply-action-row';

  const translateButton = document.createElement('button');
  translateButton.className = 'ghostreply-primary-btn';
  translateButton.textContent = 'Traduzir';
  actionRow.appendChild(translateButton);

  const { outputCard, outputText, copyButton } = criarOutputCard(
    'Texto traduzido',
    'O resultado aparecerá aqui após a tradução.',
    { comCopiar: true }
  );
  copyButton.addEventListener('click', async () => {
    if (!outputText.textContent || outputText.textContent.includes('resultado')) return;
    await navigator.clipboard.writeText(outputText.textContent);
  });

  translateButton.addEventListener('click', async () => {
    if (!textarea.value.trim()) {
      outputText.hidden = false;
      outputText.textContent = 'Digite um texto para traduzir antes de continuar.';
      return;
    }

    setButtonLoading(translateButton, true);
    outputText.style.color = '';
    outputText.hidden = true;
    const skeleton = criarSkeletonLinhas(2);
    outputCard.appendChild(skeleton);

    try {
      const translation = await translateText(textarea.value, fromDropdown.value, toDropdown.value);
      outputText.textContent = translation || 'Nenhuma tradução disponível no momento.';
    } catch (err) {
      renderErrorMessage(outputText, `Erro: ${err.message}`);
    } finally {
      skeleton.remove();
      outputText.hidden = false;
      setButtonLoading(translateButton, false);
    }
  });

  page.appendChild(textarea);
  page.appendChild(selectors);
  page.appendChild(actionRow);
  page.appendChild(outputCard);
  container.appendChild(page);
};

const renderGrammarPage = (container) => {
  const page = document.createElement('div');
  page.className = 'ghostreply-page';

  const textarea = document.createElement('textarea');
  textarea.className = 'ghostreply-textarea';
  textarea.placeholder = 'Cole seu texto para melhorar...';

  const actionRow = document.createElement('div');
  actionRow.className = 'ghostreply-action-row';

  const improveButton = document.createElement('button');
  improveButton.className = 'ghostreply-primary-btn';
  improveButton.textContent = 'Melhorar texto';
  actionRow.appendChild(improveButton);

  const { outputCard, outputText } = criarOutputCard('Texto melhorado', 'O texto ajustado aparecerá aqui.');

  const suggestionsCard = document.createElement('div');
  suggestionsCard.className = 'ghostreply-suggestions';

  const suggestionsTitle = document.createElement('div');
  suggestionsTitle.className = 'ghostreply-suggestions-title';
  suggestionsTitle.textContent = 'Sugestões rápidas';
  suggestionsCard.appendChild(suggestionsTitle);

  const suggestionList = document.createElement('div');
  suggestionList.className = 'ghostreply-suggestion-list';
  suggestionsCard.appendChild(suggestionList);

  improveButton.addEventListener('click', async () => {
    if (!textarea.value.trim()) {
      outputText.hidden = false;
      outputText.textContent = 'Digite um texto antes de melhorar a gramática.';
      outputText.style.color = '';
      suggestionList.innerHTML = '';
      return;
    }

    setButtonLoading(improveButton, true);
    outputText.style.color = '';
    outputText.hidden = true;
    suggestionList.innerHTML = '';
    const skeleton = criarSkeletonLinhas(3);
    outputCard.appendChild(skeleton);

    try {
      const result = await improveGrammar(textarea.value);
      outputText.textContent = result.corrected || 'Não foi possível gerar uma versão melhorada.';
      result.suggestions.forEach((item) => {
        const suggestionItem = document.createElement('div');
        suggestionItem.className = 'ghostreply-suggestion-item';
        suggestionItem.textContent = item;
        suggestionList.appendChild(suggestionItem);
      });
    } catch (err) {
      renderErrorMessage(outputText, `Erro: ${err.message}`);
    } finally {
      skeleton.remove();
      outputText.hidden = false;
      setButtonLoading(improveButton, false);
    }
  });

  page.appendChild(textarea);
  page.appendChild(actionRow);
  page.appendChild(outputCard);
  page.appendChild(suggestionsCard);
  container.appendChild(page);
};

// ============================================================
// SECAO 6A: BASE DE CONHECIMENTO DA EMPRESA (UI)
// ============================================================

// Só existe um painel aberto por vez, então localizar o card assim é
// suficiente e evita ter que passar a referência por toda a árvore.
const toastNoPainel = (mensagem, tipo = 'info') => {
  const card = document.querySelector('.ghostreply-card');
  if (card) mostrarToast(card, mensagem, tipo);
};

const criarCampoTexto = (label, placeholder, { linhas = 3 } = {}) => {
  const wrap = document.createElement('label');
  wrap.className = 'ghostreply-field';

  const labelEl = document.createElement('span');
  labelEl.className = 'ghostreply-field-label';
  labelEl.textContent = label;

  const input = document.createElement('textarea');
  input.className = 'ghostreply-textarea ghostreply-textarea-sm';
  input.rows = linhas;
  input.placeholder = placeholder || '';

  wrap.appendChild(labelEl);
  wrap.appendChild(input);

  return { wrap, input };
};

const criarSecao = (titulo, descricao) => {
  const secao = document.createElement('section');
  secao.className = 'ghostreply-section';

  const head = document.createElement('div');
  head.className = 'ghostreply-section-head';

  const tituloEl = document.createElement('h4');
  tituloEl.className = 'ghostreply-section-title';
  tituloEl.textContent = titulo;
  head.appendChild(tituloEl);

  if (descricao) {
    const descEl = document.createElement('p');
    descEl.className = 'ghostreply-section-desc';
    descEl.textContent = descricao;
    head.appendChild(descEl);
  }

  secao.appendChild(head);
  return secao;
};

const ENTRY_TYPES = [
  { value: 'faq', label: 'Pergunta frequente' },
  { value: 'policy', label: 'Política / prazo' },
  { value: 'note', label: 'Observação' }
];

const ENTRY_TYPE_LABELS = ENTRY_TYPES.reduce((acc, item) => ({ ...acc, [item.value]: item.label }), {});

/**
 * Página "Empresa": é daqui que sai a precisão do bot.
 *
 * Tudo cadastrado aqui é injetado no prompt a cada geração de
 * resposta (ver backend/src/services/knowledge.service.js). O que não
 * estiver aqui, o modelo trata como desconhecido — de propósito: em
 * atendimento, "vou verificar" custa muito menos que uma informação
 * inventada sobre prazo, preço ou política.
 */
const renderCompanyPage = async (container) => {
  const page = document.createElement('div');
  page.className = 'ghostreply-page';

  const carregando = document.createElement('div');
  carregando.className = 'ghostreply-empty-state';
  carregando.textContent = 'Carregando dados da empresa...';
  page.appendChild(carregando);
  container.appendChild(page);

  let profile;
  let entries;
  try {
    [profile, entries] = await Promise.all([KnowledgeClient.getProfile(), KnowledgeClient.listEntries()]);
  } catch (err) {
    page.innerHTML = '';
    const erro = document.createElement('div');
    erro.className = 'ghostreply-empty-state';
    erro.textContent = err.message;
    page.appendChild(erro);
    return;
  }

  page.innerHTML = '';

  // --- Identidade e tom de voz ---
  const secaoPerfil = criarSecao(
    'Identidade',
    'Define quem o bot representa e como ele escreve. Usado em toda resposta gerada.'
  );

  const nomeField = criarCampo('Nome da empresa', 'text', 'Ex.: Loja Aurora');
  nomeField.input.value = profile?.companyName || '';

  const resumoField = criarCampoTexto(
    'O que a empresa faz',
    'Ex.: Loja online de utensílios de cozinha, entrega para todo o Brasil.',
    { linhas: 2 }
  );
  resumoField.input.value = profile?.businessSummary || '';

  const tomField = criarCampoTexto(
    'Tom de voz',
    'Ex.: Cordial e objetivo, trata o cliente por você, sem formalidade excessiva, sempre agradece o contato.',
    { linhas: 3 }
  );
  tomField.input.value = profile?.toneOfVoice || '';

  const escalonamentoField = criarCampoTexto(
    'Quando passar para um humano',
    'Ex.: Pedidos de reembolso, reclamações graves, qualquer menção a Procon ou processo.',
    { linhas: 2 }
  );
  escalonamentoField.input.value = profile?.escalationNote || '';

  const salvarPerfilBtn = document.createElement('button');
  salvarPerfilBtn.className = 'ghostreply-primary-btn';
  salvarPerfilBtn.textContent = 'Salvar identidade';
  salvarPerfilBtn.addEventListener('click', async () => {
    setButtonLoading(salvarPerfilBtn, true);
    try {
      await KnowledgeClient.saveProfile({
        companyName: nomeField.input.value.trim(),
        businessSummary: resumoField.input.value.trim(),
        toneOfVoice: tomField.input.value.trim(),
        escalationNote: escalonamentoField.input.value.trim()
      });
      toastNoPainel('Identidade salva.', 'success');
    } catch (err) {
      toastNoPainel(err.message, 'error');
    } finally {
      setButtonLoading(salvarPerfilBtn, false);
    }
  });

  secaoPerfil.appendChild(nomeField.wrap);
  secaoPerfil.appendChild(resumoField.wrap);
  secaoPerfil.appendChild(tomField.wrap);
  secaoPerfil.appendChild(escalonamentoField.wrap);
  secaoPerfil.appendChild(salvarPerfilBtn);

  // --- Base de conhecimento ---
  const secaoBase = criarSecao(
    'Base de conhecimento',
    'Perguntas frequentes, políticas e prazos. O bot só afirma o que estiver aqui.'
  );

  const lista = document.createElement('div');
  lista.className = 'ghostreply-kb-list';

  const renderLista = (itens) => {
    lista.innerHTML = '';

    if (!itens.length) {
      const vazio = document.createElement('div');
      vazio.className = 'ghostreply-empty-state';
      vazio.textContent =
        'Nenhuma informação cadastrada ainda. Sem isso, o bot não afirma nada específico — ' +
        'ele só gera respostas de acolhimento e encaminhamento.';
      lista.appendChild(vazio);
      return;
    }

    itens.forEach((entry) => {
      const item = document.createElement('div');
      item.className = 'ghostreply-kb-item';

      const head = document.createElement('div');
      head.className = 'ghostreply-kb-item-head';

      const badge = document.createElement('span');
      badge.className = `ghostreply-kb-badge ghostreply-kb-badge-${entry.type}`;
      badge.textContent = ENTRY_TYPE_LABELS[entry.type] || entry.type;
      head.appendChild(badge);

      const removerBtn = document.createElement('button');
      removerBtn.className = 'ghostreply-kb-remove';
      removerBtn.setAttribute('aria-label', 'Remover entrada');
      removerBtn.appendChild(criarSVG(ICONS.trash));
      removerBtn.addEventListener('click', async () => {
        setButtonLoading(removerBtn, true);
        try {
          await KnowledgeClient.removeEntry(entry.id);
          entries = entries.filter((outro) => outro.id !== entry.id);
          renderLista(entries);
          toastNoPainel('Entrada removida.', 'success');
        } catch (err) {
          toastNoPainel(err.message, 'error');
          setButtonLoading(removerBtn, false);
        }
      });
      head.appendChild(removerBtn);

      item.appendChild(head);

      if (entry.title) {
        const tituloEl = document.createElement('div');
        tituloEl.className = 'ghostreply-kb-item-title';
        tituloEl.textContent = entry.title;
        item.appendChild(tituloEl);
      }

      const conteudoEl = document.createElement('p');
      conteudoEl.className = 'ghostreply-kb-item-content';
      conteudoEl.textContent = entry.content;
      item.appendChild(conteudoEl);

      lista.appendChild(item);
    });
  };

  renderLista(entries);

  // --- Formulário de nova entrada ---
  const form = document.createElement('div');
  form.className = 'ghostreply-kb-form';

  const tipoDropdown = criarDropdown(ENTRY_TYPES, 'faq');

  const tituloField = criarCampo('Pergunta ou título', 'text', 'Ex.: Qual o prazo de entrega?');
  const conteudoField = criarCampoTexto('Resposta', 'Ex.: De 5 a 10 dias úteis para todo o Brasil.', { linhas: 3 });

  const adicionarBtn = document.createElement('button');
  adicionarBtn.className = 'ghostreply-secondary-btn ghostreply-kb-add';
  adicionarBtn.appendChild(criarSVG(ICONS.plus));
  const adicionarLabel = document.createElement('span');
  adicionarLabel.textContent = 'Adicionar à base';
  adicionarBtn.appendChild(adicionarLabel);

  adicionarBtn.addEventListener('click', async () => {
    const content = conteudoField.input.value.trim();
    if (!content) {
      toastNoPainel('Escreva o conteúdo antes de adicionar.', 'error');
      return;
    }

    setButtonLoading(adicionarBtn, true);
    try {
      const nova = await KnowledgeClient.createEntry({
        type: tipoDropdown.value,
        title: tituloField.input.value.trim(),
        content
      });
      entries = [...entries, nova];
      renderLista(entries);
      tituloField.input.value = '';
      conteudoField.input.value = '';
      toastNoPainel('Adicionado à base de conhecimento.', 'success');
    } catch (err) {
      toastNoPainel(err.message, 'error');
    } finally {
      setButtonLoading(adicionarBtn, false);
    }
  });

  form.appendChild(tipoDropdown.el);
  form.appendChild(tituloField.wrap);
  form.appendChild(conteudoField.wrap);
  form.appendChild(adicionarBtn);

  secaoBase.appendChild(lista);
  secaoBase.appendChild(form);

  page.appendChild(secaoPerfil);
  page.appendChild(secaoBase);
};

// ============================================================
// SECAO 6B: SISTEMA DE CONTAS (UI)
// ============================================================

const criarCampo = (label, tipo, placeholder, autocomplete) => {
  const wrap = document.createElement('label');
  wrap.className = 'ghostreply-field';

  const labelEl = document.createElement('span');
  labelEl.className = 'ghostreply-field-label';
  labelEl.textContent = label;

  const input = document.createElement('input');
  input.className = 'ghostreply-input';
  input.type = tipo;
  input.placeholder = placeholder || '';
  if (autocomplete) input.autocomplete = autocomplete;

  wrap.appendChild(labelEl);
  wrap.appendChild(input);

  return { wrap, input };
};

const criarCampoSenha = (label, autocomplete = 'current-password') => {
  const wrap = document.createElement('label');
  wrap.className = 'ghostreply-field';

  const labelEl = document.createElement('span');
  labelEl.className = 'ghostreply-field-label';
  labelEl.textContent = label;

  const inputRow = document.createElement('div');
  inputRow.className = 'ghostreply-input-row';

  const input = document.createElement('input');
  input.className = 'ghostreply-input';
  input.type = 'password';
  input.autocomplete = autocomplete;

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'ghostreply-input-toggle';
  const icon = criarSVG(ICONS.eye);
  toggleBtn.appendChild(icon);
  toggleBtn.setAttribute('aria-label', 'Mostrar ou ocultar senha');

  toggleBtn.addEventListener('click', () => {
    const estaVisivel = input.type === 'text';
    input.type = estaVisivel ? 'password' : 'text';
    icon.innerHTML = estaVisivel ? ICONS.eye : ICONS.eyeOff;
  });

  inputRow.appendChild(input);
  inputRow.appendChild(toggleBtn);
  wrap.appendChild(labelEl);
  wrap.appendChild(inputRow);

  return { wrap, input };
};

const criarGoogleIcon = () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 18 18');
  svg.innerHTML = `
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.8 2.72v2.26h2.9a8.78 8.78 0 002.7-6.62z"/>
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.55-1.83.87-3.06.87-2.36 0-4.35-1.6-5.06-3.75H.9v2.33A9 9 0 009 18z"/>
    <path fill="#FBBC05" d="M3.94 10.68A5.4 5.4 0 013.68 9c0-.58.1-1.15.26-1.68V4.99H.9A9 9 0 000 9c0 1.45.35 2.83.97 4.01z"/>
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A8.94 8.94 0 009 0 9 9 0 00.9 4.99l3.04 2.33C4.65 5.18 6.64 3.58 9 3.58z"/>
  `;
  return svg;
};

const criarBotaoGoogle = () => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ghostreply-google-btn';
  btn.appendChild(criarGoogleIcon());
  const label = document.createElement('span');
  label.textContent = 'Continuar com Google';
  btn.appendChild(label);
  btn.disabled = true;
  AuthClient.getCapabilities().then((config) => {
    btn.disabled = !config.googleEnabled;
    if (!config.googleEnabled) {
      label.textContent = 'Google ainda não configurado';
      btn.title = 'Use Entrar ou Criar conta com seu e-mail. O Google precisa de um Client ID no servidor.';
    }
  }).catch(() => {
    label.textContent = 'Google indisponível';
    btn.title = 'Confira se o backend está rodando e reinicie-o após atualizar o projeto.';
  });
  return btn;
};

const criarAvatar = (nome, fotoUrl) => {
  const avatar = document.createElement('div');
  avatar.className = 'ghostreply-avatar';
  if (fotoUrl) {
    const img = document.createElement('img');
    img.src = fotoUrl;
    img.alt = nome || 'Avatar';
    avatar.appendChild(img);
  } else {
    const iniciais = (nome || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
    avatar.textContent = iniciais || '?';
  }
  return avatar;
};

const TOAST_ICONS = { success: 'checkCircle', error: 'alertCircle' };

const animarEntradaToast = (toast) => {
  toast.style.opacity = '0';
  animateSpring(
    (t) => {
      toast.style.opacity = String(t);
      toast.style.transform = `translate(-50%, ${8 * (1 - t)}px) scale(${0.92 + 0.08 * t})`;
    },
    { from: 0, to: 1, stiffness: 320, damping: 26, mass: 0.7 }
  );
};

const animarSaidaToast = (toast, aoTerminar) => {
  animateSpring(
    (t) => {
      toast.style.opacity = String(1 - t);
      toast.style.transform = `translate(-50%, ${6 * t}px) scale(${1 - 0.05 * t})`;
    },
    { from: 0, to: 1, stiffness: 400, damping: 30, mass: 0.6, onComplete: aoTerminar }
  );
};

const mostrarToast = (card, mensagem, tipo = 'info') => {
  const anterior = card.querySelector('.ghostreply-toast');
  if (anterior) anterior.remove();

  const toast = document.createElement('div');
  toast.className = `ghostreply-toast ghostreply-toast-${tipo}`;

  const iconeNome = TOAST_ICONS[tipo];
  if (iconeNome) toast.appendChild(criarSVG(ICONS[iconeNome]));

  const texto = document.createElement('span');
  texto.textContent = mensagem;
  toast.appendChild(texto);

  card.appendChild(toast);
  animarEntradaToast(toast);

  setTimeout(() => {
    animarSaidaToast(toast, () => toast.remove());
  }, 2500);
};

const renderLoginView = (body, ctx) => {
  body.innerHTML = '';

  const title = document.createElement('h3');
  title.className = 'ghostreply-auth-title';
  title.textContent = 'Entrar';
  body.appendChild(title);
  const description = document.createElement('p');
  description.className = 'ghostreply-auth-desc';
  description.textContent = 'Entre com uma conta já cadastrada no GhostReply. No primeiro acesso, selecione Criar conta acima.';
  body.appendChild(description);

  const form = document.createElement('form');
  form.className = 'ghostreply-auth-form';

  const emailField = criarCampo('Email', 'email', 'voce@exemplo.com', 'email');
  const senhaField = criarCampoSenha('Senha');

  const optionsRow = document.createElement('div');
  optionsRow.className = 'ghostreply-auth-options';

  const rememberLabel = document.createElement('label');
  rememberLabel.className = 'ghostreply-checkbox';
  const rememberInput = document.createElement('input');
  rememberInput.type = 'checkbox';
  rememberInput.checked = true;
  const rememberText = document.createElement('span');
  rememberText.textContent = 'Permanecer conectado';
  rememberLabel.appendChild(rememberInput);
  rememberLabel.appendChild(rememberText);

  const forgotLink = document.createElement('button');
  forgotLink.type = 'button';
  forgotLink.className = 'ghostreply-link-btn';
  forgotLink.textContent = 'Esqueci minha senha';
  forgotLink.addEventListener('click', () => ctx.onSwitch('recover'));

  optionsRow.appendChild(rememberLabel);
  optionsRow.appendChild(forgotLink);

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'ghostreply-primary-btn ghostreply-auth-submit';
  submitBtn.textContent = 'Entrar';

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitBtn.disabled) return;
    setButtonLoading(submitBtn, true);
    try {
      await AuthClient.login(emailField.input.value.trim(), senhaField.input.value, rememberInput.checked);
      ctx.showToast('Login realizado com sucesso.', 'success');
      await ctx.refresh();
    } catch (err) {
      ctx.showToast(/E-mail ou senha inválidos/i.test(err.message)
        ? 'E-mail ou senha inválidos. Se ainda não tem uma conta no GhostReply, selecione Criar conta.'
        : err.message, 'error');
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });

  form.appendChild(emailField.wrap);
  form.appendChild(senhaField.wrap);
  form.appendChild(optionsRow);
  form.appendChild(submitBtn);

  const divider = document.createElement('div');
  divider.className = 'ghostreply-auth-divider';
  divider.textContent = 'ou';

  const googleBtn = criarBotaoGoogle();
  googleBtn.addEventListener('click', async () => {
    setButtonLoading(googleBtn, true);
    try {
      await AuthClient.loginWithGoogle();
      ctx.showToast('Login realizado com sucesso.', 'success');
      await ctx.refresh();
    } catch (err) {
      ctx.showToast(err.message, 'error');
    } finally {
      setButtonLoading(googleBtn, false);
    }
  });

  const switchRow = document.createElement('div');
  switchRow.className = 'ghostreply-auth-switch';
  switchRow.append('Não tem conta? ');
  const switchLink = document.createElement('button');
  switchLink.type = 'button';
  switchLink.className = 'ghostreply-link-btn';
  switchLink.textContent = 'Criar conta';
  switchLink.addEventListener('click', () => ctx.onSwitch('signup'));
  switchRow.appendChild(switchLink);

  body.appendChild(form);
  body.appendChild(divider);
  body.appendChild(googleBtn);
  body.appendChild(switchRow);
};

const renderSignupView = (body, ctx) => {
  body.innerHTML = '';

  const title = document.createElement('h3');
  title.className = 'ghostreply-auth-title';
  title.textContent = 'Criar conta';
  body.appendChild(title);
  const description = document.createElement('p');
  description.className = 'ghostreply-auth-desc';
  description.textContent = 'Primeiro acesso? Cadastre seu e-mail e escolha uma senha de pelo menos 8 caracteres. A conta será conectada automaticamente.';
  body.appendChild(description);

  const form = document.createElement('form');
  form.className = 'ghostreply-auth-form';

  const nomeField = criarCampo('Nome', 'text', 'Seu nome', 'name');
  const emailField = criarCampo('Email', 'email', 'voce@exemplo.com', 'email');
  const senhaField = criarCampoSenha('Senha', 'new-password');
  const confirmField = criarCampoSenha('Confirmar senha', 'new-password');

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'ghostreply-primary-btn ghostreply-auth-submit';
  submitBtn.textContent = 'Criar conta';

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitBtn.disabled) return;

    const nome = nomeField.input.value.trim();
    const email = emailField.input.value.trim();
    const senha = senhaField.input.value;
    const confirmar = confirmField.input.value;

    if (!nome) return ctx.showToast('Digite seu nome.', 'error');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return ctx.showToast('Digite um email válido.', 'error');
    if (senha.length < 8) return ctx.showToast('A senha deve ter pelo menos 8 caracteres.', 'error');
    if (senha !== confirmar) return ctx.showToast('As senhas não coincidem.', 'error');

    setButtonLoading(submitBtn, true);
    try {
      const resultado = await AuthClient.signup(nome, email, senha);
      if (resultado?.pendingConfirmation) {
        ctx.showToast('Conta criada. Verifique seu email para confirmar.', 'success');
        ctx.onSwitch('login');
      } else {
        ctx.showToast('Conta criada com sucesso.', 'success');
        await ctx.refresh();
      }
    } catch (err) {
      ctx.showToast(err.message, 'error');
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });

  form.appendChild(nomeField.wrap);
  form.appendChild(emailField.wrap);
  form.appendChild(senhaField.wrap);
  form.appendChild(confirmField.wrap);
  form.appendChild(submitBtn);

  const switchRow = document.createElement('div');
  switchRow.className = 'ghostreply-auth-switch';
  switchRow.append('Já tem conta? ');
  const switchLink = document.createElement('button');
  switchLink.type = 'button';
  switchLink.className = 'ghostreply-link-btn';
  switchLink.textContent = 'Entrar';
  switchLink.addEventListener('click', () => ctx.onSwitch('login'));
  switchRow.appendChild(switchLink);

  body.appendChild(form);
  body.appendChild(switchRow);
};

const renderRecoverView = (body, ctx) => {
  body.innerHTML = '';

  const title = document.createElement('h3');
  title.className = 'ghostreply-auth-title';
  title.textContent = 'Recuperar senha';
  body.appendChild(title);

  const desc = document.createElement('p');
  desc.className = 'ghostreply-auth-desc';
  desc.textContent = 'Digite seu email e enviaremos um link para redefinir sua senha.';
  body.appendChild(desc);

  const form = document.createElement('form');
  form.className = 'ghostreply-auth-form';

  const emailField = criarCampo('Email', 'email', 'voce@exemplo.com', 'email');

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'ghostreply-primary-btn ghostreply-auth-submit';
  submitBtn.textContent = 'Enviar link';

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setButtonLoading(submitBtn, true);
    try {
      await AuthClient.recoverPassword(emailField.input.value.trim());
      body.innerHTML = '';
      const confirmMsg = document.createElement('p');
      confirmMsg.className = 'ghostreply-auth-desc';
      confirmMsg.textContent = 'Verifique seu email para o link de redefinição de senha.';
      body.appendChild(confirmMsg);
    } catch (err) {
      ctx.showToast(err.message, 'error');
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });

  form.appendChild(emailField.wrap);
  form.appendChild(submitBtn);

  const switchRow = document.createElement('div');
  switchRow.className = 'ghostreply-auth-switch';
  const switchLink = document.createElement('button');
  switchLink.type = 'button';
  switchLink.className = 'ghostreply-link-btn';
  switchLink.textContent = 'Voltar para o login';
  switchLink.addEventListener('click', () => ctx.onSwitch('login'));
  switchRow.appendChild(switchLink);

  body.appendChild(form);
  body.appendChild(switchRow);
};

const renderProfileView = (body, ctx, session) => {
  body.innerHTML = '';

  const nome = session?.user?.name || session?.user?.email || 'Usuário';
  const email = session?.user?.email || '';
  const fotoUrl = session?.user?.avatarUrl;

  const header = document.createElement('div');
  header.className = 'ghostreply-profile-header';
  header.appendChild(criarAvatar(nome, fotoUrl));

  const infoWrap = document.createElement('div');
  const nomeEl = document.createElement('div');
  nomeEl.className = 'ghostreply-profile-name';
  nomeEl.textContent = nome;
  const emailEl = document.createElement('div');
  emailEl.className = 'ghostreply-profile-email';
  emailEl.textContent = email;
  infoWrap.appendChild(nomeEl);
  infoWrap.appendChild(emailEl);
  header.appendChild(infoWrap);

  body.appendChild(header);

  const actions = document.createElement('div');
  actions.className = 'ghostreply-profile-actions';

  const editBtn = document.createElement('button');
  editBtn.className = 'ghostreply-secondary-btn';
  editBtn.textContent = 'Editar informações';

  const passBtn = document.createElement('button');
  passBtn.className = 'ghostreply-secondary-btn';
  passBtn.textContent = 'Alterar senha';

  const logoutBtn = document.createElement('button');
  logoutBtn.className = 'ghostreply-danger-btn';
  logoutBtn.textContent = 'Sair';

  const editArea = document.createElement('div');
  editArea.className = 'ghostreply-profile-edit';
  editArea.hidden = true;

  editBtn.addEventListener('click', () => {
    editArea.hidden = !editArea.hidden;
    editArea.innerHTML = '';
    if (editArea.hidden) return;

    const nomeField = criarCampo('Nome', 'text', nome, 'name');
    nomeField.input.value = nome;
    const saveBtn = document.createElement('button');
    saveBtn.className = 'ghostreply-primary-btn';
    saveBtn.textContent = 'Salvar';
    saveBtn.addEventListener('click', async () => {
      setButtonLoading(saveBtn, true);
      try {
        await AuthClient.updateProfile(nomeField.input.value.trim());
        ctx.showToast('Informações atualizadas.', 'success');
        await ctx.refresh();
      } catch (err) {
        ctx.showToast(err.message, 'error');
      } finally {
        setButtonLoading(saveBtn, false);
      }
    });
    editArea.appendChild(nomeField.wrap);
    editArea.appendChild(saveBtn);
  });

  const passArea = document.createElement('div');
  passArea.className = 'ghostreply-profile-edit';
  passArea.hidden = true;

  passBtn.addEventListener('click', () => {
    passArea.hidden = !passArea.hidden;
    passArea.innerHTML = '';
    if (passArea.hidden) return;

    const senhaAtualField = criarCampoSenha('Senha atual');
    const novaSenhaField = criarCampoSenha('Nova senha', 'new-password');
    const saveBtn = document.createElement('button');
    saveBtn.className = 'ghostreply-primary-btn';
    saveBtn.textContent = 'Salvar';
    saveBtn.addEventListener('click', async () => {
      if (!senhaAtualField.input.value) {
        ctx.showToast('Digite sua senha atual.', 'error');
        return;
      }
      if (novaSenhaField.input.value.length < 8) {
        ctx.showToast('A nova senha deve ter pelo menos 8 caracteres.', 'error');
        return;
      }
      setButtonLoading(saveBtn, true);
      try {
        await AuthClient.updatePassword(senhaAtualField.input.value, novaSenhaField.input.value);
        ctx.showToast('Senha atualizada.', 'success');
        passArea.hidden = true;
      } catch (err) {
        ctx.showToast(err.message, 'error');
      } finally {
        setButtonLoading(saveBtn, false);
      }
    });
    passArea.appendChild(senhaAtualField.wrap);
    passArea.appendChild(novaSenhaField.wrap);
    passArea.appendChild(saveBtn);
  });

  logoutBtn.addEventListener('click', async () => {
    setButtonLoading(logoutBtn, true);
    try {
      await AuthClient.logout();
      ctx.showToast('Você saiu da sua conta.', 'success');
      await ctx.refresh();
    } catch (err) {
      ctx.showToast(err.message, 'error');
    } finally {
      setButtonLoading(logoutBtn, false);
    }
  });

  actions.appendChild(editBtn);
  actions.appendChild(passBtn);
  actions.appendChild(logoutBtn);

  body.appendChild(actions);
  body.appendChild(editArea);
  body.appendChild(passArea);
};

const animarEntradaOverlay = (overlay) => {
  overlay.style.pointerEvents = 'auto';
  overlay.style.opacity = '0';
  animateSpring(
    (t) => {
      overlay.style.opacity = String(t);
      overlay.style.transform = `scale(${0.97 + 0.03 * t})`;
    },
    { from: 0, to: 1, stiffness: 300, damping: 28, mass: 0.8 }
  );
};

const animarSaidaOverlay = (overlay) => {
  animateSpring(
    (t) => {
      overlay.style.opacity = String(1 - t);
      overlay.style.transform = `scale(${1 - 0.03 * t})`;
    },
    { from: 0, to: 1, stiffness: 380, damping: 32, mass: 0.7, onComplete: () => { overlay.style.pointerEvents = 'none'; } }
  );
};

const criarAuthOverlay = (card, accountEl) => {
  const overlay = document.createElement('div');
  overlay.className = 'ghostreply-auth-overlay';
  overlay.style.opacity = '0';
  overlay.style.pointerEvents = 'none';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'ghostreply-close ghostreply-auth-close';
  closeBtn.appendChild(criarSVG(ICONS.close));
  closeBtn.addEventListener('click', () => animarSaidaOverlay(overlay));

  const body = document.createElement('div');
  body.className = 'ghostreply-auth-body';

  const navigation = document.createElement('div');
  navigation.className = 'ghostreply-auth-navigation';
  navigation.setAttribute('aria-label', 'Acesso à conta');
  const buttons = {};
  for (const [view, label] of [['login', 'Entrar'], ['signup', 'Criar conta']]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => ctx.onSwitch(view));
    navigation.appendChild(button);
    buttons[view] = button;
  }
  overlay.appendChild(closeBtn);
  overlay.appendChild(navigation);
  overlay.appendChild(body);
  card.appendChild(overlay);

  let currentSession = null;
  let currentView = 'login';
  let navigationRevision = 0;
  let sessionRequest = 0;

  const renderView = (view) => {
    currentView = view;
    navigation.hidden = view === 'profile';
    for (const [name, button] of Object.entries(buttons)) {
      button.setAttribute('aria-pressed', String(name === view));
    }
    if (view === 'login') renderLoginView(body, ctx);
    else if (view === 'signup') renderSignupView(body, ctx);
    else if (view === 'recover') renderRecoverView(body, ctx);
    else if (view === 'profile') renderProfileView(body, ctx, currentSession);
    body.scrollTop = 0;
  };

  const atualizarView = async ({ render = true, force = false } = {}) => {
    const request = ++sessionRequest;
    const revision = navigationRevision;
    let session;
    try {
      session = await AuthClient.getSession();
    } catch {
      session = null;
    }
    if (request !== sessionRequest) return;
    currentSession = session;
    accountEl.classList.toggle('logged-in', Boolean(currentSession));
    if (render && (force || revision === navigationRevision)) {
      renderView(currentSession ? 'profile' :
        (['signup', 'recover'].includes(currentView) && !force ? currentView : 'login'));
    }
  };

  const ctx = {
    onSwitch: (view) => { navigationRevision++; renderView(view); },
    showToast: (msg, tipo) => mostrarToast(card, msg, tipo),
    refresh: () => atualizarView({ force: true })
  };

  return {
    el: overlay,
    show: async () => {
      renderView(currentSession ? 'profile' : 'login');
      animarEntradaOverlay(overlay);
      await atualizarView();
    },
    refreshBadge: () => atualizarView({ render: false })
  };
};

const criarPainel = async (anchorEl) => {
  if (painelAtual) fecharPainel();

  const panel = document.createElement('div');
  panel.className = 'ghostreply-panel';
  panel.id = 'ghostreply-panel';

  const rect = anchorEl.getBoundingClientRect();
  const espacoDireita = window.innerWidth - rect.right;
  const espacoEsquerda = rect.left;
  const posicaoPadrao = rect.bottom + 12;

  if (espacoDireita > 400 || espacoDireita > espacoEsquerda) {
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${posicaoPadrao}px`;
  } else {
    panel.style.right = `${window.innerWidth - rect.right}px`;
    panel.style.top = `${posicaoPadrao}px`;
  }

  const card = document.createElement('div');
  card.className = 'ghostreply-card';
  ativarPressFeedback(card);

  const header = document.createElement('div');
  header.className = 'ghostreply-header';

  const headerLeft = document.createElement('div');
  headerLeft.className = 'ghostreply-header-left';

  const logo = document.createElement('div');
  logo.className = 'ghostreply-logo';
  logo.appendChild(criarSVG(ICONS.sparkle));

  const title = document.createElement('span');
  title.className = 'ghostreply-title';
  title.textContent = 'GhostReply';

  headerLeft.appendChild(logo);
  headerLeft.appendChild(title);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'ghostreply-close';
  closeBtn.appendChild(criarSVG(ICONS.close));
  closeBtn.addEventListener('click', fecharPainel);

  header.appendChild(headerLeft);
  header.appendChild(closeBtn);

  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  const onDragMove = (event) => {
    if (!isDragging) return;
    const newLeft = Math.min(Math.max(event.clientX - dragOffsetX, 12), window.innerWidth - panel.offsetWidth - 12);
    const newTop = Math.min(Math.max(event.clientY - dragOffsetY, 12), window.innerHeight - panel.offsetHeight - 12);
    panel.style.left = `${newLeft}px`;
    panel.style.top = `${newTop}px`;
    panel.style.right = 'auto';
  };

  const stopDrag = () => {
    if (!isDragging) return;
    isDragging = false;
    panel.style.transition = '';
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', stopDrag);
  };

  header.addEventListener('mousedown', (event) => {
    if (event.button !== 0 || event.target.closest('.ghostreply-close')) return;
    isDragging = true;
    const rect = panel.getBoundingClientRect();
    dragOffsetX = event.clientX - rect.left;
    dragOffsetY = event.clientY - rect.top;
    panel.style.transition = 'none';
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', stopDrag);
    event.preventDefault();
  });

  const content = document.createElement('div');
  content.className = 'ghostreply-content';
  content.dataset.loaded = 'false';

  let authOverlay;
  const { nav, accountEl } = criarDockNav(panel, content, () => authOverlay?.show());
  authOverlay = criarAuthOverlay(card, accountEl);
  authOverlay.refreshBadge();

  // Rodapé: lembrete permanente de que a extensão sugere, não envia.
  const footer = document.createElement('div');
  footer.className = 'ghostreply-footer';
  const footerText = document.createElement('span');
  footerText.className = 'ghostreply-footer-text';
  footerText.textContent = 'Sugestões geradas por IA — revise antes de enviar.';
  footer.appendChild(footerText);

  card.appendChild(header);
  card.appendChild(nav);
  card.appendChild(content);
  card.appendChild(footer);
  panel.appendChild(card);
  document.body.appendChild(panel);

  const ajustarPosicaoPainel = () => {
    const panelRect = panel.getBoundingClientRect();
    const alturaPainel = panelRect.height;
    const larguraPainel = panelRect.width;
    const espacoAcima = rect.top - 12;
    const espacoAbaixo = window.innerHeight - rect.bottom - 12;
    const posicaoCentro = Math.max((window.innerHeight - alturaPainel) / 2, 12);

    if (espacoAbaixo < alturaPainel && espacoAcima > alturaPainel) {
      panel.style.top = `${Math.max(rect.top - alturaPainel - 12, 12)}px`;
    } else if (espacoAbaixo < alturaPainel && espacoAcima < alturaPainel) {
      panel.style.top = `${posicaoCentro}px`;
    } else if (panelRect.bottom > window.innerHeight - 12) {
      panel.style.top = `${Math.max(window.innerHeight - alturaPainel - 12, 12)}px`;
    }

    if (parseFloat(panel.style.top) > window.innerHeight * 0.5) {
      panel.style.top = `${posicaoCentro}px`;
    }

    if (panelRect.top < 12) {
      panel.style.top = '12px';
    }

    if (panelRect.right > window.innerWidth - 12) {
      panel.style.left = `${Math.max(window.innerWidth - larguraPainel - 12, 12)}px`;
      panel.style.right = 'auto';
    }
  };

  ajustarPosicaoPainel();

  renderCurrentPanelPage(panel, content);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => panel.classList.add('visible'));
  });

  painelAtual = panel;
  STATE.painelAberto = true;

  return content;
};

const mostrarLoading = (container) => {
  container.innerHTML = '';
  container.dataset.loaded = 'false';

  const skeletonList = document.createElement('div');
  skeletonList.className = 'ghostreply-skeleton-list';

  for (let i = 0; i < 3; i++) {
    const skeletonCard = document.createElement('div');
    skeletonCard.className = 'ghostreply-skeleton-card';
    for (let j = 0; j < 2; j++) {
      const line = document.createElement('div');
      line.className = 'ghostreply-skeleton-line';
      skeletonCard.appendChild(line);
    }
    skeletonList.appendChild(skeletonCard);
  }

  container.appendChild(skeletonList);
};

// O paywall e o contador de usos gratuitos foram removidos: este é um
// deployment interno de uma empresa, com uma única pessoa usando e a
// conta da OpenRouter paga pelo dono do backend. O controle de custo
// agora fica no backend (rate limit das rotas /api/ai).

const marcarCardAtivo = (container) => {
  if (STATE.site !== 'whatsapp') return;
  const compose = encontrarComposeBoxWhatsApp();
  const textoAtual = compose?.innerText?.trim() || '';
  container.querySelectorAll('.ghostreply-response-card').forEach((card) => {
    card.classList.toggle('active', Boolean(textoAtual) && card.dataset.texto === textoAtual);
  });
};

/**
 * Card de uma sugestão de resposta.
 *
 * "resposta.confident" vem do backend e diz se a sugestão se apoia na
 * base de conhecimento cadastrada. Quando é false, o card ganha um
 * selo de revisão e o motivo — e a resposta nunca é inserida
 * automaticamente no campo do WhatsApp (ver carregarRespostasNoPainel).
 */
const criarCardResposta = (resposta, index, container) => {
  const texto = resposta.text;
  const precisaRevisao = resposta.confident !== true;

  const card = document.createElement('div');
  card.className = 'ghostreply-response-card ghostreply-animate-in';
  if (precisaRevisao) card.classList.add('needs-review');
  card.style.animationDelay = `${index * 80}ms`;
  card.dataset.texto = texto;

  if (precisaRevisao) {
    const aviso = document.createElement('div');
    aviso.className = 'ghostreply-review-flag';
    aviso.appendChild(criarSVG(ICONS.alertTriangle));

    const avisoTexto = document.createElement('span');
    avisoTexto.textContent = resposta.reviewReason || 'Revise antes de enviar.';
    aviso.appendChild(avisoTexto);

    card.appendChild(aviso);
  }

  const textEl = document.createElement('p');
  textEl.className = 'ghostreply-response-text';
  textEl.textContent = texto;

  const actions = document.createElement('div');
  actions.className = 'ghostreply-response-actions';

  {
    const insertBtn = document.createElement('button');
    insertBtn.className = 'ghostreply-insert-btn';
    insertBtn.appendChild(criarSVG(ICONS.insert));
    const insertLabel = document.createElement('span');
    insertLabel.textContent = 'Inserir';
    insertBtn.appendChild(insertLabel);

    insertBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      inserirRespostaNoWhatsApp(texto);
      marcarCardAtivo(container);
    });

    actions.appendChild(insertBtn);
  }

  const copyBtn = document.createElement('button');
  copyBtn.className = 'ghostreply-copy-btn';

  const copyIcon = criarSVG(ICONS.copy);
  const copyLabel = document.createElement('span');
  copyLabel.textContent = 'Copiar';

  copyBtn.appendChild(copyIcon);
  copyBtn.appendChild(copyLabel);

  copyBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(texto);
      copyBtn.classList.add('copied');
      copyLabel.textContent = 'Copiado';
      copyIcon.innerHTML = ICONS.check;
      setTimeout(() => {
        copyBtn.classList.remove('copied');
        copyLabel.textContent = 'Copiar';
        copyIcon.innerHTML = ICONS.copy;
      }, 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = texto;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  });

  card.addEventListener('click', () => copyBtn.click());

  actions.appendChild(copyBtn);
  card.appendChild(textEl);
  card.appendChild(actions);

  return card;
};

const carregarRespostasNoPainel = async (container, textoEntrada = '') => {
  mostrarLoading(container);

  const contexto = textoEntrada.trim().length ? textoEntrada : capturarContexto();
  if (!contexto) {
    container.innerHTML = '';
    const msg = document.createElement('div');
    msg.className = 'ghostreply-loading';
    msg.innerHTML = '<span class="ghostreply-loading-text">Nenhuma mensagem encontrada. Tente selecionar uma conversa ou digite o texto manualmente.</span>';
    container.appendChild(msg);
    return;
  }

  try {
    const entrada = { text: contexto, history: capturarHistoricoWhatsApp() };
    const { replies, hasKnowledge } = await generateReplies(entrada, STATE.modoAtual);

    container.innerHTML = '';
    container.dataset.loaded = 'true';

    // Base vazia = o modelo não sabe nada concreto sobre a empresa.
    // Avisar isso explicitamente evita que o atendente confunda uma
    // resposta genérica com uma resposta informada.
    if (!hasKnowledge) {
      const aviso = document.createElement('div');
      aviso.className = 'ghostreply-inline-notice';
      aviso.appendChild(criarSVG(ICONS.alertTriangle));
      const avisoTexto = document.createElement('span');
      avisoTexto.textContent =
        'A base de conhecimento está vazia. Cadastre as informações da empresa na aba Empresa para respostas precisas.';
      aviso.appendChild(avisoTexto);
      container.appendChild(aviso);
    }

    replies.forEach((resposta, i) => {
      container.appendChild(criarCardResposta(resposta, i, container));
    });

    // Auto-inserção só acontece quando a resposta é confiável. Se a
    // IA sinalizou que precisa de revisão, quem decide é a pessoa —
    // inserir sozinho um texto incerto é como o atendente quase
    // manda uma informação errada sem perceber.
    const primeiraConfiavel = replies.find((resposta) => resposta.confident === true);
    if (primeiraConfiavel) {
      const compose = encontrarComposeBoxWhatsApp();
      const textoAtual = compose?.innerText?.trim() || '';
      const podeAutoInserir = !textoAtual || textoAtual === STATE.ultimoTextoInserido;
      if (podeAutoInserir) {
        inserirRespostaNoWhatsApp(primeiraConfiavel.text);
        marcarCardAtivo(container);
      }
    }
  } catch (err) {
    container.innerHTML = '';
    const msg = document.createElement('div');
    msg.className = 'ghostreply-loading';
    const msgTexto = document.createElement('span');
    msgTexto.className = 'ghostreply-loading-text';
    msgTexto.textContent = `Erro: ${err.message}`;
    msg.appendChild(msgTexto);
    container.appendChild(msg);
  }
};

// ============================================================
// SECAO 7: INJECAO DO BOTAO
// ============================================================

const criarBotaoGhostReply = () => {
  const btn = document.createElement('button');
  btn.className = 'ghostreply-trigger-btn';
  btn.setAttribute('data-ghostreply', 'true');

  const icon = criarSVG(ICONS.sparkle);
  const label = document.createElement('span');
  label.textContent = 'Gerar resposta';

  btn.appendChild(icon);
  btn.appendChild(label);

  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const agora = Date.now();
    if (agora - STATE.ultimoClique < CONFIG.DEBOUNCE_CLICK) return;
    STATE.ultimoClique = agora;

    await criarPainel(btn);
  });

  return btn;
};

const encontrarComposeBoxWhatsApp = () => {
  for (const sel of WHATSAPP_COMPOSE_SELECTORS) {
    const alvo = $(sel);
    if (alvo && alvo.isContentEditable) return alvo;
  }
  return null;
};

const inserirRespostaNoWhatsApp = (texto) => {
  const compose = encontrarComposeBoxWhatsApp();
  if (!compose) return false;

  compose.focus();
  document.execCommand('selectAll', false, null);
  document.execCommand('insertText', false, texto);
  STATE.ultimoTextoInserido = texto;
  return true;
};

const injetarWhatsApp = () => {
  if (document.querySelector('[data-ghostreply="true"]')) {
    STATE.tentativasInjecao = 0;
    return;
  }

  for (const sel of WHATSAPP_COMPOSE_SELECTORS) {
    const alvo = $(sel);
    if (alvo) {
      const container = alvo.closest('footer') || alvo.parentElement;
      if (container && !STATE.botoesInjetados.has(container)) {
        const btn = criarBotaoGhostReply();
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex;align-items:center;margin-right:8px;';
        wrapper.appendChild(btn);
        container.insertBefore(wrapper, container.firstChild);
        STATE.botoesInjetados.add(container);
        STATE.tentativasInjecao = 0;
        return;
      }
    }
  }

  // Nenhum seletor casou. Isso é esperado antes de abrir uma conversa
  // (não existe caixa de mensagem na tela inicial), por isso só
  // alertamos depois de várias varreduras seguidas sem sucesso — aí
  // sim é sinal de que o HTML do WhatsApp Web mudou.
  STATE.tentativasInjecao += 1;
  if (STATE.tentativasInjecao === CONFIG.TENTATIVAS_ANTES_DE_ALERTAR) {
    reportarFalhaDeSeletor(
      'WHATSAPP_COMPOSE_SELECTOR_NOT_FOUND',
      `Nenhum dos ${WHATSAPP_COMPOSE_SELECTORS.length} seletores da caixa de mensagem casou após ${STATE.tentativasInjecao} tentativas.`
    );
  }
};

const injetarBotao = () => {
  if (STATE.site === 'whatsapp') injetarWhatsApp();
};

// ============================================================
// SECAO 8: OBSERVADORES E INICIALIZACAO
// ============================================================

const iniciarObservador = () => {
  const observer = new MutationObserver(debounce(() => {
    injetarBotao();
  }, 400));

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  setTimeout(injetarBotao, CONFIG.DELAY_INJECAO);
};

const init = () => {
  STATE.site = detectarSite();
  if (!STATE.site) return;

  console.log(`[GhostReply] Inicializado (v${getExtensionVersion()}) em: ${STATE.site}`);
  iniciarObservador();

  document.addEventListener('click', (e) => {
    if (!STATE.painelAberto) return;
    const panel = document.getElementById('ghostreply-panel');
    if (panel && !panel.contains(e.target) && !e.target.closest('[data-ghostreply="true"]')) {
      fecharPainel();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && STATE.painelAberto) {
      fecharPainel();
    }
  });

  document.addEventListener('pointerup', soltarPressFeedback);
  document.addEventListener('pointercancel', soltarPressFeedback);

  document.addEventListener('click', (e) => {
    if (e.target.closest('.ghostreply-dropdown')) return;
    document.querySelectorAll('.ghostreply-dropdown-menu:not([hidden])').forEach((menu) => {
      menu.hidden = true;
      menu.previousElementSibling?.setAttribute('aria-expanded', 'false');
    });
  });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
