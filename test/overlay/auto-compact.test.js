// @vitest-environment happy-dom
'use strict';
/**
 * auto-compact 测试：配置读写（主进程 settings.json，经 overlay/settings.ts 缓存）、
 * UI 同步、阈值触发。localStorage / document 由 happy-dom 提供；
 * window.electronAPI 用内存桩模拟主进程（save 返回合并后的完整设置）。
 */
import { test, beforeEach, afterEach, vi } from 'vitest';
import assert from 'node:assert';
import { setupDom } from '../helpers/dom';

const HTML = `
  <input type="checkbox" id="cuckoo-auto-compact-enabled">
  <input type="number" id="cuckoo-auto-compact-threshold">
  <button id="cuckoo-auto-compact-save"></button>
`;

let autoCompact;
let settingsMod;
let dom;
let api;

function makeDeps(overrides = {}) {
  const deps = {
    onResponse: (cb) => { deps.responseCb = cb; },
    triggerCompaction: () => { deps.compactCalls.push(1); return Promise.resolve(); },
    notify: (msg, ms) => { deps.notifications.push([msg, ms]); },
    compactCalls: [],
    notifications: [],
    responseCb: null,
    ...overrides,
  };
  return deps;
}

function setForm(enabled, threshold) {
  document.getElementById('cuckoo-auto-compact-enabled').checked = enabled;
  document.getElementById('cuckoo-auto-compact-threshold').value = String(threshold);
}

/** 等待 saveAutoCompactConfig 内的 await saveSettings 链完成 */
function flush() {
  return new Promise((r) => setTimeout(r, 0));
}

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  dom = setupDom(HTML);
  api = {
    saveCalls: [],
    async saveSettings(patch) {
      api.saveCalls.push(patch);
      return { success: true, settings: { ...patch } };
    },
  };
  window.electronAPI = api;
  settingsMod = await import('../../src/overlay/settings.js');
  autoCompact = await import('../../src/overlay/auto-compact.js');
});

afterEach(() => {
  dom.cleanup();
});

test('默认配置：关闭 + 阈值 80 万，同步到 UI', () => {
  autoCompact.initAutoCompact(makeDeps());
  assert.strictEqual(document.getElementById('cuckoo-auto-compact-enabled').checked, false);
  assert.strictEqual(Number(document.getElementById('cuckoo-auto-compact-threshold').value), 80);
});

test('从设置缓存加载已有配置到 UI', () => {
  settingsMod.__setCacheForTest({ autoCompactEnabled: true, autoCompactThreshold: 50 });
  autoCompact.initAutoCompact(makeDeps());
  assert.strictEqual(document.getElementById('cuckoo-auto-compact-enabled').checked, true);
  assert.strictEqual(Number(document.getElementById('cuckoo-auto-compact-threshold').value), 50);
});

test('保存按钮写入主进程设置并提示', async () => {
  const deps = makeDeps();
  autoCompact.initAutoCompact(deps);
  setForm(true, 30);
  document.getElementById('cuckoo-auto-compact-save').click();
  await flush();
  assert.strictEqual(api.saveCalls.length, 1);
  assert.deepStrictEqual(api.saveCalls[0], { autoCompactEnabled: true, autoCompactThreshold: 30 });
  // 缓存已刷新
  assert.strictEqual(settingsMod.getCachedSettings().autoCompactEnabled, true);
  assert.strictEqual(settingsMod.getCachedSettings().autoCompactThreshold, 30);
  assert.strictEqual(deps.notifications.length, 1);
  assert.strictEqual(deps.notifications[0][0].includes('30'), true);
});

test('非法阈值：提示错误且不写入主进程设置', async () => {
  const deps = makeDeps();
  autoCompact.initAutoCompact(deps);
  setForm(true, -5);
  document.getElementById('cuckoo-auto-compact-save').click();
  await flush();
  assert.strictEqual(api.saveCalls.length, 0);
  assert.strictEqual(deps.notifications.length, 1);
  assert.strictEqual(deps.notifications[0][0].includes('正数'), true);
});

test('主进程保存失败：提示失败且不更新配置', async () => {
  const deps = makeDeps();
  api.saveSettings = async () => { throw new Error('ipc down'); };
  autoCompact.initAutoCompact(deps);
  setForm(true, 30);
  document.getElementById('cuckoo-auto-compact-save').click();
  await flush();
  assert.strictEqual(deps.notifications.length, 1);
  assert.strictEqual(deps.notifications[0][0].includes('失败'), true);
  deps.responseCb('', { tokenUsage: { accumulatedTokens: 9999999 } });
  assert.strictEqual(deps.compactCalls.length, 0);
});

test('未开启时不触发压缩', () => {
  const deps = makeDeps();
  autoCompact.initAutoCompact(deps);
  deps.responseCb('', { tokenUsage: { accumulatedTokens: 9999999 } });
  assert.strictEqual(deps.compactCalls.length, 0);
});

test('低于阈值不触发，达到阈值触发', async () => {
  const deps = makeDeps();
  autoCompact.initAutoCompact(deps);
  setForm(true, 80);
  document.getElementById('cuckoo-auto-compact-save').click();
  await flush();

  deps.responseCb('', { tokenUsage: { accumulatedTokens: 799999 } });
  assert.strictEqual(deps.compactCalls.length, 0);
  deps.responseCb('', { tokenUsage: { accumulatedTokens: 800000 } });
  assert.strictEqual(deps.compactCalls.length, 1);
});

test('压缩进行中不重复触发，完成后可再次触发', async () => {
  let release;
  const deps = makeDeps({
    triggerCompaction: () => { deps.compactCalls.push(1); return new Promise((r) => { release = r; }); },
  });
  autoCompact.initAutoCompact(deps);
  setForm(true, 80);
  document.getElementById('cuckoo-auto-compact-save').click();
  await flush();

  deps.responseCb('', { tokenUsage: { accumulatedTokens: 900000 } });
  deps.responseCb('', { tokenUsage: { accumulatedTokens: 950000 } });
  assert.strictEqual(deps.compactCalls.length, 1); // 进行中，第二次被抑制

  release();
  await new Promise((r) => setTimeout(r, 0));
  deps.responseCb('', { tokenUsage: { accumulatedTokens: 960000 } });
  assert.strictEqual(deps.compactCalls.length, 2); // 完成后允许再次触发
});

test('响应缺少 tokenUsage 时不触发也不报错', async () => {
  const deps = makeDeps();
  autoCompact.initAutoCompact(deps);
  setForm(true, 80);
  document.getElementById('cuckoo-auto-compact-save').click();
  await flush();
  deps.responseCb('', null);
  deps.responseCb('', {});
  assert.strictEqual(deps.compactCalls.length, 0);
});

test('设置广播到达：运行态与 UI 同步刷新（模拟另一窗口改动自动压缩配置）', () => {
  const deps = makeDeps();
  autoCompact.initAutoCompact(deps);
  // 另一窗口保存后，主进程广播 settings-changed → applyRemoteSettings
  settingsMod.applyRemoteSettings({
    ...settingsMod.getCachedSettings(),
    autoCompactEnabled: true,
    autoCompactThreshold: 20,
  });
  assert.strictEqual(document.getElementById('cuckoo-auto-compact-enabled').checked, true);
  assert.strictEqual(Number(document.getElementById('cuckoo-auto-compact-threshold').value), 20);
  deps.responseCb('', { tokenUsage: { accumulatedTokens: 200000 } });
  assert.strictEqual(deps.compactCalls.length, 1);
});

test('恢复默认不影响自动压缩配置（reset 返回的设置保留 autoCompact 字段）', async () => {
  const deps = makeDeps();
  api.resetSettings = async () => ({
    success: true,
    // 主进程 reset 排除 autoCompact：返回的设置里保留现值
    settings: { ...settingsMod.getCachedSettings(), autoCompactEnabled: true, autoCompactThreshold: 33 },
  });
  autoCompact.initAutoCompact(deps);
  setForm(true, 33);
  document.getElementById('cuckoo-auto-compact-save').click();
  await flush();
  await settingsMod.resetSettings();
  // 运行态与 UI 仍是 33 万 / 开启
  assert.strictEqual(document.getElementById('cuckoo-auto-compact-enabled').checked, true);
  assert.strictEqual(Number(document.getElementById('cuckoo-auto-compact-threshold').value), 33);
  deps.responseCb('', { tokenUsage: { accumulatedTokens: 330000 } });
  assert.strictEqual(deps.compactCalls.length, 1);
});
