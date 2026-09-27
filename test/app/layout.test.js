'use strict';
/**
 * src/app/layout.ts 布局纯函数测试。
 * 不同窗口尺寸 × panelOpen true/false 的 bounds 断言。
 */
import { describe, it } from 'vitest';
import assert from 'node:assert';

import {
  SHELL_LAYOUT,
  computeViewBounds,
} from '../../src/app/layout.js';

describe('SHELL_LAYOUT 常量', () => {
  it('顶栏 44 / 图标栏 52 / 面板 280 / 卡片边距 10 / 圆角 12', () => {
    assert.strictEqual(SHELL_LAYOUT.TOPBAR_HEIGHT, 44);
    assert.strictEqual(SHELL_LAYOUT.RAIL_WIDTH, 52);
    assert.strictEqual(SHELL_LAYOUT.PANEL_WIDTH, 280);
    assert.strictEqual(SHELL_LAYOUT.CARD_MARGIN, 10);
    assert.strictEqual(SHELL_LAYOUT.CARD_RADIUS, 12);
  });
});

describe('computeViewBounds()', () => {
  it('面板收起：x = 52 + 10，y = 44 + 10，四周各留 10px 边距', () => {
    const b = computeViewBounds(1280, 900, false);
    assert.strictEqual(b.x, 62);
    assert.strictEqual(b.y, 54);
    assert.strictEqual(b.width, 1280 - 62 - 10);
    assert.strictEqual(b.height, 900 - 54 - 10);
  });

  it('面板展开：x 额外偏移 280，宽度相应缩减', () => {
    const b = computeViewBounds(1280, 900, true);
    assert.strictEqual(b.x, 342);
    assert.strictEqual(b.y, 54);
    assert.strictEqual(b.width, 1280 - 342 - 10);
    assert.strictEqual(b.height, 900 - 54 - 10);
  });

  it('窗口过小时宽高夹紧为 0，不为负', () => {
    const b = computeViewBounds(100, 60, true);
    assert.strictEqual(b.width, 0);
    assert.strictEqual(b.height, 0);
    assert.strictEqual(b.x, 342);
    assert.strictEqual(b.y, 54);
  });

  it('恰好容纳的最小窗口：宽高为 0', () => {
    const closed = computeViewBounds(72, 64, false);
    assert.strictEqual(closed.width, 0);
    assert.strictEqual(closed.height, 0);
  });
});
