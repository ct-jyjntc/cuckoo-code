/**
 * 窗口管理浮动面板：列表渲染、打开/关闭、生成文档
 * 由 events.ts 拆分而来（P4.5），逻辑保持不变。
 * T7：面板按钮的事件绑定也下沉到本模块（bindWindowManagerPanel）。
 */
import { showToast } from '../panel.js';
import { h, replaceChildrenOf } from '../dom.js';

/** 已绑定委托的容器（容器是模板静态元素，只绑一次） */
const delegatedLists = new WeakSet<Element>();

/**
 * 容器级事件委托：
 * - change（.cuckoo-window-auto input）→ 设置默认打开
 * - click（.cuckoo-window-del）→ 删除窗口
 * - click（.cuckoo-window-item 其他区域）→ 打开/切换窗口
 */
function bindWindowListDelegation(list: HTMLElement): void {
  if (delegatedLists.has(list)) return;
  delegatedLists.add(list);

  list.addEventListener('change', async (e) => {
    const cb = (e.target as HTMLElement).closest('.cuckoo-window-auto input') as HTMLInputElement | null;
    if (!cb || !list.contains(cb)) return;
    const profileId = cb.dataset.profileId;
    const on = cb.checked;
    try {
      const r = await window.electronAPI.setProfileAutoOpen(profileId!, on);
      if (!r || !r.success) {
        showToast((r && r.error) || '设置失败', 3000);
        cb.checked = !on; // 回滚
      }
    } catch (err: any) {
      showToast('设置失败: ' + (err.message || err), 3000);
      cb.checked = !on;
    }
  });

  list.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;

    const del = target.closest('.cuckoo-window-del') as HTMLElement | null;
    if (del && list.contains(del)) {
      const profileId = del.dataset.profileId;
      try {
        const r = await window.electronAPI.deleteProfileWindow(profileId!);
        if (r && r.success) {
          showToast('已删除窗口', 2000);
          await renderWindowList();
        } else {
          showToast((r && r.error) || '删除失败', 3000);
        }
      } catch (err: any) {
        showToast('删除失败: ' + (err.message || err), 3000);
      }
      return;
    }

    // 点击复选框区域不触发切换
    if (target.closest('.cuckoo-window-auto')) return;

    const item = target.closest('.cuckoo-window-item') as HTMLElement | null;
    if (!item || !list.contains(item)) return;
    const profileId = item.dataset.profileId;
    try {
      const r = await window.electronAPI.openProfileWindow(profileId!);
      if (r && r.success) {
        showToast(r.focused ? '已切换到该窗口' : '已打开窗口', 2000);
        closeWindowManager();
      } else {
        showToast((r && r.error) || '打开失败', 3000);
      }
    } catch (err: any) {
      showToast('打开窗口失败: ' + (err.message || err), 3000);
    }
  });
}

function renderWindowItem(p: any, providerMap: Record<string, string>): HTMLElement {
  const pname = providerMap[p.providerId] || '平台';
  const checkbox = h('input', { dataset: { profileId: String(p.id) } });
  checkbox.type = 'checkbox';
  checkbox.checked = p.autoOpen === true;
  const label = h('label', { class: 'cuckoo-window-auto' }, checkbox, '默认');
  label.title = '启动时默认打开此窗口';
  const del = h('span', { class: 'cuckoo-window-del', dataset: { profileId: String(p.id) } }, '删除');
  del.title = '删除窗口';
  return h('div', { class: 'cuckoo-window-item', dataset: { profileId: String(p.id) } },
    label,
    h('span', { class: 'cuckoo-window-left' },
      h('span', { class: 'cuckoo-window-name' }, String(p.name)),
      h('span', { class: 'cuckoo-window-sep' }, '|'),
      h('span', { class: 'cuckoo-window-status' }, pname),
    ),
    del,
  );
}

/**
 * 渲染窗口列表（浮动管理面板内）
 */
async function renderWindowList() {
  const list = document.getElementById('cuckoo-window-list');
  if (!list) return;
  bindWindowListDelegation(list);
  try {
    const res = await window.electronAPI.listProfiles();
    const profiles = res && res.success ? res.profiles : [];
    if (!profiles || profiles.length === 0) {
      replaceChildrenOf(list, h('div', { class: 'cuckoo-session-empty' }, '暂无窗口'));
      return;
    }
    // 获取平台名映射
    const providerMap: Record<string, string> = {};
    try {
      const pvRes = await window.electronAPI.listProviders();
      if (pvRes && pvRes.success) {
        (pvRes.providers || []).forEach((pv: any) => { providerMap[pv.id] = pv.name; });
      }
    } catch (_) {}

    replaceChildrenOf(list, ...profiles.map((p: any) => renderWindowItem(p, providerMap)));
  } catch (err) {
    replaceChildrenOf(list, h('div', { class: 'cuckoo-session-empty' }, '加载失败'));
  }
}

/** 打开窗口管理浮动面板 */
function openWindowManager() {
  const panel = document.getElementById('cuckoo-window-manager');
  if (panel) {
    panel.classList.remove('cuckoo-hidden');
    renderWindowList();
  }
}

/** 关闭窗口管理浮动面板 */
function closeWindowManager() {
  const panel = document.getElementById('cuckoo-window-manager');
  if (panel) panel.classList.add('cuckoo-hidden');
}

/** 生成项目说明文档按钮点击处理 */
async function handleGenerateDoc(sendToChat: any) {
  const message = '根据当前项目生成一个类似 claude.md 的项目说明文件，并将文件放到当前项目 .cuckoo/CUCKOO.md';
  if (!(await sendToChat(message, '生成文档', 300))) {
    showToast('未找到输入框，请确保已打开聊天界面', 3000);
  }
}

/** 绑定窗口管理面板相关按钮（打开面板 / 新建窗口 / 关闭 / 刷新） */
function bindWindowManagerPanel(): void {
  document.getElementById('cuckoo-btn-window-manager')?.addEventListener('click', () => {
    openWindowManager();
  });
  // 新建窗口（不指定平台，让窗口显示平台选择页）
  document.getElementById('cuckoo-wm-new-window')?.addEventListener('click', async () => {
    try {
      await window.electronAPI.createProfileWindow();
      showToast('已打开平台选择', 2200);
      await renderWindowList();
    } catch (err: any) {
      showToast('创建新窗口失败: ' + (err.message || err), 3000);
    }
  });
  document.getElementById('cuckoo-wm-close')?.addEventListener('click', closeWindowManager);
  document.getElementById('cuckoo-wm-refresh')?.addEventListener('click', renderWindowList);
}

export { renderWindowList, openWindowManager, closeWindowManager, handleGenerateDoc, bindWindowManagerPanel };
