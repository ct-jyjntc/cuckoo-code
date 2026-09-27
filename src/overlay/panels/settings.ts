/**
 * 设置弹窗：加载/保存/恢复默认
 * 由 events.ts 拆分而来（P4.5），逻辑保持不变。
 * T7：弹窗按钮的事件绑定（含「刷新技能与代理」）下沉到本模块（bindSettingsPanel）；
 * 自动压缩 → ../auto-compact.js，token 统计 → ../token-counter.js。
 */
import { showToast } from '../panel.js';
import { state } from '../state.js';
import { KEYS, removeKey } from '../storage.js';

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
  document.getElementById('cuckoo-settings-save')?.addEventListener('click', saveSettings);
  document.getElementById('cuckoo-settings-reset')?.addEventListener('click', resetSettings);
  document.getElementById('cuckoo-skills-send')?.addEventListener('click', () => handleSendSkills(sendToChat));
}

/** 打开设置弹窗：从 localStorage 加载配置到输入框 */
function openSettings() {
  function setVal(id: string, v: any) {
    const el = document.getElementById(id);
    if (el) (el as any).value = v;
  }
  // localStorage 存毫秒，UI 显示秒（毫秒/1000）
  const msToSec = (ms: any, dft: any) => {
    const n = parseInt(ms, 10);
    return String(Number.isFinite(n) ? n / 1000 : dft);
  };
  try {
    const en = localStorage.getItem(KEYS.retryEnabled);
    const enEl = document.getElementById('cuckoo-retry-enabled');
    if (enEl) (enEl as any).checked = en === null ? true : en === '1';
    setVal('cuckoo-retry-delay-min', msToSec(localStorage.getItem(KEYS.retryDelayMin) || '4000', 4));
    setVal('cuckoo-retry-delay-max', msToSec(localStorage.getItem(KEYS.retryDelayMax) || '10000', 10));
    setVal('cuckoo-retry-count', localStorage.getItem(KEYS.retryCount) || '10');
    setVal('cuckoo-retry-429-delay', msToSec(localStorage.getItem(KEYS.retry429Delay) || '60000', 60));
    setVal('cuckoo-retry-429-count', localStorage.getItem(KEYS.retry429Count) || '20');
    setVal('cuckoo-retry-prompt', localStorage.getItem(KEYS.retryPrompt) || '刚才的回复似乎中断了，请重新完整回答上一个问题。');
    setVal('cuckoo-xhr-idle-timeout', msToSec(localStorage.getItem(KEYS.xhrIdleTimeout) || '300000', 300));
    setVal('cuckoo-watchdog-prompt', localStorage.getItem(KEYS.watchdogPrompt) || '请继续');
    setVal('cuckoo-watchdog-count', localStorage.getItem(KEYS.watchdogCount) || '3');
    setVal('cuckoo-attach-delay-min', msToSec(localStorage.getItem(KEYS.attachDelayMin) || '500', 0.5));
    setVal('cuckoo-attach-delay-max', msToSec(localStorage.getItem(KEYS.attachDelayMax) || '1000', 1));
  } catch (_) {}
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

/** 恢复默认：删除设置相关 localStorage 键（从 KEYS 显式枚举派生），重置内存 state，刷新弹窗 */
function resetSettings() {
  // 明确枚举要清的 KEYS 成员：只含设置弹窗管理的配置；
  // fabPos / tokenCache 等无关键不在此列，避免误清。
  const RESET_KEYS = [
    KEYS.retryEnabled, KEYS.retryDelayMin, KEYS.retryDelayMax,
    KEYS.retryCount, KEYS.retry429Delay, KEYS.retry429Count,
    KEYS.retryPrompt, KEYS.xhrIdleTimeout, KEYS.watchdogPrompt,
    KEYS.watchdogCount, KEYS.sendDelayMin, KEYS.sendDelayMax,
    KEYS.attachDelayMin, KEYS.attachDelayMax,
  ];
  try {
    for (const k of RESET_KEYS) removeKey(k);
  } catch (_) {}
  state.sendDelayMin = 2000;
  state.sendDelayMax = 4000;
  showToast('已恢复默认设置', 2500);
  openSettings(); // 重新加载默认值到输入框
}

/** 保存设置弹窗的所有配置 */
function saveSettings() {
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
  try {
    localStorage.setItem(KEYS.retryEnabled, (enEl && (enEl as any).checked) ? '1' : '0');
    localStorage.setItem(KEYS.retryDelayMin, String(dmin));
    localStorage.setItem(KEYS.retryDelayMax, String(dmax));
    localStorage.setItem(KEYS.retryCount, String(cnt));
    localStorage.setItem(KEYS.retry429Delay, String(d429));
    localStorage.setItem(KEYS.retry429Count, String(c429));
    localStorage.setItem(KEYS.retryPrompt, prompt);
    localStorage.setItem(KEYS.xhrIdleTimeout, String(idleTimeout));
    localStorage.setItem(KEYS.watchdogPrompt, watchdogPrompt);
    localStorage.setItem(KEYS.watchdogCount, String(watchdogCount));
    localStorage.setItem(KEYS.sendDelayMin, String(smin));
    localStorage.setItem(KEYS.sendDelayMax, String(smax));
    localStorage.setItem(KEYS.attachDelayMin, String(amin));
    localStorage.setItem(KEYS.attachDelayMax, String(amax));
  } catch (_) {}
  state.sendDelayMin = smin;
  state.sendDelayMax = smax;
  showToast('设置已保存', 2500);
  closeSettings();
}

export { openSettings, closeSettings, resetSettings, saveSettings, bindSettingsPanel };
