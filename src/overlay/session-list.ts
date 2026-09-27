/**
 * 会话列表功能（渲染、导航、初始化项目按钮）
 * 由原 preload.js 拆分而来，逻辑保持不变。
 */
import { showToast } from './panel.js';
import { h, replaceChildrenOf } from './dom.js';

// ========== 会话列表功能 ==========

/** 已绑定委托的容器（容器是模板静态元素，只绑一次） */
const delegatedLists = new WeakSet<Element>();

/**
 * 容器级事件委托：点击会话条目触发导航。
 * 只绑定一次，render 函数保持纯渲染。
 */
function bindSessionListDelegation(list: HTMLElement): void {
  if (delegatedLists.has(list)) return;
  delegatedLists.add(list);
  list.addEventListener('click', (e) => {
    const item = (e.target as HTMLElement).closest('.cuckoo-session-item') as HTMLElement | null;
    if (!item || !list.contains(item)) return;
    const sessionId = item.dataset.sessionId;
    if (sessionId) handleNavigateSession(sessionId);
  });
}

/**
 * 渲染当前项目目录关联的会话列表
 */
async function renderSessions(): Promise<void> {
  const listContainer = document.getElementById('cuckoo-session-list');
  if (!listContainer) return;
  bindSessionListDelegation(listContainer);

  const renderEmpty = (text: string) =>
    replaceChildrenOf(listContainer, h('div', { class: 'cuckoo-session-empty' }, text));

  try {
    if (!window.electronAPI || !window.electronAPI.listSessions) {
      renderEmpty('API 不可用');
      return;
    }

    const result = await window.electronAPI.listSessions();
    if (!result.success) {
      renderEmpty('加载失败');
      return;
    }

    const sessions = result.sessions || [];
    if (sessions.length === 0) {
      renderEmpty('暂无会话');
      return;
    }

    replaceChildrenOf(listContainer, ...sessions.map((sessionId: string) =>
      h('div', { class: 'cuckoo-session-item', dataset: { sessionId: String(sessionId) } },
        h('span', { class: 'session-id' }, String(sessionId)),
        h('span', { class: 'session-action' }, '▶ 跳转'),
      )
    ));
  } catch (err) {
    console.error('[Cuckoo Code] 渲染会话列表失败:', err);
    renderEmpty('加载出错');
  }
}

/**
 * 导航到指定会话
 */
async function handleNavigateSession(sessionId: string): Promise<void> {
  if (!sessionId) return;

  try {
    if (!window.electronAPI || !window.electronAPI.navigateSession) {
      showToast('导航 API 不可用', 3000);
      return;
    }

    const result = await window.electronAPI.navigateSession(sessionId);
    if (result.success) {
      console.log('[Cuckoo Code] 已导航到会话:', sessionId);
      // 导航成功后，覆盖层可以保持打开，但用户可能会看到页面跳转
      // 小延迟后刷新会话列表
      setTimeout(renderSessions, 2000);
    } else {
      showToast('导航失败: ' + (result.error || '未知错误'), 3000);
    }
  } catch (err: any) {
    console.error('[Cuckoo Code] 导航到会话失败:', err);
    showToast('导航失败: ' + err.message, 3000);
  }
}

/**
 * 初始化项目按钮点击处理
 */
async function handleInitProject(): Promise<void> {
  const initBtn = document.getElementById('cuckoo-btn-init') as any;
  if (initBtn) {
    initBtn.disabled = true;
    initBtn.textContent = '⏳ 初始化中...';
  }

  try {
    // 调用主进程的 init-project IPC
    if (!window.electronAPI || !window.electronAPI.initProject) {
      throw new Error('window.electronAPI.initProject 不存在');
    }
    const result = await window.electronAPI.initProject();
    if (result && !result.success) {
      showToast(result.message || '初始化失败', 3000);
    }
  } catch (err: any) {
    console.error('[Cuckoo Code] 初始化项目失败:', err);
    showToast('初始化失败: ' + err.message, 3000);
  } finally {
    if (initBtn) {
      initBtn.disabled = false;
      initBtn.textContent = '初始化项目';
    }
  }
}

export { renderSessions, handleNavigateSession, handleInitProject };
