'use strict';
/**
 * src/app/layout.ts 布局纯函数测试。
 * 不同窗口尺寸 × panelOpen true/false 的 bounds 断言。
 */
import { describe, it } from 'vitest';
import assert from 'node:assert';

import {
  SHELL_LAYOUT,
  SHELL_PANEL_IDS,
  isShellPanelId,
  computeViewBounds,
} from '../../src/app/layout.js';

describe('SHELL_LAYOUT 常量', () => {
  it('顶栏浮层 44 / 图标栏 52 / 面板 280 / 卡片边距 10 / 圆角 12', () => {
    assert.strictEqual(SHELL_LAYOUT.TOPBAR_OVERLAY_HEIGHT, 44);
    assert.strictEqual(SHELL_LAYOUT.RAIL_WIDTH, 52);
    assert.strictEqual(SHELL_LAYOUT.PANEL_WIDTH, 280);
    assert.strictEqual(SHELL_LAYOUT.CARD_MARGIN, 10);
    assert.strictEqual(SHELL_LAYOUT.CARD_RADIUS, 12);
  });

  it('不再有 TOPBAR_HEIGHT（顶栏不占布局高度）', () => {
    assert.strictEqual('TOPBAR_HEIGHT' in SHELL_LAYOUT, false);
  });
});

describe('computeViewBounds()', () => {
  it('面板收起 + 顶栏隐藏：x = 52 + 10，y = 10（顶栏不占高），四周各留 10px 边距', () => {
    const b = computeViewBounds(1280, 900, false);
    assert.strictEqual(b.x, 62);
    assert.strictEqual(b.y, 10);
    assert.strictEqual(b.width, 1280 - 62 - 10);
    assert.strictEqual(b.height, 900 - 10 - 10);
  });

  it('面板展开：x 额外偏移 280，宽度相应缩减', () => {
    const b = computeViewBounds(1280, 900, true);
    assert.strictEqual(b.x, 342);
    assert.strictEqual(b.y, 10);
    assert.strictEqual(b.width, 1280 - 342 - 10);
    assert.strictEqual(b.height, 900 - 10 - 10);
  });

  it('顶栏浮层滑出：view 临时下移 44px 露出浮层（y = 44 + 10）', () => {
    const b = computeViewBounds(1280, 900, false, true);
    assert.strictEqual(b.x, 62);
    assert.strictEqual(b.y, 54);
    assert.strictEqual(b.width, 1280 - 62 - 10);
    assert.strictEqual(b.height, 900 - 54 - 10);
  });

  it('顶栏滑出 + 面板展开：x 与 y 同时偏移', () => {
    const b = computeViewBounds(1280, 900, true, true);
    assert.strictEqual(b.x, 342);
    assert.strictEqual(b.y, 54);
    assert.strictEqual(b.width, 1280 - 342 - 10);
    assert.strictEqual(b.height, 900 - 54 - 10);
  });

  it('窗口过小时宽高夹紧为 0，不为负', () => {
    const b = computeViewBounds(100, 20, true);
    assert.strictEqual(b.width, 0);
    assert.strictEqual(b.height, 0);
    assert.strictEqual(b.x, 342);
    assert.strictEqual(b.y, 10);
  });

  it('恰好容纳的最小窗口：宽高为 0', () => {
    const closed = computeViewBounds(72, 20, false);
    assert.strictEqual(closed.width, 0);
    assert.strictEqual(closed.height, 0);
  });
});

describe('SHELL_PANEL_IDS / isShellPanelId()', () => {
  it('已知面板集合与 shell.html 图标栏一致', () => {
    assert.deepStrictEqual(
      [...SHELL_PANEL_IDS],
      ['chat', 'window', 'mcp', 'task', 'settings', 'project']
    );
  });

  it('合法 id 通过，非法值被拒绝', () => {
    for (const id of SHELL_PANEL_IDS) {
      assert.strictEqual(isShellPanelId(id), true);
    }
    assert.strictEqual(isShellPanelId('sessions'), false);
    assert.strictEqual(isShellPanelId('home'), false);
    assert.strictEqual(isShellPanelId(''), false);
    assert.strictEqual(isShellPanelId(null), false);
    assert.strictEqual(isShellPanelId(undefined), false);
    assert.strictEqual(isShellPanelId(42), false);
    assert.strictEqual(isShellPanelId('chat; DROP TABLE'), false);
  });
});
