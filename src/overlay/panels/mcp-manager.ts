/**
 * MCP 管理浮动面板：列表渲染、配置加载/保存、打开/关闭
 * 由 events.ts 拆分而来（P4.5），逻辑保持不变。
 */
import { showToast, showConfirmDialog } from '../panel.js';
import { h, replaceChildrenOf } from '../dom.js';

/** 最近一次渲染的 server 列表（委托回调按名字查找状态） */
let lastServers: any[] = [];

/** 已绑定委托的容器（容器是模板静态元素，只绑一次） */
const delegatedLists = new WeakSet<Element>();

/**
 * 容器级事件委托：点击 server 条目切换连接/断开。
 * 只绑定一次，render 函数保持纯渲染。
 */
function bindMcpListDelegation(list: HTMLElement): void {
  if (delegatedLists.has(list)) return;
  delegatedLists.add(list);
  list.addEventListener('click', async (e) => {
    const el = (e.target as HTMLElement).closest('.cuckoo-mcp-item') as HTMLElement | null;
    if (!el || !list.contains(el)) return;
    const name = el.dataset.mcpName;
    const server = lastServers.find((s: any) => s.name === name);
    if (!server) return;

    // 点击后立即显示 loading
    const dot = el.querySelector('.cuckoo-mcp-dot');
    if (dot) (dot as HTMLElement).style.background = '#ffc107';
    el.style.pointerEvents = 'none';

    try {
      if (server.connected || server.enabled) {
        // 已连接或已启用 → 断开/禁用
        await window.electronAPI.disableMcpServer(name!);
        showToast('已断开 ' + name, 2000);
      } else {
        // 未启用 → 连接
        await window.electronAPI.enableMcpServer(name!);
        showToast('已连接 ' + name, 2000);
      }
      await renderMcpList();
      await loadMcpConfigToJson();
    } catch (err: any) {
      showToast('操作失败: ' + (err.message || err), 3000);
      await renderMcpList();
    }
  });
}

function renderMcpItem(s: any): HTMLElement {
  const status = s.connected ? '已连接' : (s.enabled ? '未连接' : '已禁用');
  const dotClass = s.connected ? 'connected' : (s.enabled ? 'enabled' : 'disabled');
  // 来源标记：项目级 / 用户级
  const srcLabel = s.source === 'project' ? '项目' : '用户';
  const srcClass = s.source === 'project' ? 'project' : 'user';
  const dot = h('span', { class: `cuckoo-mcp-dot ${dotClass}` });
  dot.title = status;
  return h('div', { class: 'cuckoo-window-item cuckoo-mcp-item', dataset: { mcpName: String(s.name) } },
    h('span', { class: 'cuckoo-window-name' }, String(s.name)),
    h('span', { class: `cuckoo-mcp-src ${srcClass}` }, srcLabel),
    dot,
  );
}

/** 加载配置到 JSON 框（只显示用户级，不混项目级） */
async function loadMcpConfigToJson() {
  const res = await window.electronAPI.listMcpServers({ scope: 'user' });
  const servers = res && res.success ? res.servers : [];
  // 转成主流 mcpServers 格式
  const mcpServers: Record<string, any> = {};
  for (const s of servers) {
    const def: any = {};
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
  const jsonInput = document.getElementById('cuckoo-mcp-json');
  if (jsonInput) (jsonInput as any).value = JSON.stringify({ mcpServers }, null, 2);
}

/** 渲染 MCP server 列表 */
async function renderMcpList() {
  const list = document.getElementById('cuckoo-mcp-list');
  if (!list) return;
  bindMcpListDelegation(list);
  try {
    const res = await window.electronAPI.listMcpServers();
    const servers = res && res.success ? res.servers : [];
    lastServers = servers || [];
    if (!servers || servers.length === 0) {
      replaceChildrenOf(list, h('div', { class: 'cuckoo-session-empty' }, '暂无 MCP Server'));
      return;
    }
    replaceChildrenOf(list, ...servers.map((s: any) => renderMcpItem(s)));
  } catch (err) {
    lastServers = [];
    replaceChildrenOf(list, h('div', { class: 'cuckoo-session-empty' }, '加载失败'));
  }
}

/** 打开 MCP 管理面板 */
function openMcpManager() {
  const panel = document.getElementById('cuckoo-mcp-manager');
  if (panel) {
    panel.classList.remove('cuckoo-hidden');
    renderMcpList();
    loadMcpConfigToJson();
  }
}

/** 关闭 MCP 管理面板 */
function closeMcpManager() {
  const panel = document.getElementById('cuckoo-mcp-manager');
  if (panel) panel.classList.add('cuckoo-hidden');
}

/**
 * 保存 MCP 配置（校验 → 删除旧 server → upsert → 询问是否通知 AI）
 * @param sendToChat 发送消息到聊天的函数（由 events 注入，避免跨层依赖）
 */
async function handleMcpSave(sendToChat: any) {
  const jsonInput = document.getElementById('cuckoo-mcp-json');
  if (!jsonInput || !(jsonInput as any).value.trim()) {
    showToast('请输入配置', 3000);
    return;
  }
  try {
    const parsed = JSON.parse((jsonInput as any).value);
    if (!parsed.mcpServers || typeof parsed.mcpServers !== 'object') {
      showToast('配置格式错误，需要 mcpServers 对象', 3000);
      return;
    }

    // 校验每个 server 定义是否完整合法（发现错误立即中止，不删旧配置、不覆盖编辑框）
    for (const [name, def] of Object.entries(parsed.mcpServers) as [string, any][]) {
      if (!def || typeof def !== 'object' || Array.isArray(def)) {
        showToast('配置错误：server "' + name + '" 的定义必须是对象', 4000);
        return;
      }
      const hasUrl = def.url !== undefined;
      const hasCommand = def.command !== undefined;
      if (hasUrl) {
        if (typeof def.url !== 'string' || !def.url.trim()) {
          showToast('配置错误：server "' + name + '" 的 url 必须是非空字符串', 4000);
          return;
        }
        if (hasCommand) {
          showToast('配置错误：server "' + name + '" 不能同时指定 url 和 command', 4000);
          return;
        }
      } else if (hasCommand) {
        if (typeof def.command !== 'string' || !def.command.trim()) {
          showToast('配置错误：server "' + name + '" 的 command 必须是非空字符串', 4000);
          return;
        }
      } else {
        showToast('配置错误：server "' + name + '" 缺少 command 或 url', 4000);
        return;
      }
      if (def.args !== undefined && !Array.isArray(def.args)) {
        showToast('配置错误：server "' + name + '" 的 args 必须是数组', 4000);
        return;
      }
      if (def.env !== undefined && (typeof def.env !== 'object' || def.env === null || Array.isArray(def.env))) {
        showToast('配置错误：server "' + name + '" 的 env 必须是对象', 4000);
        return;
      }
      if (def.headers !== undefined && (typeof def.headers !== 'object' || def.headers === null || Array.isArray(def.headers))) {
        showToast('配置错误：server "' + name + '" 的 headers 必须是对象', 4000);
        return;
      }
    }

    // 先删除 JSON 里不存在的旧 server（只针对用户级，避免误删项目级）
    const oldRes = await window.electronAPI.listMcpServers({ scope: 'user' });
    const oldServers = (oldRes && oldRes.success && oldRes.servers) || [];
    const newNames = new Set(Object.keys(parsed.mcpServers));
    for (const old of oldServers) {
      if (!newNames.has(old.name)) {
        await window.electronAPI.removeMcpServer(old.name);
      }
    }

    // 逐个 upsert 新配置
    for (const [name, def] of Object.entries(parsed.mcpServers) as [string, any][]) {
      const server = {
        name,
        type: (def && def.url ? 'http' : 'stdio') as 'http' | 'stdio',
        command: def && def.command,
        args: def && def.args || [],
        url: def && def.url,
        headers: def && def.headers,
        env: def && def.env,
      };
      await window.electronAPI.upsertMcpServer(server);
    }
    showToast('配置已保存', 2200);
    await renderMcpList();
    await loadMcpConfigToJson();
    // 询问用户是否将 MCP 更新通知发给 AI（不自动发送）
    try {
      const confirmed = await showConfirmDialog(
        'MCP 配置已保存。\n\n是否告诉 AI 配置已更新？\n（请确保 AI 当前没有正在进行其他操作）',
        { okText: '发送', showCancel: true, cancelText: '取消' }
      );
      if (!confirmed) return;

      const res = await window.electronAPI.getMcpTools();
      const tools = res && res.success ? res.tools : [];
      const serverNames = Array.from(new Set(tools.map((t: any) => t.server)));
      let msg = '【MCP 配置已更新】\n\n';
      if (serverNames.length === 0) {
        msg += '当前没有已连接的 MCP server。';
      } else {
        msg += '可用的 MCP server：' + serverNames.join('、') + '。\n';
        msg += '需要时用 mcpListServers() 查看概览，或用 mcpGetTools(serverName) 查看具体工具。';
      }
      sendToChat(msg, 'MCP信息', 300);
    } catch (err: any) {
      console.error('[Cuckoo Code] 发送 MCP 信息失败:', err);
    }
  } catch (err: any) {
    showToast('保存失败: ' + (err.message || err), 3000);
  }
}

export { loadMcpConfigToJson, renderMcpList, openMcpManager, closeMcpManager, handleMcpSave };
