/**
 * shell 侧栏面板内容（ES Module，供 happy-dom 测试导入）。
 * 承载「会话」与「窗口」两个面板，逻辑对照迁移自 overlay 侧
 * session-list.ts 与 panels/window-manager.ts（功能等价）。
 * shell 是 file:// 自有页面，但会话 id / profile 名等外部数据
 * 一律走 textContent / dataset，不拼 innerHTML。
 */
'use strict';

/** 面板内轻提示（替代 overlay 的 showToast） */
function showPanelToast(doc, text, ms) {
  const toast = doc.getElementById('panel-toast');
  if (!toast) return;
  toast.textContent = text;
  toast.hidden = false;
  clearTimeout(showPanelToast._timer);
  showPanelToast._timer = setTimeout(function () {
    toast.hidden = true;
  }, ms || 2500);
}

/** 创建元素（文本走 textContent） */
function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

export function initPanels(api, doc) {
  api = api || {};
  const sessionList = doc.getElementById('shell-session-list');
  const windowList = doc.getElementById('shell-window-list');

  // ===== 会话面板 =====

  function renderSessionEmpty(text) {
    if (!sessionList) return;
    sessionList.textContent = '';
    sessionList.appendChild(el(doc, 'div', 'panel-empty', text));
  }

  async function renderSessionList() {
    if (!sessionList) return;
    try {
      if (!api.listSessions) {
        renderSessionEmpty('API 不可用');
        return;
      }
      const result = await api.listSessions();
      if (!result || !result.success) {
        renderSessionEmpty('加载失败');
        return;
      }
      const sessions = result.sessions || [];
      if (sessions.length === 0) {
        renderSessionEmpty('暂无会话');
        return;
      }
      sessionList.textContent = '';
      for (const sessionId of sessions) {
        const item = el(doc, 'div', 'panel-item session-item');
        item.dataset.sessionId = String(sessionId);
        item.appendChild(el(doc, 'span', 'session-id', String(sessionId)));
        item.appendChild(el(doc, 'span', 'session-action', '跳转'));
        sessionList.appendChild(item);
      }
    } catch (err) {
      console.error('[Cuckoo Shell] 渲染会话列表失败:', err);
      renderSessionEmpty('加载出错');
    }
  }

  async function navigateToSession(sessionId) {
    if (!sessionId) return;
    try {
      if (!api.navigateSession) {
        showPanelToast(doc, '导航 API 不可用', 3000);
        return;
      }
      const result = await api.navigateSession(sessionId);
      if (result && result.success) {
        // 导航成功后小延迟刷新会话列表（页面可能正在跳转）
        setTimeout(renderSessionList, 2000);
      } else {
        showPanelToast(doc, '导航失败: ' + ((result && result.error) || '未知错误'), 3000);
      }
    } catch (err) {
      console.error('[Cuckoo Shell] 导航到会话失败:', err);
      showPanelToast(doc, '导航失败: ' + (err && err.message ? err.message : err), 3000);
    }
  }

  if (sessionList) {
    sessionList.addEventListener('click', function (e) {
      const item = e.target.closest('.session-item');
      if (!item || !sessionList.contains(item)) return;
      const sessionId = item.dataset.sessionId;
      if (sessionId) navigateToSession(sessionId);
    });
  }

  // ===== 窗口面板 =====

  function renderWindowEmpty(text) {
    if (!windowList) return;
    windowList.textContent = '';
    windowList.appendChild(el(doc, 'div', 'panel-empty', text));
  }

  function renderWindowItem(p, providerMap) {
    const pname = providerMap[p.providerId] || '平台';
    const item = el(doc, 'div', 'panel-item window-item');
    item.dataset.profileId = String(p.id);

    const checkbox = el(doc, 'input');
    checkbox.type = 'checkbox';
    checkbox.checked = p.autoOpen === true;
    checkbox.dataset.profileId = String(p.id);
    const label = el(doc, 'label', 'window-auto');
    label.title = '启动时默认打开此窗口';
    label.appendChild(checkbox);
    label.appendChild(doc.createTextNode('默认'));

    const left = el(doc, 'span', 'window-left');
    left.appendChild(el(doc, 'span', 'window-name', String(p.name)));
    left.appendChild(el(doc, 'span', 'window-sep', '|'));
    left.appendChild(el(doc, 'span', 'window-status', pname));

    const del = el(doc, 'span', 'window-del', '删除');
    del.title = '删除窗口';
    del.dataset.profileId = String(p.id);

    item.appendChild(label);
    item.appendChild(left);
    item.appendChild(del);
    return item;
  }

  async function renderWindowList() {
    if (!windowList) return;
    if (!api.listProfiles) {
      renderWindowEmpty('API 不可用');
      return;
    }
    try {
      const res = await api.listProfiles();
      const profiles = res && res.success ? res.profiles : [];
      if (!profiles || profiles.length === 0) {
        renderWindowEmpty('暂无窗口');
        return;
      }
      // 获取平台名映射
      const providerMap = {};
      try {
        const pvRes = api.listProviders ? await api.listProviders() : null;
        if (pvRes && pvRes.success) {
          for (const pv of pvRes.providers || []) providerMap[pv.id] = pv.name;
        }
      } catch { /* 平台名映射失败时退化为“平台” */ }

      windowList.textContent = '';
      for (const p of profiles) windowList.appendChild(renderWindowItem(p, providerMap));
    } catch (err) {
      console.error('[Cuckoo Shell] 渲染窗口列表失败:', err);
      renderWindowEmpty('加载失败');
    }
  }

  if (windowList) {
    // 勾选「默认」→ 设置启动时自动打开（失败回滚）
    windowList.addEventListener('change', async function (e) {
      const cb = e.target.closest('.window-auto input');
      if (!cb || !windowList.contains(cb)) return;
      const profileId = cb.dataset.profileId;
      const on = cb.checked;
      try {
        const r = await api.setProfileAutoOpen(profileId, on);
        if (!r || !r.success) {
          showPanelToast(doc, (r && r.error) || '设置失败', 3000);
          cb.checked = !on;
        }
      } catch (err) {
        showPanelToast(doc, '设置失败: ' + (err && err.message ? err.message : err), 3000);
        cb.checked = !on;
      }
    });

    windowList.addEventListener('click', async function (e) {
      const target = e.target;

      const del = target.closest('.window-del');
      if (del && windowList.contains(del)) {
        const profileId = del.dataset.profileId;
        try {
          const r = await api.deleteProfileWindow(profileId);
          if (r && r.success) {
            showPanelToast(doc, '已删除窗口', 2000);
            await renderWindowList();
          } else {
            showPanelToast(doc, (r && r.error) || '删除失败', 3000);
          }
        } catch (err) {
          showPanelToast(doc, '删除失败: ' + (err && err.message ? err.message : err), 3000);
        }
        return;
      }

      // 点击复选框区域不触发切换
      if (target.closest('.window-auto')) return;

      const item = target.closest('.window-item');
      if (!item || !windowList.contains(item)) return;
      const profileId = item.dataset.profileId;
      try {
        const r = await api.openProfileWindow(profileId);
        if (r && r.success) {
          showPanelToast(doc, r.focused ? '已切换到该窗口' : '已打开窗口', 2000);
        } else {
          showPanelToast(doc, (r && r.error) || '打开失败', 3000);
        }
      } catch (err) {
        showPanelToast(doc, '打开窗口失败: ' + (err && err.message ? err.message : err), 3000);
      }
    });
  }

  // 新建窗口（不指定平台，让窗口显示平台选择页）
  const btnNewWindow = doc.getElementById('shell-btn-new-window');
  if (btnNewWindow) {
    btnNewWindow.addEventListener('click', async function () {
      try {
        await api.createProfileWindow();
        showPanelToast(doc, '已打开平台选择', 2200);
        await renderWindowList();
      } catch (err) {
        showPanelToast(doc, '创建新窗口失败: ' + (err && err.message ? err.message : err), 3000);
      }
    });
  }
  const btnRefreshWindows = doc.getElementById('shell-btn-refresh-windows');
  if (btnRefreshWindows) {
    btnRefreshWindows.addEventListener('click', function () { renderWindowList(); });
  }

  // ===== 面板切换：显隐内容容器，按需渲染 =====
  function handlePanelChange(panelId) {
    const contents = doc.querySelectorAll('.panel-content');
    for (const c of contents) {
      c.hidden = c.dataset.panelContent !== panelId;
    }
    if (panelId === 'chat') renderSessionList();
    if (panelId === 'window') renderWindowList();
  }

  return {
    handlePanelChange: handlePanelChange,
    renderSessionList: renderSessionList,
    renderWindowList: renderWindowList,
  };
}
