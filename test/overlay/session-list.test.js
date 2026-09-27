// @vitest-environment happy-dom
'use strict';
/**
 * session-list 渲染测试：XSS 安全（session id 走 textNode）+ 容器级事件委托。
 * 委托语义：同一数据 render 两次后，点击条目只触发一次 navigateSession。
 */
import { describe, it, beforeEach, afterEach, vi } from 'vitest';
import assert from 'node:assert';

import { setupDom } from '../helpers/dom';

vi.mock('../../src/overlay/panel.js', () => ({
  showToast: () => {},
}));

let ctx;
let navigated;

function installApi(sessions) {
  navigated = [];
  window.electronAPI = {
    listSessions: async () => ({ success: true, sessions }),
    navigateSession: async (id) => { navigated.push(id); return { success: true }; },
  };
}

beforeEach(() => {
  ctx = setupDom('<div id="cuckoo-session-list" class="cuckoo-session-list"></div>');
});

afterEach(() => {
  ctx.cleanup();
  delete window.electronAPI;
});

describe('renderSessions', () => {
  it('渲染会话条目并保留 data-session-id', async () => {
    installApi(['sess-1', 'sess-2']);
    const { renderSessions } = await import('../../src/overlay/session-list.js');
    await renderSessions();

    const items = document.querySelectorAll('.cuckoo-session-item');
    assert.strictEqual(items.length, 2);
    assert.strictEqual(items[0].dataset.sessionId, 'sess-1');
    assert.strictEqual(items[0].querySelector('.session-id').textContent, 'sess-1');
  });

  it('session id 含 HTML 注入时按纯文本渲染，不产生 img 元素', async () => {
    installApi(['<img src=x onerror=alert(1)>']);
    const { renderSessions } = await import('../../src/overlay/session-list.js');
    await renderSessions();

    const list = document.getElementById('cuckoo-session-list');
    assert.strictEqual(list.querySelector('img') === null, true);
    const item = list.querySelector('.cuckoo-session-item');
    assert.ok(item);
    assert.strictEqual(item.dataset.sessionId, '<img src=x onerror=alert(1)>');
    assert.strictEqual(item.querySelector('.session-id').textContent, '<img src=x onerror=alert(1)>');
  });

  it('同一数据 render 两次后，点击条目只触发一次 navigateSession（委托只绑一次）', async () => {
    installApi(['sess-1']);
    const { renderSessions } = await import('../../src/overlay/session-list.js');
    await renderSessions();
    await renderSessions();

    document.querySelector('.cuckoo-session-item').click();
    assert.deepStrictEqual(navigated, ['sess-1']);
  });

  it('listSessions 不可用/失败时显示空态文案', async () => {
    navigated = [];
    window.electronAPI = { listSessions: async () => ({ success: false }) };
    const { renderSessions } = await import('../../src/overlay/session-list.js');
    await renderSessions();

    const list = document.getElementById('cuckoo-session-list');
    assert.ok(list.textContent.includes('加载失败'));
  });
});
