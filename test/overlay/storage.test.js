// @vitest-environment happy-dom
'use strict';
/**
 * storage 模块测试：KEYS 键名集中管理 + readKey/writeKey 窄封装。
 * localStorage 由 happy-dom 提供，每个用例前清空。
 */
import { test, beforeEach, vi } from 'vitest';
import assert from 'node:assert';

let storage;

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  storage = await import('../../src/overlay/storage.js');
});

test('KEYS 无重复值', () => {
  const values = Object.values(storage.KEYS);
  assert.strictEqual(new Set(values).size, values.length);
});

test('KEYS 值全部是 cuckoo- 前缀的非空字符串', () => {
  const values = Object.values(storage.KEYS);
  assert.strictEqual(values.length > 0, true);
  for (const v of values) {
    assert.strictEqual(typeof v, 'string');
    assert.strictEqual(v.startsWith('cuckoo-'), true, 'key without cuckoo- prefix: ' + v);
  }
});

test('readKey 键不存在时返回调用方给的默认值', () => {
  assert.strictEqual(storage.readKey(storage.KEYS.fabPos, 'dft'), 'dft');
  assert.deepStrictEqual(storage.readKey(storage.KEYS.tokenCache, { a: 1 }), { a: 1 });
});

test('readKey 遇到坏 JSON 返回默认值而不是抛错', () => {
  localStorage.setItem(storage.KEYS.fabPos, '{broken json');
  assert.deepStrictEqual(storage.readKey(storage.KEYS.fabPos, { left: 0, top: 0 }), { left: 0, top: 0 });
});

test('readKey 解析合法 JSON', () => {
  localStorage.setItem(storage.KEYS.fabPos, JSON.stringify({ left: 10, top: 20 }));
  assert.deepStrictEqual(storage.readKey(storage.KEYS.fabPos, null), { left: 10, top: 20 });
});

test('writeKey JSON 序列化，readKey 可读回', () => {
  storage.writeKey(storage.KEYS.fabPos, { left: 3, top: 4 });
  assert.strictEqual(localStorage.getItem(storage.KEYS.fabPos), '{"left":3,"top":4}');
  assert.deepStrictEqual(storage.readKey(storage.KEYS.fabPos, null), { left: 3, top: 4 });
});

test('removeKey 删除键且不抛错', () => {
  storage.writeKey(storage.KEYS.tokenDaily, { '2026-09-28': 1 });
  storage.removeKey(storage.KEYS.tokenDaily);
  assert.strictEqual(localStorage.getItem(storage.KEYS.tokenDaily), null);
  storage.removeKey(storage.KEYS.tokenDaily); // 幂等
});

test('settings 的 reset 清单从 KEYS 派生：恰好清空设置键，保留 fabPos/token/autoCompact', async () => {
  const { resetSettings } = await import('../../src/overlay/panels/settings.js');
  // 所有 KEYS 都写入值
  for (const v of Object.values(storage.KEYS)) localStorage.setItem(v, 'x');
  resetSettings();
  const removed = Object.values(storage.KEYS).filter((v) => localStorage.getItem(v) === null);
  const kept = Object.values(storage.KEYS).filter((v) => localStorage.getItem(v) !== null);
  // 清空集合必须恰好是这 14 个设置键（全部来自 KEYS，无手工字面量）
  const expectedRemoved = [
    storage.KEYS.retryEnabled, storage.KEYS.retryDelayMin, storage.KEYS.retryDelayMax,
    storage.KEYS.retryCount, storage.KEYS.retry429Delay, storage.KEYS.retry429Count,
    storage.KEYS.retryPrompt, storage.KEYS.xhrIdleTimeout, storage.KEYS.watchdogPrompt,
    storage.KEYS.watchdogCount, storage.KEYS.sendDelayMin, storage.KEYS.sendDelayMax,
    storage.KEYS.attachDelayMin, storage.KEYS.attachDelayMax,
  ];
  assert.deepStrictEqual([...removed].sort(), [...expectedRemoved].sort());
  // 无关键（fab 位置、token 统计、自动压缩配置）不受影响
  assert.deepStrictEqual([...kept].sort(), [
    storage.KEYS.fabPos, storage.KEYS.tokenCache, storage.KEYS.tokenDaily,
    storage.KEYS.tokenDailyVersion, storage.KEYS.autoCompactEnabled,
    storage.KEYS.autoCompactThreshold,
  ].sort());
});
