/**
 * IPC：overlay 设置（主进程 settings.json 的读 / 写 / 重置 / 旧数据迁移）
 */
import { createRequire } from 'node:module';
import { getSettings, saveSettings, resetSettings, applyLegacyMigration } from '../settings-store.js';

const require = createRequire(import.meta.url);
const { ipcMain } = require('electron');

function registerSettingsIpc(): void {
  ipcMain.handle('settings-get', async () => {
    return getSettings();
  });

  ipcMain.handle('settings-set', async (_event: any, payload: any) => {
    const patch = payload && typeof payload === 'object' ? payload.patch : null;
    return { success: true, settings: saveSettings(patch) };
  });

  ipcMain.handle('settings-reset', async () => {
    return { success: true, settings: resetSettings() };
  });

  // 旧版 localStorage 设置迁入：主进程按 migrated 标记只应用一次
  ipcMain.handle('settings-migrate', async (_event: any, payload: any) => {
    const patch = payload && typeof payload === 'object' ? payload.patch : null;
    return { success: true, applied: applyLegacyMigration(patch) };
  });
}

export { registerSettingsIpc };
