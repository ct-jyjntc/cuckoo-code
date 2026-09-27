var api = window.shellAPI || {};
var input = document.getElementById('url-input');
var btnBack = document.getElementById('btn-back');
var btnForward = document.getElementById('btn-forward');
var currentUrl = '';

function setBtn(btn, enabled) {
  if (enabled) btn.classList.remove('disabled');
  else btn.classList.add('disabled');
}

if (api.onUrlUpdated) {
  api.onUrlUpdated(function (data) {
    if (!data) return;
    currentUrl = data.url || '';
    if (document.activeElement !== input) input.value = currentUrl;
    setBtn(btnBack, data.canGoBack);
    setBtn(btnForward, data.canGoForward);
    var lock = document.getElementById('lock');
    if (lock) lock.style.color = /^https:/i.test(currentUrl) ? '#5fbf7f' : '#c0a060';
  });
}

input.addEventListener('focus', function () { input.select(); });
input.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') {
    var url = input.value.trim();
    if (!url) return;
    if (!/^[a-z]+:\/\//i.test(url)) url = 'https://' + url;
    if (api.navigate) api.navigate(url);
    input.blur();
  } else if (e.key === 'Escape') {
    input.value = currentUrl;
    input.blur();
  }
});

// 对话 token 显示
function formatTokenCount(n) {
  if (!isFinite(n) || n < 0) return '0';
  if (n >= 100000000) return (n / 100000000).toFixed(2) + '亿';
  if (n >= 10000) return (n / 10000).toFixed(2) + '万';
  return String(Math.round(n));
}
var contextEl = document.getElementById('sb-context');
var cumulativeEl = document.getElementById('sb-cumulative');
var windowEl = document.getElementById('sb-window');
var todayEl = document.getElementById('sb-today');
var systemEl = document.getElementById('sb-system');
if (api.onTokenUpdated) {
  api.onTokenUpdated(function (data) {
    if (!data) return;
    if (contextEl) contextEl.textContent = formatTokenCount(data.context);
    if (cumulativeEl) cumulativeEl.textContent = formatTokenCount(data.cumulative);
    if (windowEl) windowEl.textContent = formatTokenCount(data.windowCumulative);
    if (todayEl) todayEl.textContent = formatTokenCount(data.todayCumulative);
  });
}
// 系统总累计：订阅广播 + 加载时拉取一次
if (api.onTotalUpdated) {
  api.onTotalUpdated(function (data) {
    if (data && systemEl) systemEl.textContent = formatTokenCount(data.systemTotal);
  });
}
if (api.getSystemTotal) {
  api.getSystemTotal().then(function (r) {
    if (r && r.success && systemEl) systemEl.textContent = formatTokenCount(r.systemTotal);
  }).catch(function () {});
}

btnBack.addEventListener('click', function () { if (api.back) api.back(); });
btnForward.addEventListener('click', function () { if (api.forward) api.forward(); });
document.getElementById('btn-reload').addEventListener('click', function () { if (api.reload) api.reload(); });
document.getElementById('btn-home').addEventListener('click', function () { if (api.home) api.home(); });
