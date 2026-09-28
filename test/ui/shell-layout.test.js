// @vitest-environment happy-dom
'use strict';
/**
 * src/ui/shell.html + shell.js 骨架测试。
 * 覆盖：图标栏渲染、面板展开/收起状态切换、token 徽章更新。
 * 标记 HTML 直接读自 src/ui/shell.html，避免测试与实现脱节。
 */
import { describe, it, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { setupDom } from '../helpers/dom';
import { initShell, formatTokenCount } from '../../src/ui/shell.js';

const SHELL_HTML = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../src/ui/shell.html'
);

function readShellBody() {
  const html = fs.readFileSync(SHELL_HTML, 'utf-8');
  const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  assert.ok(m, 'shell.html 缺少 <body>');
  return m[1].replace(/<script[\s\S]*?<\/script>/gi, '');
}

function makeApi() {
  const calls = [];
  const handlers = {};
  const api = {
    calls,
    handlers,
    navigate: (url) => { calls.push(['navigate', url]); },
    back: () => {},
    forward: () => {},
    reload: () => {},
    home: () => { calls.push(['home']); },
    setPanelOpen: (panelId) => { calls.push(['setPanelOpen', panelId]); },
    onUrlUpdated: (cb) => { handlers.url = cb; },
    onTokenUpdated: (cb) => { handlers.token = cb; },
    onTogglePanel: (cb) => { handlers.togglePanel = cb; },
    onClosePanel: (cb) => { handlers.closePanel = cb; },
  };
  return api;
}

let ctx;
let api;

beforeEach(() => {
  ctx = setupDom(readShellBody());
  api = makeApi();
  initShell(api, document);
});

afterEach(() => {
  ctx.cleanup();
});

describe('图标栏', () => {
  it('渲染 5 个主图标 + 底部 2 个固定图标，均带 title 与 SVG', () => {
    const main = document.querySelectorAll('.rail-main .rail-btn');
    const bottom = document.querySelectorAll('.rail-bottom .rail-btn');
    assert.strictEqual(main.length, 5);
    assert.strictEqual(bottom.length, 2);

    // 首位是 home 导航按钮（id 标识，不是面板）；其余 4 个为面板按钮
    assert.strictEqual(main[0].id, 'rail-btn-home');
    const ids = Array.from(main).slice(1).map((b) => b.dataset.panel);
    assert.deepStrictEqual(ids, ['chat', 'window', 'mcp', 'task']);
    const bottomIds = Array.from(bottom).map((b) => b.dataset.panel);
    assert.deepStrictEqual(bottomIds, ['settings', 'project']);

    const all = document.querySelectorAll('.rail-btn');
    for (const btn of all) {
      assert.strictEqual(typeof btn.title, 'string');
      assert.strictEqual(btn.title.length > 0, true);
      assert.strictEqual(btn.querySelector('svg') !== null, true);
    }
  });

  it('图标 title 依次为 平台主页/会话/窗口/MCP/任务/设置/项目', () => {
    const titles = Array.from(document.querySelectorAll('.rail-btn')).map((b) => b.title);
    assert.deepStrictEqual(titles, ['平台主页', '会话', '窗口', 'MCP', '任务', '设置', '项目']);
  });

  it('点击 home 图标：调用 api.home() 导航，不展开面板、不高亮、无对应面板容器', () => {
    document.getElementById('rail-btn-home').click();

    assert.deepStrictEqual(api.calls, [['home']]);
    assert.strictEqual(document.getElementById('side-panel').hidden, true);
    assert.strictEqual(document.querySelectorAll('.rail-btn.active').length, 0);
    assert.strictEqual(document.querySelector('.panel-content[data-panel-content="home"]'), null);
  });
});

describe('面板切换状态机', () => {
  it('初始面板隐藏，无激活图标', () => {
    const panel = document.getElementById('side-panel');
    assert.strictEqual(panel.hidden, true);
    assert.strictEqual(document.querySelectorAll('.rail-btn.active').length, 0);
  });

  it('点击图标：调用 setPanelOpen(panelId)，面板展开并显示面板名，图标高亮', () => {
    const chatBtn = document.querySelector('.rail-btn[data-panel="chat"]');
    chatBtn.click();

    assert.deepStrictEqual(api.calls, [['setPanelOpen', 'chat']]);
    assert.strictEqual(document.getElementById('side-panel').hidden, false);
    assert.strictEqual(document.getElementById('panel-title').textContent, '会话');
    assert.strictEqual(chatBtn.classList.contains('active'), true);
  });

  it('点击另一图标：直接切换面板，不移除展开状态', () => {
    document.querySelector('.rail-btn[data-panel="chat"]').click();
    document.querySelector('.rail-btn[data-panel="mcp"]').click();

    assert.deepStrictEqual(api.calls, [['setPanelOpen', 'chat'], ['setPanelOpen', 'mcp']]);
    assert.strictEqual(document.getElementById('side-panel').hidden, false);
    assert.strictEqual(document.getElementById('panel-title').textContent, 'MCP');
    assert.strictEqual(document.querySelector('.rail-btn[data-panel="chat"]').classList.contains('active'), false);
    assert.strictEqual(document.querySelector('.rail-btn[data-panel="mcp"]').classList.contains('active'), true);
  });

  it('再次点击激活图标：收起面板，setPanelOpen(null)', () => {
    const chatBtn = document.querySelector('.rail-btn[data-panel="chat"]');
    chatBtn.click();
    chatBtn.click();

    assert.deepStrictEqual(api.calls, [['setPanelOpen', 'chat'], ['setPanelOpen', null]]);
    assert.strictEqual(document.getElementById('side-panel').hidden, true);
    assert.strictEqual(document.querySelectorAll('.rail-btn.active').length, 0);
  });

  it('面板标题栏的收起按钮：收起面板，setPanelOpen(null)', () => {
    document.querySelector('.rail-btn[data-panel="task"]').click();
    document.getElementById('panel-close').click();

    assert.deepStrictEqual(api.calls, [['setPanelOpen', 'task'], ['setPanelOpen', null]]);
    assert.strictEqual(document.getElementById('side-panel').hidden, true);
  });

  it('面板标题栏包含面板名与收起按钮', () => {
    document.querySelector('.rail-btn[data-panel="settings"]').click();
    const header = document.querySelector('#side-panel .panel-header');
    assert.strictEqual(header !== null, true);
    assert.strictEqual(document.getElementById('panel-title').textContent, '设置');
    assert.strictEqual(typeof document.getElementById('panel-close').title, 'string');
  });
});

describe('token 徽章', () => {
  it('初始为 0，带 title', () => {
    const badge = document.getElementById('token-badge');
    assert.strictEqual(badge !== null, true);
    assert.strictEqual(document.getElementById('token-value').textContent, '0');
    assert.strictEqual(badge.title.length > 0, true);
  });

  it('onTokenUpdated 用 context 字段更新徽章文本', () => {
    api.handlers.token({ context: 56100, cumulative: 123456 });
    assert.strictEqual(document.getElementById('token-value').textContent, '5.61万');
  });

  it('徽章含 SVG 图标而非 emoji', () => {
    const badge = document.getElementById('token-badge');
    assert.strictEqual(badge.querySelector('svg') !== null, true);
  });
});

describe('快捷键（原 overlay Ctrl+Shift+C / Esc 迁入 shell）', () => {
  function pressShortcut(opts) {
    document.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ bubbles: true }, opts)));
  }

  it('Ctrl+Shift+C：面板关闭时展开默认面板（会话）', () => {
    pressShortcut({ key: 'C', ctrlKey: true, shiftKey: true });
    assert.deepStrictEqual(api.calls, [['setPanelOpen', 'chat']]);
    assert.strictEqual(document.getElementById('side-panel').hidden, false);
    assert.strictEqual(document.getElementById('panel-title').textContent, '会话');
  });

  it('Ctrl+Shift+C：面板打开时收起', () => {
    document.querySelector('.rail-btn[data-panel="mcp"]').click();
    pressShortcut({ key: 'C', ctrlKey: true, shiftKey: true });
    assert.deepStrictEqual(api.calls, [['setPanelOpen', 'mcp'], ['setPanelOpen', null]]);
    assert.strictEqual(document.getElementById('side-panel').hidden, true);
  });

  it('Ctrl+Shift+C 重新展开时回到上次打开的面板', () => {
    document.querySelector('.rail-btn[data-panel="mcp"]').click();
    pressShortcut({ key: 'C', ctrlKey: true, shiftKey: true });
    pressShortcut({ key: 'C', ctrlKey: true, shiftKey: true });
    assert.deepStrictEqual(api.calls, [['setPanelOpen', 'mcp'], ['setPanelOpen', null], ['setPanelOpen', 'mcp']]);
    assert.strictEqual(document.getElementById('panel-title').textContent, 'MCP');
  });

  it('Esc：面板打开时收起', () => {
    document.querySelector('.rail-btn[data-panel="chat"]').click();
    pressShortcut({ key: 'Escape' });
    assert.deepStrictEqual(api.calls, [['setPanelOpen', 'chat'], ['setPanelOpen', null]]);
  });

  it('Esc：面板已关闭时不产生调用', () => {
    pressShortcut({ key: 'Escape' });
    assert.deepStrictEqual(api.calls, []);
  });

  it('Esc：焦点在输入框时不收起面板（地址栏自己的 Esc 归它管）', () => {
    document.querySelector('.rail-btn[data-panel="chat"]').click();
    const input = document.getElementById('url-input');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.deepStrictEqual(api.calls, [['setPanelOpen', 'chat']]);
    assert.strictEqual(document.getElementById('side-panel').hidden, false);
  });

  it('主进程 relay：onTogglePanel / onClosePanel 复用同一面板状态机', () => {
    api.handlers.togglePanel();
    assert.deepStrictEqual(api.calls, [['setPanelOpen', 'chat']]);
    api.handlers.closePanel();
    assert.deepStrictEqual(api.calls, [['setPanelOpen', 'chat'], ['setPanelOpen', null]]);
  });
});

describe('formatTokenCount()', () => {
  it('保留现有格式化逻辑', () => {
    assert.strictEqual(formatTokenCount(0), '0');
    assert.strictEqual(formatTokenCount(56100), '5.61万');
    assert.strictEqual(formatTokenCount(123456789), '1.23亿');
    assert.strictEqual(formatTokenCount(9999), '9999');
    assert.strictEqual(formatTokenCount(NaN), '0');
    assert.strictEqual(formatTokenCount(-5), '0');
  });
});

describe('顶栏保留行为', () => {
  it('URL 输入回车触发 navigate（自动补 https://）', () => {
    const input = document.getElementById('url-input');
    input.value = 'example.com';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert.deepStrictEqual(api.calls, [['navigate', 'https://example.com']]);
  });

  it('onUrlUpdated 更新输入框与前进/后退按钮态', () => {
    api.handlers.url({ url: 'https://a.com/', canGoBack: true, canGoForward: false });
    assert.strictEqual(document.getElementById('url-input').value, 'https://a.com/');
    assert.strictEqual(document.getElementById('btn-back').classList.contains('disabled'), false);
    assert.strictEqual(document.getElementById('btn-forward').classList.contains('disabled'), true);
  });

  it('状态栏已删除', () => {
    assert.strictEqual(document.querySelector('.statusbar') === null, true);
  });
});
