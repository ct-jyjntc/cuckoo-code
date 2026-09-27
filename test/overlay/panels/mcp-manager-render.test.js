// @vitest-environment happy-dom
'use strict';
/**
 * mcp-manager 渲染测试：renderMcpList 的 XSS 安全（server 名走 textNode）
 * + 容器级事件委托（render 两次后点击只触发一次切换）。
 * handleMcpSave 的校验逻辑见 mcp-manager.test.js。
 */
import { describe, it, beforeEach, afterEach, vi } from 'vitest';
import assert from 'node:assert';

import { setupDom } from '../../helpers/dom';

let toasts = [];
vi.mock('../../../src/overlay/panel.js', () => ({
  showToast: (msg) => { toasts.push(msg); },
  showConfirmDialog: async () => false,
}));

let ctx;
let mgr;
let calls;

const flush = () => new Promise((r) => setTimeout(r, 0));

function installApi(servers) {
  calls = { enable: [], disable: [] };
  window.electronAPI = {
    listMcpServers: async () => ({ success: true, servers }),
    enableMcpServer: async (name) => { calls.enable.push(name); return { success: true }; },
    disableMcpServer: async (name) => { calls.disable.push(name); return { success: true }; },
  };
}

function listEl() {
  return document.getElementById('cuckoo-mcp-list');
}

beforeEach(async () => {
  toasts = [];
  ctx = setupDom(
    '<div id="cuckoo-mcp-list" class="cuckoo-session-list"></div>' +
    '<textarea id="cuckoo-mcp-json"></textarea>'
  );
  mgr = await import('../../../src/overlay/panels/mcp-manager.js');
});

afterEach(() => {
  ctx.cleanup();
  delete window.electronAPI;
});

describe('renderMcpList', () => {
  it('空列表显示"暂无 MCP Server"', async () => {
    installApi([]);
    await mgr.renderMcpList();
    assert.ok(listEl().textContent.includes('暂无 MCP Server'));
  });

  it('渲染 server 名并保留 class 结构与 data-mcp-name', async () => {
    installApi([{ name: 'fs', source: 'user', type: 'stdio', enabled: true, connected: false }]);
    await mgr.renderMcpList();
    const item = listEl().querySelector('.cuckoo-mcp-item');
    assert.ok(item);
    assert.ok(item.classList.contains('cuckoo-window-item'));
    assert.strictEqual(item.dataset.mcpName, 'fs');
    assert.strictEqual(item.querySelector('.cuckoo-window-name').textContent, 'fs');
    assert.ok(item.querySelector('.cuckoo-mcp-dot'));
  });

  it('server 名含 HTML 注入时按纯文本渲染，不产生 img 元素', async () => {
    installApi([{ name: '<img src=x onerror=alert(1)>', source: 'project', type: 'stdio', enabled: true, connected: false }]);
    await mgr.renderMcpList();
    assert.strictEqual(listEl().querySelector('img') === null, true);
    const item = listEl().querySelector('.cuckoo-mcp-item');
    assert.strictEqual(item.dataset.mcpName, '<img src=x onerror=alert(1)>');
    assert.strictEqual(item.querySelector('.cuckoo-window-name').textContent, '<img src=x onerror=alert(1)>');
  });

  it('点击已启用 server → disableMcpServer', async () => {
    installApi([{ name: 'fs', source: 'user', type: 'stdio', enabled: true, connected: false }]);
    await mgr.renderMcpList();
    listEl().querySelector('.cuckoo-mcp-item').click();
    await flush();
    await flush();
    assert.deepStrictEqual(calls.disable, ['fs']);
    assert.deepStrictEqual(calls.enable, []);
  });

  it('点击已禁用 server → enableMcpServer', async () => {
    installApi([{ name: 'fs', source: 'user', type: 'stdio', enabled: false, connected: false }]);
    await mgr.renderMcpList();
    listEl().querySelector('.cuckoo-mcp-item').click();
    await flush();
    await flush();
    assert.deepStrictEqual(calls.enable, ['fs']);
  });

  it('同一数据 render 两次后，点击条目只触发一次切换（委托只绑一次）', async () => {
    installApi([{ name: 'fs', source: 'user', type: 'stdio', enabled: true, connected: false }]);
    await mgr.renderMcpList();
    await mgr.renderMcpList();
    listEl().querySelector('.cuckoo-mcp-item').click();
    await flush();
    await flush();
    assert.strictEqual(calls.disable.length, 1);
  });

  it('listMcpServers 抛异常时显示"加载失败"', async () => {
    window.electronAPI = { listMcpServers: async () => { throw new Error('boom'); } };
    await mgr.renderMcpList();
    assert.ok(listEl().textContent.includes('加载失败'));
  });
});
