'use strict';
/**
 * 设置面板测试：openSettings 从设置缓存读取；saveSettings / resetSettings
 * 经 window.electronAPI 写入主进程 settings.json（此处用内存桩模拟）。
 */
import { test, beforeEach, afterEach, vi } from 'vitest';
import assert from 'node:assert';

let settings;
let settingsMod;
let stateMod;
let DEFAULT_SETTINGS;
let els;
let api;

// 简易 DOM 模拟（外部边界）：按 id 存取元素
function makeEl(id) {
  return {
    id,
    value: '',
    checked: false,
    textContent: '',
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      toggle(c, f) { if (f) this._s.add(c); else this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    },
  };
}

function setupGlobals() {
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  };
  els = {};
  globalThis.document = {
    getElementById: (id) => els[id] || null,
    createElement: (tag) => makeEl('el-' + tag),
    querySelector: () => null,
    querySelectorAll: () => [],
    body: { appendChild() {} },
  };
  api = {
    saveCalls: [],
    resetCalls: 0,
    async saveSettings(patch) {
      api.saveCalls.push(patch);
      return { success: true, settings: { ...patch } };
    },
    async resetSettings() {
      api.resetCalls++;
      return { success: true, settings: { ...DEFAULT_SETTINGS } };
    },
  };
  globalThis.window = { electronAPI: api };
  globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
}

beforeEach(async () => {
  vi.resetModules();
  setupGlobals();
  const storeMod = await import('../../../src/app/settings-store.js');
  DEFAULT_SETTINGS = storeMod.DEFAULT_SETTINGS;
  settingsMod = await import('../../../src/overlay/settings.js');
  stateMod = await import('../../../src/overlay/state.js');
  settings = await import('../../../src/overlay/panels/settings.js');
});

afterEach(() => {
  vi.useRealTimers();
});

test('openSettings 从设置缓存加载到输入框', () => {
  settingsMod.__setCacheForTest({ retryCount: 7 });
  const id = 'cuckoo-retry-count';
  els[id] = makeEl(id);
  const panel = 'cuckoo-settings';
  els[panel] = makeEl(panel);
  els[panel].classList.add('cuckoo-hidden');
  settings.openSettings();
  assert.strictEqual(els[id].value, '7');
  assert.strictEqual(els[panel].classList.contains('cuckoo-hidden'), false);
});

test('openSettings 毫秒转秒', () => {
  settingsMod.__setCacheForTest({ retryDelayMin: 5000 });
  const id = 'cuckoo-retry-delay-min';
  els[id] = makeEl(id);
  settings.openSettings();
  assert.strictEqual(els[id].value, 5);
});

test('openSettings 默认缓存用默认值', () => {
  const id = 'cuckoo-retry-count';
  els[id] = makeEl(id);
  settings.openSettings();
  assert.strictEqual(els[id].value, '10');
});

test('closeSettings 加 hidden 类', () => {
  const panel = 'cuckoo-settings';
  els[panel] = makeEl(panel);
  settings.closeSettings();
  assert.strictEqual(els[panel].classList.contains('cuckoo-hidden'), true);
});

test('saveSettings 校验：最小间隔非法被拒绝', async () => {
  els['cuckoo-retry-delay-min'] = makeEl('cuckoo-retry-delay-min');
  els['cuckoo-retry-delay-min'].value = 'abc';
  await settings.saveSettings();
  assert.strictEqual(api.saveCalls.length, 0);
});

test('saveSettings 校验：最大间隔小于最小被拒绝', async () => {
  els['cuckoo-retry-delay-min'] = makeEl('a'); els['cuckoo-retry-delay-min'].value = '5';
  els['cuckoo-retry-delay-max'] = makeEl('b'); els['cuckoo-retry-delay-max'].value = '3';
  await settings.saveSettings();
  assert.strictEqual(api.saveCalls.length, 0);
});

test('saveSettings 校验：重试次数非整数被拒绝', async () => {
  els['cuckoo-retry-delay-min'] = makeEl('a'); els['cuckoo-retry-delay-min'].value = '4';
  els['cuckoo-retry-delay-max'] = makeEl('b'); els['cuckoo-retry-delay-max'].value = '10';
  els['cuckoo-retry-count'] = makeEl('c'); els['cuckoo-retry-count'].value = 'x';
  await settings.saveSettings();
  assert.strictEqual(api.saveCalls.length, 0);
});

test('saveSettings 校验：提示词为空被拒绝', async () => {
  els['cuckoo-retry-delay-min'] = makeEl('a'); els['cuckoo-retry-delay-min'].value = '4';
  els['cuckoo-retry-delay-max'] = makeEl('b'); els['cuckoo-retry-delay-max'].value = '10';
  els['cuckoo-retry-count'] = makeEl('c'); els['cuckoo-retry-count'].value = '10';
  els['cuckoo-retry-429-delay'] = makeEl('d'); els['cuckoo-retry-429-delay'].value = '60';
  els['cuckoo-retry-429-count'] = makeEl('e'); els['cuckoo-retry-429-count'].value = '20';
  els['cuckoo-retry-prompt'] = makeEl('f'); els['cuckoo-retry-prompt'].value = '   ';
  await settings.saveSettings();
  assert.strictEqual(api.saveCalls.length, 0);
});

test('saveSettings 校验：发送延迟最大超 10 秒被拒绝', async () => {
  fillValid();
  els['cuckoo-delay-min'] = makeEl('x'); els['cuckoo-delay-min'].value = '1';
  els['cuckoo-delay-max'] = makeEl('y'); els['cuckoo-delay-max'].value = '11';
  await settings.saveSettings();
  assert.strictEqual(api.saveCalls.length, 0);
});

test('saveSettings 校验：附件间隔最大超 60 秒被拒绝', async () => {
  fillValid();
  els['cuckoo-delay-min'] = makeEl('x'); els['cuckoo-delay-min'].value = '1';
  els['cuckoo-delay-max'] = makeEl('y'); els['cuckoo-delay-max'].value = '2';
  els['cuckoo-attach-delay-min'] = makeEl('z'); els['cuckoo-attach-delay-min'].value = '1';
  els['cuckoo-attach-delay-max'] = makeEl('w'); els['cuckoo-attach-delay-max'].value = '61';
  await settings.saveSettings();
  assert.strictEqual(api.saveCalls.length, 0);
});

function fillValid() {
  const map = {
    'cuckoo-retry-delay-min': '4',
    'cuckoo-retry-delay-max': '10',
    'cuckoo-retry-count': '10',
    'cuckoo-retry-429-delay': '60',
    'cuckoo-retry-429-count': '20',
    'cuckoo-retry-prompt': '请继续',
    'cuckoo-xhr-idle-timeout': '300',
    'cuckoo-watchdog-prompt': '请继续',
    'cuckoo-watchdog-count': '3',
  };
  for (const [k, v] of Object.entries(map)) {
    els[k] = makeEl(k);
    els[k].value = v;
  }
}

test('saveSettings 全部合法写入主进程设置（秒转毫秒）', async () => {
  fillValid();
  els['cuckoo-delay-min'] = makeEl('x'); els['cuckoo-delay-min'].value = '2';
  els['cuckoo-delay-max'] = makeEl('y'); els['cuckoo-delay-max'].value = '4';
  els['cuckoo-attach-delay-min'] = makeEl('z'); els['cuckoo-attach-delay-min'].value = '0.5';
  els['cuckoo-attach-delay-max'] = makeEl('w'); els['cuckoo-attach-delay-max'].value = '1';
  els['cuckoo-retry-enabled'] = makeEl('en'); els['cuckoo-retry-enabled'].checked = true;
  els['cuckoo-settings'] = makeEl('cuckoo-settings');

  await settings.saveSettings();

  assert.strictEqual(api.saveCalls.length, 1);
  const patch = api.saveCalls[0];
  assert.strictEqual(patch.retryDelayMin, 4000);
  assert.strictEqual(patch.retryDelayMax, 10000);
  assert.strictEqual(patch.retryCount, 10);
  assert.strictEqual(patch.retryEnabled, true);
  assert.strictEqual(patch.sendDelayMin, 2000);
  assert.strictEqual(patch.sendDelayMax, 4000);
  assert.strictEqual(patch.attachDelayMin, 500);
  assert.strictEqual(patch.attachDelayMax, 1000);
  assert.strictEqual(patch.xhrIdleTimeout, 300000);
  // 缓存同步刷新
  assert.strictEqual(settingsMod.getCachedSettings().retryDelayMin, 4000);
  // state 同步
  assert.strictEqual(stateMod.state.sendDelayMin, 2000);
  assert.strictEqual(stateMod.state.sendDelayMax, 4000);
});

test('saveSettings 主进程保存失败：不关闭弹窗且不更新 state', async () => {
  fillValid();
  els['cuckoo-delay-min'] = makeEl('x'); els['cuckoo-delay-min'].value = '1';
  els['cuckoo-delay-max'] = makeEl('y'); els['cuckoo-delay-max'].value = '2';
  els['cuckoo-attach-delay-min'] = makeEl('z'); els['cuckoo-attach-delay-min'].value = '0.5';
  els['cuckoo-attach-delay-max'] = makeEl('w'); els['cuckoo-attach-delay-max'].value = '1';
  const panel = 'cuckoo-settings';
  els[panel] = makeEl(panel);
  stateMod.state.sendDelayMin = 2000;
  api.saveSettings = async () => { throw new Error('ipc down'); };

  await settings.saveSettings();

  assert.strictEqual(els[panel].classList.contains('cuckoo-hidden'), false);
  assert.strictEqual(stateMod.state.sendDelayMin, 2000);
});

test('resetSettings 调主进程重置，缓存与 state 回到默认，localStorage 不受影响', async () => {
  settingsMod.__setCacheForTest({ retryCount: 99, sendDelayMin: 999 });
  stateMod.state.sendDelayMin = 999;
  localStorage.setItem('cuckoo-retry-count', '99'); // 假设残留旧键
  const panel = 'cuckoo-settings';
  els[panel] = makeEl(panel);

  await settings.resetSettings();

  assert.strictEqual(api.resetCalls, 1);
  assert.strictEqual(settingsMod.getCachedSettings().retryCount, 10);
  assert.strictEqual(stateMod.state.sendDelayMin, 2000);
  // 设置面板的 reset 不再直接操作 localStorage（旧键清理由 initSettings 迁移负责）
  assert.strictEqual(localStorage.getItem('cuckoo-retry-count'), '99');
});
