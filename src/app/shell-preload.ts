/**
 * 地址栏壳页面 preload（与 AI 页面 preload 分离）
 * 暴露 window.shellAPI：导航控制 + 地址变化订阅。不能有顶层 await（P3a 教训）。
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { contextBridge, ipcRenderer } = require('electron');

const shellAPI = {
  navigate: (url: string) => ipcRenderer.invoke('shell-navigate', { url }),
  back: () => ipcRenderer.invoke('shell-back'),
  forward: () => ipcRenderer.invoke('shell-forward'),
  reload: () => ipcRenderer.invoke('shell-reload'),
  home: () => ipcRenderer.invoke('shell-home'),
  setPanelOpen: (panelId: string | null) => ipcRenderer.invoke('shell-panel-state', { panelId }),
  onUrlUpdated: (cb: (data: any) => void) => {
    ipcRenderer.on('shell-url-updated', (_e: any, data: any) => cb(data));
  },
  onTokenUpdated: (cb: (data: any) => void) => {
    ipcRenderer.on('shell-token-updated', (_e: any, data: any) => cb(data));
  },
  onTotalUpdated: (cb: (data: any) => void) => {
    ipcRenderer.on('shell-total-updated', (_e: any, data: any) => cb(data));
  },
  getSystemTotal: () => ipcRenderer.invoke('get-system-total'),
  // ===== 会话面板（通道 handler 用 event.sender 反查窗口，shell webContents 可被命中）=====
  listSessions: () => ipcRenderer.invoke('list-sessions'),
  navigateSession: (sessionId: string) => ipcRenderer.invoke('navigate-session', { sessionId }),
  // ===== 窗口面板（profile 管理通道均不依赖 sender，直接可用）=====
  listProfiles: () => ipcRenderer.invoke('list-profiles'),
  listProviders: () => ipcRenderer.invoke('list-providers'),
  openProfileWindow: (profileId: string) => ipcRenderer.invoke('open-profile-window', { profileId }),
  setProfileAutoOpen: (profileId: string, autoOpen: boolean) =>
    ipcRenderer.invoke('set-profile-auto-open', { profileId, autoOpen }),
  deleteProfileWindow: (profileId: string) => ipcRenderer.invoke('delete-profile', { profileId }),
  createProfileWindow: () => ipcRenderer.invoke('create-profile-window'),
  // ===== MCP 面板（handler 用 event.sender 反查窗口取 projectDir，shell webContents 可被命中）=====
  listMcpServers: (opts?: any) => ipcRenderer.invoke('list-mcp-servers', opts || {}),
  upsertMcpServer: (server: any) => ipcRenderer.invoke('upsert-mcp-server', { server }),
  removeMcpServer: (name: string) => ipcRenderer.invoke('remove-mcp-server', { name }),
  enableMcpServer: (name: string) => ipcRenderer.invoke('enable-mcp-server', { name }),
  disableMcpServer: (name: string) => ipcRenderer.invoke('disable-mcp-server', { name }),
  getMcpTools: () => ipcRenderer.invoke('get-mcp-tools'),
  // 壳页面 → 主进程 → AI 页面 view → bridge preload 的 sendToChat
  sendToChat: (msg: string, tag?: string, delayMs?: number) =>
    ipcRenderer.invoke('shell-send-to-chat', { msg, tag, delayMs }),
};

try {
  contextBridge.exposeInMainWorld('shellAPI', shellAPI);
} catch (err) {
  console.error('[Cuckoo Shell] contextBridge 失败:', err);
}
(window as any).shellAPI = shellAPI;
