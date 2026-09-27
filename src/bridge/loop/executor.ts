/**
 * 工具/JS 脚本执行器（与回复获取方式无关）
 * 拦截模式和 DOM 模式共用的执行逻辑：执行工具调用、执行 JS 脚本、通知 UI。
 */
import { showToast, setTaskStatus, addHistory, truncate, flashBadge, displayCommand, displayResult } from '../../overlay/panel.js';

// 是否正在执行命令或工具
let isExecuting = false;

/**
 * 通知用户检测到 JS 工具脚本（更新预览 + 闪烁徽章）
 */
function notifyJsScriptDetected(code: string): void {
  displayCommand({ command: '[JS 工具脚本]' + String.fromCharCode(10) + code });
  flashBadge('Cuckoo Code - JS 工具脚本检测到');
}

/**
 * 执行检测到的 JS 工具脚本
 */
async function handleJsToolScript(code: string): Promise<{ code: string; result: any }> {
  isExecuting = true;
  notifyJsScriptDetected(code);
  setTaskStatus(true);
  showToast('开始执行命令');

  const callId = 'js_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  console.log('[Cuckoo Code] [诊断] 即将执行的代码(JSON转义): ' + JSON.stringify(code));
  try {
    const result = await window.electronAPI.executeJs(code, callId);

    if (result.success) {
      displayResult('success', result.output || '(脚本执行完成，无输出)');
    } else {
      displayResult('error', result.error || '未知错误');
    }

    addHistory({
      id: callId,
      command: '[JS] ' + truncate((code.split(String.fromCharCode(10))[0] || code), 60),
      success: result.success,
      output: result.success ? (result.output || '') : (result.error || '未知错误'),
      timestamp: Date.now(),
    });

    return { code, result };
  } catch (err: any) {
    console.error('[Cuckoo Code] JS 工具脚本执行异常:', err);
    displayResult('error', err.message || String(err));
    return { code, result: { success: false, error: '系统异常: ' + (err.message || String(err)) } };
  } finally {
    isExecuting = false;
    setTaskStatus(false);
  }
}

export {
  handleJsToolScript,
  notifyJsScriptDetected,
};

