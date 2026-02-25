const API_KEY_STORAGE = 'tilda_flows_api_key';
const API_PROVIDER_STORAGE = 'tilda_flows_api_provider';
const OFFICIAL_API_KEY_STORAGE = 'tilda_flows_official_gemini_api_key';
const AUTHOR_NAME_KEY = 'tilda_flows_author_name';
const AUTHOR_LINK_KEY = 'tilda_flows_author_link';
const BRAND_KNOWLEDGE_KEY = 'tilda_flows_brand_knowledge';
const TONE_OF_VOICE_KEY = 'tilda_flows_tone_of_voice';
const CUSTOM_FOOTER_KEY = 'tilda_flows_custom_footer';
const HISTORY_STORAGE = 'tilda_flows_history';
const INLINE_LOGO_DATA_URL = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#16a34a"/><stop offset="1" stop-color="#22c55e"/>' +
    '</linearGradient></defs>' +
    '<rect x="4" y="4" width="56" height="56" rx="14" fill="url(#g)"/>' +
    '<path d="M20 20h24v6h-9v18h-6V26h-9z" fill="#fff"/>' +
    '<circle cx="47" cy="47" r="6" fill="#fff" fill-opacity="0.92"/>' +
  '</svg>'
);

async function tryLoadCustomLogo() {
  try {
    const url = chrome.runtime.getURL('tilda-kovcheg.png');
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch (_) {
    return null;
  }
}

document.getElementById('save').addEventListener('click', saveKey);
document.getElementById('check').addEventListener('click', checkKey);
document.getElementById('saveAuthor').addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    saveAuthor();
  });
document.getElementById('saveContentSettings').addEventListener('click', saveContentSettings);
document.getElementById('apiKey').addEventListener('input', clearStatus);
document.getElementById('officialApiKey').addEventListener('input', clearStatus);

// Check if on Tilda
chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
  if (tabs && tabs.length > 0) {
    const url = tabs[0].url || '';
    if (!url.includes('tilda.cc') && !url.includes('tilda.ru')) {
      document.getElementById('ctaBanner').classList.add('show');
    }
  }
});

// Tabs logic
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.getAttribute('data-tab')).classList.add('active');
    if (tab.getAttribute('data-tab') === 'tab-history') {
      loadHistory();
    }
  });
});

var apiProviderEl = document.getElementById('apiProvider');
if (apiProviderEl) {
  apiProviderEl.addEventListener('change', function () {
    var isOfficial = this.value === 'official';
    document.getElementById('kieKeyGroup').style.display = isOfficial ? 'none' : 'block';
    document.getElementById('officialKeyGroup').style.display = isOfficial ? 'block' : 'none';
    clearStatus();
  });
}

var logoEl = document.getElementById('headerLogo');
if (logoEl) {
  logoEl.src = INLINE_LOGO_DATA_URL;
  tryLoadCustomLogo().then(function (src) {
    if (src) logoEl.src = src;
  });
}
var openInTab = document.getElementById('openInTab');
if (openInTab) {
  openInTab.addEventListener('click', function (e) {
    e.preventDefault();
    window.open(chrome.runtime.getURL('popup/popup.html'), '_blank', 'noopener');
  });
}
loadSaved();

function loadSaved() {
  chrome.storage.local.get([
    API_KEY_STORAGE, OFFICIAL_API_KEY_STORAGE, API_PROVIDER_STORAGE, 
    AUTHOR_NAME_KEY, AUTHOR_LINK_KEY, 
    BRAND_KNOWLEDGE_KEY, TONE_OF_VOICE_KEY, CUSTOM_FOOTER_KEY
  ], (r) => {
    if (r[API_PROVIDER_STORAGE]) {
      var providerEl = document.getElementById('apiProvider');
      if (providerEl) {
        providerEl.value = r[API_PROVIDER_STORAGE];
        providerEl.dispatchEvent(new Event('change'));
      }
    }
    if (r[API_KEY_STORAGE]) document.getElementById('apiKey').value = r[API_KEY_STORAGE];
    if (r[OFFICIAL_API_KEY_STORAGE]) document.getElementById('officialApiKey').value = r[OFFICIAL_API_KEY_STORAGE];
    if (r[AUTHOR_NAME_KEY]) document.getElementById('authorName').value = r[AUTHOR_NAME_KEY];
    if (r[AUTHOR_LINK_KEY]) document.getElementById('authorLink').value = r[AUTHOR_LINK_KEY];
    
    // New fields
    if (r[BRAND_KNOWLEDGE_KEY]) document.getElementById('brandKnowledge').value = r[BRAND_KNOWLEDGE_KEY];
    if (r[TONE_OF_VOICE_KEY]) document.getElementById('toneOfVoice').value = r[TONE_OF_VOICE_KEY];
    if (r[CUSTOM_FOOTER_KEY]) document.getElementById('customFooter').value = r[CUSTOM_FOOTER_KEY];
  });
}

function saveKey() {
  const provider = document.getElementById('apiProvider').value;
  const key = document.getElementById('apiKey').value.trim();
  const officialKey = document.getElementById('officialApiKey').value.trim();
  
  chrome.storage.local.set({ 
    [API_PROVIDER_STORAGE]: provider,
    [API_KEY_STORAGE]: key,
    [OFFICIAL_API_KEY_STORAGE]: officialKey
  }, () => {
    showStatus('Настройки сохранены.', 'success');
  });
}

function showAuthorToast(message) {
  var existing = document.getElementById('tilda-kovcheg-toast');
  if (existing) existing.remove();
  var toast = document.createElement('div');
  toast.id = 'tilda-kovcheg-toast';
  toast.setAttribute('role', 'alert');
  toast.style.cssText = 'display:block !important; visibility:visible !important; position:fixed !important; top:0 !important; left:0 !important; right:0 !important; z-index:99999 !important; background:#198754 !important; color:#fff !important; padding:12px 16px !important; font-size:14px !important; font-weight:600 !important; text-align:center !important; box-shadow:0 4px 12px rgba(0,0,0,0.2) !important;';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(function () {
    var t = document.getElementById('tilda-kovcheg-toast');
    if (t) t.remove();
  }, 5000);
}

function saveAuthor() {
  const name = document.getElementById('authorName').value.trim();
  const link = document.getElementById('authorLink').value.trim();
  const btn = document.getElementById('saveAuthor');
  const statusEl = document.getElementById('authorStatus');
  if (!btn) return;
  if (statusEl) { statusEl.textContent = ''; statusEl.className = 'status status-author'; }
  btn.disabled = true;
  btn.classList.remove('saved');
  btn.textContent = 'Сохранение…';
  chrome.storage.local.set({
    [AUTHOR_NAME_KEY]: name,
    [AUTHOR_LINK_KEY]: link
  }, function () {
    btn.disabled = false;
    btn.textContent = 'Сохранено ✓';
    btn.classList.add('saved');
    var msg = (name || link) ? 'Автор сохранён. Подставится при «Заполнить всё» на странице поста.' : 'Поля автора очищены.';
    showAuthorToast(msg);
    if (statusEl) {
      statusEl.textContent = msg;
      statusEl.className = 'status status-author show success';
    }
    setTimeout(function () {
      btn.textContent = 'Сохранить автора';
      btn.classList.remove('saved');
      if (statusEl) statusEl.classList.remove('show');
    }, 4000);
  });
}

function saveContentSettings() {
  const brandKnowledge = document.getElementById('brandKnowledge').value.trim();
  const toneOfVoice = document.getElementById('toneOfVoice').value;
  const customFooter = document.getElementById('customFooter').value.trim();
  
  const btn = document.getElementById('saveContentSettings');
  const statusEl = document.getElementById('contentStatus');
  if (!btn) return;
  if (statusEl) { statusEl.textContent = ''; statusEl.className = 'status status-author'; }
  btn.disabled = true;
  btn.classList.remove('saved');
  btn.textContent = 'Сохранение…';
  
  chrome.storage.local.set({
    [BRAND_KNOWLEDGE_KEY]: brandKnowledge,
    [TONE_OF_VOICE_KEY]: toneOfVoice,
    [CUSTOM_FOOTER_KEY]: customFooter
  }, function () {
    btn.disabled = false;
    btn.textContent = 'Сохранено ✓';
    btn.classList.add('saved');
    if (statusEl) {
      statusEl.textContent = 'Настройки контента сохранены.';
      statusEl.className = 'status status-author show success';
    }
    setTimeout(function () {
      btn.textContent = 'Сохранить настройки';
      btn.classList.remove('saved');
      if (statusEl) statusEl.classList.remove('show');
    }, 4000);
  });
}

function loadHistory() {
  const container = document.getElementById('tab-history');
  chrome.storage.local.get([HISTORY_STORAGE], (data) => {
    const list = Array.isArray(data[HISTORY_STORAGE]) ? data[HISTORY_STORAGE] : [];
    if (list.length === 0) {
      container.innerHTML = '<div style="text-align: center; color: #6c757d; margin-top: 20px;">История пуста.<br>Сгенерированные посты появятся здесь.</div>';
      return;
    }
    
    // Sort descending by date
    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    container.innerHTML = list.map(item => {
      const d = new Date(item.date);
      const dateStr = d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU');
      const keywordHtml = item.keyword ? `<span>Ключ: ${item.keyword}</span>` : '';
      const hasImage = item.imageUrl ? `<span style="color:#16a34a">Обложка ✓</span>` : '';
      
      return `
        <div class="history-item">
          <div class="history-date">${dateStr}</div>
          <div class="history-prompt">${item.prompt || 'Без темы'}</div>
          <div class="history-meta">
            ${keywordHtml}
            ${hasImage}
          </div>
          <button class="secondary history-copy" data-prompt="${(item.prompt || '').replace(/"/g, '&quot;')}">Повторить промпт</button>
        </div>
      `;
    }).join('');
    
    // Add listeners for copy buttons
    container.querySelectorAll('.history-copy').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const prompt = e.target.getAttribute('data-prompt');
        navigator.clipboard.writeText(prompt).then(() => {
          const oldTxt = e.target.textContent;
          e.target.textContent = 'Скопировано ✓';
          e.target.classList.add('saved');
          setTimeout(() => {
            e.target.textContent = oldTxt;
            e.target.classList.remove('saved');
          }, 2000);
        });
      });
    });
  });
}

function checkKey() {
  const provider = document.getElementById('apiProvider').value;
  const isOfficial = provider === 'official';
  const key = isOfficial ? document.getElementById('officialApiKey').value.trim() : document.getElementById('apiKey').value.trim();
  
  if (!key) {
    showStatus('Введите API Key и нажмите «Сохранить».', 'error');
    return;
  }
  const btn = document.getElementById('check');
  btn.disabled = true;
  showStatus('Проверка...', 'success');

  const url = isOfficial 
    ? `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${key}`
    : 'https://api.kie.ai/gemini-3-pro/v1/chat/completions';

  const body = isOfficial
    ? JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Say OK' }] }],
        generationConfig: { maxOutputTokens: 5 }
      })
    : JSON.stringify({
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Say OK' }] }],
        stream: false,
        include_thoughts: false
      });

  const headers = { 'Content-Type': 'application/json' };
  if (!isOfficial) headers['Authorization'] = `Bearer ${key}`;

  fetch(url, { method: 'POST', headers, body })
    .then((res) => {
      if (res.ok) showStatus('Ключ действителен.', 'success');
      else return res.text().then((t) => { throw new Error(t || res.status); });
    })
    .catch((err) => showStatus('Ошибка: ' + (err.message || 'сеть или ключ'), 'error'))
    .finally(() => { btn.disabled = false; });
}

function showStatus(text, type) {
  const el = document.getElementById('status');
  el.textContent = text;
  el.className = 'status show ' + type;
}

function clearStatus() {
  document.getElementById('status').classList.remove('show');
}
