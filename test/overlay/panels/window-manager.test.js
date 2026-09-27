// @vitest-environment happy-dom
'use strict';
/**
 * window-manager 渲染逻辑测试：renderWindowList（列表为空/有数据/失败兜底）
 * + XSS 安全（profile 名走 textNode）+ 容器级事件委托。
 */
import { test, beforeEach, afterEach, vi } from 'vitest';
import assert from 'node:assert';

import { setupDom } from '../../helpers/dom';

let toasts = [];
vi.mock('../../../src/overlay/panel.js', () => ({
  showToast: (msg) => { toasts.push(msg); },
}));

let ctx;
let mgr;
let calls;

const flush = () => new Promise((r) => setTimeout(r, 0));

function installApi({ profiles = [], providers = [] } = {}) {
  calls = { open: [], del: [], auto: [] };
  window.electronAPI = {
    listProfiles: async () => ({ success: true, profiles }),
    listProviders: async () => ({ success: true, providers }),
    openProfileWindow: async (id) => { calls.open.push(id); return { success: true, focused: true }; },
    deleteProfileWindow: async (id) => { calls.del.push(id); return { success: true, error: null }; },
    setProfileAutoOpen: async (id, on) => { calls.auto.push([id, on]); return { success: true }; },
  };
}

function listEl() {
  return document.getElementById('cuckoo-window-list');
}

beforeEach(async () => {
  toasts = [];
  ctx = setupDom(
    '<div id="cuckoo-window-manager" class="cuckoo-hidden">' +
      '<div id="cuckoo-window-list" class="cuckoo-session-list"></div>' +
    '</div>'
  );
  mgr = await import('../../../src/overlay/panels/window-manager.js');
});

afterEach(() => {
  ctx.cleanup();
  delete window.electronAPI;
});

test('无 list 元素时直接返回', async () => {
  ctx.cleanup();
  installApi();
  await mgr.renderWindowList();
  // 不抛错即通过
});

test('空列表显示"暂无窗口"', async () => {
  installApi({ profiles: [] });
  await mgr.renderWindowList();
  assert.ok(listEl().textContent.includes('暂无窗口'));
});

test('listProfiles 失败时显示"暂无窗口"（profiles 回退空）', async () => {
  calls = { open: [], del: [], auto: [] };
  window.electronAPI = { listProfiles: async () => ({ success: false }) };
  await mgr.renderWindowList();
  assert.ok(listEl().textContent.includes('暂无窗口'));
});

test('渲染窗口列表：名称 + 平台名', async () => {
  installApi({
    profiles: [{ id: 'p1', name: '我的窗口', providerId: 'deepseek', autoOpen: false }],
    providers: [{ id: 'deepseek', name: 'DeepSeek' }],
  });
  await mgr.renderWindowList();
  assert.ok(listEl().textContent.includes('我的窗口'));
  assert.ok(listEl().textContent.includes('DeepSeek'));
});

test('渲染保留 class 结构与 data-profile-id', async () => {
  installApi({ profiles: [{ id: 'p1', name: 'A', providerId: 'deepseek', autoOpen: false }] });
  await mgr.renderWindowList();
  const item = listEl().querySelector('.cuckoo-window-item');
  assert.ok(item);
  assert.strictEqual(item.dataset.profileId, 'p1');
  assert.ok(item.querySelector('.cuckoo-window-auto input'));
  assert.ok(item.querySelector('.cuckoo-window-name'));
  assert.ok(item.querySelector('.cuckoo-window-status'));
  assert.ok(item.querySelector('.cuckoo-window-del'));
});

test('autoOpen=true 时复选框为勾选状态', async () => {
  installApi({ profiles: [{ id: 'p1', name: 'A', providerId: 'deepseek', autoOpen: true }] });
  await mgr.renderWindowList();
  assert.strictEqual(listEl().querySelector('.cuckoo-window-auto input').checked, true);
});

test('未知 providerId 时平台名回退"平台"', async () => {
  installApi({ profiles: [{ id: 'p1', name: 'A', providerId: 'unknown', autoOpen: false }] });
  await mgr.renderWindowList();
  assert.ok(listEl().textContent.includes('平台'));
});

test('listProfiles 抛异常时显示"加载失败"', async () => {
  window.electronAPI = { listProfiles: async () => { throw new Error('boom'); } };
  await mgr.renderWindowList();
  assert.ok(listEl().textContent.includes('加载失败'));
});

test('profile 名含 HTML 注入时按纯文本渲染，不产生 img 元素', async () => {
  installApi({
    profiles: [{ id: 'p1', name: '<img src=x onerror=alert(1)>', providerId: 'deepseek', autoOpen: false }],
  });
  await mgr.renderWindowList();
  assert.strictEqual(listEl().querySelector('img') === null, true);
  const name = listEl().querySelector('.cuckoo-window-name');
  assert.strictEqual(name.textContent, '<img src=x onerror=alert(1)>');
});

test('点击条目触发 openProfileWindow 并关闭面板', async () => {
  installApi({ profiles: [{ id: 'p1', name: 'A', providerId: 'deepseek', autoOpen: false }] });
  await mgr.renderWindowList();
  listEl().querySelector('.cuckoo-window-item').click();
  await flush();
  assert.deepStrictEqual(calls.open, ['p1']);
  assert.ok(document.getElementById('cuckoo-window-manager').classList.contains('cuckoo-hidden'));
});

test('同一数据 render 两次后，点击条目只触发一次 openProfileWindow（委托只绑一次）', async () => {
  installApi({ profiles: [{ id: 'p1', name: 'A', providerId: 'deepseek', autoOpen: false }] });
  await mgr.renderWindowList();
  await mgr.renderWindowList();
  listEl().querySelector('.cuckoo-window-item').click();
  await flush();
  assert.deepStrictEqual(calls.open, ['p1']);
});

test('点击「删除」触发 deleteProfileWindow，不触发打开', async () => {
  installApi({ profiles: [{ id: 'p1', name: 'A', providerId: 'deepseek', autoOpen: false }] });
  await mgr.renderWindowList();
  listEl().querySelector('.cuckoo-window-del').click();
  await flush();
  assert.deepStrictEqual(calls.del, ['p1']);
  assert.deepStrictEqual(calls.open, []);
});

test('勾选「默认」触发 setProfileAutoOpen，且不触发打开', async () => {
  installApi({ profiles: [{ id: 'p1', name: 'A', providerId: 'deepseek', autoOpen: false }] });
  await mgr.renderWindowList();
  const cb = listEl().querySelector('.cuckoo-window-auto input');
  cb.click();
  await flush();
  assert.deepStrictEqual(calls.open, []);
  assert.deepStrictEqual(calls.auto, [['p1', true]]);
});
