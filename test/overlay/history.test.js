// @vitest-environment happy-dom
'use strict';
/**
 * panel.renderHistory 渲染测试：历史记录走 textNode（XSS 安全）
 * + 容器级事件委托（点击查看详情）。
 */
import { describe, it, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert';

import { setupDom } from '../helpers/dom';

let ctx;
let panel;

beforeEach(async () => {
  ctx = setupDom(
    '<div id="cuckoo-history-list" class="cuckoo-history-list"></div>' +
    '<div id="cuckoo-cmd-preview"></div>' +
    '<div id="cuckoo-result-section" class="cuckoo-hidden">' +
      '<div id="cuckoo-result-status"></div>' +
      '<div id="cuckoo-result-output"></div>' +
    '</div>' +
    '<div id="cuckoo-overlay" class="cuckoo-hidden"></div>'
  );
  panel = await import('../../src/overlay/panel.js');
  panel.commandHistory.length = 0;
});

afterEach(() => {
  ctx.cleanup();
});

function addEntry(overrides = {}) {
  const entry = {
    id: 'cmd_1',
    command: 'echo hello',
    success: true,
    canceled: false,
    output: 'hello',
    timestamp: Date.now(),
    ...overrides,
  };
  panel.addHistory(entry);
  return entry;
}

function listEl() {
  return document.getElementById('cuckoo-history-list');
}

describe('renderHistory', () => {
  it('空历史显示"暂无记录"', () => {
    panel.renderHistory();
    assert.ok(listEl().textContent.includes('暂无记录'));
  });

  it('渲染历史条目并保留 class 结构与 data-id', () => {
    addEntry();
    const item = listEl().querySelector('.cuckoo-history-item');
    assert.ok(item);
    assert.strictEqual(item.dataset.id, 'cmd_1');
    assert.strictEqual(item.querySelector('.cuckoo-cmd-text').textContent, 'echo hello');
    assert.ok(item.querySelector('.cuckoo-cmd-status').classList.contains('success'));
    assert.ok(item.querySelector('.cuckoo-cmd-time'));
  });

  it('失败/取消状态使用对应 class 与文案', () => {
    addEntry({ id: 'a', success: false });
    addEntry({ id: 'b', canceled: true });
    const items = listEl().querySelectorAll('.cuckoo-history-item');
    assert.ok(items[0].querySelector('.cuckoo-cmd-status').textContent.includes('已忽略'));
    assert.ok(items[1].querySelector('.cuckoo-cmd-status').classList.contains('error'));
  });

  it('命令含 HTML 注入时按纯文本渲染，不产生 img 元素', () => {
    addEntry({ command: '<img src=x onerror=alert(1)>' });
    assert.strictEqual(listEl().querySelector('img') === null, true);
    assert.strictEqual(
      listEl().querySelector('.cuckoo-cmd-text').textContent,
      '<img src=x onerror=alert(1)>'
    );
  });

  it('点击条目回填预览与输出，并展开覆盖层', () => {
    const entry = addEntry();
    listEl().querySelector('.cuckoo-history-item').click();
    assert.strictEqual(document.getElementById('cuckoo-cmd-preview').textContent, entry.command);
    assert.ok(!document.getElementById('cuckoo-result-section').classList.contains('cuckoo-hidden'));
    assert.strictEqual(document.getElementById('cuckoo-result-output').textContent, 'hello');
    assert.ok(!document.getElementById('cuckoo-overlay').classList.contains('cuckoo-hidden'));
  });

  it('render 两次后点击条目行为正常（委托只绑一次）', () => {
    const entry = addEntry();
    panel.renderHistory();
    listEl().querySelector('.cuckoo-history-item').click();
    assert.strictEqual(document.getElementById('cuckoo-cmd-preview').textContent, entry.command);
  });
});
