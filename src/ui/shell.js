/**
 * 壳页面逻辑（ES Module，供 happy-dom 测试导入）。
 * shell.html 以 <script type="module"> 调用 initShell(window.shellAPI || {}, document)。
 */
'use strict';

/** 面板 id → 面板名（标题栏显示）；rail 首位的 home 图标是导航动作，不是面板 */
const PANEL_NAMES = {
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

export function initShell(api, doc, hooks) {
  api = api || {};
  hooks = hooks || {};
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
      if (lock) lock.classList.toggle('insecure', !/^https:/i.test(currentUrl));
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

  // ===== 顶栏沉浸式自动隐藏状态机 =====
  // 默认隐藏；热区 mouseenter / Ctrl+L 唤出；离开顶栏 600ms 后收起，
  // URL 输入框聚焦期间不收起（blur 后重新计时）。
  const topbar = doc.getElementById('topbar');
  const hotzone = doc.getElementById('topbar-hotzone');
  const TOPBAR_HIDE_DELAY = 600;
  let topbarVisible = false;
  let hideTimer = null;

  function clearHideTimer() {
    if (hideTimer !== null) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function setTopbarVisible(visible) {
    topbarVisible = visible;
    topbar.classList.toggle('visible', visible);
    // 同步主进程：滑出时 view 下移 44px 露出浮层，隐藏后回到顶部
    if (api.setTopbarVisible) api.setTopbarVisible(visible);
  }

  function showTopbar() {
    clearHideTimer();
    if (!topbarVisible) setTopbarVisible(true);
  }

  function scheduleHide() {
    clearHideTimer();
    hideTimer = setTimeout(function () {
      hideTimer = null;
      if (doc.activeElement === input) return; // URL 输入框聚焦期间不收起
      if (topbarVisible) setTopbarVisible(false);
    }, TOPBAR_HIDE_DELAY);
  }

  function focusUrlInput() {
    showTopbar();
    input.focus();
    input.select();
  }

  hotzone.addEventListener('mouseenter', showTopbar);
  // 鼠标从热区移开且未进入顶栏（如移出窗口/移到图标栏）：延迟收起
  hotzone.addEventListener('mouseleave', function () { if (topbarVisible) scheduleHide(); });
  topbar.addEventListener('mouseenter', clearHideTimer);
  topbar.addEventListener('mouseleave', scheduleHide);
  input.addEventListener('focus', clearHideTimer);
  input.addEventListener('blur', scheduleHide);

  // AI 页面聚焦时 Ctrl+L 由主进程 before-input-event relay 回来
  if (api.onFocusUrl) api.onFocusUrl(focusUrlInput);

  // ===== 面板切换状态机 =====
  const panel = doc.getElementById('side-panel');
  const panelTitle = doc.getElementById('panel-title');
  let lastPanel = null;

  function setActivePanel(panelId, opts) {
    const quiet = !!(opts && opts.quiet);
    activePanel = panelId;
    if (panelId) lastPanel = panelId;
    const buttons = doc.querySelectorAll('.rail-btn');
    for (const btn of buttons) {
      btn.classList.toggle('active', btn.dataset.panel === panelId);
    }
    panel.hidden = !panelId;
    if (panelId) panelTitle.textContent = PANEL_NAMES[panelId] || '';
    if (hooks.onPanelChange) hooks.onPanelChange(panelId);
    // quiet：主进程回放面板状态（壳重载后恢复），状态已一致，不再回传
    if (!quiet && api.setPanelOpen) api.setPanelOpen(panelId);
  }

  // 原 overlay 的 Ctrl+Shift+C / Esc 快捷键迁入 shell（Task 10）：
  // Ctrl+Shift+C 展开（上次打开的面板，默认会话）/收起；Esc 收起
  function togglePanel() {
    setActivePanel(activePanel ? null : (lastPanel || 'chat'));
  }

  function isEditableTarget(target) {
    if (!target || !target.tagName) return false;
    const tag = target.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
  }

  doc.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
      e.preventDefault();
      togglePanel();
      return;
    }
    // Ctrl+L / Cmd+L：无论顶栏是否可见都唤出并聚焦 URL 输入框（浏览器惯例键，拦截）
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'L' || e.key === 'l')) {
      e.preventDefault();
      focusUrlInput();
      return;
    }
    if (e.key === 'Escape' && activePanel && !isEditableTarget(e.target)) {
      setActivePanel(null);
    }
  });

  // AI 页面聚焦时按键落在 view，由主进程 before-input-event relay 回来
  if (api.onTogglePanel) api.onTogglePanel(function () { togglePanel(); });
  if (api.onClosePanel) api.onClosePanel(function () { if (activePanel) setActivePanel(null); });

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

  // 点击徽章：展开「项目」面板并滚动到用量区（滚动细节由 panels.js 的 onRevealUsage hook 负责）
  const tokenBadge = doc.getElementById('token-badge');
  if (tokenBadge) {
    tokenBadge.addEventListener('click', function () {
      setActivePanel('project');
      if (hooks.onRevealUsage) {
        hooks.onRevealUsage();
      } else {
        const usage = doc.getElementById('shell-usage-section');
        if (usage && typeof usage.scrollIntoView === 'function') {
          usage.scrollIntoView({ block: 'start' });
        }
      }
    });
  }

  // 主进程回放面板状态（壳页面 did-finish-load 后恢复，修复壳重载状态脱钩）：
  // 主进程已有该状态，quiet 回写避免再次触发 setPanelOpen/relayout
  if (api.onPanelRestore) {
    api.onPanelRestore(function (data) {
      const panelId = data && data.panelId ? data.panelId : null;
      setActivePanel(panelId, { quiet: true });
      // 顶栏可见性一并回放：壳重载丢失 .visible 类，需与主进程保留的 view 下移状态对齐。
      // showTopbar 会回传 setTopbarVisible(true)，主进程侧是幂等赋值，无环路风险。
      if (data && data.topbarVisible) showTopbar();
    });
  }

  btnBack.addEventListener('click', function () { if (api.back) api.back(); });
  btnForward.addEventListener('click', function () { if (api.forward) api.forward(); });
  doc.getElementById('btn-reload').addEventListener('click', function () { if (api.reload) api.reload(); });
  doc.getElementById('btn-home').addEventListener('click', function () { if (api.home) api.home(); });

  // rail 首位的 home 图标：与顶栏主页按钮同一动作（导航回平台主页），不展开面板、不高亮
  const railHome = doc.getElementById('rail-btn-home');
  if (railHome) {
    railHome.addEventListener('click', function () { if (api.home) api.home(); });
  }

  return {
    getActivePanel: function () { return activePanel; },
    isTopbarVisible: function () { return topbarVisible; },
    showTopbar: showTopbar,
  };
}
