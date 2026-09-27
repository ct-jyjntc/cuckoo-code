/**
 * 暴露给渲染进程的 API（contextBridge + window 兜底）
 * 由原 preload.js 拆分而来，行为保持不变。
 * 类型契约见 ./api-types.ts（ElectronAPI）。
 */
import { createRequire } from 'node:module';
import type { ElectronAPI, McpServerConfig } from './api-types.js';

const require = createRequire(import.meta.url);
const { contextBridge, ipcRenderer } = require('electron');

// ========== 暴露给渲染进程的 API ==========
// 尝试 contextBridge，如果失败则直接挂载到 window（作为 fallback）
const electronAPI: ElectronAPI = {
  executeCommand: (command: string, id: string) => {
    return ipcRenderer.invoke('execute-command', { command, id });
  },
  initProject: (projectDir?: string | null, isCompaction?: boolean, extraPrompt?: string, noDialog?: boolean) => {
    return ipcRenderer.invoke('init-project', {
      skipPrompt: false,
      projectDir: projectDir || null,
      isCompaction: !!isCompaction,
      extraPrompt: extraPrompt || '',
      noDialog: !!noDialog,
    });
  },
  updateProjectDir: () => {
    return ipcRenderer.invoke('init-project', { skipPrompt: true });
  },
  executeTool: (toolName: string, params: Record<string, unknown>, callId: string) => {
    return ipcRenderer.invoke('execute-tool', { toolName, params, callId });
  },
  executeJs: (code: string, callId: string) => {
    // 附件上传间隔（毫秒），随 JS 执行一并传给主进程的 attachFile 工具
    let attachDelayMin, attachDelayMax;
    try {
      const mn = parseInt(localStorage.getItem('cuckoo-attach-delay-min') as string, 10);
      const mx = parseInt(localStorage.getItem('cuckoo-attach-delay-max') as string, 10);
      if (Number.isFinite(mn)) attachDelayMin = mn;
      if (Number.isFinite(mx)) attachDelayMax = mx;
    } catch (_) {}
    return ipcRenderer.invoke('execute-js', { code, callId, attachDelayMin, attachDelayMax });
  },
  sendEnterToChat: () => {
    return ipcRenderer.invoke('chat-send-enter');
  },
  simulateMouse: (action: 'move' | 'click', x: number, y: number) => {
    return ipcRenderer.invoke('simulate-mouse', { action, x, y });
  },
  listSessions: () => {
    return ipcRenderer.invoke('list-sessions');
  },
  navigateSession: (sessionId: string) => {
    return ipcRenderer.invoke('navigate-session', { sessionId });
  },
  createProfileWindow: () => {
    return ipcRenderer.invoke('create-profile-window');
  },
  listProfiles: () => {
    return ipcRenderer.invoke('list-profiles');
  },
  openProfileWindow: (profileId: string) => {
    return ipcRenderer.invoke('open-profile-window', { profileId });
  },
  setProfileAutoOpen: (profileId: string, autoOpen: boolean) => {
    return ipcRenderer.invoke('set-profile-auto-open', { profileId, autoOpen });
  },
  deleteProfileWindow: (profileId: string) => {
    return ipcRenderer.invoke('delete-profile', { profileId });
  },
  updateWindowName: (displayName: string) => {
    return ipcRenderer.invoke('update-window-name', { displayName });
  },
  showAiNotification: () => {
    return ipcRenderer.invoke('show-ai-notification');
  },
  updateTokenUsage: (context: number, cumulative: number, windowCumulative: number, todayCumulative: number) => {
    return ipcRenderer.invoke('update-token-usage', { context, cumulative, windowCumulative, todayCumulative });
  },
  // ========== 技能相关 API ==========
  refreshSkills: () => {
    return ipcRenderer.invoke('refresh-skills');
  },
  // ========== MCP 相关 API ==========
  listMcpServers: (opts?: { scope?: 'user' }) => {
    return ipcRenderer.invoke('list-mcp-servers', opts || {});
  },
  upsertMcpServer: (server: McpServerConfig) => {
    return ipcRenderer.invoke('upsert-mcp-server', { server });
  },
  removeMcpServer: (name: string) => {
    return ipcRenderer.invoke('remove-mcp-server', { name });
  },
  enableMcpServer: (name: string) => {
    return ipcRenderer.invoke('enable-mcp-server', { name });
  },
  disableMcpServer: (name: string) => {
    return ipcRenderer.invoke('disable-mcp-server', { name });
  },
  getMcpTools: () => {
    return ipcRenderer.invoke('get-mcp-tools');
  },
  // ========== 平台相关 API ==========
  listProviders: () => {
    return ipcRenderer.invoke('list-providers');
  },
  selectPlatform: (providerId: string) => {
    return ipcRenderer.invoke('select-platform', { providerId });
  },
  createProfileWindowWithProvider: (providerId: string) => {
    return ipcRenderer.invoke('create-profile-window', { providerId });
  },
  importProvider: () => {
    return ipcRenderer.invoke('import-provider');
  },
  removeProvider: (filePath: string, providerId: string) => {
    return ipcRenderer.invoke('remove-provider', { path: filePath, providerId });
  },
  replaceProvider: (providerId: string) => {
    return ipcRenderer.invoke('replace-provider', { providerId });
  },
};

try {
  contextBridge.exposeInMainWorld('electronAPI', electronAPI);
} catch (err) {
  console.error('[Cuckoo Code] contextBridge.exposeInMainWorld 失败:', err);
}

// 无论 contextBridge 是否成功，都直接挂载到 window 作为备选
window.electronAPI = electronAPI;
