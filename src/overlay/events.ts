/**
 * 覆盖层按钮事件绑定（编排层）
 * T7 拆分：token 统计 → token-counter.ts、自动压缩 → auto-compact.ts、
 * 各面板按钮绑定下沉到 panels/* 自导出的 bind 函数，本文件只编排。
 * P4.5 拆分：窗口面板 → panels/window-manager、MCP 面板 → panels/mcp-manager、
 * 设置弹窗 → panels/settings、悬浮球拖动 → fab.js。
 */
import { state } from './state.js';
import { hideOverlay, showOverlay, renderHistory, commandHistory, showToast, hideFirstTimeDialog } from './panel.js';
import { handleInitProject, renderSessions } from './session-list.js';
import { sendToChat } from './chat-input.js';
import { runCompaction, checkPendingCompact, checkPendingInit } from '../session/compaction.js';
import { closeWindowManager, handleGenerateDoc, bindWindowManagerPanel } from './panels/window-manager.js';
import { closeMcpManager, bindMcpPanel } from './panels/mcp-manager.js';
import { closeSettings, bindSettingsPanel } from './panels/settings.js';
import { makeFabDraggable } from './fab.js';
import { getProviderByUrl } from '../providers/registry.js';
import { initTokenCounter, setIsSubagentWindow } from './token-counter.js';
import type { TokenCounter } from './token-counter.js';
import { initAutoCompact } from './auto-compact.js';
import { getCachedSettings } from './settings.js';

// 回调注入（P4.2-A：overlay 不依赖 bridge）
let hooks: { onInterceptedResponse?: (cb: (text: string, meta: any) => void) => void } = {};
/** 由 bridge/entry 在初始化时注入 bridge 能力 */
function wireEvents(h: typeof hooks): void {
  hooks = h;
}

let eventsBound = false;
let tokenCounter: TokenCounter | null = null;

/** 取当前页面对应的会话 ID（无则 null） */
function getCurrentSessionId(): string | null {
  try {
    const provider = getProviderByUrl(window.location.href);
    if (provider && typeof provider.extractSessionId === 'function') {
      return provider.extractSessionId(window.location.href) || null;
    }
  } catch (_) {}
  return null;
}

/** 供 bridge 在 URL 变化时调用：刷新当前会话的 token 显示 */
function refreshTokenForCurrentSession(): void {
  void tokenCounter?.refresh();
}

/**
 * 「催促继续」按钮：向 AI 发一句继续，催促其接着之前的工作
 */
async function handleManualParseDispatch() {
  if (!(await sendToChat('刚才卡住了请继续 爱你哦', '继续', 300))) {
    showToast('发送失败：未找到输入框', 3000);
    return;
  }
  showToast('已发送：继续', 2500);
}

/** 从设置缓存恢复发送延迟配置并同步到输入框 */
function restoreSendDelayConfig(): void {
  try {
    const s = getCachedSettings();
    if (Number.isFinite(s.sendDelayMin) && s.sendDelayMin >= 0) state.sendDelayMin = s.sendDelayMin;
    if (Number.isFinite(s.sendDelayMax) && s.sendDelayMax >= 0) state.sendDelayMax = s.sendDelayMax;
    const minInput = document.getElementById('cuckoo-delay-min');
    const maxInput = document.getElementById('cuckoo-delay-max');
    if (minInput) (minInput as any).value = state.sendDelayMin;
    if (maxInput) (maxInput as any).value = state.sendDelayMax;
  } catch (e) {}
}

/** 主面板：最小化 / 初始化 / 压缩 / 清空历史 / 手动解析 / 沉浸式 / 生成文档 / 刷新会话 */
function bindMainPanel(): void {
  document.getElementById('cuckoo-btn-minimize')?.addEventListener('click', hideOverlay);
  document.getElementById('cuckoo-btn-init')?.addEventListener('click', handleInitProject);
  document.getElementById('cuckoo-btn-compact')?.addEventListener('click',
    () => runCompaction(state.currentProjectDir || undefined));
  // 首次使用提示浮窗：初始化按钮（与右侧初始化项目逻辑一致）
  document.getElementById('cuckoo-btn-first-init')?.addEventListener('click', handleInitProject);
  // 首次使用提示浮窗：关闭按钮
  document.getElementById('cuckoo-btn-first-close')?.addEventListener('click', hideFirstTimeDialog);
  document.getElementById('cuckoo-btn-clear')?.addEventListener('click', () => {
    commandHistory.length = 0;
    renderHistory();
  });
  document.getElementById('cuckoo-btn-manual-parse')?.addEventListener('click', handleManualParseDispatch);
  document.getElementById('cuckoo-btn-gen-doc')?.addEventListener('click', () => handleGenerateDoc(sendToChat));
  document.getElementById('cuckoo-btn-immersive')?.addEventListener('click', async () => {
    const message = '现在你的任何疑问,或没有疑问的选择都需要和我确认 , 确认的方式是 你问一个问题我回答一个问题,然后你再问下一个问题, 最好给我选项, 也要给我个其他的选项, 谢谢 爱你哦';
    if (!(await sendToChat(message, '沉浸式交流', 300))) {
      showToast('未找到输入框，请确保已打开聊天界面', 3000);
    } else {
      showToast('已发送沉浸式交流提示', 2200);
    }
  });
  document.getElementById('cuckoo-btn-refresh-sessions')?.addEventListener('click', renderSessions);
}

/** 悬浮球拖动 + 点击切换显隐；键盘快捷键（Ctrl+Shift+C / Esc） */
function bindFabAndShortcuts(): void {
  const statusBadge = document.getElementById('cuckoo-status-badge');
  if (statusBadge) makeFabDraggable(statusBadge);
  statusBadge?.addEventListener('click', () => {
    const overlay = document.getElementById('cuckoo-overlay');
    if (!overlay) return;
    if (overlay.classList.contains('cuckoo-hidden')) {
      showOverlay();
    } else {
      hideOverlay();
    }
  });

  document.addEventListener('keydown', (e) => {
    // Ctrl+Shift+C 切换覆盖层显示
    if (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
      e.preventDefault();
      const overlay = document.getElementById('cuckoo-overlay');
      if (overlay) {
        if (overlay.classList.contains('cuckoo-hidden')) {
          showOverlay();
        } else {
          hideOverlay();
        }
      }
    }
    // Esc 隐藏覆盖层和窗口管理面板
    if (e.key === 'Escape') {
      hideOverlay();
      closeWindowManager();
      closeMcpManager();
      closeSettings();
      hideFirstTimeDialog();
    }
  });
}

/** 启动 token 统计 + 自动压缩（事件驱动，deps 注入组装） */
function startTokenCounter(): void {
  tokenCounter = initTokenCounter({
    getCurrentSessionId,
    onResponse: (cb) => hooks.onInterceptedResponse?.(cb),
    updateShellTokenUsage: (context, cumulative, windowCumulative, todayCumulative) => {
      try {
        window.electronAPI.updateTokenUsage(context, cumulative, windowCumulative, todayCumulative).catch(() => {});
      } catch (_) {}
    },
  });
  initAutoCompact({
    onResponse: (cb) => hooks.onInterceptedResponse?.(cb),
    triggerCompaction: () => runCompaction(state.currentProjectDir || undefined),
    notify: showToast,
  });
  void tokenCounter.refresh();
}

/**
 * 绑定覆盖层所有 UI 事件
 * 包括按钮点击、键盘快捷键、状态徽章点击等
 */
function bindEvents() {
  // 防止重复绑定（SPA 导航或 preload 重载时可能导致多次执行）
  if (eventsBound) return;
  eventsBound = true;

  restoreSendDelayConfig();
  bindMainPanel();
  bindWindowManagerPanel();
  bindMcpPanel(sendToChat);
  bindSettingsPanel(sendToChat);
  bindFabAndShortcuts();

  // 启动输入框 token 估算 + 自动压缩检查
  startTokenCounter();

  // 压缩流程：先检查是否处于"段2"（刷新后等 IDB 重建），否则检查"段3"（分享页初始化）
  checkPendingCompact().then((handled) => {
    if (!handled) checkPendingInit();
  });
}

export { bindEvents, wireEvents, refreshTokenForCurrentSession, setIsSubagentWindow };
