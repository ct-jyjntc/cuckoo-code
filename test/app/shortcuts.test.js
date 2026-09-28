'use strict';
/**
 * src/app/shortcuts.ts 按键判定纯函数测试。
 * 覆盖：Esc 收起（面板打开时拦截）、面板关闭时 Esc 放行、Ctrl+Shift+C 切换。
 */
import { describe, it } from 'vitest';
import assert from 'node:assert';

import { decideViewKeyAction } from '../../src/app/shortcuts.js';

describe('decideViewKeyAction', () => {
  it('Esc + 面板打开 → close-panel（调用方据此 preventDefault）', () => {
    assert.strictEqual(decideViewKeyAction({ key: 'Escape' }, 'chat'), 'close-panel');
  });

  it('Esc + 面板关闭 → null（不拦截，Esc 归页面自己）', () => {
    assert.strictEqual(decideViewKeyAction({ key: 'Escape' }, null), null);
  });

  it('Ctrl+Shift+C → toggle-panel（与面板状态无关）', () => {
    assert.strictEqual(decideViewKeyAction({ key: 'C', control: true, shift: true }, null), 'toggle-panel');
    assert.strictEqual(decideViewKeyAction({ key: 'C', control: true, shift: true }, 'mcp'), 'toggle-panel');
  });

  it('小写 c 同样触发切换', () => {
    assert.strictEqual(decideViewKeyAction({ key: 'c', control: true, shift: true }, null), 'toggle-panel');
  });

  it('缺 ctrl 或 shift 的 C 不触发', () => {
    assert.strictEqual(decideViewKeyAction({ key: 'C', control: true }, null), null);
    assert.strictEqual(decideViewKeyAction({ key: 'C', shift: true }, null), null);
    assert.strictEqual(decideViewKeyAction({ key: 'C' }, 'chat'), null);
  });

  it('其他按键一律放行', () => {
    assert.strictEqual(decideViewKeyAction({ key: 'a', control: true }, 'chat'), null);
    assert.strictEqual(decideViewKeyAction({ key: 'F5' }, 'chat'), null);
    assert.strictEqual(decideViewKeyAction({}, 'chat'), null);
  });
});
