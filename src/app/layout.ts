/**
 * 壳窗口布局纯函数（浅色改版骨架）。
 *
 * 布局结构：
 *   左图标栏 52px（全高） + 顶栏 44px（图标栏右侧） + 可展开面板 280px
 *   AI 页面 view 以圆角卡片呈现，四周留 10px 边距。
 * bounds = f(窗口尺寸, panelOpen)，无 Electron 依赖，便于单测。
 */

export const SHELL_LAYOUT = {
  /** 顶栏高度 */
  TOPBAR_HEIGHT: 44,
  /** 左侧图标栏宽度 */
  RAIL_WIDTH: 52,
  /** 侧面板宽度（展开时） */
  PANEL_WIDTH: 280,
  /** AI 页面卡片四周间距 */
  CARD_MARGIN: 10,
  /** AI 页面卡片圆角（view.setBorderRadius） */
  CARD_RADIUS: 12,
} as const;

/**
 * shell 侧栏已知面板 id 集合（与 src/ui/shell.html 图标栏 data-panel 值一一对应）。
 * shell-panel-state IPC 据此拒绝非法 panelId。
 */
export const SHELL_PANEL_IDS = ['chat', 'window', 'mcp', 'task', 'settings', 'project'] as const;

/** 判断是否为合法的 shell 面板 id */
export function isShellPanelId(v: unknown): v is string {
  return typeof v === 'string' && (SHELL_PANEL_IDS as readonly string[]).includes(v);
}

export interface ViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 由窗口内容尺寸与面板开关计算 AI 页面 view 的 bounds */
export function computeViewBounds(winWidth: number, winHeight: number, panelOpen: boolean): ViewBounds {
  const m = SHELL_LAYOUT.CARD_MARGIN;
  const x = SHELL_LAYOUT.RAIL_WIDTH + (panelOpen ? SHELL_LAYOUT.PANEL_WIDTH : 0) + m;
  const y = SHELL_LAYOUT.TOPBAR_HEIGHT + m;
  return {
    x,
    y,
    width: Math.max(0, winWidth - x - m),
    height: Math.max(0, winHeight - y - m),
  };
}
