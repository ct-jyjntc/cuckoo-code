// 等待 preload 注入的 API
// 安全约束：provider 的 name/id 来自用户导入的 JS 文件（不受信输入），
// 一律经 createElement/textContent 构建，禁止拼 innerHTML。

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function showStatus(message, isError) {
  const listEl = document.getElementById('platform-list');
  listEl.textContent = '';
  listEl.appendChild(el('div', isError ? 'cuckoo-empty error' : 'cuckoo-empty', message));
}

function buildLogoBox(p) {
  const box = el('div', 'platform-logo');
  box.dataset.name = p.name || '';
  const img = document.createElement('img');
  img.src = 'logos/' + encodeURIComponent(p.id) + '.svg';
  img.alt = (p.name || '') + ' logo';
  img.addEventListener('error', function () {
    const name = box.dataset.name || '?';
    box.textContent = '';
    box.appendChild(el('span', 'logo-fallback', name.charAt(0).toUpperCase()));
  });
  box.appendChild(img);
  return box;
}

function buildProviderCard(p) {
  const card = el('div', 'platform-card');
  card.dataset.id = p.id;

  if (p.custom) {
    const replaceBtn = el('button', 'platform-replace', '↻');
    replaceBtn.dataset.id = p.id;
    replaceBtn.title = '替换';
    const deleteBtn = el('button', 'platform-delete', '×');
    deleteBtn.dataset.id = p.id;
    deleteBtn.dataset.path = p.path || '';
    deleteBtn.title = '删除';
    card.appendChild(replaceBtn);
    card.appendChild(deleteBtn);
  }

  card.appendChild(buildLogoBox(p));
  card.appendChild(el('div', 'platform-name', p.name || ''));
  card.appendChild(el('div', 'platform-desc', '点击进入'));
  return card;
}

function buildImportCard() {
  const card = el('div', 'platform-card');
  card.id = 'platform-import-card';
  const logo = el('div', 'platform-logo');
  logo.appendChild(el('span', 'logo-plus', '+'));
  card.appendChild(logo);
  card.appendChild(el('div', 'platform-name', '导入 Provider'));
  card.appendChild(el('div', 'platform-desc', '选择 JS 文件'));
  return card;
}

async function loadPlatforms() {
  try {
    const res = await window.electronAPI.listProviders();
    const providers = (res && res.success && res.providers) || [];
    const listEl = document.getElementById('platform-list');
    if (!providers.length) {
      showStatus('暂无可用平台', false);
      return;
    }
    listEl.textContent = '';
    for (const p of providers) {
      listEl.appendChild(buildProviderCard(p));
    }
    listEl.appendChild(buildImportCard());

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
    showStatus('加载失败: ' + (err && err.message ? err.message : err), true);
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
      showStatus('API 未就绪，请重启应用', true);
    }
  }, 500);
}
