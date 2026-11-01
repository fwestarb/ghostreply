const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function setup() {
  const timers = [], requests = [], inserts = [];
  let chat = 'A';
  const element = () => ({ isConnected: true, children: [], dataset: {}, style: {},
    classList: { add() {}, remove() {}, toggle() {} }, appendChild(child) { this.children.push(child); return child; },
    setAttribute() {}, addEventListener(name, fn) { this[name] = fn; }, querySelectorAll: () => [], focus() {},
    remove() { this.removed = true; this.isConnected = false; } });
  const main = element(), compose = { ...element(), isContentEditable: true, innerText: '' };
  const panel = element(), container = element();
  const document = { readyState: 'complete', querySelector(selector) {
    if (selector === '#main') return main;
    if (selector.includes('header')) return { getAttribute: () => chat, textContent: chat };
    return selector.includes('footer') ? compose : null;
  }, querySelectorAll: () => [], createElement: element, createElementNS: element,
  execCommand(command, _, value) { if (command === 'insertText') { compose.innerText = value; inserts.push({ chat, value }); } } };
  const sandbox = { console, document, location: { hostname: 'example.test' }, window: {}, navigator: {},
    setTimeout(fn) { timers.push(fn); }, clearTimeout() {}, generateReplies: () => new Promise((resolve, reject) => requests.push({ resolve, reject })) };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../content.js'), 'utf8') + `
    STATE.site='whatsapp'; painelAtual=globalThis.testPanel; STATE.painelAberto=true;
    globalThis.api={load:carregarRespostasNoPainel,close:fecharPainel,setPanel:p=>{painelAtual=p;STATE.painelAberto=true;},current:()=>painelAtual,state:STATE};`,
    Object.assign(sandbox, { testPanel: panel }));
  return { api: sandbox.api, panel, container, compose, requests, inserts, timers, element, switchChat(value) { chat = value; } };
}
const reply = (text) => ({ replies: [{ text, confident: true }], hasKnowledge: true });
test('resposta de A não preenche B nem renderiza em contexto trocado', async () => {
  const s = setup(); const pending = s.api.load(s.container, 'Pergunta A'); s.switchChat('B');
  s.requests.shift().resolve(reply('Resposta A')); await pending;
  assert.equal(s.inserts.length, 0); assert.notEqual(s.container.dataset.loaded, 'true');
});
test('somente geração mais recente pode substituir o rascunho', async () => {
  const s = setup(); const older = s.api.load(s.container, 'antiga'), newer = s.api.load(s.container, 'nova');
  s.requests[1].resolve(reply('Resposta nova')); await newer;
  s.requests[0].resolve(reply('Resposta antiga')); await older;
  assert.equal(s.compose.innerText, 'Resposta nova'); assert.equal(s.inserts.length, 1);
});
test('fechar painel invalida resposta e erro pendentes', async () => {
  for (const error of [false, true]) {
    const s = setup(); const pending = s.api.load(s.container, 'pergunta'); s.api.close();
    if (error) s.requests[0].reject(new Error('erro antigo')); else s.requests[0].resolve(reply('antiga'));
    await pending; assert.equal(s.inserts.length, 0); assert.notEqual(s.container.dataset.loaded, 'true');
  }
});
test('fechamento atrasado remove somente a instância antiga', () => {
  const s = setup(); s.api.close(); const newer = s.element(); s.api.setPanel(newer); s.timers.shift()();
  assert.equal(s.panel.removed, true); assert.equal(newer.removed, undefined);
  assert.equal(s.api.current(), newer); assert.equal(s.api.state.painelAberto, true);
});
test('inserção manual de card antigo também respeita a conversa de origem', async () => {
  const s = setup(); const pending = s.api.load(s.container, 'pergunta'); s.requests[0].resolve(reply('Resposta')); await pending;
  const card = s.container.children.find((child) => child.dataset.texto === 'Resposta');
  const insert = card.children.find((child) => child.children?.[0]?.click)?.children[0];
  assert.ok(insert); s.switchChat('B'); insert.click({ stopPropagation() {} });
  assert.equal(s.inserts.length, 1); // Apenas a inserção inicial legítima em A.
});
