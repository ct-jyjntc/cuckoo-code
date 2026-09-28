/**
 * AI 页面 view 按键 → 壳面板动作 的纯判定（before-input-event 用）。
 * 输入按键信息与面板状态，输出动作；调用方据此决定是否 preventDefault。
 * 无 Electron 依赖，便于单测。
 */

/** 按键信息（Electron before-input-event 的 input 子集） */
export interface ViewKeyInput {
  key?: string;
  control?: boolean;
  shift?: boolean;
}

export type ViewKeyAction = 'toggle-panel' | 'close-panel' | null;

/**
 * 判定 view 内按键应触发的面板动作：
 * - Ctrl+Shift+C → 切换面板（展开/收起），始终拦截
 * - Esc 且面板打开 → 收起面板，拦截（否则菜单「停止加载」会与收起叠加触发）
 * - 其余（含面板关闭时的 Esc）→ null，放行页面自身行为
 */
export function decideViewKeyAction(input: ViewKeyInput, panelId: string | null): ViewKeyAction {
  if (input.control && input.shift && (input.key === 'C' || input.key === 'c')) {
    return 'toggle-panel';
  }
  if (input.key === 'Escape' && panelId) {
    return 'close-panel';
  }
  return null;
}
