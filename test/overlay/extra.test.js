// @vitest-environment happy-dom
'use strict';
/**
 * 杂项覆盖测试。
 * 注：renderSessions 相关用例原先用 innerHTML 字符串桩假 document；
 * 渲染改为 h()/replaceChildrenOf 后假 DOM 无法工作，迁移到 happy-dom + setupDom，
 * 断言目标保持不变（API 不可用 / 暂无会话 / 渲染条目）。
 */
import { test, beforeEach, afterEach, vi } from 'vitest';
import assert from 'node:assert';

import { setupDom } from '../helpers/dom';

vi.mock('../../src/overlay/panel.js', () => ({
  showToast: () => {},
  hideFirstTimeDialog: () => {},
}));

let ctx;

beforeEach(() => {
  ctx = setupDom('');
});

afterEach(() => {
  ctx.cleanup();
  delete window.electronAPI;
});

test('randomDelay 返回 2000-3999ms', async () => {
  const { randomDelay } = await import('../../src/overlay/chat-input.js');
  for (let i = 0; i < 10; i++) {
    const d = randomDelay();
    assert.ok(d >= 2000 && d <= 3999);
  }
});

test('updateProjectDirDisplay 更新显示', async () => {
  ctx.cleanup();
  ctx = setupDom(
    '<div class="cuckoo-project-dir-section">' +
      '<div id="cuckoo-project-dir-display"><span class="cuckoo-dir-path"></span></div>' +
    '</div>'
  );
  const span = document.querySelector('.cuckoo-dir-path');
  const section = document.querySelector('.cuckoo-project-dir-section');
  const { updateProjectDirDisplay } = await import('../../src/overlay/project-dir.js');
  updateProjectDirDisplay('C:\\proj');
  assert.strictEqual(span.textContent, 'C:\\proj');
  assert.strictEqual(section.style.display, '');
  updateProjectDirDisplay(null);
  assert.strictEqual(span.textContent, '未选择');
  assert.strictEqual(section.style.display, 'none');
});

test('renderSessions API 不可用显示提示', async () => {
  ctx.cleanup();
  ctx = setupDom('<div id="cuckoo-session-list" class="cuckoo-session-list"></div>');
  const { renderSessions } = await import('../../src/overlay/session-list.js');
  await renderSessions();
  const list = document.getElementById('cuckoo-session-list');
  assert.ok(list.textContent.includes('API 不可用'));
});

test('renderSessions 无会话显示暂无', async () => {
  ctx.cleanup();
  ctx = setupDom('<div id="cuckoo-session-list" class="cuckoo-session-list"></div>');
  window.electronAPI = { listSessions: async () => ({ success: true, sessions: [] }) };
  const { renderSessions } = await import('../../src/overlay/session-list.js');
  await renderSessions();
  const list = document.getElementById('cuckoo-session-list');
  assert.ok(list.textContent.includes('暂无会话'));
});

test('renderSessions 有会话渲染并绑定', async () => {
  ctx.cleanup();
  ctx = setupDom('<div id="cuckoo-session-list" class="cuckoo-session-list"></div>');
  window.electronAPI = { listSessions: async () => ({ success: true, sessions: ['abc'] }) };
  const { renderSessions } = await import('../../src/overlay/session-list.js');
  await renderSessions();
  const item = document.querySelector('.cuckoo-session-item');
  assert.ok(item);
  assert.strictEqual(item.dataset.sessionId, 'abc');
  assert.strictEqual(item.querySelector('.session-id').textContent, 'abc');
});
