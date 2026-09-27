/**
 * 壳页面逻辑（ES Module，供 happy-dom 测试导入）。
 * shell.html 以 <script type="module"> 调用 initShell(window.shellAPI || {}, document)。
 */
'use strict';

/** 面板 id → 面板名（标题栏显示） */
const PANEL_NAMES = {
  home: '平台主页',
  chat: '会话',
  window: '窗口',
  mcp: 'MCP',
  task: '任务',
  settings: '设置',
  project: '项目',
};

// 对话 token 显示
export function formatTokenCount(n) {
  if (!isFinite(n) || n < 0) return '0';
  if (n >= 100000000) return (n / 100000000).toFixed(2) + '亿';
  if (n >= 10000) return (n / 10000).toFixed(2) + '万';
  return String(Math.round(n));
}

export function initShell(api, doc) {
  api = api || {};
  const input = doc.getElementById('url-input');
  const btnBack = doc.getElementById('btn-back');
  const btnForward = doc.getElementById('btn-forward');
  let currentUrl = '';
  let activePanel = null;

  function setBtn(btn, enabled) {
    if (enabled) btn.classList.remove('disabled');
    else btn.classList.add('disabled');
  }

  if (api.onUrlUpdated) {
    api.onUrlUpdated(function (data) {
      if (!data) return;
      currentUrl = data.url || '';
      if (doc.activeElement !== input) input.value = currentUrl;
      setBtn(btnBack, data.canGoBack);
      setBtn(btnForward, data.canGoForward);
      const lock = doc.getElementById('lock');
      if (lock) lock.style.color = /^https:/i.test(currentUrl) ? '#3d9e63' : '#c0a060';
    });
  }

  input.addEventListener('focus', function () { input.select(); });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      let url = input.value.trim();
      if (!url) return;
      if (!/^[a-z]+:\/\//i.test(url)) url = 'https://' + url;
      if (api.navigate) api.navigate(url);
      input.blur();
    } else if (e.key === 'Escape') {
      input.value = currentUrl;
      input.blur();
    }
  });

  // ===== 面板切换状态机 =====
  const panel = doc.getElementById('side-panel');
  const panelTitle = doc.getElementById('panel-title');

  function setActivePanel(panelId) {
    activePanel = panelId;
    const buttons = doc.querySelectorAll('.rail-btn');
    for (const btn of buttons) {
      btn.classList.toggle('active', btn.dataset.panel === panelId);
    }
    panel.hidden = !panelId;
    if (panelId) panelTitle.textContent = PANEL_NAMES[panelId] || '';
    if (api.setPanelOpen) api.setPanelOpen(panelId);
  }

  const railButtons = doc.querySelectorAll('.rail-btn[data-panel]');
  for (const btn of railButtons) {
    btn.addEventListener('click', function () {
      const id = btn.dataset.panel;
      setActivePanel(activePanel === id ? null : id);
    });
  }
  doc.getElementById('panel-close').addEventListener('click', function () {
    setActivePanel(null);
  });

  // ===== token 徽章（当前会话上下文 token） =====
  const tokenValue = doc.getElementById('token-value');
  if (api.onTokenUpdated) {
    api.onTokenUpdated(function (data) {
      if (!data) return;
      if (tokenValue) tokenValue.textContent = formatTokenCount(data.context);
    });
  }

  btnBack.addEventListener('click', function () { if (api.back) api.back(); });
  btnForward.addEventListener('click', function () { if (api.forward) api.forward(); });
  doc.getElementById('btn-reload').addEventListener('click', function () { if (api.reload) api.reload(); });
  doc.getElementById('btn-home').addEventListener('click', function () { if (api.home) api.home(); });

  return {
    getActivePanel: function () { return activePanel; },
  };
}
