// @vitest-environment happy-dom
'use strict';
/**
 * auto-compact 测试：配置读写（localStorage 键保持现值）、UI 同步、阈值触发。
 * localStorage / document 由 happy-dom 提供，每个用例前清空并重建 DOM。
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
let dom;

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

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  dom = setupDom(HTML);
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

test('从 localStorage 加载已有配置到 UI', () => {
  localStorage.setItem('cuckoo-auto-compact-enabled', '1');
  localStorage.setItem('cuckoo-auto-compact-threshold', '50');
  autoCompact.initAutoCompact(makeDeps());
  assert.strictEqual(document.getElementById('cuckoo-auto-compact-enabled').checked, true);
  assert.strictEqual(Number(document.getElementById('cuckoo-auto-compact-threshold').value), 50);
});

test('保存按钮写入 localStorage 并提示', () => {
  const deps = makeDeps();
  autoCompact.initAutoCompact(deps);
  setForm(true, 30);
  document.getElementById('cuckoo-auto-compact-save').click();
  assert.strictEqual(localStorage.getItem('cuckoo-auto-compact-enabled'), '1');
  assert.strictEqual(localStorage.getItem('cuckoo-auto-compact-threshold'), '30');
  assert.strictEqual(deps.notifications.length, 1);
  assert.strictEqual(deps.notifications[0][0].includes('30'), true);
});

test('非法阈值：提示错误且不写入 localStorage', () => {
  const deps = makeDeps();
  autoCompact.initAutoCompact(deps);
  setForm(true, -5);
  document.getElementById('cuckoo-auto-compact-save').click();
  assert.strictEqual(localStorage.getItem('cuckoo-auto-compact-enabled') === null, true);
  assert.strictEqual(deps.notifications.length, 1);
  assert.strictEqual(deps.notifications[0][0].includes('正数'), true);
});

test('未开启时不触发压缩', () => {
  const deps = makeDeps();
  autoCompact.initAutoCompact(deps);
  deps.responseCb('', { tokenUsage: { accumulatedTokens: 9999999 } });
  assert.strictEqual(deps.compactCalls.length, 0);
});

test('低于阈值不触发，达到阈值触发', () => {
  const deps = makeDeps();
  autoCompact.initAutoCompact(deps);
  setForm(true, 80);
  document.getElementById('cuckoo-auto-compact-save').click();

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

  deps.responseCb('', { tokenUsage: { accumulatedTokens: 900000 } });
  deps.responseCb('', { tokenUsage: { accumulatedTokens: 950000 } });
  assert.strictEqual(deps.compactCalls.length, 1); // 进行中，第二次被抑制

  release();
  await new Promise((r) => setTimeout(r, 0));
  deps.responseCb('', { tokenUsage: { accumulatedTokens: 960000 } });
  assert.strictEqual(deps.compactCalls.length, 2); // 完成后允许再次触发
});

test('响应缺少 tokenUsage 时不触发也不报错', () => {
  const deps = makeDeps();
  autoCompact.initAutoCompact(deps);
  setForm(true, 80);
  document.getElementById('cuckoo-auto-compact-save').click();
  deps.responseCb('', null);
  deps.responseCb('', {});
  assert.strictEqual(deps.compactCalls.length, 0);
});
