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
