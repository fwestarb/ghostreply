const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../content.js'), 'utf8');
const overlayCode = source.slice(source.indexOf('const criarAuthOverlay ='), source.indexOf('const criarPainel ='));
function setup() {
  const pending = [];
  const renders = [];
  const element = () => ({ style: {}, children: [], attributes: {}, classList: { toggle() {} },
    appendChild(child) { this.children.push(child); },
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, fn) { this[name] = fn; } });
  const context = { document: { createElement: element }, ICONS: {close: ''}, criarSVG: element,
    animarSaidaOverlay() {}, animarEntradaOverlay() {}, mostrarToast() {},
    AuthClient: { getSession: () => new Promise(resolve => pending.push(resolve)) } };
  for (const view of ['Login', 'Signup', 'Recover', 'Profile']) {
    context[`render${view}View`] = (body, ctx) => { renders.push(view); context.ctx = ctx; };
  }
  vm.createContext(context);
  vm.runInContext(overlayCode + '\nglobalThis.result = criarAuthOverlay(document.createElement("div"), document.createElement("div"));', context);
  return Object.assign(context, { pending, renders });
}
test('account creation stays selected when the initial session lookup finishes', async () => {
  const state = setup();
  const shown = state.result.show();
  const navigation = state.result.el.children[1];
  assert.equal(navigation.children[1].textContent, 'Criar conta');
  navigation.children[1].click();
  state.pending.shift()(null);
  await shown;
  assert.deepEqual(state.renders, ['Login', 'Signup']);
  assert.equal(navigation.children[1].attributes['aria-pressed'], 'true');
});
test('badge refresh does not reset the open signup form', async () => {
  const state = setup();
  const shown = state.result.show();
  state.pending.shift()(null);
  await shown;
  state.result.el.children[1].children[1].click();
  const refreshed = state.result.refreshBadge();
  state.pending.shift()(null);
  await refreshed;
  assert.equal(state.renders.at(-1), 'Signup');
});
test('successful authentication refresh opens the profile', async () => {
  const state = setup();
  const shown = state.result.show();
  state.pending.shift()(null);
  await shown;
  const refreshed = state.ctx.refresh();
  state.pending.shift()({ user: { name: 'Test' } });
  await refreshed;
  assert.equal(state.renders.at(-1), 'Profile');
  assert.equal(state.result.el.children[1].hidden, true);
});

