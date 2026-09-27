/**
 * overlay / ui 测试的 DOM 环境 helper。
 *
 * 前置条件：测试文件顶部带 `// @vitest-environment happy-dom` docblock，
 * happy-dom 环境会注入全局 document/window。本 helper 负责写入 html、
 * 并在 cleanup 时还原 body，保证测试间隔离。
 */

export interface DomContext {
  document: Document;
  cleanup(): void;
}

export function setupDom(html: string = ''): DomContext {
  document.body.innerHTML = html;

  return {
    document,
    cleanup() {
      document.body.innerHTML = '';
    },
  };
}
