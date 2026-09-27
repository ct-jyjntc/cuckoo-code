// 等待 preload 注入的 API
async function loadPlatforms() {
  try {
    const res = await window.electronAPI.listProviders();
    const providers = (res && res.success && res.providers) || [];
    const listEl = document.getElementById('platform-list');
    if (!providers.length) {
      listEl.innerHTML = '<div style="color:#8a90b8;font-size:14px;">暂无可用平台</div>';
      return;
    }
    listEl.innerHTML = providers.map(function (p) {
      const actions = p.custom
        ? '<button class="platform-replace" data-id="' + p.id + '" title="替换">↻</button>' +
          '<button class="platform-delete" data-id="' + p.id + '" data-path="' + (p.path || '') + '" title="删除">×</button>'
        : '';
      return '<div class="platform-card" data-id="' + p.id + '">' +
        actions +
        '<div class="platform-logo" data-name="' + p.name + '">' +
          '<img src="logos/' + encodeURIComponent(p.id) + '.svg" alt="' + p.name + ' logo" />' +
        '</div>' +
        '<div class="platform-name">' + p.name + '</div>' +
        '<div class="platform-desc">点击进入</div>' +
      '</div>';
    }).join('') +
    '<div class="platform-card" id="platform-import-card">' +
      '<div class="platform-logo">' +
        '<span style="font-size:28px;color:#6d76ff;line-height:1;">+</span>' +
      '</div>' +
      '<div class="platform-name">导入 Provider</div>' +
      '<div class="platform-desc">选择 JS 文件</div>' +
    '</div>';

    listEl.querySelectorAll('.platform-logo img').forEach(function (img) {
      img.addEventListener('error', function () {
        const container = img.parentElement;
        const name = container.getAttribute('data-name') || '?';
        container.innerHTML = '<span class="logo-fallback">' + name.charAt(0).toUpperCase() + '</span>';
      });
    });

    listEl.querySelectorAll('.platform-card[data-id]').forEach(function (card) {
      card.addEventListener('click', async function () {
        const providerId = card.dataset.id;
        try {
          await window.electronAPI.selectPlatform(providerId);
        } catch (err) {
          // 失败提示
          alert('进入平台失败: ' + (err && err.message ? err.message : err));
        }
      });
    });

    listEl.querySelectorAll('.platform-delete').forEach(function (btn) {
      btn.addEventListener('click', async function (e) {
        e.stopPropagation();
        const filePath = btn.dataset.path;
        const providerId = btn.dataset.id;
        if (!filePath) return;
        if (!confirm('确定删除这个自定义 Provider 吗？')) return;
        try {
          const res = await window.electronAPI.removeProvider(filePath, providerId);
          if (res && res.success) {
            await loadPlatforms();
          } else {
            alert('删除失败: ' + ((res && res.error) || '未知错误'));
          }
        } catch (err) {
          alert('删除失败: ' + (err.message || err));
        }
      });
    });

    listEl.querySelectorAll('.platform-replace').forEach(function (btn) {
      btn.addEventListener('click', async function (e) {
        e.stopPropagation();
        const providerId = btn.dataset.id;
        try {
          const res = await window.electronAPI.replaceProvider(providerId);
          if (res && res.success) {
            alert('替换成功');
            await loadPlatforms();
          } else if (res && res.canceled) {
            // 用户取消，不处理
          } else {
            alert('替换失败: ' + ((res && res.error) || '未知错误'));
          }
        } catch (err) {
          alert('替换失败: ' + (err.message || err));
        }
      });
    });

    const importCard = document.getElementById('platform-import-card');
    if (importCard) {
      importCard.addEventListener('click', async function () {
        try {
          const res = await window.electronAPI.importProvider();
          if (res && res.success) {
            // 导入成功后刷新平台列表
            await loadPlatforms();
          } else if (res && res.canceled) {
            // 用户取消，不处理
          } else {
            alert('导入失败: ' + ((res && res.error) || '未知错误'));
          }
        } catch (err) {
          alert('导入失败: ' + (err.message || err));
        }
      });
    }
  } catch (err) {
    document.getElementById('platform-list').innerHTML =
      '<div style="color:#ff6b7a;font-size:14px;">加载失败: ' + (err && err.message ? err.message : err) + '</div>';
  }
}

// 等 API 就绪
if (window.electronAPI && window.electronAPI.listProviders) {
  loadPlatforms();
} else {
  // preload 可能还没注入完成，稍等再试
  setTimeout(function () {
    if (window.electronAPI && window.electronAPI.listProviders) {
      loadPlatforms();
    } else {
      document.getElementById('platform-list').innerHTML =
        '<div style="color:#ff6b7a;font-size:14px;">API 未就绪，请重启应用</div>';
    }
  }, 500);
}
