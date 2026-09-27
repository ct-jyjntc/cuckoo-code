// @vitest-environment happy-dom
'use strict';
/**
 * token-counter 测试：localStorage 读写、显示刷新、壳页面同步（deps 注入）。
 * localStorage / document 由 happy-dom 提供，每个用例前清空。
 */
import { test, beforeEach, afterEach, vi } from 'vitest';
import assert from 'node:assert';
import { setupDom } from '../helpers/dom';

let tokenCounter;
let dom;

function makeDeps(overrides = {}) {
  const shellCalls = [];
  const deps = {
    getCurrentSessionId: () => 's1',
    onResponse: (cb) => { deps.responseCb = cb; },
    updateShellTokenUsage: (c, cu, w, t) => { shellCalls.push([c, cu, w, t]); },
    shellCalls,
    responseCb: null,
    ...overrides,
  };
  return deps;
}

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  dom = setupDom('<div id="cuckoo-conv-token-count"></div>');
  tokenCounter = await import('../../src/overlay/token-counter.js');
  tokenCounter.setIsSubagentWindow(false);
});

afterEach(() => {
  dom.cleanup();
  vi.useRealTimers();
});

test('refresh 返回 Promise', () => {
  const tc = tokenCounter.initTokenCounter(makeDeps());
  const p = tc.refresh();
  assert.strictEqual(typeof p.then, 'function');
  return p;
});

test('收到响应后写入会话缓存、更新显示并同步壳页面', async () => {
  localStorage.setItem('cuckoo-token-daily-version', '3'); // 模拟应用已初始化（版本已迁移）
  const deps = makeDeps();
  const tc = tokenCounter.initTokenCounter(deps);
  deps.responseCb('reply', { tokenUsage: { accumulatedTokens: 200 } });
  await tc.refresh();

  const cache = JSON.parse(localStorage.getItem('cuckoo-token-cache'));
  assert.strictEqual(cache.s1.context, 200);
  assert.strictEqual(cache.s1.cumulative, 200);
  assert.strictEqual(document.getElementById('cuckoo-conv-token-count').textContent, '200');
  // 壳页面同步参数：上下文 + 对话累计 + 窗口累计 + 今日累计
  assert.deepStrictEqual(deps.shellCalls[deps.shellCalls.length - 1], [200, 200, 200, 200]);
});

test('累计消耗 = 各轮 acc 之和（去重同轮重复事件）', () => {
  const deps = makeDeps();
  tokenCounter.initTokenCounter(deps);
  deps.responseCb('', { tokenUsage: { accumulatedTokens: 200 } });
  deps.responseCb('', { tokenUsage: { accumulatedTokens: 200 } }); // 同轮重复，不累加
  deps.responseCb('', { tokenUsage: { accumulatedTokens: 500 } });
  const cache = JSON.parse(localStorage.getItem('cuckoo-token-cache'));
  assert.strictEqual(cache.s1.cumulative, 700); // 200 + 500
});

test('今日累计随响应累加，跨天归零', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 26, 12, 0, 0));
  localStorage.setItem('cuckoo-token-daily-version', '3');
  const deps = makeDeps();
  tokenCounter.initTokenCounter(deps);
  deps.responseCb('', { tokenUsage: { accumulatedTokens: 100 } });
  deps.responseCb('', { tokenUsage: { accumulatedTokens: 300 } });
  assert.strictEqual(tokenCounter.getTodayCumulative(), 400);

  vi.setSystemTime(new Date(2026, 8, 27, 12, 0, 0));
  assert.strictEqual(tokenCounter.getTodayCumulative(), 0);
});

test('服务端值丢失时仍显示当前会话缓存', async () => {
  const deps = makeDeps();
  const tc = tokenCounter.initTokenCounter(deps);
  deps.responseCb('', { tokenUsage: { accumulatedTokens: 200 } });
  await tc.refresh();
  deps.responseCb('', {}); // 无 tokenUsage → 服务端值置空
  await tc.refresh();
  assert.strictEqual(document.getElementById('cuckoo-conv-token-count').textContent, '200');
});

test('当前会话无缓存时回退到服务端值', async () => {
  const deps = makeDeps({ getCurrentSessionId: () => null });
  const tc = tokenCounter.initTokenCounter(deps);
  deps.responseCb('', { tokenUsage: { accumulatedTokens: 500 } });
  await tc.refresh();
  assert.strictEqual(document.getElementById('cuckoo-conv-token-count').textContent, '500');
});

test('过万显示为「x.xx万」', async () => {
  const deps = makeDeps();
  const tc = tokenCounter.initTokenCounter(deps);
  deps.responseCb('', { tokenUsage: { accumulatedTokens: 123456 } });
  await tc.refresh();
  assert.strictEqual(document.getElementById('cuckoo-conv-token-count').textContent, '12.35万');
});

test('旧口径版本触发迁移清空', () => {
  localStorage.setItem('cuckoo-token-daily', JSON.stringify({ '2026-09-26': 99999999 }));
  localStorage.removeItem('cuckoo-token-daily-version');
  assert.strictEqual(tokenCounter.getTodayCumulative(), 0);
  assert.strictEqual(localStorage.getItem('cuckoo-token-daily-version'), '3');
});

test('子代理窗口不写缓存、不计入今日', () => {
  localStorage.setItem('cuckoo-token-daily-version', '3');
  tokenCounter.setIsSubagentWindow(true);
  const deps = makeDeps();
  tokenCounter.initTokenCounter(deps);
  deps.responseCb('', { tokenUsage: { accumulatedTokens: 9999 } });
  assert.strictEqual(localStorage.getItem('cuckoo-token-cache') === null, true);
  assert.strictEqual(tokenCounter.getTodayCumulative(), 0);
});

test('updateShellTokenUsage 抛错不影响 refresh 完成', async () => {
  const deps = makeDeps({
    updateShellTokenUsage: () => { throw new Error('boom'); },
  });
  const tc = tokenCounter.initTokenCounter(deps);
  deps.responseCb('', { tokenUsage: { accumulatedTokens: 100 } });
  await tc.refresh(); // 不应 reject
  assert.strictEqual(document.getElementById('cuckoo-conv-token-count').textContent, '100');
});
