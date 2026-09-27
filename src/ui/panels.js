/**
 * shell 侧栏面板内容（ES Module，供 happy-dom 测试导入）。
 * 承载「会话」「窗口」「MCP」三个面板，逻辑对照迁移自 overlay 侧
 * session-list.ts、panels/window-manager.ts、panels/mcp-manager.ts（功能等价）。
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

  // ===== MCP 面板（逻辑对照迁移自 overlay panels/mcp-manager.ts） =====

  const mcpList = doc.getElementById('shell-mcp-list');
  const mcpJson = doc.getElementById('shell-mcp-json');
  const mcpNotify = doc.getElementById('shell-mcp-notify');
  /** 最近一次渲染的 server 列表（委托回调按名字查找状态） */
  let lastMcpServers = [];

  function renderMcpEmpty(text) {
    if (!mcpList) return;
    mcpList.textContent = '';
    mcpList.appendChild(el(doc, 'div', 'panel-empty', text));
  }

  function renderMcpItem(s) {
    const status = s.connected ? '已连接' : (s.enabled ? '未连接' : '已禁用');
    const dotClass = s.connected ? 'connected' : (s.enabled ? 'enabled' : 'disabled');
    const srcLabel = s.source === 'project' ? '项目' : '用户';
    const srcClass = s.source === 'project' ? 'project' : 'user';
    const item = el(doc, 'div', 'panel-item mcp-item');
    item.dataset.mcpName = String(s.name);
    item.appendChild(el(doc, 'span', 'mcp-name', String(s.name)));
    item.appendChild(el(doc, 'span', 'mcp-src ' + srcClass, srcLabel));
    const dot = el(doc, 'span', 'mcp-dot ' + dotClass);
    dot.title = status;
    item.appendChild(dot);
    return item;
  }

  /** 渲染 MCP server 列表 */
  async function renderMcpList() {
    if (!mcpList) return;
    if (!api.listMcpServers) {
      renderMcpEmpty('API 不可用');
      return;
    }
    try {
      const res = await api.listMcpServers();
      const servers = res && res.success ? res.servers : [];
      lastMcpServers = servers || [];
      if (!servers || servers.length === 0) {
        renderMcpEmpty('暂无 MCP Server');
        return;
      }
      mcpList.textContent = '';
      for (const s of servers) mcpList.appendChild(renderMcpItem(s));
    } catch (err) {
      console.error('[Cuckoo Shell] 渲染 MCP 列表失败:', err);
      lastMcpServers = [];
      renderMcpEmpty('加载失败');
    }
  }

  /** 加载配置到 JSON 框（只显示用户级，不混项目级） */
  async function loadMcpConfigToJson() {
    if (!mcpJson || !api.listMcpServers) return;
    try {
      const res = await api.listMcpServers({ scope: 'user' });
      const servers = res && res.success ? res.servers : [];
      const mcpServers = {};
      for (const s of servers) {
        const def = {};
        if (s.type === 'http') {
          if (s.url) def.url = s.url;
          if (s.headers) def.headers = s.headers;
        } else {
          if (s.command) def.command = s.command;
          if (s.args && s.args.length) def.args = s.args;
          if (s.env) def.env = s.env;
        }
        mcpServers[s.name] = def;
      }
      mcpJson.value = JSON.stringify({ mcpServers: mcpServers }, null, 2);
    } catch (err) {
      console.error('[Cuckoo Shell] 加载 MCP 配置失败:', err);
    }
  }

  if (mcpList) {
    // 点击 server 条目：已连接/已启用 → 断开，否则 → 连接
    mcpList.addEventListener('click', async function (e) {
      const item = e.target.closest('.mcp-item');
      if (!item || !mcpList.contains(item)) return;
      const name = item.dataset.mcpName;
      const server = lastMcpServers.find(function (s) { return s.name === name; });
      if (!server) return;
      try {
        if (server.connected || server.enabled) {
          await api.disableMcpServer(name);
          showPanelToast(doc, '已断开 ' + name, 2000);
        } else {
          await api.enableMcpServer(name);
          showPanelToast(doc, '已连接 ' + name, 2000);
        }
        await renderMcpList();
        await loadMcpConfigToJson();
      } catch (err) {
        showPanelToast(doc, '操作失败: ' + (err && err.message ? err.message : err), 3000);
        await renderMcpList();
      }
    });
  }

  /** 校验单个 server 定义，返回错误文案或 null（与 overlay 版提示一致） */
  function validateMcpServerDef(name, def) {
    if (!def || typeof def !== 'object' || Array.isArray(def)) {
      return '配置错误：server "' + name + '" 的定义必须是对象';
    }
    const hasUrl = def.url !== undefined;
    const hasCommand = def.command !== undefined;
    if (hasUrl) {
      if (typeof def.url !== 'string' || !def.url.trim()) {
        return '配置错误：server "' + name + '" 的 url 必须是非空字符串';
      }
      if (hasCommand) {
        return '配置错误：server "' + name + '" 不能同时指定 url 和 command';
      }
    } else if (hasCommand) {
      if (typeof def.command !== 'string' || !def.command.trim()) {
        return '配置错误：server "' + name + '" 的 command 必须是非空字符串';
      }
    } else {
      return '配置错误：server "' + name + '" 缺少 command 或 url';
    }
    if (def.args !== undefined && !Array.isArray(def.args)) {
      return '配置错误：server "' + name + '" 的 args 必须是数组';
    }
    if (def.env !== undefined && (typeof def.env !== 'object' || def.env === null || Array.isArray(def.env))) {
      return '配置错误：server "' + name + '" 的 env 必须是对象';
    }
    if (def.headers !== undefined && (typeof def.headers !== 'object' || def.headers === null || Array.isArray(def.headers))) {
      return '配置错误：server "' + name + '" 的 headers 必须是对象';
    }
    return null;
  }

  function hideMcpNotify() {
    if (mcpNotify) mcpNotify.hidden = true;
  }

  /** 保存 MCP 配置（校验 → 删除旧 server → upsert → 显示「通知 AI」确认条） */
  async function handleMcpSave() {
    if (!mcpJson || !mcpJson.value.trim()) {
      showPanelToast(doc, '请输入配置', 3000);
      return;
    }
    try {
      const parsed = JSON.parse(mcpJson.value);
      if (!parsed.mcpServers || typeof parsed.mcpServers !== 'object') {
        showPanelToast(doc, '配置格式错误，需要 mcpServers 对象', 3000);
        return;
      }
      // 发现错误立即中止，不删旧配置、不覆盖编辑框
      for (const entry of Object.entries(parsed.mcpServers)) {
        const errText = validateMcpServerDef(entry[0], entry[1]);
        if (errText) {
          showPanelToast(doc, errText, 4000);
          return;
        }
      }

      // 先删除 JSON 里不存在的旧 server（只针对用户级，避免误删项目级）
      const oldRes = await api.listMcpServers({ scope: 'user' });
      const oldServers = (oldRes && oldRes.success && oldRes.servers) || [];
      const newNames = new Set(Object.keys(parsed.mcpServers));
      for (const old of oldServers) {
        if (!newNames.has(old.name)) {
          await api.removeMcpServer(old.name);
        }
      }

      // 逐个 upsert 新配置
      for (const entry of Object.entries(parsed.mcpServers)) {
        const name = entry[0];
        const def = entry[1];
        await api.upsertMcpServer({
          name: name,
          type: def && def.url ? 'http' : 'stdio',
          command: def && def.command,
          args: (def && def.args) || [],
          url: def && def.url,
          headers: def && def.headers,
          env: def && def.env,
        });
      }
      showPanelToast(doc, '配置已保存', 2200);
      await renderMcpList();
      await loadMcpConfigToJson();
      // 等价于 overlay 的 showConfirmDialog：面板内确认条，不自动发送
      if (mcpNotify) mcpNotify.hidden = false;
    } catch (err) {
      showPanelToast(doc, '保存失败: ' + (err && err.message ? err.message : err), 3000);
    }
  }

  const btnMcpSave = doc.getElementById('shell-btn-mcp-save');
  if (btnMcpSave) {
    btnMcpSave.addEventListener('click', function () { handleMcpSave(); });
  }
  const btnRefreshMcp = doc.getElementById('shell-btn-refresh-mcp');
  if (btnRefreshMcp) {
    btnRefreshMcp.addEventListener('click', function () { renderMcpList(); });
  }
  const btnMcpNotifySend = doc.getElementById('shell-btn-mcp-notify-send');
  if (btnMcpNotifySend) {
    btnMcpNotifySend.addEventListener('click', async function () {
      hideMcpNotify();
      try {
        const res = await api.getMcpTools();
        const tools = res && res.success ? res.tools : [];
        const serverNames = Array.from(new Set(tools.map(function (t) { return t.server; })));
        let msg = '【MCP 配置已更新】\n\n';
        if (serverNames.length === 0) {
          msg += '当前没有已连接的 MCP server。';
        } else {
          msg += '可用的 MCP server：' + serverNames.join('、') + '。\n';
          msg += '需要时用 mcpListServers() 查看概览，或用 mcpGetTools(serverName) 查看具体工具。';
        }
        if (api.sendToChat) await api.sendToChat(msg, 'MCP信息', 300);
      } catch (err) {
        console.error('[Cuckoo Shell] 发送 MCP 信息失败:', err);
      }
    });
  }
  const btnMcpNotifyCancel = doc.getElementById('shell-btn-mcp-notify-cancel');
  if (btnMcpNotifyCancel) {
    btnMcpNotifyCancel.addEventListener('click', hideMcpNotify);
  }

  // ===== 面板切换：显隐内容容器，按需渲染 =====
  function handlePanelChange(panelId) {
    const contents = doc.querySelectorAll('.panel-content');
    for (const c of contents) {
      c.hidden = c.dataset.panelContent !== panelId;
    }
    if (panelId === 'chat') renderSessionList();
    if (panelId === 'window') renderWindowList();
    if (panelId === 'mcp') {
      renderMcpList();
      loadMcpConfigToJson();
    }
  }

  return {
    handlePanelChange: handlePanelChange,
    renderSessionList: renderSessionList,
    renderWindowList: renderWindowList,
    renderMcpList: renderMcpList,
    loadMcpConfigToJson: loadMcpConfigToJson,
  };
}
