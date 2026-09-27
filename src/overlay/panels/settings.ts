/**
 * 设置弹窗：加载/保存/恢复默认
 * 由 events.ts 拆分而来（P4.5），逻辑保持不变。
 * T7：弹窗按钮的事件绑定（含「刷新技能与代理」）下沉到本模块（bindSettingsPanel）；
 * 自动压缩 → ../auto-compact.js，token 统计 → ../token-counter.js。
 * UI 改版 Task 1：设置持久化迁到主进程 settings.json，本模块经 overlay/settings.ts
 * 的内存缓存读取（openSettings），保存/恢复默认走 electronAPI（saveSettings/resetSettings）。
 */
import { showToast } from '../panel.js';
import { state } from '../state.js';
import { getCachedSettings, saveSettings as persistSettings, resetSettings as persistReset } from '../settings.js';

/**
 * 「刷新技能与代理」按钮：让主进程重新扫描技能 + 代理目录，把最新清单发给 AI
 */
async function handleSendSkills(sendToChat: any) {
  const api = window.electronAPI;
  if (!api || !api.refreshSkills) {
    showToast('接口不可用', 3000);
    return;
  }
  try {
    const result = await api.refreshSkills();
    if (!result || !result.success) {
      showToast('获取清单失败: ' + ((result && result.error) || '未知错误'), 3000);
      return;
    }
    const section = result.section || '';
    if (!section.trim()) {
      showToast('没有找到任何技能或代理', 3000);
      return;
    }
    // 注意：sendToChat 是 async，必须 await，否则恒为真值、误报成功
    const ok = await sendToChat(section, '技能与代理清单', 300);
    if (!ok) {
      showToast('发送失败：未找到输入框', 3000);
      return;
    }
    showToast('已发送（技能 ' + (result.skillCount || 0) + ' 个 / 代理 ' + (result.agentCount || 0) + ' 个）', 2500);
  } catch (e: any) {
    showToast('发送失败: ' + e.message, 3000);
  }
}

/** 绑定设置弹窗相关按钮（打开 / 关闭 / 保存 / 恢复默认 / 发送技能清单） */
function bindSettingsPanel(sendToChat: any): void {
  document.getElementById('cuckoo-btn-settings')?.addEventListener('click', openSettings);
  document.getElementById('cuckoo-settings-close')?.addEventListener('click', closeSettings);
  document.getElementById('cuckoo-settings-save')?.addEventListener('click', () => { void saveSettings(); });
  document.getElementById('cuckoo-settings-reset')?.addEventListener('click', () => { void resetSettings(); });
  document.getElementById('cuckoo-skills-send')?.addEventListener('click', () => handleSendSkills(sendToChat));
}

/** 打开设置弹窗：从设置缓存加载配置到输入框 */
function openSettings() {
  function setVal(id: string, v: any) {
    const el = document.getElementById(id);
    if (el) (el as any).value = v;
  }
  const s = getCachedSettings();
  // 存储为毫秒，UI 显示秒
  const enEl = document.getElementById('cuckoo-retry-enabled');
  if (enEl) (enEl as any).checked = s.retryEnabled;
  setVal('cuckoo-retry-delay-min', s.retryDelayMin / 1000);
  setVal('cuckoo-retry-delay-max', s.retryDelayMax / 1000);
  setVal('cuckoo-retry-count', String(s.retryCount));
  setVal('cuckoo-retry-429-delay', s.retry429Delay / 1000);
  setVal('cuckoo-retry-429-count', String(s.retry429Count));
  setVal('cuckoo-retry-prompt', s.retryPrompt);
  setVal('cuckoo-xhr-idle-timeout', s.xhrIdleTimeout / 1000);
  setVal('cuckoo-watchdog-prompt', s.watchdogPrompt);
  setVal('cuckoo-watchdog-count', String(s.watchdogCount));
  setVal('cuckoo-attach-delay-min', s.attachDelayMin / 1000);
  setVal('cuckoo-attach-delay-max', s.attachDelayMax / 1000);
  setVal('cuckoo-delay-min', state.sendDelayMin / 1000);
  setVal('cuckoo-delay-max', state.sendDelayMax / 1000);
  const panel = document.getElementById('cuckoo-settings');
  if (panel) panel.classList.remove('cuckoo-hidden');
}

/** 关闭设置弹窗 */
function closeSettings() {
  const panel = document.getElementById('cuckoo-settings');
  if (panel) panel.classList.add('cuckoo-hidden');
}

/** 恢复默认：主进程 settings.json 重置为默认值，刷新缓存后重载弹窗 */
async function resetSettings() {
  const ok = await persistReset();
  if (!ok) {
    showToast('恢复默认失败', 3000);
    return;
  }
  const s = getCachedSettings();
  state.sendDelayMin = s.sendDelayMin;
  state.sendDelayMax = s.sendDelayMax;
  showToast('已恢复默认设置', 2500);
  openSettings(); // 重新加载默认值到输入框
}

/** 保存设置弹窗的所有配置（写入主进程 settings.json） */
async function saveSettings() {
  const val = (id: string) => { const el = document.getElementById(id); return el ? (el as any).value : ''; };
  // UI 输入为秒，存储转毫秒
  const secToMs = (s: any) => Math.round(parseFloat(s) * 1000);
  const dmin = secToMs(val('cuckoo-retry-delay-min'));
  const dmax = secToMs(val('cuckoo-retry-delay-max'));
  if (Number.isNaN(dmin) || dmin < 0) { showToast('普通失败最小间隔必须是非负数字（秒）', 3000); return; }
  if (Number.isNaN(dmax) || dmax < dmin) { showToast('普通失败最大间隔不能小于最小间隔', 3000); return; }
  const cnt = parseInt(val('cuckoo-retry-count'), 10);
  if (Number.isNaN(cnt)) { showToast('普通失败重试次数必须是整数', 3000); return; }
  const d429 = secToMs(val('cuckoo-retry-429-delay'));
  if (Number.isNaN(d429) || d429 < 0) { showToast('操作频繁重试间隔必须是非负数字（秒）', 3000); return; }
  const c429 = parseInt(val('cuckoo-retry-429-count'), 10);
  if (Number.isNaN(c429)) { showToast('操作频繁重试次数必须是整数', 3000); return; }
  const prompt = val('cuckoo-retry-prompt').trim();
  if (!prompt) { showToast('重试提示词不能为空', 3000); return; }
  const idleTimeout = secToMs(val('cuckoo-xhr-idle-timeout'));
  if (Number.isNaN(idleTimeout) || idleTimeout < 0) { showToast('挂起超时必须是非负数字（秒）', 3000); return; }
  const watchdogPrompt = val('cuckoo-watchdog-prompt').trim();
  if (!watchdogPrompt) { showToast('工具循环超时提示词不能为空', 3000); return; }
  const watchdogCount = parseInt(val('cuckoo-watchdog-count'), 10);
  if (Number.isNaN(watchdogCount)) { showToast('工具循环催继续次数必须是整数', 3000); return; }
  const smin = secToMs(val('cuckoo-delay-min'));
  const smax = secToMs(val('cuckoo-delay-max'));
  if (Number.isNaN(smin) || smin < 0) { showToast('发送延迟最小值必须是非负数字（秒）', 3000); return; }
  if (Number.isNaN(smax) || smax < smin) { showToast('发送延迟最大值不能小于最小值', 3000); return; }
  const amin = secToMs(val('cuckoo-attach-delay-min'));
  const amax = secToMs(val('cuckoo-attach-delay-max'));
  if (Number.isNaN(amin) || amin < 0) { showToast('附件上传间隔最小值必须是非负数字（秒）', 3000); return; }
  if (Number.isNaN(amax) || amax < amin) { showToast('附件上传间隔最大值不能小于最小值', 3000); return; }
  if (amax > 60000) { showToast('附件上传间隔最大值不能超过 60 秒', 3000); return; }

  const enEl = document.getElementById('cuckoo-retry-enabled');
  const ok = await persistSettings({
    retryEnabled: !!(enEl && (enEl as any).checked),
    retryDelayMin: dmin,
    retryDelayMax: dmax,
    retryCount: cnt,
    retry429Delay: d429,
    retry429Count: c429,
    retryPrompt: prompt,
    xhrIdleTimeout: idleTimeout,
    watchdogPrompt: watchdogPrompt,
    watchdogCount: watchdogCount,
    sendDelayMin: smin,
    sendDelayMax: smax,
    attachDelayMin: amin,
    attachDelayMax: amax,
  });
  if (!ok) {
    showToast('设置保存失败', 3000);
    return;
  }
  state.sendDelayMin = smin;
  state.sendDelayMax = smax;
  showToast('设置已保存', 2500);
  closeSettings();
}

export { openSettings, closeSettings, resetSettings, saveSettings, bindSettingsPanel };
