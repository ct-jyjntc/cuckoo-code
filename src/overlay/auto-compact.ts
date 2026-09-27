/**
 * 自动压缩上下文（T7 从 events.ts 拆出）
 * 负责：配置读写（localStorage）、设置区 UI 同步、收到回复后按阈值触发压缩。
 * deps 显式注入（响应订阅、压缩触发、UI 提示），便于测试。
 */

// 配置：是否启用 + 阈值（单位：万 token）
let autoCompactEnabled = false;
let autoCompactThresholdWan = 80;
// 防止压缩过程中重复触发
let autoCompactTriggering = false;

interface AutoCompactDeps {
  /** 订阅"AI 回复完成"事件（bridge 注入的 onInterceptedResponse） */
  onResponse?: (cb: (text: string, meta: any) => void) => void;
  /** 触发一次压缩流程 */
  triggerCompaction(): Promise<unknown> | void;
  /** UI 提示（showToast） */
  notify(message: string, durationMs?: number): void;
}

/** 从 localStorage 读取自动压缩配置并同步到 UI */
function loadAutoCompactConfig(): void {
  try {
    const en = localStorage.getItem('cuckoo-auto-compact-enabled');
    const th = localStorage.getItem('cuckoo-auto-compact-threshold');
    autoCompactEnabled = en === '1';
    // 同样避免 "parseFloat() || 80"（0 会被丢弃）
    if (th !== null) { const v = parseFloat(th); if (Number.isFinite(v) && v > 0) autoCompactThresholdWan = v; }
  } catch (_) {}
  const enEl = document.getElementById('cuckoo-auto-compact-enabled');
  const thEl = document.getElementById('cuckoo-auto-compact-threshold');
  if (enEl) (enEl as any).checked = autoCompactEnabled;
  if (thEl) (thEl as any).value = autoCompactThresholdWan;
}

/** 保存自动压缩配置 */
function saveAutoCompactConfig(notify: AutoCompactDeps['notify']): void {
  const enEl = document.getElementById('cuckoo-auto-compact-enabled');
  const thEl = document.getElementById('cuckoo-auto-compact-threshold');
  const enabled = !!(enEl && (enEl as any).checked);
  let th = thEl ? parseFloat((thEl as any).value) : 80;
  if (!Number.isFinite(th) || th <= 0) {
    notify('阈值需为正数（万）', 3000);
    return;
  }
  autoCompactEnabled = enabled;
  autoCompactThresholdWan = th;
  try {
    localStorage.setItem('cuckoo-auto-compact-enabled', enabled ? '1' : '0');
    localStorage.setItem('cuckoo-auto-compact-threshold', String(th));
  } catch (_) {}
  notify('自动压缩设置已保存：' + (enabled ? '开启，阈值 ' + th + ' 万' : '关闭'), 2500);
}

/** 检查是否触发自动压缩（数据源：服务端 tokenUsage.accumulatedTokens） */
function checkAutoCompact(deps: AutoCompactDeps, server: any): void {
  if (!autoCompactEnabled || autoCompactTriggering) return;
  if (!server || typeof server.accumulatedTokens !== 'number') return;
  const thresholdTokens = autoCompactThresholdWan * 10000;
  if (server.accumulatedTokens < thresholdTokens) return;
  // 触发
  autoCompactTriggering = true;
  console.log('[Cuckoo Compact] 自动触发：当前 ' + server.accumulatedTokens + ' >= 阈值 ' + thresholdTokens);
  deps.notify('Token 超阈值（' + autoCompactThresholdWan + '万），自动压缩中...', 4000);
  Promise.resolve(deps.triggerCompaction()).finally(() => {
    // 压缩会跳转页面；若未跳转（失败），重置标志允许下次重试
    autoCompactTriggering = false;
  });
}

/**
 * 初始化自动压缩：加载配置、绑定保存按钮、订阅回复事件做阈值检查。
 * 仅在收到成功回复事件时检查，避免失败/停止时因旧 token 值反复触发压缩。
 */
function initAutoCompact(deps: AutoCompactDeps): void {
  loadAutoCompactConfig();
  const saveBtn = document.getElementById('cuckoo-auto-compact-save');
  saveBtn?.addEventListener('click', () => saveAutoCompactConfig(deps.notify));
  deps.onResponse?.((_text: string, meta: any) => {
    checkAutoCompact(deps, (meta && meta.tokenUsage) || null);
  });
}

export { initAutoCompact };
export type { AutoCompactDeps };
