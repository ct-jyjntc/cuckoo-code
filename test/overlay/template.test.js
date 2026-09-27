'use strict';
import { test } from 'vitest';
import assert from 'node:assert';
import { OVERLAY_HTML, OVERLAY_CSS } from '../../src/overlay/template.generated.js';

test('OVERLAY_HTML 包含核心元素', () => {
  assert.ok(OVERLAY_HTML.includes('cuckoo-overlay'));
  assert.ok(OVERLAY_HTML.includes('cuckoo-btn-init'));
  assert.ok(OVERLAY_HTML.includes('cuckoo-session-list'));
  assert.ok(OVERLAY_HTML.includes('cuckoo-btn-manual-parse'));
  assert.ok(OVERLAY_HTML.includes('cuckoo-status-badge'));
});

test('OVERLAY_HTML 包含工具调用遮罩及提示文案', () => {
  assert.ok(OVERLAY_HTML.includes('id="cuckoo-tool-mask"'));
  assert.ok(OVERLAY_HTML.includes('工具调用执行中，请不要有额外操作'));
});

test('OVERLAY_CSS 包含核心样式', () => {
  assert.ok(OVERLAY_CSS.includes('.cuckoo-overlay'));
  assert.ok(OVERLAY_CSS.includes('--ck-primary'));
  assert.ok(OVERLAY_CSS.includes('cuckoo-hidden'));
});

test('OVERLAY_CSS 包含工具调用遮罩样式', () => {
  assert.ok(OVERLAY_CSS.includes('.cuckoo-tool-mask'));
  assert.ok(OVERLAY_CSS.includes('.cuckoo-tool-mask-spinner'));
});

test('OVERLAY_HTML 不包含内联样式', () => {
  assert.ok(!OVERLAY_HTML.includes('style="'), 'OVERLAY_HTML 中不应存在 style=" 内联样式');
});

test('OVERLAY_HTML 所有 class 值均带 cuckoo- 前缀（防宿主样式污染）', () => {
  const classAttrs = OVERLAY_HTML.match(/class="([^"]*)"/g) || [];
  assert.ok(classAttrs.length > 0, 'OVERLAY_HTML 中应存在 class 属性');
  for (const attr of classAttrs) {
    const value = attr.slice('class="'.length, -1);
    const names = value.split(/\s+/).filter(Boolean);
    assert.ok(names.length > 0, 'class 属性不应为空');
    for (const name of names) {
      assert.ok(name.startsWith('cuckoo-'), `class 值 "${name}" 缺少 cuckoo- 前缀`);
    }
  }
});

test('OVERLAY_HTML 不含 🔄 等 emoji 装饰', () => {
  assert.ok(!OVERLAY_HTML.includes('🔄'), 'OVERLAY_HTML 中不应存在 🔄 emoji');
});

test('OVERLAY_HTML 存在 details 折叠元素（更多操作 / 自动压缩设置）', () => {
  assert.ok(OVERLAY_HTML.includes('<details'), 'OVERLAY_HTML 中应存在 details 元素');
});

test('OVERLAY_HTML 催促按钮文案已更新', () => {
  assert.ok(OVERLAY_HTML.includes('催促继续'));
  assert.ok(!OVERLAY_HTML.includes('卡住了?点我'));
});

