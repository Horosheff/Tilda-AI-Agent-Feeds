(function () {
  'use strict';
  const API_KEY_STORAGE = 'tilda_flows_api_key';
  const WORDSTAT_API_KEY_STORAGE = 'tilda_flows_wordstat_api_key';
  const COVER_PRESETS_STORAGE = 'tilda_flows_cover_presets';
  const COVER_PRESET_LAST_STORAGE = 'tilda_flows_cover_preset_last';
  const TEXT_PRESETS_STORAGE = 'tilda_flows_text_presets';
  const TEXT_PRESET_LAST_STORAGE = 'tilda_flows_text_preset_last';
  const API_PROVIDER_STORAGE = 'tilda_flows_api_provider';
  const OFFICIAL_API_KEY_STORAGE = 'tilda_flows_official_gemini_api_key';
  const BRAND_KNOWLEDGE_KEY = 'tilda_flows_brand_knowledge';
  const TONE_OF_VOICE_KEY = 'tilda_flows_tone_of_voice';
  const CUSTOM_FOOTER_KEY = 'tilda_flows_custom_footer';
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

  const IMAGE_MODEL_PRESETS = {
    'nano-banana-pro': {
      label: 'Nano Banana Pro',
      fields: ['aspect_ratio', 'resolution', 'output_format'],
      defaults: { aspect_ratio: '4:3', resolution: '1K', output_format: 'png' },
      options: {
        aspect_ratio: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9', 'auto'],
        resolution: ['1K', '2K', '4K'],
        output_format: ['png', 'jpg']
      },
      requiresInputUrls: false
    },
    'gemini-3-pro-image-preview': {
      label: 'Gemini 3 Pro Image (Official)',
      fields: ['aspect_ratio', 'resolution'],
      defaults: { aspect_ratio: '4:3', resolution: '1K' },
      options: {
        aspect_ratio: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
        resolution: ['1K', '2K', '4K']
      },
      requiresInputUrls: false // although it supports references, they are not mandatory
    },
    'gpt-image/1.5-image-to-image': {
      label: 'GPT Image 1.5 (Image To Image)',
      fields: ['aspect_ratio', 'quality'],
      defaults: { aspect_ratio: '3:2', quality: 'medium' },
      options: {
        aspect_ratio: ['1:1', '2:3', '3:2'],
        quality: ['medium', 'high']
      },
      requiresInputUrls: true
    },
    'gpt-image/1.5-text-to-image': {
      label: 'GPT Image 1.5 (Text To Image)',
      fields: ['aspect_ratio', 'quality'],
      defaults: { aspect_ratio: '3:2', quality: 'medium' },
      options: {
        aspect_ratio: ['1:1', '2:3', '3:2'],
        quality: ['medium', 'high']
      },
      requiresInputUrls: false
    }
  };
  console.log('[Tilda Kovcheg] content script loaded, frame:', window === window.top ? 'TOP' : 'iframe', 'url:', window.location.href);

  // Инжектируем скрипт в контекст страницы (для перехвата XHR/fetch при сохранении)
  function injectPageScript() {
    if (document.getElementById('__tk-injected')) return;
    try {
      const script = document.createElement('script');
      script.id = '__tk-injected';
      script.src = chrome.runtime.getURL('content/injected.js');
      script.onload = () => {
        console.log('[Tilda Kovcheg] injected.js загружен ✓');
        script.remove();
      };
      (document.head || document.documentElement).appendChild(script);
    } catch (e) {
      console.error('[Tilda Kovcheg] Не удалось загрузить injected.js:', e);
    }
  }

  // Отправляем данные поста в page context (injected.js запомнит их и подставит при сохранении)
  function sendDataToPageContext(d, storage) {
    const authorName = (storage && storage.tilda_flows_author_name) || d.authorName;
    const authorLink = (storage && storage.tilda_flows_author_link) || d.authorLink;
    const payload = {
      body: d.body || '',
      shortDescription: d.shortDescription || '',
      seoTitle: d.seoTitle || '',
      seoDescription: d.seoDescription || '',
      seoKeywords: d.seoKeywords || '',
      fbTitle: d.fbTitle || '',
      fbDescription: d.fbDescription || '',
      slug: d.slug || '',
      authorName: authorName || '',
      authorLink: authorLink || '',
      tags: d.tags || [],
      imageAlt: d.imageAlt || ''
    };
    // Запоминаем последний payload для надёжного автосохранения
    window.__tkLastPublishPayload = payload;
    window.postMessage({
      __tildaKovcheg: 'setData',
      payload: payload
    }, '*');
    console.log('[Tilda Kovcheg] Данные отправлены в page context для XHR-перехвата');
  }

  // В каком фрейме показывать панель: в top — всегда; в iframe — только если есть редактор
  function shouldShowPanelHere() {
    if (window === window.top) {
      const url = window.location.href;
      if (url.includes('tilda.cc') || url.includes('tilda.ru')) {
        const isProjectOrFeed = url.includes('/projects/') || url.includes('/identity/') || url.includes('/page/') || url.includes('/feed/');
        if (!isProjectOrFeed) {
          const banner = document.getElementById('tfe-cta-banner');
          if (banner) banner.style.display = 'block';
        } else {
          const banner = document.getElementById('tfe-cta-banner');
          if (banner) banner.style.display = 'none';
        }
      }
      return true;
    }
    try {
      return !!(
        document.querySelector('.ql-editor') ||
        document.querySelector('input[name="feed_title"]') ||
        document.querySelector('.tte-block-text__editable') ||
        document.querySelector('input[name="title"]')
      );
    } catch (_) { return false; }
  }

  // Панель расширения на странице
  function createPanel() {
    if (!shouldShowPanelHere()) return;
    if (document.getElementById('tilda-flows-extension-root')) return;
    if (!document.body) return;

    const root = document.createElement('div');
    root.id = 'tilda-flows-extension-root';
    const ctaBannerHtml = `
      <div class="tfe-cta-banner" id="tfe-cta-banner" style="display:none; margin: 12px 16px; padding: 16px; background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%); border-radius: 12px; color: #fff; text-align: center; box-shadow: 0 8px 20px rgba(99, 102, 241, 0.25);">
        <div style="font-weight: 700; font-size: 14px; margin-bottom: 6px;">Вы не на странице Тильды</div>
        <div style="font-size: 12px; opacity: 0.9; margin-bottom: 12px; line-height: 1.4;">Агент работает прямо поверх редактора постов Tilda Потоки. Откройте панель управления, чтобы начать работу.</div>
        <a href="https://tilda.cc/login/" target="_blank" style="display: inline-block; background: #fff; color: #6366f1; padding: 8px 16px; border-radius: 8px; font-weight: 600; font-size: 12px; text-decoration: none; transition: transform 0.2s, box-shadow 0.2s;">Перейти в Tilda Потоки</a>
      </div>
    `;

    root.innerHTML = `
      <div class="tfe-collapsed-tab" title="Развернуть">
        <svg class="tfe-cloud-icon" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="tfe-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <linearGradient id="tfe-cloudGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#ffffff"/>
              <stop offset="100%" stop-color="#e2e8f0"/>
            </linearGradient>
          </defs>
          <g filter="url(#tfe-glow)">
            <path class="tfe-cloud-base" d="M32 62 A13 13 0 0 1 32 36 A22 22 0 0 1 70 40 A13 13 0 0 1 66 66 Z" fill="url(#tfe-cloudGrad)"/>
            <path class="tfe-cloud-top" d="M42 48 A12 12 0 0 1 65 48" fill="none" stroke="#f8fafc" stroke-width="3" stroke-linecap="round"/>
          </g>
          <circle class="tfe-particle p1" cx="30" cy="30" r="2" fill="#fff"/>
          <circle class="tfe-particle p2" cx="75" cy="25" r="2.5" fill="#fff"/>
          <circle class="tfe-particle p3" cx="80" cy="60" r="1.5" fill="#fff"/>
          <circle class="tfe-particle p4" cx="20" cy="55" r="1.5" fill="#fff"/>
        </svg>
      </div>
      <div class="tfe-panel">
        <div class="tfe-header">
          <img class="tfe-header-logo" alt="" width="28" height="28">
          <span class="tfe-header-title">TILDA IA AGENT</span>
          <button type="button" class="tfe-header-settings" title="Настройки" aria-label="Настройки">
            <svg class="tfe-icon-gear" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </button>
          <button type="button" class="tfe-header-toggle" aria-label="Свернуть">−</button>
        </div>
        ${ctaBannerHtml}
        <div class="tfe-agent-intro">
          AI-агент для Tilda Потоки: подбирает семантику (Wordstat), генерирует SEO-текст и обложку, затем заполняет поля и публикует.<br>
          <div class="tfe-channel-buttons">
            <a class="tfe-channel-btn" href="https://t.me/maya_pro" target="_blank" rel="noopener">Канал в Telegram</a>
            <a class="tfe-channel-btn tfe-channel-btn-black" href="https://max.ru/maya_pro" target="_blank" rel="noopener">Канал в MAX</a>
          </div>
        </div>
        <div class="tfe-settings">
          <div class="tfe-settings-inner">
            <div class="tfe-section-title tfe-flex-title">Провайдер API</div>
            <select class="tfe-input tfe-api-provider" style="margin-bottom:12px">
              <option value="kie">kie.ai (Default)</option>
              <option value="official">Gemini (Official) — В РФ нужен VPN</option>
            </select>
            
            <div class="tfe-kie-key-group">
              <div class="tfe-section-title tfe-flex-title">
                API ключ
                <div class="tfe-tooltip-wrap">
                  <span class="tfe-info-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg></span>
                  <div class="tfe-tooltip-content">Один ключ для Gemini 3 Pro и Nano Banana Pro.<br><a href="https://kie.ai/dashboard/api" target="_blank" rel="noopener">Получить ключ на kie.ai →</a></div>
                </div>
              </div>
              <input type="password" class="tfe-input tfe-api-key" placeholder="Вставьте ключ kie.ai" autocomplete="new-password" data-lpignore="true" data-1p-ignore="true">
            </div>

            <div class="tfe-official-key-group" style="display:none;">
              <div class="tfe-section-title tfe-flex-title">
                API ключ (Gemini Official)
                <div class="tfe-tooltip-wrap">
                  <span class="tfe-info-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg></span>
                  <div class="tfe-tooltip-content">Один ключ для всех моделей Google AI Studio. <br>Внимание: в РФ может потребоваться VPN.<br><a href="https://aistudio.google.com/" target="_blank" rel="noopener">Получить ключ →</a></div>
                </div>
              </div>
              <input type="password" class="tfe-input tfe-official-api-key" placeholder="Вставьте ключ Google AI Studio" autocomplete="new-password" data-lpignore="true" data-1p-ignore="true">
            </div>
            
            <div class="tfe-section-title tfe-flex-title" style="margin-top:12px">
              Wordstat API
              <div class="tfe-tooltip-wrap">
                <span class="tfe-info-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg></span>
                <div class="tfe-tooltip-content">Если не заполнено — генерация работает в режиме без ключевых слов Wordstat.</div>
              </div>
            </div>
            <input type="password" class="tfe-input tfe-wordstat-api-key" placeholder="OAuth token для api.wordstat.yandex.net" autocomplete="new-password" data-lpignore="true" data-1p-ignore="true">
            
            <div class="tfe-section-title" style="margin-top:14px">Автор по умолчанию</div>
            <div class="tfe-section-title" style="margin-top:14px">Автор по умолчанию</div>
            <label class="tfe-label">Имя автора</label>
            <input type="text" class="tfe-input tfe-author-name" placeholder="Например: Редакция" autocomplete="off" data-lpignore="true" data-1p-ignore="true">
            <label class="tfe-label">Ссылка на страницу автора</label>
            <input type="url" class="tfe-input tfe-author-link" placeholder="https://..." autocomplete="off" data-lpignore="true" data-1p-ignore="true">
            <button type="button" class="tfe-btn primary" data-action="saveSettings"><span>Сохранить настройки</span></button>
            <div class="tfe-settings-status tfe-status"></div>
          </div>
        </div>
        <div class="tfe-section tfe-accordion open" data-acc="text">
          <button type="button" class="tfe-acc-toggle" aria-expanded="true">
            <span class="tfe-acc-title">Текст</span>
            <span class="tfe-acc-chevron">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </span>
          </button>
          <div class="tfe-acc-body">
            <div class="tfe-section-title">Промпт генерации (Инструкции)</div>
            <textarea class="tfe-textarea tfe-prompt" placeholder="Инструкции для нейросети, как писать статью…" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true" style="min-height: 80px; max-height: 400px; resize: vertical; overflow-y: auto;"></textarea>
            
            <label class="tfe-toggle-row" style="margin-top:10px; margin-bottom: 4px;"><input type="checkbox" class="tfe-checkbox tfe-super-prompt" checked> Использовать SUPER-PROMPT SEO/GEO v4 для текста</label>
            
            <div style="display: flex; gap: 8px; margin-bottom: 12px;">
              <div style="flex: 1;">
                <label class="tfe-label" style="margin-top: 0;">Мин. слов</label>
                <input type="number" class="tfe-input tfe-words-min" min="100" max="3000" value="400" placeholder="400">
              </div>
              <div style="flex: 1;">
                <label class="tfe-label" style="margin-top: 0;">Макс. слов (0 — б/л)</label>
                <input type="number" class="tfe-input tfe-words-max" min="0" max="5000" value="0" placeholder="0">
              </div>
            </div>
            
            <div class="tfe-text-presets" style="margin-top: 12px; padding: 12px; background: #f8fafc; border-radius: var(--tk-radius-sm); border: 1px dashed #cbd5e1;">
              <label class="tfe-label">Мой пресет текста</label>
              <div class="tfe-cover-preset-row">
                <select class="tfe-input tfe-text-preset-select">
                  <option value="">Выберите пресет...</option>
                </select>
                <button type="button" class="tfe-btn secondary subdued tfe-text-preset-apply" data-action="applyTextPreset"><span>Применить</span></button>
              </div>
              <div class="tfe-cover-preset-row">
                <input type="text" class="tfe-input tfe-text-preset-name" placeholder="Название пресета">
                <button type="button" class="tfe-btn secondary subdued tfe-text-preset-save" data-action="saveTextPreset"><span>Сохранить</span></button>
              </div>
              <div class="tfe-cover-preset-actions">
                <button type="button" class="tfe-btn ghost subdued tfe-text-preset-delete" data-action="deleteTextPreset"><span>Удалить выбранный</span></button>
              </div>
            </div>
            
            <div class="tfe-section-title" style="margin-top: 14px">Тема или вводная информация</div>
            <textarea class="tfe-textarea tfe-topic-info" placeholder="Тема поста, ключевые слова, факты или исходный текст…" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true" style="min-height: 120px; max-height: 400px; resize: vertical; overflow-y: auto;"></textarea>

            <label class="tfe-label" style="margin-top:10px">Tone of Voice (Тон голоса)</label>
            <select class="tfe-input tfe-tone-of-voice">
              <option value="default">По умолчанию (Экспертный)</option>
              <option value="official">Официальный / Деловой (B2B)</option>
              <option value="friendly">Дружелюбный / Неформальный</option>
              <option value="clickbait">Кликбейт / Желтая пресса</option>
              <option value="educational">Обучающий / Поучительный</option>
              <option value="selling">Продающий / Маркетинговый</option>
            </select>
            
            <label class="tfe-toggle-row" style="margin-top:10px"><input type="checkbox" class="tfe-checkbox tfe-web-search" checked> Web Search (Gemini) — поиск в интернете</label>
          </div>
        </div>
        <div class="tfe-section tfe-accordion" data-acc="knowledge">
          <button type="button" class="tfe-acc-toggle" aria-expanded="false">
            <span class="tfe-acc-title">Локальный RAG</span>
            <span class="tfe-acc-chevron">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </span>
          </button>
          <div class="tfe-acc-body">
            <div class="tfe-section-title tfe-flex-title">
              Знания о компании
              <div class="tfe-tooltip-wrap">
                <span class="tfe-info-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg></span>
                <div class="tfe-tooltip-content">Факты, цены и услуги, чтобы нейросеть не выдумывала лишнего.</div>
              </div>
            </div>
            <textarea class="tfe-textarea tfe-brand-knowledge" placeholder="Например: Наша компания 'Ромашка' основана в 2010 году. Мы продаем стулья по 500 рублей. Контакты: г. Москва..." autocomplete="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true" style="min-height:80px"></textarea>
            
            <div class="tfe-section-title tfe-flex-title" style="margin-top:14px">
              Постоянный подвал (Custom Footer)
              <div class="tfe-tooltip-wrap">
                <span class="tfe-info-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg></span>
                <div class="tfe-tooltip-content">Автоматически добавляется в конец каждой сгенерированной статьи.</div>
              </div>
            </div>
            <textarea class="tfe-textarea tfe-custom-footer" placeholder='Например: <p>Подписывайтесь на наш <a href="https://t.me/ourchannel">Telegram</a></p>' autocomplete="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true" style="min-height:60px"></textarea>
          </div>
        </div>
        <div class="tfe-section tfe-accordion" data-acc="cover">
          <button type="button" class="tfe-acc-toggle" aria-expanded="false">
            <span class="tfe-acc-title">Обложка</span>
            <span class="tfe-acc-chevron">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </span>
          </button>
          <div class="tfe-acc-body">
            <div class="tfe-section-title">Обложка</div>
            <label class="tfe-toggle-row"><input type="checkbox" class="tfe-checkbox tfe-cover-preset" checked> Использовать пресет промпта обложки</label>
            <label class="tfe-label">Модель генерации</label>
            <select class="tfe-input tfe-image-model">
              <option value="nano-banana-pro">Nano Banana Pro</option>
              <option value="gemini-3-pro-image-preview">Gemini 3 Pro Image (Official)</option>
              <option value="gpt-image/1.5-image-to-image">GPT Image 1.5 (Image to Image)</option>
              <option value="gpt-image/1.5-text-to-image">GPT Image 1.5 (Text to Image)</option>
            </select>
            <div class="tfe-image-row tfe-image-row-aspect">
              <label class="tfe-label">Соотношение сторон</label>
              <select class="tfe-input tfe-image-aspect"></select>
            </div>
            <div class="tfe-image-row tfe-image-row-resolution">
              <label class="tfe-label">Разрешение</label>
              <select class="tfe-input tfe-image-resolution"></select>
            </div>
            <div class="tfe-image-row tfe-image-row-format">
              <label class="tfe-label">Формат</label>
              <select class="tfe-input tfe-image-format"></select>
            </div>
            <div class="tfe-image-row tfe-image-row-quality">
              <label class="tfe-label">Качество</label>
              <select class="tfe-input tfe-image-quality"></select>
            </div>
            <label class="tfe-label">Текст на обложке</label>
            <input type="text" class="tfe-input tfe-cover-text" placeholder="Например: AI SEO 2026" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true">
            <textarea class="tfe-textarea tfe-cover-prompt" placeholder="Промпт для обложки (или оставьте пусто — подставится заголовок)" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true"></textarea>
            <div class="tfe-cover-presets">
              <label class="tfe-label">Мой пресет обложки</label>
              <div class="tfe-cover-preset-row">
                <select class="tfe-input tfe-cover-preset-select">
                  <option value="">Выберите пресет...</option>
                </select>
                <button type="button" class="tfe-btn secondary subdued tfe-cover-preset-apply" data-action="applyCoverPreset"><span>Применить</span></button>
              </div>
              <div class="tfe-cover-preset-row">
                <input type="text" class="tfe-input tfe-cover-preset-name" placeholder="Название пресета">
                <button type="button" class="tfe-btn secondary subdued tfe-cover-preset-save" data-action="saveCoverPreset"><span>Сохранить</span></button>
              </div>
              <div class="tfe-cover-preset-actions">
                <button type="button" class="tfe-btn ghost subdued tfe-cover-preset-delete" data-action="deleteCoverPreset"><span>Удалить выбранный</span></button>
              </div>
            </div>
            <div class="tfe-refs" id="tfe-refs"></div>
            <button type="button" class="tfe-btn ghost tfe-add-ref" id="tfe-add-ref" style="width:100%; justify-content:center; margin-top:8px; border:1px dashed #cbd5e1; color:#64748b;"><span>+ Добавить референс (URL изображения)</span></button>
          </div>
        </div>
        <div class="tfe-section tfe-accordion" data-acc="generation">
          <button type="button" class="tfe-acc-toggle" aria-expanded="false">
            <span class="tfe-acc-title">Генерация</span>
            <span class="tfe-acc-chevron">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </span>
          </button>
          <div class="tfe-acc-body">
            <div class="tfe-section-title tfe-flex-title">Настройки генерации</div>
            <label class="tfe-toggle-row"><input type="checkbox" class="tfe-checkbox tfe-seo-geo" checked> SEO/GEO — оптимизация под поиск и геозапросы</label>
            <label class="tfe-toggle-row"><input type="checkbox" class="tfe-checkbox tfe-wordstat-agent" checked> SEO-агент (Wordstat)</label>
            <label class="tfe-label">Глубина Wordstat</label>
            <select class="tfe-input tfe-wordstat-depth">
              <option value="light">Light (3 вызова)</option>
              <option value="pro">Pro (10 вызовов)</option>
            </select>
            <label class="tfe-label">Фраз в ответе Wordstat (numPhrases)</label>
            <input type="number" class="tfe-input tfe-wordstat-num-phrases" min="10" max="2000" value="50" placeholder="50">
            <label class="tfe-label">Geo режим</label>
            <select class="tfe-input tfe-wordstat-geo-mode">
              <option value="ru">RU</option>
              <option value="all">Любой регион</option>
              <option value="custom">Свой регион (ID)</option>
            </select>
            <div class="tfe-wordstat-region-wrap" style="display:none">
              <label class="tfe-label">Выбор региона</label>
              <div class="tfe-wordstat-region-row">
                <select class="tfe-input tfe-wordstat-region-select">
                  <option value="">Выберите регион…</option>
                </select>
                <button type="button" class="tfe-btn ghost subdued tfe-wordstat-region-reload" data-action="reloadWordstatRegions"><span>Обновить</span></button>
              </div>
              <label class="tfe-label">Region ID (через запятую)</label>
              <input type="text" class="tfe-input tfe-wordstat-region-ids" placeholder="Например: 213,2">
            </div>
            <label class="tfe-toggle-row"><input type="checkbox" class="tfe-checkbox tfe-keyword-density-guard" checked> Keyword density guard (анти-переспам)</label>
          </div>
        </div>
        
        <div class="tfe-section tfe-accordion" data-acc="history">
          <button type="button" class="tfe-acc-toggle" aria-expanded="false">
            <span class="tfe-acc-title">История генераций</span>
            <span class="tfe-acc-chevron">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </span>
          </button>
          <div class="tfe-acc-body" style="padding: 0; max-height: 400px; overflow-y: auto;">
            <div id="tfe-history-panel" style="padding: 16px;">История пуста. Сгенерируйте первую статью!</div>
          </div>
        </div>
      </div>
      <div class="tfe-sticky-bottom">
        <div class="tfe-actions">
          <button type="button" class="tfe-btn primary" data-action="fillAllWithCover"><span>Заполнить всё</span></button>
          <button type="button" class="tfe-btn stop subdued" data-action="stopProcess"><span>Стоп</span></button>
        </div>
        <div id="tfe-status" class="tfe-status tfe-status-card">
          <div class="tfe-status-top">
            <span class="tfe-status-label">Статус выполнения</span>
            <div class="tfe-status-meta">
              <span id="tfe-status-eta" class="tfe-status-eta">ETA --</span>
              <span id="tfe-status-percent" class="tfe-status-percent">0%</span>
            </div>
          </div>
          <div class="tfe-progress">
            <div id="tfe-status-bar" class="tfe-progress-fill" style="width:0%"></div>
          </div>
          <div id="tfe-status-msg" class="tfe-status-msg">Готово к запуску</div>
          <div class="tfe-status-skeletons">
            <div class="tfe-skeleton-line"></div>
            <div class="tfe-skeleton-line short"></div>
          </div>
          <div id="tfe-used-keywords" class="tfe-used-keywords"></div>
          <div class="tfe-status-steps">
            <span class="tfe-step" data-step="text">Текст</span>
            <span class="tfe-step" data-step="cover">Обложка</span>
            <span class="tfe-step" data-step="upload">Загрузка</span>
            <span class="tfe-step" data-step="publish">Публикация</span>
          </div>
        </div>
      </div>
    `;

    const toneOfVoiceMap = {
      'default': 'По умолчанию (Экспертный)',
      'official': 'Официальный / Деловой (B2B)',
      'friendly': 'Дружелюбный / Неформальный',
      'clickbait': 'Кликбейт / Желтая пресса',
      'educational': 'Обучающий / Поучительный',
      'selling': 'Продающий / Маркетинговый'
    };

    const historyKey = 'tilda_flows_history';
    
    function renderHistoryPanel() {
      const histEl = root.querySelector('#tfe-history-panel');
      if (!histEl) return;
      chrome.storage.local.get([historyKey], (storage) => {
        const history = (storage && Array.isArray(storage[historyKey])) ? storage[historyKey] : [];
        if (history.length === 0) {
          histEl.innerHTML = '<div style="text-align: center; color: #64748b; margin-top: 20px;">История пуста.<br>Сгенерированные посты появятся здесь.</div>';
          return;
        }
        
        histEl.innerHTML = history.map(item => {
          const d = new Date(item.date);
          const dateStr = d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU');
          const keywordHtml = item.keyword ? `<span style="background: rgba(99, 102, 241, 0.1); color: #6366f1; padding: 2px 6px; border-radius: 4px; font-weight: 600;">Ключ: ${item.keyword}</span>` : '';
          const hasImage = item.imageUrl ? `<span style="background: rgba(22, 163, 74, 0.1); color: #16a34a; padding: 2px 6px; border-radius: 4px; font-weight: 600;">Обложка ✓</span>` : '';
          
          return `
            <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
              <div style="font-size: 10px; color: #94a3b8; margin-bottom: 4px;">${dateStr}</div>
              <div style="font-weight: 600; font-size: 13px; margin-bottom: 4px; color: #1e293b; line-height: 1.4;">Промпт: ${item.prompt || 'Без промпта'}</div>
              <div style="font-weight: 400; font-size: 12px; margin-bottom: 8px; color: #475569; line-height: 1.4; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">Тема/Инфо: ${item.topicInfo || 'Без темы'}</div>
              <div style="font-size: 11px; display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px;">
                ${keywordHtml}
                ${hasImage}
              </div>
              <div style="display:flex; gap:8px;">
                <button type="button" class="tfe-btn secondary subdued tfe-history-copy" data-type="prompt" data-content="${(item.prompt || '').replace(/"/g, '&quot;')}"><span>Копировать промпт</span></button>
                <button type="button" class="tfe-btn secondary subdued tfe-history-copy" data-type="topic" data-content="${(item.topicInfo || '').replace(/"/g, '&quot;')}"><span>Копировать инфо</span></button>
              </div>
            </div>
          `;
        }).join('');
        
        histEl.querySelectorAll('.tfe-history-copy').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const content = e.currentTarget.getAttribute('data-content');
            const type = e.currentTarget.getAttribute('data-type');
            navigator.clipboard.writeText(content).then(() => {
              const span = e.currentTarget.querySelector('span');
              const oldTxt = span.textContent;
              span.textContent = 'Скопировано ✓';
              e.currentTarget.style.background = '#dcfce7';
              e.currentTarget.style.color = '#166534';
              e.currentTarget.style.borderColor = '#bbf7d0';
              
              // If user clicks "copy prompt/topic", we can optionally paste it into the respective field
              const root = document.getElementById('tilda-flows-extension-root');
              if (root) {
                if (type === 'prompt') {
                  const promptEl = root.querySelector('.tfe-prompt');
                  if (promptEl) promptEl.value = content;
                } else if (type === 'topic') {
                  const topicEl = root.querySelector('.tfe-topic-info');
                  if (topicEl) topicEl.value = content;
                }
              }

              setTimeout(() => {
                span.textContent = oldTxt;
                e.currentTarget.style.background = '';
                e.currentTarget.style.color = '';
                e.currentTarget.style.borderColor = '';
              }, 2000);
            });
          });
        });
      });
    }

    // History accordion toggle logic
    const historyAccToggle = root.querySelector('.tfe-section[data-acc="history"] .tfe-acc-toggle');
    if (historyAccToggle) {
      historyAccToggle.addEventListener('click', () => {
        // Render history only when the accordion is opened
        if (historyAccToggle.getAttribute('aria-expanded') === 'false') {
          renderHistoryPanel();
        }
      });
    }

    const toggleBtn = root.querySelector('.tfe-header-toggle');
    if (toggleBtn) toggleBtn.addEventListener('click', function () { 
      root.classList.add('collapsed'); 
      try { chrome.storage.local.set({ tilda_flows_panel_collapsed: true }); } catch (e) {}
    });
    const collapsedTab = root.querySelector('.tfe-collapsed-tab');
    if (collapsedTab) collapsedTab.addEventListener('click', function () { 
      root.classList.remove('collapsed'); 
      try { chrome.storage.local.set({ tilda_flows_panel_collapsed: false }); } catch (e) {}
    });

    const settingsBtn = root.querySelector('.tfe-header-settings');
    const settingsEl = root.querySelector('.tfe-settings');
    if (settingsBtn && settingsEl) {
      settingsBtn.addEventListener('click', function () {
        const isOpen = settingsEl.classList.contains('tfe-settings-open');
        if (isOpen) {
          settingsEl.classList.remove('tfe-settings-open');
          settingsBtn.classList.remove('active');
        } else {
          settingsEl.classList.add('tfe-settings-open');
          settingsBtn.classList.add('active');
        }
      });
    }

    const saveSettingsBtn = root.querySelector('[data-action="saveSettings"]');
    if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', onSaveSettings);

    var btnFillAll = root.querySelector('[data-action="fillAllWithCover"]');
    if (btnFillAll) btnFillAll.addEventListener('click', onFillAllWithCover);
    var btnStop = root.querySelector('[data-action="stopProcess"]');
    if (btnStop) btnStop.addEventListener('click', onStopProcess);
    var addRefBtn = root.querySelector('#tfe-add-ref');
    if (addRefBtn) addRefBtn.addEventListener('click', addReferenceRow);
    
    var apiProviderEl = root.querySelector('.tfe-api-provider');
    var imageModelEl = root.querySelector('.tfe-image-model');
    
    if (apiProviderEl) {
      apiProviderEl.addEventListener('change', function () {
        var isOfficial = this.value === 'official';
        var kieGroup = root.querySelector('.tfe-kie-key-group');
        var offGroup = root.querySelector('.tfe-official-key-group');
        if (kieGroup) kieGroup.style.display = isOfficial ? 'none' : 'block';
        if (offGroup) offGroup.style.display = isOfficial ? 'block' : 'none';
        
        // Автоматически переключаем модель генерации обложки
        if (imageModelEl) {
          if (isOfficial) {
            imageModelEl.value = 'gemini-3-pro-image-preview';
          } else {
            imageModelEl.value = 'nano-banana-pro';
          }
          syncImageModelFields();
        }
      });
    }

    if (imageModelEl) imageModelEl.addEventListener('change', syncImageModelFields);
    var wordstatGeoModeEl = root.querySelector('.tfe-wordstat-geo-mode');
    if (wordstatGeoModeEl) wordstatGeoModeEl.addEventListener('change', syncWordstatUiFields);
    var wordstatRegionSelectEl = root.querySelector('.tfe-wordstat-region-select');
    if (wordstatRegionSelectEl) wordstatRegionSelectEl.addEventListener('change', onWordstatRegionSelectChange);
    var reloadRegionsBtn = root.querySelector('[data-action="reloadWordstatRegions"]');
    if (reloadRegionsBtn) reloadRegionsBtn.addEventListener('click', () => loadWordstatRegionsForUi(true));
    var saveTextPresetBtn = root.querySelector('[data-action="saveTextPreset"]');
    if (saveTextPresetBtn) saveTextPresetBtn.addEventListener('click', onSaveTextPreset);
    var applyTextPresetBtn = root.querySelector('[data-action="applyTextPreset"]');
    if (applyTextPresetBtn) applyTextPresetBtn.addEventListener('click', onApplyTextPreset);
    var deleteTextPresetBtn = root.querySelector('[data-action="deleteTextPreset"]');
    if (deleteTextPresetBtn) deleteTextPresetBtn.addEventListener('click', onDeleteTextPreset);

    var saveCoverPresetBtn = root.querySelector('[data-action="saveCoverPreset"]');
    if (saveCoverPresetBtn) saveCoverPresetBtn.addEventListener('click', onSaveCoverPreset);
    var applyCoverPresetBtn = root.querySelector('[data-action="applyCoverPreset"]');
    if (applyCoverPresetBtn) applyCoverPresetBtn.addEventListener('click', onApplyCoverPreset);
    var deleteCoverPresetBtn = root.querySelector('[data-action="deleteCoverPreset"]');
    if (deleteCoverPresetBtn) deleteCoverPresetBtn.addEventListener('click', onDeleteCoverPreset);

    var logo = root.querySelector('.tfe-header-logo');
    if (logo) {
      function handleLogoError() {
        if(logo) { logo.removeEventListener('error', handleLogoError); logo.src = INLINE_LOGO_DATA_URL; }
      }
      logo.addEventListener('error', handleLogoError);
      
      const logoUrl = chrome.runtime.getURL('tilda-kovcheg.png');
      logo.src = logoUrl;
    }
    document.body.appendChild(root);
    hardenAgainstAutofill(root);
    setupAccordions(root);
    
    // Ripple Effect
    function createRipple(event) {
      const button = event.currentTarget;
      const ripple = document.createElement('span');
      const rect = button.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = event.clientX - rect.left - size / 2;
      const y = event.clientY - rect.top - size / 2;
      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${x}px`;
      ripple.style.top = `${y}px`;
      ripple.classList.add('tfe-ripple-effect');
      button.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    }
    root.querySelectorAll('.tfe-btn, .tfe-acc-toggle, .tfe-collapsed-tab').forEach(btn => {
      btn.addEventListener('mousedown', createRipple);
    });

    addReferenceRow();
    syncImageModelFields();
    syncWordstatUiFields();
    loadCoverPresets();
    loadTextPresets();
    renderUsedKeywords({ enabled: false, reason: 'awaiting_run' });

    // Загружаем сохранённые настройки в панель
    chrome.storage.local.get([API_KEY_STORAGE, OFFICIAL_API_KEY_STORAGE, API_PROVIDER_STORAGE, WORDSTAT_API_KEY_STORAGE, 'tilda_flows_author_name', 'tilda_flows_author_link', COVER_PRESET_LAST_STORAGE, TONE_OF_VOICE_KEY, BRAND_KNOWLEDGE_KEY, CUSTOM_FOOTER_KEY, 'tilda_flows_panel_collapsed'], function (data) {
      if (data.tilda_flows_panel_collapsed) {
        root.classList.add('collapsed');
      }

      var providerEl = root.querySelector('.tfe-api-provider');
      var apiKeyEl = root.querySelector('.tfe-api-key');
      var officialKeyEl = root.querySelector('.tfe-official-api-key');
      var wordstatApiKeyEl = root.querySelector('.tfe-wordstat-api-key');
      var authorNameEl = root.querySelector('.tfe-author-name');
      var authorLinkEl = root.querySelector('.tfe-author-link');
      var toneOfVoiceEl = root.querySelector('.tfe-tone-of-voice');
      var brandKnowledgeEl = root.querySelector('.tfe-brand-knowledge');
      var customFooterEl = root.querySelector('.tfe-custom-footer');
      
      if (providerEl && data[API_PROVIDER_STORAGE]) {
        providerEl.value = data[API_PROVIDER_STORAGE];
        providerEl.dispatchEvent(new Event('change'));
      }
      if (apiKeyEl && data[API_KEY_STORAGE]) apiKeyEl.value = data[API_KEY_STORAGE];
      if (officialKeyEl && data[OFFICIAL_API_KEY_STORAGE]) officialKeyEl.value = data[OFFICIAL_API_KEY_STORAGE];
      if (wordstatApiKeyEl && data[WORDSTAT_API_KEY_STORAGE]) wordstatApiKeyEl.value = data[WORDSTAT_API_KEY_STORAGE];
      if (authorNameEl && data.tilda_flows_author_name) authorNameEl.value = data.tilda_flows_author_name;
      if (authorLinkEl && data.tilda_flows_author_link) authorLinkEl.value = data.tilda_flows_author_link;
      if (toneOfVoiceEl && data[TONE_OF_VOICE_KEY]) toneOfVoiceEl.value = data[TONE_OF_VOICE_KEY];
      if (brandKnowledgeEl && data[BRAND_KNOWLEDGE_KEY]) brandKnowledgeEl.value = data[BRAND_KNOWLEDGE_KEY];
      if (customFooterEl && data[CUSTOM_FOOTER_KEY]) customFooterEl.value = data[CUSTOM_FOOTER_KEY];
      
      const presetSelectEl = root.querySelector('.tfe-cover-preset-select');
      if (presetSelectEl && data[COVER_PRESET_LAST_STORAGE]) presetSelectEl.value = data[COVER_PRESET_LAST_STORAGE];
      // Если ни одного ключа не задано — открываем настройки автоматически
      if (!data[API_KEY_STORAGE] && !data[OFFICIAL_API_KEY_STORAGE] && settingsEl) {
        settingsEl.classList.add('tfe-settings-open');
        if (settingsBtn) settingsBtn.classList.add('active');
      }
    });

    console.log('[Tilda Kovcheg] panel created');
    observePanelRemoval();
  }

  function observePanelRemoval() {
    var root = document.getElementById('tilda-flows-extension-root');
    if (!root || !root.parentNode) return;
    var observer = new MutationObserver(function (mutations) {
      if (!document.getElementById('tilda-flows-extension-root')) {
        observer.disconnect();
        tryCreatePanel();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function addReferenceRow() {
    const container = document.getElementById('tfe-refs');
    if (!container) return;
    const max = 14;
    if (container.querySelectorAll('.tfe-ref-row').length >= max) {
      setStatus(`Максимум ${max} референсов`, 'error');
      return;
    }
    const row = document.createElement('div');
    row.className = 'tfe-ref-row';
    row.innerHTML = `
      <div style="flex:1; display:flex; flex-direction:column; gap:6px;">
        <input type="url" class="tfe-input tfe-ref-url" placeholder="https://… ссылка на изображение">
        <div style="display:flex; align-items:center; gap:8px;">
          <label class="tfe-btn ghost tfe-ref-file-label" style="flex:1; justify-content:center; font-size:12px; padding:0 8px; height:28px; border:1px dashed #cbd5e1; color:#64748b; font-weight:normal; cursor:pointer;">
            <span class="tfe-ref-file-name">...или выбрать локальный файл</span>
            <input type="file" accept="image/jpeg, image/png, image/webp" class="tfe-ref-file" style="display:none;">
          </label>
          <input type="hidden" class="tfe-ref-base64">
        </div>
      </div>
      <button type="button" class="tfe-ref-remove" aria-label="Удалить">×</button>
    `;
    
    const fileInput = row.querySelector('.tfe-ref-file');
    const base64Input = row.querySelector('.tfe-ref-base64');
    const fileNameSpan = row.querySelector('.tfe-ref-file-name');
    
    fileInput.addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (!file) {
        base64Input.value = '';
        fileNameSpan.textContent = '...или выбрать локальный файл';
        return;
      }
      fileNameSpan.textContent = file.name;
      const reader = new FileReader();
      reader.onload = function(event) {
        base64Input.value = event.target.result;
      };
      reader.readAsDataURL(file);
    });

    row.querySelector('.tfe-ref-remove').addEventListener('click', () => row.remove());
    container.appendChild(row);
  }

  function setupAccordions(root) {
    if (!root || !root.querySelectorAll) return;
    const sections = root.querySelectorAll('.tfe-accordion');
    sections.forEach((section) => {
      const toggle = section.querySelector('.tfe-acc-toggle');
      if (!toggle) return;
      toggle.addEventListener('click', () => {
        const isOpen = section.classList.contains('open');
        sections.forEach((s) => {
          s.classList.remove('open');
          const t = s.querySelector('.tfe-acc-toggle');
          if (t) t.setAttribute('aria-expanded', 'false');
        });
        if (!isOpen) {
          section.classList.add('open');
          toggle.setAttribute('aria-expanded', 'true');
        }
      });
    });
  }

  function hardenAgainstAutofill(root) {
    if (!root || !root.querySelectorAll) return;
    const controls = root.querySelectorAll('input, textarea, select');
    controls.forEach((el, i) => {
      if (!el) return;
      const cls = (el.className || '').toString();
      const isPrompt = /\btfe-prompt\b/.test(cls) || /\btfe-cover-prompt\b/.test(cls);
      const isApi = /\btfe-api-key\b/.test(cls);
      const tag = (el.tagName || '').toLowerCase();
      const inputType = String(el.getAttribute('type') || '').toLowerCase();
      if (isApi) {
        el.setAttribute('autocomplete', 'new-password');
      } else {
        el.setAttribute('autocomplete', 'off');
      }
      if (isPrompt) {
        // Unique name minimizes browser profile autofill (email/login) in prompt fields.
        el.setAttribute('name', 'tk_prompt_' + i + '_' + Date.now());
        el.setAttribute('autocorrect', 'off');
        el.setAttribute('autocapitalize', 'off');
        el.setAttribute('spellcheck', 'false');
      }
      el.setAttribute('data-lpignore', 'true');
      el.setAttribute('data-1p-ignore', 'true');

      // Auto-resize for textarea
      if (tag === 'textarea') {
        const resizeTextarea = function () {
          el.style.height = 'auto';
          el.style.height = (el.scrollHeight) + 'px';
        };
        el.addEventListener('input', resizeTextarea);
        setTimeout(resizeTextarea, 100); // Initial resize
      }

      // Keyboard shortcuts for prompts (Cmd/Ctrl + Enter)
      if (isPrompt) {
        el.addEventListener('keydown', function(e) {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            const btnFillAll = root.querySelector('[data-action="fillAllWithCover"]');
            if (btnFillAll && !btnFillAll.disabled) {
              btnFillAll.click();
            }
          }
        });
      }

      // Strong anti-autofill guard: keep text controls readonly until real user focus.
      const isTextControl =
        tag === 'textarea' ||
        (tag === 'input' && ['text', 'search', 'email', 'url', 'tel', 'password', ''].indexOf(inputType) !== -1);
      if (isTextControl) {
        el.setAttribute('readonly', 'readonly');
        const unlock = function () {
          el.removeAttribute('readonly');
          el.removeEventListener('focus', unlock, true);
          el.removeEventListener('pointerdown', unlock, true);
          el.removeEventListener('keydown', unlock, true);
        };
        el.addEventListener('focus', unlock, true);
        el.addEventListener('pointerdown', unlock, true);
        el.addEventListener('keydown', unlock, true);
      }
    });
  }

  function normalizePresetName(name) {
    return String(name || '').trim().slice(0, 60);
  }

  function updateCoverPresetSelect(list, selectedName) {
    const root = document.getElementById('tilda-flows-extension-root');
    if (!root) return;
    const selectEl = root.querySelector('.tfe-cover-preset-select');
    if (!selectEl) return;
    selectEl.innerHTML = '<option value="">Выберите пресет...</option>';
    (Array.isArray(list) ? list : []).forEach((p) => {
      if (!p || !p.name) return;
      const opt = document.createElement('option');
      opt.value = p.name;
      opt.textContent = p.name;
      selectEl.appendChild(opt);
    });
    if (selectedName) selectEl.value = selectedName;
  }

  function loadCoverPresets() {
    chrome.storage.local.get([COVER_PRESETS_STORAGE, COVER_PRESET_LAST_STORAGE], (data) => {
      const presets = Array.isArray(data[COVER_PRESETS_STORAGE]) ? data[COVER_PRESETS_STORAGE] : [];
      updateCoverPresetSelect(presets, data[COVER_PRESET_LAST_STORAGE] || '');
    });
  }

  function readCoverPresetDraft() {
    const root = document.getElementById('tilda-flows-extension-root');
    if (!root) return null;
    const coverPrompt = ((root.querySelector('.tfe-cover-prompt') || {}).value || '').trim();
    const coverText = ((root.querySelector('.tfe-cover-text') || {}).value || '').trim();
    const model = ((root.querySelector('.tfe-image-model') || {}).value || 'nano-banana-pro').trim();
    const presetCb = root.querySelector('.tfe-cover-preset');
    const useCoverPreset = presetCb ? !!presetCb.checked : true;
    const aspect_ratio = ((root.querySelector('.tfe-image-aspect') || {}).value || '').trim();
    const resolution = ((root.querySelector('.tfe-image-resolution') || {}).value || '').trim();
    const output_format = ((root.querySelector('.tfe-image-format') || {}).value || '').trim();
    const quality = ((root.querySelector('.tfe-image-quality') || {}).value || '').trim();
    return {
      coverPrompt,
      coverText,
      model,
      useCoverPreset,
      aspect_ratio,
      resolution,
      output_format,
      quality
    };
  }

  function onSaveCoverPreset() {
    const root = document.getElementById('tilda-flows-extension-root');
    if (!root) return;
    const nameEl = root.querySelector('.tfe-cover-preset-name');
    const name = normalizePresetName((nameEl && nameEl.value) || '');
    if (!name) {
      setStatus('Укажите название пресета обложки.', 'error');
      return;
    }
    const draft = readCoverPresetDraft();
    chrome.storage.local.get([COVER_PRESETS_STORAGE], (data) => {
      const list = Array.isArray(data[COVER_PRESETS_STORAGE]) ? data[COVER_PRESETS_STORAGE] : [];
      const next = list.filter((p) => p && p.name !== name);
      next.push({ name, ...draft });
      chrome.storage.local.set({
        [COVER_PRESETS_STORAGE]: next,
        [COVER_PRESET_LAST_STORAGE]: name
      }, () => {
        updateCoverPresetSelect(next, name);
        if (nameEl) nameEl.value = '';
        setStatus('Пресет обложки сохранён: ' + name, 'success', { step: 'cover', percent: 14 });
      });
    });
  }

  function onApplyCoverPreset() {
    const root = document.getElementById('tilda-flows-extension-root');
    if (!root) return;
    const selectEl = root.querySelector('.tfe-cover-preset-select');
    const name = normalizePresetName((selectEl && selectEl.value) || '');
    if (!name) {
      setStatus('Выберите пресет для применения.', 'error');
      return;
    }
    chrome.storage.local.get([COVER_PRESETS_STORAGE], (data) => {
      const list = Array.isArray(data[COVER_PRESETS_STORAGE]) ? data[COVER_PRESETS_STORAGE] : [];
      const preset = list.find((p) => p && p.name === name);
      if (!preset) {
        setStatus('Пресет не найден (возможно удалён).', 'error');
        return;
      }
      const modelEl = root.querySelector('.tfe-image-model');
      if (modelEl && preset.model) modelEl.value = preset.model;
      syncImageModelFields();
      const coverPromptEl = root.querySelector('.tfe-cover-prompt');
      if (coverPromptEl) coverPromptEl.value = preset.coverPrompt || '';
      const coverTextEl = root.querySelector('.tfe-cover-text');
      if (coverTextEl) coverTextEl.value = preset.coverText || '';
      const presetCb = root.querySelector('.tfe-cover-preset');
      if (presetCb) presetCb.checked = preset.useCoverPreset !== false;
      const aspectEl = root.querySelector('.tfe-image-aspect');
      const resEl = root.querySelector('.tfe-image-resolution');
      const formatEl = root.querySelector('.tfe-image-format');
      const qualityEl = root.querySelector('.tfe-image-quality');
      if (aspectEl && preset.aspect_ratio) aspectEl.value = preset.aspect_ratio;
      if (resEl && preset.resolution) resEl.value = preset.resolution;
      if (formatEl && preset.output_format) formatEl.value = preset.output_format;
      if (qualityEl && preset.quality) qualityEl.value = preset.quality;
      chrome.storage.local.set({ [COVER_PRESET_LAST_STORAGE]: name });
      setStatus('Пресет применён: ' + name, 'success', { step: 'cover', percent: 18 });
    });
  }

  function onDeleteCoverPreset() {
    const root = document.getElementById('tilda-flows-extension-root');
    if (!root) return;
    const selectEl = root.querySelector('.tfe-cover-preset-select');
    const name = normalizePresetName((selectEl && selectEl.value) || '');
    if (!name) {
      setStatus('Выберите пресет для удаления.', 'error');
      return;
    }
    chrome.storage.local.get([COVER_PRESETS_STORAGE], (data) => {
      const list = Array.isArray(data[COVER_PRESETS_STORAGE]) ? data[COVER_PRESETS_STORAGE] : [];
      const next = list.filter((p) => p && p.name !== name);
      chrome.storage.local.set({
        [COVER_PRESETS_STORAGE]: next,
        [COVER_PRESET_LAST_STORAGE]: ''
      }, () => {
        updateCoverPresetSelect(next, '');
        setStatus('Пресет удалён: ' + name, 'success', { step: 'cover', percent: 10 });
      });
    });
  }

  function updateTextPresetSelect(list, selectedName) {
    const root = document.getElementById('tilda-flows-extension-root');
    if (!root) return;
    const selectEl = root.querySelector('.tfe-text-preset-select');
    if (!selectEl) return;
    selectEl.innerHTML = '<option value="">Выберите пресет...</option>';
    (Array.isArray(list) ? list : []).forEach((p) => {
      if (!p || !p.name) return;
      const opt = document.createElement('option');
      opt.value = p.name;
      opt.textContent = p.name;
      selectEl.appendChild(opt);
    });
    if (selectedName) selectEl.value = selectedName;
  }

  function loadTextPresets() {
    chrome.storage.local.get([TEXT_PRESETS_STORAGE, TEXT_PRESET_LAST_STORAGE], (data) => {
      const presets = Array.isArray(data[TEXT_PRESETS_STORAGE]) ? data[TEXT_PRESETS_STORAGE] : [];
      updateTextPresetSelect(presets, data[TEXT_PRESET_LAST_STORAGE] || '');
    });
  }

  function readTextPresetDraft() {
    const root = document.getElementById('tilda-flows-extension-root');
    if (!root) return null;
    const prompt = ((root.querySelector('.tfe-prompt') || {}).value || '').trim();
    const toneOfVoice = ((root.querySelector('.tfe-tone-of-voice') || {}).value || 'default').trim();
    const webSearch = (root.querySelector('.tfe-web-search') || {}).checked !== false;
    const useSuperPrompt = (root.querySelector('.tfe-super-prompt') || {}).checked !== false;
    const wordsMin = ((root.querySelector('.tfe-words-min') || {}).value || '400').trim();
    const wordsMax = ((root.querySelector('.tfe-words-max') || {}).value || '0').trim();
    return {
      prompt,
      toneOfVoice,
      webSearch,
      useSuperPrompt,
      wordsMin,
      wordsMax
    };
  }

  function onSaveTextPreset() {
    const root = document.getElementById('tilda-flows-extension-root');
    if (!root) return;
    const nameEl = root.querySelector('.tfe-text-preset-name');
    const name = normalizePresetName((nameEl && nameEl.value) || '');
    if (!name) {
      setStatus('Укажите название пресета текста.', 'error');
      return;
    }
    const draft = readTextPresetDraft();
    chrome.storage.local.get([TEXT_PRESETS_STORAGE], (data) => {
      const list = Array.isArray(data[TEXT_PRESETS_STORAGE]) ? data[TEXT_PRESETS_STORAGE] : [];
      const next = list.filter((p) => p && p.name !== name);
      next.push({ name, ...draft });
      chrome.storage.local.set({
        [TEXT_PRESETS_STORAGE]: next,
        [TEXT_PRESET_LAST_STORAGE]: name
      }, () => {
        updateTextPresetSelect(next, name);
        if (nameEl) nameEl.value = '';
        setStatus('Пресет текста сохранён: ' + name, 'success', { step: 'generate', percent: 14 });
      });
    });
  }

  function onApplyTextPreset() {
    const root = document.getElementById('tilda-flows-extension-root');
    if (!root) return;
    const selectEl = root.querySelector('.tfe-text-preset-select');
    const name = normalizePresetName((selectEl && selectEl.value) || '');
    if (!name) {
      setStatus('Выберите пресет для применения.', 'error');
      return;
    }
    chrome.storage.local.get([TEXT_PRESETS_STORAGE], (data) => {
      const list = Array.isArray(data[TEXT_PRESETS_STORAGE]) ? data[TEXT_PRESETS_STORAGE] : [];
      const preset = list.find((p) => p && p.name === name);
      if (!preset) {
        setStatus('Пресет не найден (возможно удалён).', 'error');
        return;
      }
      
      const promptEl = root.querySelector('.tfe-prompt');
      if (promptEl) promptEl.value = preset.prompt || '';
      
      const toneOfVoiceEl = root.querySelector('.tfe-tone-of-voice');
      if (toneOfVoiceEl && preset.toneOfVoice) toneOfVoiceEl.value = preset.toneOfVoice;
      
      const webSearchCb = root.querySelector('.tfe-web-search');
      if (webSearchCb) webSearchCb.checked = preset.webSearch !== false;
      
      const superPromptCb = root.querySelector('.tfe-super-prompt');
      if (superPromptCb) superPromptCb.checked = preset.useSuperPrompt !== false;
      
      const wordsMinEl = root.querySelector('.tfe-words-min');
      if (wordsMinEl && preset.wordsMin !== undefined) wordsMinEl.value = preset.wordsMin;
      
      const wordsMaxEl = root.querySelector('.tfe-words-max');
      if (wordsMaxEl && preset.wordsMax !== undefined) wordsMaxEl.value = preset.wordsMax;
      
      chrome.storage.local.set({ [TEXT_PRESET_LAST_STORAGE]: name });
      setStatus('Пресет применён: ' + name, 'success', { step: 'generate', percent: 18 });
    });
  }

  function onDeleteTextPreset() {
    const root = document.getElementById('tilda-flows-extension-root');
    if (!root) return;
    const selectEl = root.querySelector('.tfe-text-preset-select');
    const name = normalizePresetName((selectEl && selectEl.value) || '');
    if (!name) {
      setStatus('Выберите пресет для удаления.', 'error');
      return;
    }
    chrome.storage.local.get([TEXT_PRESETS_STORAGE], (data) => {
      const list = Array.isArray(data[TEXT_PRESETS_STORAGE]) ? data[TEXT_PRESETS_STORAGE] : [];
      const next = list.filter((p) => p && p.name !== name);
      chrome.storage.local.set({
        [TEXT_PRESETS_STORAGE]: next,
        [TEXT_PRESET_LAST_STORAGE]: ''
      }, () => {
        updateTextPresetSelect(next, '');
        setStatus('Пресет удалён: ' + name, 'success', { step: 'generate', percent: 10 });
      });
    });
  }

  function getPrompt() {
    const el = document.querySelector('#tilda-flows-extension-root .tfe-prompt');
    return (el && el.value.trim()) || '';
  }

  function getTopicInfo() {
    const el = document.querySelector('#tilda-flows-extension-root .tfe-topic-info');
    return (el && el.value.trim()) || '';
  }

  function getCoverPrompt() {
    const el = document.querySelector('#tilda-flows-extension-root .tfe-cover-prompt');
    return (el && el.value.trim()) || '';
  }

  function getCoverText() {
    const el = document.querySelector('#tilda-flows-extension-root .tfe-cover-text');
    return (el && el.value.trim()) || '';
  }

  function getReferenceUrls() {
    const rows = document.querySelectorAll('#tilda-flows-extension-root .tfe-ref-row');
    const results = [];
    rows.forEach((row) => {
      const base64Inp = row.querySelector('.tfe-ref-base64');
      const urlInp = row.querySelector('.tfe-ref-url');
      if (base64Inp && base64Inp.value) {
        results.push(base64Inp.value);
      } else if (urlInp) {
        const v = (urlInp.value || '').trim();
        if (v && /^https?:\/\//i.test(v)) results.push(v);
      }
    });
    return results;
  }

  function setSelectOptions(selectEl, values, selectedValue) {
    if (!selectEl) return;
    selectEl.innerHTML = '';
    (values || []).forEach((v) => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      if (v === selectedValue) opt.selected = true;
      selectEl.appendChild(opt);
    });
  }

  function syncImageModelFields() {
    const root = document.getElementById('tilda-flows-extension-root');
    if (!root) return;
    const modelEl = root.querySelector('.tfe-image-model');
    const aspectEl = root.querySelector('.tfe-image-aspect');
    const resEl = root.querySelector('.tfe-image-resolution');
    const formatEl = root.querySelector('.tfe-image-format');
    const qualityEl = root.querySelector('.tfe-image-quality');
    const hintEl = root.querySelector('.tfe-image-hint');
    const model = (modelEl && modelEl.value) || 'nano-banana-pro';
    const preset = IMAGE_MODEL_PRESETS[model] || IMAGE_MODEL_PRESETS['nano-banana-pro'];

    setSelectOptions(aspectEl, preset.options.aspect_ratio || [], preset.defaults.aspect_ratio || '');
    setSelectOptions(resEl, preset.options.resolution || [], preset.defaults.resolution || '');
    setSelectOptions(formatEl, preset.options.output_format || [], preset.defaults.output_format || '');
    setSelectOptions(qualityEl, preset.options.quality || [], preset.defaults.quality || '');

    const show = (cls, on) => {
      const el = root.querySelector(cls);
      if (!el) return;
      if (on) {
        el.style.display = 'block';
        el.classList.add('active');
      } else {
        el.style.display = 'none';
        el.classList.remove('active');
      }
    };
    show('.tfe-image-row-aspect', preset.fields.includes('aspect_ratio'));
    show('.tfe-image-row-resolution', preset.fields.includes('resolution'));
    show('.tfe-image-row-format', preset.fields.includes('output_format'));
    show('.tfe-image-row-quality', preset.fields.includes('quality'));

    if (hintEl) {
      hintEl.textContent = preset.requiresInputUrls
        ? 'Для этой модели требуется хотя бы 1 референс URL.'
        : 'Можно без референсов (text-to-image).';
    }
  }

  function getImageGenerationOptions() {
    const root = document.getElementById('tilda-flows-extension-root');
    const model = ((root && root.querySelector('.tfe-image-model') && root.querySelector('.tfe-image-model').value) || 'nano-banana-pro').trim();
    const preset = IMAGE_MODEL_PRESETS[model] || IMAGE_MODEL_PRESETS['nano-banana-pro'];
    const out = { model };
    if (preset.fields.includes('aspect_ratio')) {
      out.aspect_ratio = ((root.querySelector('.tfe-image-aspect') || {}).value || preset.defaults.aspect_ratio || '').trim();
    }
    if (preset.fields.includes('resolution')) {
      out.resolution = ((root.querySelector('.tfe-image-resolution') || {}).value || preset.defaults.resolution || '').trim();
    }
    if (preset.fields.includes('output_format')) {
      out.output_format = ((root.querySelector('.tfe-image-format') || {}).value || preset.defaults.output_format || '').trim();
    }
    if (preset.fields.includes('quality')) {
      out.quality = ((root.querySelector('.tfe-image-quality') || {}).value || preset.defaults.quality || '').trim();
    }
    const presetCb = root && root.querySelector('.tfe-cover-preset');
    out.use_cover_preset = presetCb ? !!presetCb.checked : true;
    out.requiresInputUrls = !!preset.requiresInputUrls;
    return out;
  }

  function getGenerationOptions() {
    const root = document.getElementById('tilda-flows-extension-root');
    if (!root) return { wordsMin: 400, wordsMax: 0, seoGeo: true, useSuperPrompt: true, useWebSearch: true, useWordstatAgent: true, wordstatDepth: 'light', wordstatNumPhrases: 50, wordstatGeoMode: 'ru', wordstatRegionIds: [], keywordDensityGuard: true };
    const wordsMinEl = root.querySelector('.tfe-words-min');
    const wordsMaxEl = root.querySelector('.tfe-words-max');
    const seoGeoEl = root.querySelector('.tfe-seo-geo');
    const superPromptEl = root.querySelector('.tfe-super-prompt');
    const webSearchEl = root.querySelector('.tfe-web-search');
    const wordstatAgentEl = root.querySelector('.tfe-wordstat-agent');
    const wordstatDepthEl = root.querySelector('.tfe-wordstat-depth');
    const wordstatNumPhrasesEl = root.querySelector('.tfe-wordstat-num-phrases');
    const wordstatGeoModeEl = root.querySelector('.tfe-wordstat-geo-mode');
    const wordstatRegionIdsEl = root.querySelector('.tfe-wordstat-region-ids');
    const keywordDensityGuardEl = root.querySelector('.tfe-keyword-density-guard');
    const wordsMin = wordsMinEl ? parseInt(wordsMinEl.value, 10) : 400;
    const wordsMax = wordsMaxEl ? parseInt(wordsMaxEl.value, 10) : 0;
    const seoGeo = seoGeoEl ? seoGeoEl.checked : true;
    const useSuperPrompt = superPromptEl ? superPromptEl.checked : true;
    const useWebSearch = webSearchEl ? webSearchEl.checked : true;
    const useWordstatAgent = wordstatAgentEl ? !!wordstatAgentEl.checked : true;
    const wordstatDepth = (wordstatDepthEl && wordstatDepthEl.value === 'pro') ? 'pro' : 'light';
    const wordstatNumPhrasesRaw = wordstatNumPhrasesEl ? parseInt(wordstatNumPhrasesEl.value, 10) : 50;
    const wordstatNumPhrases = Number.isFinite(wordstatNumPhrasesRaw) ? Math.max(10, Math.min(2000, wordstatNumPhrasesRaw)) : 50;
    const wordstatGeoMode = (wordstatGeoModeEl && wordstatGeoModeEl.value) || 'ru';
    const wordstatRegionIds = String((wordstatRegionIdsEl && wordstatRegionIdsEl.value) || '')
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    const keywordDensityGuard = keywordDensityGuardEl ? !!keywordDensityGuardEl.checked : true;
    return {
      wordsMin: isNaN(wordsMin) || wordsMin < 0 ? 400 : Math.min(3000, wordsMin),
      wordsMax: isNaN(wordsMax) || wordsMax <= 0 ? 0 : Math.min(5000, wordsMax),
      seoGeo: !!seoGeo,
      useSuperPrompt: !!useSuperPrompt,
      useWebSearch: !!useWebSearch,
      useWordstatAgent: !!useWordstatAgent,
      wordstatDepth: wordstatDepth,
      wordstatNumPhrases: wordstatNumPhrases,
      wordstatGeoMode: wordstatGeoMode,
      wordstatRegionIds: wordstatRegionIds,
      keywordDensityGuard: !!keywordDensityGuard
    };
  }

  function syncWordstatUiFields() {
    const root = document.getElementById('tilda-flows-extension-root');
    if (!root) return;
    const modeEl = root.querySelector('.tfe-wordstat-geo-mode');
    const wrapEl = root.querySelector('.tfe-wordstat-region-wrap');
    const idsEl = root.querySelector('.tfe-wordstat-region-ids');
    const mode = (modeEl && modeEl.value) || 'ru';
    if (wrapEl) wrapEl.style.display = mode === 'custom' ? '' : 'none';
    if (mode !== 'custom' && idsEl && !idsEl.value.trim()) {
      idsEl.value = mode === 'ru' ? '225' : '';
    }
    if (mode === 'custom') loadWordstatRegionsForUi();
  }

  function onWordstatRegionSelectChange() {
    const root = document.getElementById('tilda-flows-extension-root');
    if (!root) return;
    const selectEl = root.querySelector('.tfe-wordstat-region-select');
    const idsEl = root.querySelector('.tfe-wordstat-region-ids');
    const id = (selectEl && selectEl.value) || '';
    if (idsEl && id) idsEl.value = id;
  }

  function setWordstatRegionOptions(regions) {
    const root = document.getElementById('tilda-flows-extension-root');
    if (!root) return;
    const selectEl = root.querySelector('.tfe-wordstat-region-select');
    if (!selectEl) return;
    const list = Array.isArray(regions) ? regions : [];
    selectEl.innerHTML = '<option value="">Выберите регион…</option>';
    list.slice(0, 500).forEach((r) => {
      if (!r || !r.id) return;
      const opt = document.createElement('option');
      opt.value = String(r.id);
      opt.textContent = `${r.name} (${r.id})`;
      selectEl.appendChild(opt);
    });
  }

  function loadWordstatRegionsForUi(forceReload) {
    const root = document.getElementById('tilda-flows-extension-root');
    if (!root) return;
    const selectEl = root.querySelector('.tfe-wordstat-region-select');
    const alreadyHasList = !!(selectEl && selectEl.options && selectEl.options.length > 1);
    if (!forceReload && (root.__tkWordstatRegionsLoaded || alreadyHasList)) return;
    root.__tkWordstatRegionsLoaded = true;
    if (forceReload) setStatus('Wordstat: обновляю список регионов…', 'progress', { step: 'text', percent: 10 });
    chrome.runtime.sendMessage({ action: 'getWordstatRegions' }, (resp) => {
      if (chrome.runtime.lastError) {
        root.__tkWordstatRegionsLoaded = false;
        setWordstatRegionOptions([{ id: 225, name: 'Россия (fallback)' }]);
        setStatus('Wordstat: список регионов не получен. Проверьте перезагрузку расширения.', 'error', { step: 'text', percent: 10 });
        return;
      }
      const regions = (resp && Array.isArray(resp.regions) && resp.regions.length)
        ? resp.regions
        : [{ id: 225, name: 'Россия (fallback)' }];
      setWordstatRegionOptions(regions);
      const idsEl = root.querySelector('.tfe-wordstat-region-ids');
      const selectElLocal = root.querySelector('.tfe-wordstat-region-select');
      if (idsEl && idsEl.value) {
        const firstId = String(idsEl.value.split(',')[0] || '').trim();
        if (firstId && selectElLocal) selectElLocal.value = firstId;
      }
      if (forceReload) setStatus(`Wordstat: регионы загружены (${regions.length}).`, 'progress', { step: 'text', percent: 11 });
    });
  }

  function renderUsedKeywords(report) {
    const root = document.getElementById('tilda-flows-extension-root');
    if (!root) return;
    const el = root.querySelector('#tfe-used-keywords');
    if (!el) return;
    if (!report || !report.enabled) {
      let reasonText = report && report.reason ? report.reason : '';
      if (reasonText === 'api_error') reasonText = 'Ошибка API (проверьте ключ)';
      else if (reasonText === 'running') reasonText = 'Сбор данных...';
      else if (reasonText === 'bad_response') reasonText = 'Неверный ответ от нейросети';
      else if (reasonText === 'runtime_error') reasonText = 'Внутренняя ошибка расширения';
      
      const reasonDisplay = reasonText ? ` (${reasonText})` : '';
      el.innerHTML = `<div class="tfe-used-keywords-title">Использованные ключи</div><div class="tfe-used-keywords-muted">Wordstat выключен${reasonDisplay}</div>`;
      return;
    }
    const top = Array.isArray(report.topKeywords) ? report.topKeywords : [];
    const tags = top.slice(0, 8).map((k) => {
      const phrase = String(k && k.phrase || '').trim();
      const count = Number(k && k.count) || 0;
      return `<span class="tfe-key-chip">${phrase}${count > 0 ? ` · ${count}` : ''}</span>`;
    }).join('');
    const main = report.primaryKeyword ? `<span class="tfe-used-key-main">Главный: ${report.primaryKeyword}</span>` : '';
    const cover = report.coverKeyword ? `<span class="tfe-used-key-main">Обложка: ${report.coverKeyword}</span>` : '';
    const selectedTotal = Number(report.selectedTotalCount) || 0;
    const apiTotal = Number(report.totalCount) || 0;
    const displayTotal = selectedTotal > 0 ? selectedTotal : apiTotal;
    const totalLine = displayTotal > 0 ? `<div class="tfe-used-keywords-muted">Суммарная частотность выбранных ключей: ${displayTotal}</div>` : '';
    el.innerHTML = `
      <div class="tfe-used-keywords-title">Использованные ключи</div>
      <div class="tfe-used-keywords-meta">${main}${cover}</div>
      ${totalLine}
      <div class="tfe-key-chip-wrap">${tags || '<span class="tfe-used-keywords-muted">нет ключей</span>'}</div>
    `;
  }

  function isAutoPublishEnabled() {
    // По требованию: автопубликация всегда включена
    return true;
  }

  function findPublishButton(doc) {
    const d = doc || document;
    const selectors = [
      '.tstore__editbox__save-close-btn-wrap .tbtn_primary',
      '.tore__editbox__save-close-btn-wrap .tbtn_primary',
      'button.tbtn_primary',
      'button.t-btn, button.tbtn'
    ];
    for (const sel of selectors) {
      const list = Array.from(d.querySelectorAll(sel));
      for (const btn of list) {
        const txt = ((btn.textContent || '') + ' ' + (btn.getAttribute('value') || '')).toLowerCase();
        if (/сохранить|опубликов|save|publish|save\s*and\s*close/.test(txt)) return btn;
      }
    }
    // Фоллбек по тексту по всем кнопкам
    const allBtns = Array.from(d.querySelectorAll('button, input[type="button"], input[type="submit"]'));
    for (const b of allBtns) {
      const txt = ((b.textContent || '') + ' ' + (b.getAttribute('value') || '')).toLowerCase();
      if (/сохранить|опубликов|save|publish/.test(txt)) return b;
    }
    return null;
  }

  function clickPublishButton(doc) {
    const btn = findPublishButton(doc);
    if (!btn) return false;
    try {
      btn.scrollIntoView && btn.scrollIntoView({ block: 'center', behavior: 'auto' });
    } catch (_) {}
    try { btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); } catch (_) {}
    try { btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); } catch (_) {}
    try { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); } catch (_) {}
    try { btn.click && btn.click(); } catch (_) {}
    return true;
  }

  function triggerAutoPublish(afterMs, processRunId) {
    if (!isAutoPublishEnabled()) return;
    if (typeof processRunId === 'number' && !isRunActive(processRunId)) return;
    const autoPublishRunId = Date.now() + Math.random();
    window.__tkAutoPublishRunId = autoPublishRunId;
    let clicked = false;
    const delay = Math.max(0, afterMs || 0);
    setStatus('Автопубликация: подготовка…', 'progress', { step: 'publish', percent: 90 });
    const attempts = [delay, delay + 1200, delay + 2600, delay + 4500];
    attempts.forEach((t, idx) => {
      setTimeout(() => {
        if ((typeof processRunId === 'number' && !isRunActive(processRunId)) || window.__tkAutoPublishRunId !== autoPublishRunId || clicked) return;
        setStatus(`Автопубликация: попытка ${idx + 1}/${attempts.length}…`, 'progress', { step: 'publish', percent: 92 + idx });
        // Перед автокликом повторно подкидываем payload в injected.js
        if (window.__tkLastPublishPayload) {
          try {
            window.postMessage({ __tildaKovcheg: 'setData', payload: window.__tkLastPublishPayload }, '*');
          } catch (_) {}
        }
        const d = getEditorDocument();
        const ok = clickPublishButton(d);
        if (ok) {
          clicked = true;
          window.__tkAutoPublishRunId = null;
          setStatus('Автопубликация: кнопка нажата ✓', 'success', { step: 'publish', percent: 100 });
          console.log('[Tilda Kovcheg] auto publish clicked, attempt', idx + 1);
        } else if (idx === attempts.length - 1) {
          setStatus('Автопубликация: кнопка не найдена. Нажмите "Сохранить и закрыть" вручную.', 'error', { step: 'publish', percent: 96 });
          console.warn('[Tilda Kovcheg] auto publish button not found');
        }
      }, t);
    });
  }

  function isCoverReadyInDoc(doc) {
    const d = doc || document;
    try {
      const mediaRoot =
        d.querySelector('.j-gallery-upload-widget') ||
        d.querySelector('[class*="gallery-upload-widget"]') ||
        d.querySelector('[class*="media-wrapper"]') ||
        d.querySelector('[class*="image-box"]');
      if (!mediaRoot) return false;
      const txt = (mediaRoot.textContent || '').toLowerCase();
      const loading = /загрузка|uploading|loading/.test(txt);
      const hasVisual =
        !!mediaRoot.querySelector('img[src]') ||
        !!mediaRoot.querySelector('[style*="background-image"]') ||
        !!mediaRoot.querySelector('.j-gallery-item img') ||
        !!mediaRoot.querySelector('.j-gallery-item');
      return hasVisual && !loading;
    } catch (_) {
      return false;
    }
  }

  function waitForCoverReady(timeoutMs) {
    const timeout = Math.max(1000, timeoutMs || 6000);
    const started = Date.now();
    return new Promise((resolve) => {
      const check = () => {
        const d = getEditorDocument();
        if (isCoverReadyInDoc(d)) return resolve(true);
        if (Date.now() - started >= timeout) return resolve(false);
        setTimeout(check, 250);
      };
      check();
    });
  }

  const STATUS_ORDER = ['text', 'cover', 'upload', 'publish'];
  const statusRuntime = { percent: 0, step: 'text', startedAt: 0 };
  const processRuntime = { runId: 0, stopped: false };

  function beginProcessRun() {
    processRuntime.runId += 1;
    processRuntime.stopped = false;
    return processRuntime.runId;
  }

  function isRunActive(runId) {
    return !processRuntime.stopped && processRuntime.runId === runId;
  }

  function stopProcessRun(reason) {
    processRuntime.stopped = true;
    processRuntime.runId += 1;
    window.__tkAutoPublishRunId = null;
    window.__tkLastPublishPayload = null;
    try { window.postMessage({ __tildaKovcheg: 'setData', payload: null }, '*'); } catch (_) {}
    setButtonsDisabled(false);
    renderUsedKeywords({ enabled: false, reason: 'stopped' });
    setStatus(reason || 'Процесс остановлен пользователем.', 'error', {
      step: statusRuntime.step || 'text',
      percent: statusRuntime.percent || 0
    });
  }

  function inferStatusMeta(msg, type) {
    const text = String(msg || '').toLowerCase();
    if (type === 'error') return { percent: statusRuntime.percent || 0, step: statusRuntime.step || 'text' };
    if (/wordstat|ключев/.test(text)) return { percent: 12, step: 'text' };
    if (/автопубликация: кнопка нажата/.test(text)) return { percent: 100, step: 'publish' };
    if (/автопубликация/.test(text)) return { percent: 92, step: 'publish' };
    if (/загрузка обложки/.test(text)) return { percent: 78, step: 'upload' };
    if (/генерация обложки|обложка:/.test(text)) return { percent: 58, step: 'cover' };
    if (/заполнено:/.test(text)) return { percent: 86, step: 'upload' };
    if (/генерация текста|генерация контента/.test(text)) return { percent: 24, step: 'text' };
    if (type === 'success') return { percent: 100, step: 'publish' };
    return { percent: Math.max(statusRuntime.percent, 8), step: statusRuntime.step || 'text' };
  }

  function paintStatusSteps(container, step, percent) {
    const idx = Math.max(0, STATUS_ORDER.indexOf(step || 'text'));
    container.querySelectorAll('.tfe-step').forEach((el, i) => {
      const wasDone = el.classList.contains('done');
      el.classList.remove('done', 'active');
      const shouldDone = i < idx || percent >= 100;
      if (shouldDone) {
        el.classList.add('done');
        if (!wasDone) {
          el.classList.add('just-done');
          setTimeout(() => el.classList.remove('just-done'), 700);
        }
      } else if (i === idx && percent < 100) {
        el.classList.add('active');
      }
    });
  }

  function formatEta(percent, startedAt) {
    if (!startedAt || percent <= 0 || percent >= 99) return 'ETA --';
    const elapsed = Date.now() - startedAt;
    if (elapsed < 1200) return 'ETA ~...';
    const total = elapsed / (percent / 100);
    const left = Math.max(0, total - elapsed);
    const sec = Math.ceil(left / 1000);
    if (sec < 60) return 'ETA ~' + sec + 's';
    const min = Math.floor(sec / 60);
    const rem = sec % 60;
    return 'ETA ~' + min + 'm ' + rem + 's';
  }

  function setStatus(msg, type, meta) {
    const el = document.getElementById('tfe-status');
    if (!el) return;
    const statusMsg = el.querySelector('#tfe-status-msg');
    const percentEl = el.querySelector('#tfe-status-percent');
    const barEl = el.querySelector('#tfe-status-bar');
    const etaEl = el.querySelector('#tfe-status-eta');
    const inferred = inferStatusMeta(msg, type);
    const step = (meta && meta.step) || inferred.step;
    let percent = typeof (meta && meta.percent) === 'number' ? meta.percent : inferred.percent;
    percent = Math.max(0, Math.min(100, Math.round(percent)));
    if (type === 'progress') percent = Math.max(statusRuntime.percent || 0, percent);
    if (type === 'error') percent = statusRuntime.percent || percent;

    if (type === 'progress' && !statusRuntime.startedAt) statusRuntime.startedAt = Date.now();
    if (type === 'success' || type === 'error') statusRuntime.startedAt = 0;

    statusRuntime.percent = percent;
    statusRuntime.step = step;

    if (statusMsg) statusMsg.textContent = msg;
    if (percentEl) percentEl.textContent = percent + '%';
    if (barEl) barEl.style.width = percent + '%';
    if (etaEl) etaEl.textContent = type === 'success' ? 'Готово' : (type === 'error' ? 'Пауза' : formatEta(percent, statusRuntime.startedAt));
    paintStatusSteps(el, step, percent);

    el.className = 'tfe-status tfe-status-card show ' + (type || '');
  }

  // Документ, в котором находится форма редактора (может быть во вложенных iframe)
  function getEditorDocument() {
    function collectDocs(rootDoc, out, depth) {
      if (!rootDoc || !rootDoc.querySelector || depth > 4) return;
      out.push(rootDoc);
      try {
        const iframes = rootDoc.querySelectorAll('iframe');
        for (let i = 0; i < iframes.length; i++) {
          try {
            const sub = iframes[i].contentDocument;
            if (sub) collectDocs(sub, out, depth + 1);
          } catch (_) {}
        }
      } catch (_) {}
    }

    function scoreDoc(d) {
      if (!d || !d.querySelector) return -1;
      let s = 0;
      if (d.querySelector('form[id^="postform_"], form[id*="postform"]')) s += 50;
      if (d.querySelector('.pe-redactor__editor.tte-editor[name="text"]')) s += 50;
      if (d.querySelector('.pe-redactor__editor.tte-editor[name="text"] .ql-editor')) s += 60;
      if (d.querySelector('.tte-block-text__editable .ql-editor')) s += 40;
      if (d.querySelector('.tore__editbox__form-text, .tstore__editbox__form-text, .tstore__editbox__form-text_blocks')) s += 20;
      if (d.querySelector('.tore__editbox__form-param, .tstore__editbox__form-param, .tstore__editbox__form-params')) s += 10;
      if (d.querySelector('textarea[name="descr"]')) s += 10;
      return s;
    }

    const docs = [];
    collectDocs(document, docs, 0);
    let bestDoc = document;
    let bestScore = -1;
    for (let i = 0; i < docs.length; i++) {
      const s = scoreDoc(docs[i]);
      if (s > bestScore) {
        bestScore = s;
        bestDoc = docs[i];
      }
    }
    if (bestScore >= 50) return bestDoc;

    // Legacy fallback
    const hasLegacyForm = (d) =>
      d && d.querySelector && (d.querySelector('input[name="feed_title"]') || d.querySelector('input[name="title"]'));
    for (let i = 0; i < docs.length; i++) {
      if (hasLegacyForm(docs[i])) return docs[i];
    }
    return document;
  }

  // Контейнер с обычными полями формы (заголовок, описание, SEO…)
  function getFormParamContainer(doc) {
    return (doc || document).querySelector(
      '.tore__editbox__form-param, .tstore__editbox__form-param, .tstore__editbox__form-params'
    ) || null;
  }

  // Контейнер блочного редактора (основной текст статьи)
  function getFormTextContainer(doc) {
    return (doc || document).querySelector(
      '.tore__editbox__form-text, .tstore__editbox__form-text, .tstore__editbox__form-text_blocks'
    ) || null;
  }

  // Проверка: элемент связан с подписью/placeholder "описание" (не подставляем туда основной текст)
  function isDescriptionField(el) {
    if (!el) return false;
    const placeholder = (el.getAttribute('placeholder') || el.getAttribute('data-placeholder') || '').toLowerCase();
    const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
    const text = (placeholder + ' ' + ariaLabel);
    if (/описание|description|краткое\s*описание/.test(text)) return true;
    const doc = el.ownerDocument || document;
    const label = el.closest('label') || doc.querySelector(`label[for="${el.id}"]`);
    if (label && /описание|description|краткое/.test(label.textContent.toLowerCase())) return true;
    const parent = el.closest('[class*="field"], [class*="input"], [data-name]');
    if (parent) {
      const parentText = (parent.getAttribute('data-name') || parent.className || '').toLowerCase();
      if (/описание|description|short|краткое/.test(parentText)) return true;
    }
    return false;
  }

  // Селекторы из Tildapub/tilda_client.py (форма Tilda Потоки / Kovcheg). doc = документ с формой (getEditorDocument())
  function findTitleField(doc) {
    const d = doc || document;
    const candidates = [
      () => d.querySelector('input[name="feed_title"]'),
      () => d.querySelector('input[name="title"]'),
      () => d.querySelector('input[placeholder*="заголовок" i]:not([placeholder*="SEO"])'),
      () => d.querySelector('input[placeholder*="название" i]'),
      () => d.querySelector('.td-input[name="title"], .td-input[name="feed_title"]'),
      () => byLabelForInputInDoc(d, 'Название', true),
      () => byLabelForInputInDoc(d, 'заголовок', true),
      () => d.querySelector('[contenteditable="true"][data-placeholder*="заголовок" i]'),
      () => d.querySelector('h1[contenteditable="true"]')
    ];
    for (const fn of candidates) {
      const el = fn();
      if (el && !isDescriptionField(el) && !el.closest('#tilda-flows-extension-root')) return el;
    }
    return null;
  }

  // Основной текст поста — в блоке form-text (ОТДЕЛЬНЫЙ от form-param!)
  function findBodyField(doc) {
    const d = doc || document;
    const candidates = [
      // Паттерн из Tildapub (самый надежный)
      () => d.querySelector('.tte-block-text__editable .ql-editor[contenteditable="true"]'),
      () => d.querySelector('.tstore__editbox__form-text .tte-block-text__editable .ql-editor[contenteditable="true"]'),
      () => d.querySelector('.tore__editbox__form-text .tte-block-text__editable .ql-editor[contenteditable="true"]'),
      // Точный путь из DevTools: form-text > tte-block-text__editable.ql-container > .ql-editor
      () => { const c = getFormTextContainer(d); return c ? c.querySelector('.ql-editor[contenteditable="true"]') : null; },
      () => d.querySelector('.tore__editbox__form-text .ql-editor[contenteditable="true"], .tstore__editbox__form-text .ql-editor[contenteditable="true"]'),
      () => d.querySelector('.ql-editor[contenteditable="true"][data-placeholder*="Введите текст"]'),
      () => d.querySelector('.tte-block-text__editable .ql-editor[contenteditable="true"]'),
      () => d.querySelector('.tte-block-text__editable.ql-container > .ql-editor'),
      () => d.querySelector('.tte-block-text__wrapper .ql-editor[contenteditable="true"]'),
      () => d.querySelector('.tte-editor .ql-editor[contenteditable="true"]'),
      // Старый рабочий fallback: "второй ql-editor" в форме обычно является телом статьи
      () => {
        const form = d.querySelector('form[id^="postform_"], form[id*="postform"]') || d;
        const all = form.querySelectorAll('.ql-editor[contenteditable="true"]');
        return all.length > 1 ? all[1] : null;
      },
      // Fallback
      () => d.querySelector('textarea[name="text"]'),
      () => d.querySelector('.t-rich-editor [contenteditable="true"]')
    ];
    for (const fn of candidates) {
      try {
        const el = fn();
        if (el && !el.closest('#tilda-flows-extension-root')) return el;
      } catch (_) {}
    }
    return null;
  }

  // Только визуальный редактор тела (без hidden textarea fallback)
  function findBodyVisualEditor(doc) {
    const d = doc || document;
    const candidates = [
      // Точный путь пользователя: host[name=text] -> .ql-editor
      () => d.querySelector('form[id^="postform_"] .pe-redactor__editor.tte-editor[name="text"] .ql-editor'),
      () => d.querySelector('form[id*="postform"] .pe-redactor__editor.tte-editor[name="text"] .ql-editor'),
      // Сначала максимально строгие
      () => d.querySelector('.tte-block-text__editable .ql-editor[contenteditable="true"]'),
      () => d.querySelector('.tstore__editbox__form-text .tte-block-text__editable .ql-editor[contenteditable="true"]'),
      () => d.querySelector('.tore__editbox__form-text .tte-block-text__editable .ql-editor[contenteditable="true"]'),
      // Затем мягкие (до полной инициализации Quill contenteditable может отсутствовать)
      () => d.querySelector('.tte-block-text__editable .ql-editor'),
      () => d.querySelector('.tstore__editbox__form-text .ql-editor, .tore__editbox__form-text .ql-editor'),
      () => d.querySelector('.ql-editor[data-placeholder*="Введите текст"], .ql-editor[data-placeholder*="текст" i]'),
      // Fallback из tilda_client.py
      () => d.querySelector('.tte-block-text__editable')
    ];
    for (const fn of candidates) {
      try {
        const el = fn();
        if (el && !el.closest('#tilda-flows-extension-root')) return el;
      } catch (_) {}
    }
    return null;
  }

  // Хост основного редактора (если ql-editor ещё не инициализировался)
  function findBodyEditorHost(doc) {
    const d = doc || document;
    const candidates = [
      () => d.querySelector('.pe-redactor__editor.tte-editor[name="text"]'),
      () => d.querySelector('.tstore__editbox__form-text .pe-redactor__editor.tte-editor'),
      () => d.querySelector('.tore__editbox__form-text .pe-redactor__editor.tte-editor'),
      () => d.querySelector('.tte-editor[name="text"]'),
      () => d.querySelector('.tte-block-text__editable')
    ];
    for (const fn of candidates) {
      try {
        const el = fn();
        if (el && !el.closest('#tilda-flows-extension-root')) return el;
      } catch (_) {}
    }
    return null;
  }

  // Инициализация tte-редактора (как в Tildapub): клик по wrapper/form-text
  function primeBodyEditor(doc) {
    const d = doc || document;
    const candidates = [
      '.tte-block-text__wrapper',
      '.tstore__editbox__form-text',
      '.tore__editbox__form-text',
      '.pe-redactor__editor.tte-editor[name="text"]',
      '.tte-editor[name="text"]',
      '.pe-redactor__editor.tte-editor[name="text"]'
    ];
    for (const sel of candidates) {
      try {
        const el = d.querySelector(sel);
        if (!el || el.closest('#tilda-flows-extension-root')) continue;
        if (el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'auto' });
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        // Дополнительный focus-триггер (иногда без него Quill не создаёт .ql-editor)
        try { el.focus && el.focus(); } catch (_) {}
        return true;
      } catch (_) {}
    }
    return false;
  }

  function byLabelForInput(labelSubstring, forInput) {
    const labels = document.querySelectorAll('label, [class*="label"], [class*="caption"]');
    for (const l of labels) {
      if (!l.textContent.toLowerCase().includes(labelSubstring.toLowerCase())) continue;
      const input = l.querySelector('input, textarea');
      if (input && (!forInput || input.tagName === 'INPUT')) return input;
      const forId = l.getAttribute('for');
      if (forId) {
        const target = document.getElementById(forId);
        if (target) return target;
      }
    }
    return null;
  }

  function byLabelForContentEditable(labelSubstring) {
    return byLabelForContentEditableInDoc(document, labelSubstring);
  }
  function byLabelForContentEditableInDoc(doc, labelSubstring) {
    const d = doc || document;
    const labels = d.querySelectorAll('label, [class*="label"], [class*="caption"]');
    for (const l of labels) {
      if (!l.textContent.toLowerCase().includes(labelSubstring.toLowerCase())) continue;
      const ce = l.querySelector('[contenteditable="true"]');
      if (ce) return ce;
      const container = l.nextElementSibling || l.parentElement;
      if (container) {
        const ce2 = container.querySelector('[contenteditable="true"]');
        if (ce2) return ce2;
      }
    }
    return null;
  }

  // Краткое описание — .ql-editor ТОЛЬКО внутри form-param (НЕ form-text!)
  function findDescriptionFieldInDoc(doc) {
    if (!doc || !doc.querySelector) return null;
    // Главный селектор: ищем ТОЛЬКО в контейнере form-param, не затрагивая form-text (тело)
    const formParam = getFormParamContainer(doc);
    if (formParam) {
      const qlInParam = formParam.querySelector('.ql-editor[contenteditable="true"]');
      if (qlInParam && !qlInParam.closest('#tilda-flows-extension-root')) return qlInParam;
    }
    // Fallback: textarea с известными именами
    const candidates = [
      () => doc.querySelector('textarea[name="descr"].pe-textarea'),
      () => doc.querySelector('textarea[name="descr"]'),
      // Старый рабочий fallback: "первый ql-editor" в форме обычно краткое описание
      () => {
        const form = doc.querySelector('form[id^="postform_"], form[id*="postform"]') || doc;
        const all = form.querySelectorAll('.ql-editor[contenteditable="true"]');
        return all.length ? all[0] : null;
      },
      () => {
        const form = doc.querySelector('form[id^="postform_"], form[id*="postform"]') || doc;
        const g = form.querySelector('.pe-form-group');
        return g ? g.querySelector('textarea, input, [contenteditable="true"]') : null;
      },
      () => doc.querySelector('textarea[name="excerpt"]'),
      () => doc.querySelector('textarea[name="short_description"]'),
      () => doc.querySelector('textarea[id*="descr"]'),
      () => doc.querySelector('textarea[id*="excerpt"]'),
      () => doc.querySelector('textarea[data-name="descr"]'),
      () => byLabelForInputInDoc(doc, 'Краткое описание', false),
      () => byLabelForInputInDoc(doc, 'краткое описание', false),
      () => byLabelForInputInDoc(doc, 'описание', false),
      () => byLabelForInputInDoc(doc, 'превью', false),
      () => byLabelForInputInDoc(doc, 'аннотация', false),
      () => doc.querySelector('textarea[placeholder*="описание" i]:not([placeholder*="SEO"])'),
      () => doc.querySelector('textarea[placeholder*="краткое" i]'),
      () => doc.querySelector('input[placeholder*="описание" i]:not([placeholder*="SEO"])'),
      () => byLabelNearbyInDoc(doc, 'краткое'),
      () => byLabelNearbyInDoc(doc, 'описание')
    ];
    for (const fn of candidates) {
      try {
        const el = fn();
        if (el && !el.closest('#tilda-flows-extension-root')) return el;
      } catch (_) {}
    }
    return null;
  }

  function findDescriptionField(doc) {
    if (doc) return findDescriptionFieldInDoc(doc);
    const el = findDescriptionFieldInDoc(document);
    if (el) return el;
    try {
      const iframes = document.querySelectorAll('iframe');
      for (let i = 0; i < iframes.length; i++) {
        try {
          const d = iframes[i].contentDocument;
          if (!d) continue;
          const inFrame = findDescriptionFieldInDoc(d);
          if (inFrame) return inFrame;
        } catch (_) {}
      }
    } catch (_) {}
    return null;
  }

  function byLabelForInputInDoc(doc, labelSubstring, forInput) {
    const labels = doc.querySelectorAll('label, [class*="label"], [class*="caption"]');
    for (const l of labels) {
      if (!l.textContent.toLowerCase().includes(labelSubstring.toLowerCase())) continue;
      const input = l.querySelector('input, textarea');
      if (input && (!forInput || input.tagName === 'INPUT')) return input;
      const forId = l.getAttribute('for');
      if (forId) {
        const target = doc.getElementById(forId);
        if (target) return target;
      }
    }
    return null;
  }

  function byLabelNearby(labelSubstring) {
    return byLabelNearbyInDoc(document, labelSubstring);
  }

  function byLabelNearbyInDoc(doc, labelSubstring) {
    if (!doc || !doc.querySelectorAll) return null;
    const lower = labelSubstring.toLowerCase();
    const labels = doc.querySelectorAll('label, [class*="label"], [class*="caption"], .t-label, [class*="title"]');
    for (const l of labels) {
      if (!l.textContent.toLowerCase().includes(lower)) continue;
      if (/SEO|Facebook|FB|соцсет/i.test(l.textContent)) continue;
      const ta = l.querySelector('textarea');
      if (ta) return ta;
      const forId = l.getAttribute('for');
      if (forId) {
        const target = doc.getElementById(forId);
        if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) return target;
      }
      const next = l.nextElementSibling;
      if (next) {
        const t = next.querySelector('textarea, input[type="text"]');
        if (t) return t;
      }
      const parent = l.closest('div');
      if (parent) {
        const t = parent.querySelector('textarea');
        if (t) return t;
      }
    }
    return null;
  }

  // SEO заголовок — tilda_client: input[name="seo_title"]
  function findSeoTitleField(doc) {
    const d = doc || document;
    const candidates = [
      () => d.querySelector('input[name="seo_title"]'),
      () => d.querySelector('input[name="seo_title"].pe-input'),
      () => byLabelForInputInDoc(d, 'SEO: Заголовок', true),
      () => d.querySelector('input[placeholder*="SEO" i][placeholder*="заголовок" i]')
    ];
    for (const fn of candidates) {
      const el = fn();
      if (el && !el.closest('#tilda-flows-extension-root')) return el;
    }
    return null;
  }

  // SEO описание — tilda_client: input[name="seo_descr"]
  function findSeoDescriptionField(doc) {
    const d = doc || document;
    const candidates = [
      () => d.querySelector('input[name="seo_descr"]'),
      () => d.querySelector('input[name="seo_descr"].pe-input'),
      () => byLabelForInputInDoc(d, 'SEO: Описание', false),
      () => byLabelForInputInDoc(d, 'SEO описание', false)
    ];
    for (const fn of candidates) {
      const el = fn();
      if (el && !el.closest('#tilda-flows-extension-root')) return el;
    }
    return null;
  }

  // SEO ключевые слова — tilda_client: input[name="seo_keywords"]
  function findSeoKeywordsField(doc) {
    const d = doc || document;
    const candidates = [
      () => d.querySelector('input[name="seo_keywords"]'),
      () => byLabelForInputInDoc(d, 'SEO: Ключевые слова', true),
      () => byLabelForInputInDoc(d, 'Ключевые слова', true)
    ];
    for (const fn of candidates) {
      const el = fn();
      if (el && !el.closest('#tilda-flows-extension-root')) return el;
    }
    return null;
  }

  // Адрес поста (slug) — tilda_client: input[name="postalias"]
  function findSlugField(doc) {
    const d = doc || document;
    const candidates = [
      () => d.querySelector('input[name="postalias"]'),
      () => d.querySelector('input#post-alias-input'),
      () => byLabelForInputInDoc(d, 'Адрес поста', true)
    ];
    for (const fn of candidates) {
      const el = fn();
      if (el && !el.closest('#tilda-flows-extension-root')) return el;
    }
    return null;
  }

  // Имя автора — tilda_client: input[name="authorname"]
  function findAuthorNameField(doc) {
    const d = doc || document;
    const candidates = [
      () => d.querySelector('input[name="authorname"]'),
      () => byLabelForInputInDoc(d, 'Имя автора', true)
    ];
    for (const fn of candidates) {
      const el = fn();
      if (el && !el.closest('#tilda-flows-extension-root')) return el;
    }
    return null;
  }

  // Ссылка автора — tilda_client: input[name="authorurl"]
  function findAuthorLinkField(doc) {
    const d = doc || document;
    const candidates = [
      () => d.querySelector('input[name="authorurl"]'),
      () => byLabelForInputInDoc(d, 'Ссылка на сайт автора', true)
    ];
    for (const fn of candidates) {
      const el = fn();
      if (el && !el.closest('#tilda-flows-extension-root')) return el;
    }
    return null;
  }

  // Видимость — tilda_client: select[name="visibility"]
  function findVisibilityField(doc) {
    const d = doc || document;
    const el = d.querySelector('select[name="visibility"]');
    return el && !el.closest('#tilda-flows-extension-root') ? el : null;
  }

  // Теги/разделы — tilda_client: input[name="tags"], input[name="sections"]
  function findTagsField(doc) {
    const d = doc || document;
    const candidates = [
      () => d.querySelector('input[name="tags"]'),
      () => d.querySelector('input[name="sections"]'),
      () => byLabelForInputInDoc(d, 'Список разделов', true),
      () => byLabelForInputInDoc(d, 'Разделы', true),
      () => byLabelForInputInDoc(d, 'Теги', true)
    ];
    for (const fn of candidates) {
      const el = fn();
      if (el && !el.closest('#tilda-flows-extension-root')) return el;
    }
    return null;
  }

  // Facebook заголовок — tilda_client: input[name="fb_title"]
  function findFbTitleField(doc) {
    const d = doc || document;
    const candidates = [
      () => d.querySelector('input[name="fb_title"]'),
      () => byLabelForInputInDoc(d, 'Facebook: Заголовок', true)
    ];
    for (const fn of candidates) {
      const el = fn();
      if (el && !el.closest('#tilda-flows-extension-root')) return el;
    }
    return null;
  }

  // Facebook описание — tilda_client: input[name="fb_descr"]
  function findFbDescriptionField(doc) {
    const d = doc || document;
    const candidates = [
      () => d.querySelector('input[name="fb_descr"]'),
      () => byLabelForInputInDoc(d, 'Facebook: Описание', true)
    ];
    for (const fn of candidates) {
      const el = fn();
      if (el && !el.closest('#tilda-flows-extension-root')) return el;
    }
    return null;
  }

  // Раскрыть гармошки «Дополнительно» и «Соц.сети и SEO» (tilda_client: _expand_sections)
  function expandSectionsIfNeeded(doc) {
    const d = doc || document;
    ['grouptitle_additional', 'grouptitle_meta'].forEach((id) => {
      const grp = d.querySelector('#' + id + ' a, #' + id);
      if (grp && !grp.closest('#tilda-flows-extension-root')) {
        try { grp.click(); } catch (_) {}
      }
    });
  }

  // Обложка — tilda_client: лейбл "Изображение", input[name="image"] для значения
  function findCoverField(doc) {
    const d = doc || document;
    const byLabel = (text) => {
      const labels = d.querySelectorAll('label, .t-label, [class*="label"]');
      for (const l of labels) {
        if (l.textContent.toLowerCase().includes(text)) {
          const input = l.querySelector('input[type="file"]') || l.querySelector('input[accept*="image"]');
          if (input) return input;
          const forId = l.getAttribute('for');
          if (forId) return d.getElementById(forId);
          const container = l.closest('div');
          if (container) {
            const fileInput = container.querySelector('input[type="file"].tu-hidden-input, input[type="file"]');
            if (fileInput) return fileInput;
          }
        }
      }
      return null;
    };
    return (
      byLabel('изображение') ||
      byLabel('обложк') ||
      byLabel('cover') ||
      d.querySelector('input[type="file"].tu-hidden-input') ||
      d.querySelector('input[type="file"][accept*="image"]') ||
      d.querySelector('input[type="file"]')
    );
  }

  // Alt-текст изображения обложки — input.pe-input в блоке медиа/галереи (pe-form-group[2])
  function findImageAltField(doc) {
    const d = doc || document;
    const candidates = [
      // Точный селектор по DOM-пути пользователя
      () => {
        const groups = d.querySelectorAll('.tore__editbox__form-param .pe-form-group, .tstore__editbox__form-param .pe-form-group, .tstore__editbox__form-params .pe-form-group, form[id^="postform"] .pe-form-group');
        for (const g of groups) {
          if (g.querySelector('[class*="gallery"], [class*="media"], [class*="image-box"], [class*="j-gallery"]')) {
            const inp = g.querySelector('input.pe-input[type="text"], input[type="text"].pe-input');
            if (inp) return inp;
          }
        }
        return null;
      },
      () => d.querySelector('[class*="j-gallery-item"] input.pe-input[type="text"]'),
      () => d.querySelector('[class*="gallery-item"] input.pe-input[type="text"]'),
      () => d.querySelector('[class*="j-media-wrapper"] input.pe-input[type="text"]'),
      () => d.querySelector('[class*="j-image-box"] input.pe-input[type="text"]'),
      () => byLabelForInputInDoc(d, 'alt', true),
      () => byLabelForInputInDoc(d, 'альт', true),
      () => byLabelForInputInDoc(d, 'подпись к', true),
    ];
    for (const fn of candidates) {
      try {
        const el = fn();
        if (el && !el.closest('#tilda-flows-extension-root')) return el;
      } catch (_) {}
    }
    return null;
  }

  function insertText(el, text) {
    if (!el) return false;
    // Получаем window элемента (может быть из iframe)
    const elWin = (el.ownerDocument && el.ownerDocument.defaultView) || window;
    const elDoc = el.ownerDocument || document;

    if (el.contentEditable === 'true' || el.isContentEditable) {
      el.focus();
      const beforeHtml = el.innerHTML;
      try { elDoc.execCommand('selectAll', false, null); } catch (_) {}
      try { elDoc.execCommand('insertText', false, text); } catch (_) {}
      if (el.innerHTML === beforeHtml || el.textContent.trim() !== text.trim()) {
        el.innerHTML = '<p>' + text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return true;
    }
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      el.focus();
      // Используем прототип из того же window что и элемент (защита от cross-frame "Illegal invocation")
      try {
        const proto = el.tagName === 'TEXTAREA'
          ? elWin.HTMLTextAreaElement.prototype
          : elWin.HTMLInputElement.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value');
        if (nativeSetter && nativeSetter.set) {
          nativeSetter.set.call(el, text);
        } else {
          el.value = text;
        }
      } catch (_) {
        el.value = text;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  }

  // Вставка HTML в визуальный .ql-editor (только для отображения)
  // Реальное сохранение делает injected.js через перехват XHR
  function insertHtmlIntoBody(el, html) {
    if (!el || !html) return false;
    const elDoc = el.ownerDocument || document;
    const elWin = (elDoc && elDoc.defaultView) || window;
    // Если пришел хост/обертка, пытаемся взять вложенный .ql-editor
    if (el.classList && !el.classList.contains('ql-editor')) {
      const nestedQl = el.querySelector && el.querySelector('.ql-editor');
      if (nestedQl) el = nestedQl;
    }

    if (el.classList && el.classList.contains('ql-editor')) {
      el.focus();
      // Попытка через Quill API
      try {
        const qlContainer = el.closest('.ql-container');
        const quill = (qlContainer && (qlContainer.__quill || qlContainer._quill)) ||
          (elWin.Quill && elWin.Quill.find && elWin.Quill.find(el));
        if (quill && quill.clipboard && quill.clipboard.dangerouslyPasteHTML) {
          quill.clipboard.dangerouslyPasteHTML(0, html);
          try {
            // Явно сообщаем Quill о смене контента
            quill.update && quill.update('user');
          } catch (_) {}
        }
      } catch (_) {}
      // Fallback: прямой innerHTML
      el.innerHTML = html;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertHTML' }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      // Эмулируем ввод как в tilda_client.py: End -> " " -> Backspace
      try {
        el.focus();
        const sel = elWin.getSelection ? elWin.getSelection() : null;
        if (sel) {
          const range = elDoc.createRange();
          range.selectNodeContents(el);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
        // Реальные команды редактирования дают Quill "user edit"
        try { elDoc.execCommand('insertText', false, ' '); } catch (_) {}
        try { elDoc.execCommand('delete', false, null); } catch (_) {}
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        // Визуально убираем placeholder, если текст уже есть
        if ((el.textContent || '').trim()) el.classList.remove('ql-blank');
      } catch (_) {}
      return true;
    }
    // Fallback из tilda_client.py: вставка в .tte-block-text__editable
    if (el.classList && el.classList.contains('tte-block-text__editable')) {
      try {
        el.focus && el.focus();
        el.innerHTML = html;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      } catch (_) {}
    }
    if (el.contentEditable === 'true') {
      el.focus();
      el.innerHTML = html;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    return false;
  }

  function toParagraphHtml(text) {
    const safe = String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
    return '<p>' + safe + '</p>';
  }

  // Гарантированная визуальная вставка body в .ql-editor (без fallback в hidden textarea)
  function renderBodyVisibleWithRetries(rawBody) {
    const body = String(rawBody || '').trim();
    if (!body) return;
    const html = body.startsWith('<') ? body : toParagraphHtml(body);
    const runId = Date.now() + Math.random();
    window.__tkBodyRenderRunId = runId;
    const delays = [0, 120, 350, 800, 1500, 2600, 4200];
    delays.forEach((delay) => {
      setTimeout(() => {
        // Если уже стартовал новый запуск заполнения — прекращаем старые ретраи
        if (window.__tkBodyRenderRunId !== runId) return;
        const liveDoc = getEditorDocument();
        primeBodyEditor(liveDoc);
        let el = findBodyVisualEditor(liveDoc);
        if (!el) {
          const host = findBodyEditorHost(liveDoc);
          if (host) {
            try {
              host.dispatchEvent(new MouseEvent('click', { bubbles: true }));
              host.focus && host.focus();
            } catch (_) {}
            // пробуем найти ql-editor снова после активации хоста
            el = findBodyVisualEditor(liveDoc) || liveDoc.querySelector('.tte-block-text__editable');
          }
        }
        if (!el) {
          console.log('[Tilda Kovcheg] body visual editor not found +', delay, 'ms');
          return;
        }
        // Если в поле уже есть текст, не перетираем его (пользователь мог отредактировать вручную)
        const currentText = (el.textContent || '').trim();
        if (currentText.length > 0) {
          // Останавливаем остаток ретраев после первого успешного/ручного контента
          if (window.__tkBodyRenderRunId === runId) {
            window.__tkBodyRenderRunId = null;
          }
          return;
        }
        const ok = insertHtmlIntoBody(el, html);
        if (ok) {
          try {
            const txt = (el.textContent || '').trim();
            if (txt) el.classList.remove('ql-blank');
          } catch (_) {}
          console.log('[Tilda Kovcheg] body rendered visually +', delay, 'ms');
          // После первой удачной визуальной вставки — прекращаем остальные ретраи
          if (window.__tkBodyRenderRunId === runId) {
            window.__tkBodyRenderRunId = null;
          }
        }
      }, delay);
    });
  }

  // Доп. сторож: если Tilda перерисовала блок и текст исчез, возвращаем его в видимый editor.
  function ensureBodyVisibleOnce(rawBody) {
    const body = String(rawBody || '').trim();
    if (!body) return;
    const html = body.startsWith('<') ? body : toParagraphHtml(body);
    const observer = new MutationObserver(() => {
      try {
        const d = getEditorDocument();
        const el = findBodyVisualEditor(d);
        if (!el) return;
        const hasText = (el.textContent || '').trim().length > 0;
        if (!hasText) {
          insertHtmlIntoBody(el, html);
          console.log('[Tilda Kovcheg] body restored by observer');
        } else {
          observer.disconnect();
        }
      } catch (_) {}
    });
    try {
      observer.observe((getEditorDocument() || document).documentElement || document.documentElement, {
        childList: true,
        subtree: true
      });
      setTimeout(() => observer.disconnect(), 12000);
    } catch (_) {}
  }

  function setCoverByUrl(url, processRunId) {
    return new Promise((resolve) => {
    if (typeof processRunId === 'number' && !isRunActive(processRunId)) return resolve(false);
    const fileInput = findCoverField(getEditorDocument());
    if (fileInput && fileInput.type === 'file') {
      setStatus('Обложка: скачиваю файл…', 'progress', { step: 'upload', percent: 74 });
      fetch(url, { mode: 'cors' })
        .then((r) => r.blob())
        .then((blob) => {
          if (typeof processRunId === 'number' && !isRunActive(processRunId)) return false;
          setStatus('Обложка: файл получен, загружаю в Tilda…', 'progress', { step: 'upload', percent: 78 });
          const file = new File([blob], 'cover.png', { type: blob.type || 'image/png' });
          const dt = new DataTransfer();
          dt.items.add(file);
          fileInput.files = dt.files;
          fileInput.dispatchEvent(new Event('change', { bubbles: true }));
          fileInput.dispatchEvent(new Event('input', { bubbles: true }));
          // Короткое ожидание готовности обложки перед автопубликацией
          setStatus('Обложка: ожидаю подтверждение загрузки…', 'progress', { step: 'upload', percent: 82 });
          return waitForCoverReady(6000);
        })
        .then((ready) => resolve(!!ready))
        .catch(() => {
          setStatus('Не удалось загрузить изображение по URL. Откройте ссылку вручную.', 'error');
          resolve(false);
        });
      return;
    }
    window.open(url, '_blank');
    setStatus('Обложка открыта в новой вкладке. Сохраните и загрузите в Tilda при необходимости.', 'success', { step: 'upload', percent: 80 });
    resolve(false);
    });
  }

  function setButtonsDisabled(disabled) {
    const root = document.getElementById('tilda-flows-extension-root');
    if (!root) return;
    root.querySelectorAll('.tfe-btn').forEach((b) => {
      const action = b.getAttribute('data-action') || '';
      if (action === 'stopProcess') b.disabled = false;
      else b.disabled = disabled;
    });
    root.classList.toggle('is-generating', !!disabled);
    const addRef = document.getElementById('tfe-add-ref');
    if (addRef) addRef.disabled = disabled;
  }

  function onStopProcess() {
    stopProcessRun('Остановлено пользователем.');
  }

  function onSaveSettings() {
    const root = document.getElementById('tilda-flows-extension-root');
    if (!root) return;
    const provider = ((root.querySelector('.tfe-api-provider') || {}).value || 'kie').trim();
    const apiKey = ((root.querySelector('.tfe-api-key') || {}).value || '').trim();
    const officialApiKey = ((root.querySelector('.tfe-official-api-key') || {}).value || '').trim();
    const wordstatApiKey = ((root.querySelector('.tfe-wordstat-api-key') || {}).value || '').trim();
    const authorName = ((root.querySelector('.tfe-author-name') || {}).value || '').trim();
    const authorLink = ((root.querySelector('.tfe-author-link') || {}).value || '').trim();
    
    const toneOfVoice = ((root.querySelector('.tfe-tone-of-voice') || {}).value || 'default').trim();
    const brandKnowledge = ((root.querySelector('.tfe-brand-knowledge') || {}).value || '').trim();
    const customFooter = ((root.querySelector('.tfe-custom-footer') || {}).value || '').trim();

    const statusEl = root.querySelector('.tfe-settings-status');
    const btn = root.querySelector('[data-action="saveSettings"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Сохранение…'; }
    chrome.storage.local.set({
      [API_PROVIDER_STORAGE]: provider,
      tilda_flows_api_key: apiKey,
      [OFFICIAL_API_KEY_STORAGE]: officialApiKey,
      [WORDSTAT_API_KEY_STORAGE]: wordstatApiKey,
      tilda_flows_author_name: authorName,
      tilda_flows_author_link: authorLink,
      [TONE_OF_VOICE_KEY]: toneOfVoice,
      [BRAND_KNOWLEDGE_KEY]: brandKnowledge,
      [CUSTOM_FOOTER_KEY]: customFooter
    }, function () {
      if (btn) { btn.disabled = false; btn.textContent = 'Сохранено ✓'; setTimeout(() => { btn.textContent = 'Сохранить настройки'; }, 3000); }
      if (statusEl) {
        const keyState = provider === 'official' 
          ? (officialApiKey ? 'Official: OK' : 'Official: не задан') 
          : (apiKey ? 'Kie: OK' : 'Kie: не задан');
        const wordstatState = wordstatApiKey ? 'Wordstat: OK' : 'Wordstat: off';
        statusEl.textContent = keyState + ' | ' + wordstatState + '.';
        statusEl.className = 'tfe-settings-status tfe-status show success';
        setTimeout(() => { statusEl.className = 'tfe-settings-status tfe-status'; }, 4000);
      }
    });
  }

  function saveHistoryItem(prompt, topicInfo, keywordData, imageUrl) {
    chrome.runtime.sendMessage({ action: 'getStorage' }, (storage) => {
      const historyKey = 'tilda_flows_history';
      const history = (storage && Array.isArray(storage[historyKey])) ? storage[historyKey] : [];
      const item = {
        date: new Date().toISOString(),
        prompt: String(prompt || '').trim(),
        topicInfo: String(topicInfo || '').trim(),
        keyword: keywordData && keywordData.primaryKeyword ? keywordData.primaryKeyword : '',
        imageUrl: imageUrl || ''
      };
      
      const newHistory = [item, ...history].slice(0, 50); // Keep max 50 items
      chrome.storage.local.set({ [historyKey]: newHistory });
    });
  }

  function applyFilledData(d, filled, storage) {
    let doc = getEditorDocument();
    if (!doc || !doc.querySelector) doc = document;
    expandSectionsIfNeeded(doc);

    // Отправляем данные в page context (injected.js перехватит XHR и сохранит их правильно)
    sendDataToPageContext(d, storage);

    // === Визуальное заполнение для отображения пользователю ===

    // Заголовок
    if (d.title && insertText(findTitleField(doc), d.title)) filled.push('заголовок');

    // Тело статьи — ТОЛЬКО визуальный .ql-editor в form-text
    // (чтобы текст реально отображался до публикации)
    primeBodyEditor(doc);
    let bodyEl = findBodyVisualEditor(doc) || (doc && doc.querySelector ? doc.querySelector('.tte-block-text__editable') : null);
    if (!bodyEl) {
      const host = findBodyEditorHost(doc);
      if (host) {
        try {
          host.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          host.focus && host.focus();
        } catch (_) {}
        bodyEl = findBodyVisualEditor(doc);
      }
    }
    const descProbe = findDescriptionField(doc);
    let hasPostForm = false;
    try { hasPostForm = !!doc.querySelector('form[id^="postform_"], form[id*="postform"]'); } catch (_) {}
    console.log('[Tilda Kovcheg] fields:', {
      docIsTop: doc === document,
      hasPostForm: hasPostForm,
      bodyFound: !!bodyEl,
      descFound: !!descProbe
    });
    console.log('[Tilda Kovcheg] bodyEl:', bodyEl ? (bodyEl.tagName + '.' + (bodyEl.className || '').slice(0, 40)) : 'null');
    
    if (d.body) {
      // Append Custom Footer if present
      const customFooter = storage && storage.tilda_flows_custom_footer;
      if (customFooter) {
        // Simple heuristic: if the body ends with a closing tag (like </p>), we just append the footer as HTML
        // It might be raw text, so let's wrap it in a div to be safe
        d.body += `\n<div class="tfe-custom-footer">${customFooter}</div>`;
      }
      
      if (bodyEl) {
        const html = d.body.trim().startsWith('<') ? d.body : toParagraphHtml(d.body);
        if (insertHtmlIntoBody(bodyEl, html)) filled.push('текст (визуально)');
      }
      // Всегда ретраим визуальную вставку, т.к. tte-редактор инициализируется лениво
      renderBodyVisibleWithRetries(d.body);
      ensureBodyVisibleOnce(d.body);
    }

    // Краткое описание — визуальный .ql-editor в form-param (только для отображения)
    // Реальное сохранение делает injected.js → textarea[name="descr"]
    if (d.shortDescription) {
      const formParam = getFormParamContainer(doc);
      const descVisual = formParam && formParam.querySelector('.ql-editor[contenteditable="true"]');
      if (descVisual) {
        const escaped = d.shortDescription.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        try { descVisual.innerHTML = '<p>' + escaped + '</p>'; } catch (_) {}
        descVisual.dispatchEvent(new Event('input', { bubbles: true }));
        filled.push('описание (визуально)');
      } else {
        // Fallback: insertText в найденное поле
        const descEl = findDescriptionField(doc);
        if (descEl) insertText(descEl, d.shortDescription);
      }
    }

    // Slug / alias
    if (d.slug && insertText(findSlugField(doc), d.slug)) filled.push('slug');

    // Автор (из настроек или из сгенерированных данных)
    const authorName = (storage && storage.tilda_flows_author_name) || d.authorName;
    const authorLink = (storage && storage.tilda_flows_author_link) || d.authorLink;
    if (authorName && insertText(findAuthorNameField(doc), authorName)) filled.push('автор');
    if (authorLink && insertText(findAuthorLinkField(doc), authorLink)) filled.push('ссылка автора');

    // Видимость
    const visEl = findVisibilityField(doc);
    if (d.visibility && visEl) {
      const val = /опубликовано|published|y/i.test(d.visibility) ? 'y' : '';
      try { visEl.value = val; visEl.dispatchEvent(new Event('change', { bubbles: true })); filled.push('видимость'); } catch (_) {}
    }

    // SEO / FB
    if (d.seoTitle && insertText(findSeoTitleField(doc), d.seoTitle)) filled.push('SEO заголовок');
    if (d.seoDescription && insertText(findSeoDescriptionField(doc), d.seoDescription)) filled.push('SEO описание');
    if (d.seoKeywords && insertText(findSeoKeywordsField(doc), d.seoKeywords)) filled.push('SEO ключевые слова');
    if (d.fbTitle && insertText(findFbTitleField(doc), d.fbTitle)) filled.push('FB заголовок');
    if (d.fbDescription && insertText(findFbDescriptionField(doc), d.fbDescription)) filled.push('FB описание');

    // Теги
    const tagsStr = Array.isArray(d.tags) ? d.tags.join(', ') : (d.tags || '');
    if (tagsStr && insertText(findTagsField(doc), tagsStr)) filled.push('теги');

    // Alt обложки — появляется после загрузки изображения, пробуем сразу и с задержкой
    if (d.imageAlt) {
      const tryAlt = (delay) => setTimeout(() => {
        const altEl = findImageAltField(getEditorDocument());
        if (altEl && !altEl.value) {
          insertText(altEl, d.imageAlt);
          console.log('[Tilda Kovcheg] alt обложки заполнен +', delay, 'ms');
        }
      }, delay);
      if (!insertText(findImageAltField(doc), d.imageAlt)) {
        [2000, 5000, 10000, 20000].forEach(tryAlt);
      } else {
        filled.push('alt обложки');
      }
    }
  }

  function onFillAllWithCover() {
    const prompt = getPrompt();
    const topicInfo = getTopicInfo();
    if (!prompt && !topicInfo) {
      setStatus('Введите промпт генерации или информацию для статьи.', 'error');
      return;
    }
    const imageOptions = getImageGenerationOptions();
    const referenceUrls = getReferenceUrls();
    if (imageOptions.requiresInputUrls && referenceUrls.length === 0) {
      setStatus('Для выбранной модели обложки добавьте минимум 1 референс URL.', 'error');
      return;
    }
    const runId = beginProcessRun();
    setButtonsDisabled(true);
    renderUsedKeywords({ enabled: false, reason: 'running' });
    setStatus('Старт пайплайна: подготовка запроса…', 'progress', { step: 'text', percent: 8 });

    chrome.runtime.sendMessage({
      action: 'generateFullPost',
      prompt,
      topicInfo,
      coverPrompt: getCoverPrompt(),
      coverText: getCoverText(),
      referenceUrls: referenceUrls,
      generationOptions: getGenerationOptions(),
      imageOptions: imageOptions
    }, (response) => {
      if (!isRunActive(runId)) return;
      setButtonsDisabled(false);
      if (chrome.runtime.lastError) {
        renderUsedKeywords({ enabled: false, reason: 'runtime_error' });
        setStatus('Ошибка: ' + chrome.runtime.lastError.message, 'error');
        return;
      }
      if (response && response.error) {
        renderUsedKeywords({ enabled: false, reason: 'api_error' });
        setStatus(response.error, 'error');
        return;
      }
      const d = response.data;
      const imageUrl = response.imageUrl;
      if (!d || typeof d !== 'object') {
        renderUsedKeywords({ enabled: false, reason: 'bad_response' });
        setStatus('Неверный ответ API.', 'error');
        return;
      }
      chrome.runtime.sendMessage({ action: 'getStorage' }, (storage) => {
        if (!isRunActive(runId)) return;
        if (storage) window._tildaFlowsStorage = storage;
        const filled = [];
        renderUsedKeywords(d && d._keywordResearch);
        setStatus('Применение данных в поля Tilda…', 'progress', { step: 'upload', percent: 70 });
        applyFilledData(d, filled, storage);
        saveHistoryItem(prompt, topicInfo, d && d._keywordResearch, imageUrl);
        
        if (imageUrl) {
          setStatus('Загрузка обложки…', 'progress', { step: 'upload', percent: 73 });
          setCoverByUrl(imageUrl, runId).then((coverReady) => {
            if (!isRunActive(runId)) return;
            filled.push('обложка');
            const msg = 'Заполнено: ' + (filled.length ? filled.join(', ') : 'поля не найдены');
            if (coverReady) {
              setStatus(msg, 'progress', { step: 'upload', percent: 88 });
              triggerAutoPublish(250, runId);
            } else {
              setStatus(msg + ' (обложка может догружаться)', 'progress', { step: 'upload', percent: 86 });
              triggerAutoPublish(1200, runId);
            }
          });
          return;
        }
        setStatus('Заполнено: ' + (filled.length ? filled.join(', ') : 'поля не найдены'), filled.length ? 'progress' : 'error', { step: 'upload', percent: 86 });
        triggerAutoPublish(250, runId);
      });
    });
  }

  function onFillAllFields() {
    const prompt = getPrompt();
    const topicInfo = getTopicInfo();
    if (!prompt && !topicInfo) {
      setStatus('Введите промпт генерации или информацию для статьи.', 'error');
      return;
    }
    const runId = beginProcessRun();
    setButtonsDisabled(true);
    renderUsedKeywords({ enabled: false, reason: 'running' });
    setStatus('Старт пайплайна: подготовка запроса…', 'progress', { step: 'text', percent: 8 });

    chrome.runtime.sendMessage({ action: 'generateStructuredText', prompt, topicInfo, generationOptions: getGenerationOptions() }, (response) => {
      if (!isRunActive(runId)) return;
      setButtonsDisabled(false);
      if (chrome.runtime.lastError) {
        renderUsedKeywords({ enabled: false, reason: 'runtime_error' });
        setStatus('Ошибка: ' + chrome.runtime.lastError.message, 'error');
        return;
      }
      if (response && response.error) {
        renderUsedKeywords({ enabled: false, reason: 'api_error' });
        setStatus(response.error, 'error');
        return;
      }
      const d = response && response.data;
      if (!d || typeof d !== 'object') {
        renderUsedKeywords({ enabled: false, reason: 'bad_response' });
        setStatus('Неверный ответ API.', 'error');
        return;
      }
      chrome.runtime.sendMessage({ action: 'getStorage' }, (storage) => {
        if (!isRunActive(runId)) return;
        if (storage) window._tildaFlowsStorage = storage;
        const filled = [];
        renderUsedKeywords(d && d._keywordResearch);
        setStatus('Применение данных в поля Tilda…', 'progress', { step: 'upload', percent: 70 });
        applyFilledData(d, filled, storage);
        saveHistoryItem(prompt, topicInfo, d && d._keywordResearch, null);
        setStatus('Заполнено: ' + (filled.length ? filled.join(', ') : 'поля не найдены'), filled.length ? 'progress' : 'error', { step: 'upload', percent: 86 });
        triggerAutoPublish(250, runId);
      });
    });
  }

  function onGenerateText() {
    const prompt = getPrompt();
    const topicInfo = getTopicInfo();
    if (!prompt && !topicInfo) {
      setStatus('Введите промпт генерации или информацию для статьи.', 'error');
      return;
    }
    setButtonsDisabled(true);
    setStatus('Генерация текста…', 'success');

    chrome.runtime.sendMessage({ action: 'generateText', prompt, topicInfo }, (response) => {
      setButtonsDisabled(false);
      if (chrome.runtime.lastError) {
        setStatus('Ошибка: ' + chrome.runtime.lastError.message, 'error');
        return;
      }
      if (response && response.error) {
        setStatus(response.error, 'error');
        return;
      }
      const text = (response && response.text) || '';
      if (!text) {
        setStatus('Пустой ответ от API.', 'error');
        return;
      }
      const titleEl = findTitleField();
      const bodyEl = findBodyVisualEditor() || findBodyField();
      const firstLine = text.split('\n')[0].trim();
      const rest = text.slice(firstLine.length).trim();
      if (titleEl && firstLine) insertText(titleEl, firstLine);
      if (bodyEl) insertText(bodyEl, rest || text);
      setStatus('Текст вставлен. Проверьте поля заголовка и тела.', 'success');
    });
  }

  function onGenerateImage() {
    const prompt = getCoverPrompt() || getPrompt();
    const coverText = getCoverText();
    if (!prompt) {
      setStatus('Введите промпт для обложки (описание изображения).', 'error');
      return;
    }
    const imageOptions = getImageGenerationOptions();
    const referenceUrls = getReferenceUrls();
    if (imageOptions.requiresInputUrls && referenceUrls.length === 0) {
      setStatus('Для выбранной модели добавьте минимум 1 референс URL.', 'error');
      return;
    }
    setButtonsDisabled(true);
    setStatus('Генерация обложки… Подождите.', 'progress', { step: 'cover', percent: 52 });

    chrome.runtime.sendMessage(
      {
        action: 'generateImage',
        prompt,
        input: {
          ...imageOptions,
          cover_text: coverText,
          image_input: referenceUrls
        }
      },
      (response) => {
        setButtonsDisabled(false);
        if (chrome.runtime.lastError) {
          setStatus('Ошибка: ' + chrome.runtime.lastError.message, 'error');
          return;
        }
        if (response && response.error) {
          setStatus(response.error, 'error');
          return;
        }
        const url = response && response.url;
        if (!url) {
          setStatus('Нет URL изображения в ответе.', 'error');
          return;
        }
        setCoverByUrl(url);
        setStatus('Обложка подставлена или открыта в новой вкладке.', 'success');
      }
    );
  }

  function highlightElement(el, color) {
    if (!el) return;
    el.style.setProperty('outline', '3px solid ' + color, 'important');
    el.style.setProperty('outline-offset', '2px', 'important');
    setTimeout(() => {
      el.style.removeProperty('outline');
      el.style.removeProperty('outline-offset');
    }, 3000);
  }

  function onDebugFields() {
    const doc = getEditorDocument();
    const bodyVisual = findBodyVisualEditor(doc);
    const bodyHost = findBodyEditorHost(doc);
    const fields = [
      ['Заголовок', findTitleField(doc)],
      ['Описание', findDescriptionField(doc)],
      ['Текст', bodyVisual || findBodyField(doc)],
      ['Хост текста', bodyHost],
      ['Slug', findSlugField(doc)],
      ['Автор', findAuthorNameField(doc)],
      ['Ссылка автора', findAuthorLinkField(doc)],
      ['Видимость', findVisibilityField(doc)],
      ['SEO загол.', findSeoTitleField(doc)],
      ['SEO опис.', findSeoDescriptionField(doc)],
      ['SEO ключевые', findSeoKeywordsField(doc)],
      ['FB загол.', findFbTitleField(doc)],
      ['FB опис.', findFbDescriptionField(doc)],
      ['Теги', findTagsField(doc)],
      ['Обложка', findCoverField(doc)],
      ['Alt обложки', findImageAltField(doc)]
    ];
    fields.forEach(([name, el]) => { if (el) highlightElement(el, '#1a73e8'); });
    // Дополнительно подсвечиваем контейнер текста, чтобы сразу видеть нужную зону
    const formTextWrap = (doc || document).querySelector('.tstore__editbox__form-text, .tore__editbox__form-text');
    if (formTextWrap) highlightElement(formTextWrap, '#34a853');
    const parts = fields.map(([name, el]) => (el ? name + ' ✓' : name + ' ✗'));
    setStatus(parts.join('  '), (bodyVisual || findBodyField(doc)) ? 'success' : 'error');
    console.log('[Tilda Kovcheg]', parts.join('  '));
    console.log('[Tilda Kovcheg] fields', Object.fromEntries(fields));
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (processRuntime.stopped) return;
    if (msg.type === 'fullPostProgress') {
      if (msg.step === 'wordstat') setStatus('Wordstat: подбор ключевых запросов (topRequests)…', 'progress', { step: 'text', percent: 12 });
      else if (msg.step === 'text') setStatus('Генерация текста…', 'progress', { step: 'text', percent: 20 });
      else if (msg.step === 'text_done') setStatus('Текст: готово, подготавливаю обложку…', 'progress', { step: 'cover', percent: 48 });
      else if (msg.step === 'cover') setStatus('Генерация обложки…', 'progress', { step: 'cover', percent: 56 });
      else if (msg.step === 'cover_done') setStatus('Обложка: URL получен, применяю в редакторе…', 'progress', { step: 'upload', percent: 72 });
      else setStatus('Генерация текста…', 'progress', { step: 'text', percent: 20 });
    }
    if (msg.type === 'wordstatProgress') {
      const state = String(msg.state || '').toLowerCase();
      if (state === 'skipped_no_key') {
        setStatus('Wordstat: ключ не задан, продолжаю без ключевых слов.', 'progress', { step: 'text', percent: 14 });
        renderUsedKeywords({ enabled: false, reason: 'no_key' });
      } else if (state === 'ai_seed_start') {
        renderUsedKeywords({ enabled: false, reason: 'ai_seed' });
        setStatus('Wordstat: AI подбирает seed-фразы…', 'progress', { step: 'text', percent: 10 });
      } else if (state === 'ai_seed_done') {
        const n = Number(msg.aiSeedCount) || 0;
        setStatus(`Wordstat: AI подготовил seed-фразы (${n}).`, 'progress', { step: 'text', percent: 11 });
      } else if (state === 'ai_seed_fallback') {
        setStatus('Wordstat: AI seed недоступен, аварийный fallback.', 'progress', { step: 'text', percent: 10 });
      } else if (state === 'ai_core_start') {
        setStatus('Wordstat: AI собирает семантическое ядро…', 'progress', { step: 'text', percent: 18 });
      } else if (state === 'ai_core_done') {
        setStatus('Wordstat: AI ядро сформировано.', 'progress', { step: 'text', percent: 19 });
      } else if (state === 'ai_core_fallback') {
        setStatus('Wordstat: AI ядро недоступно, применён fallback.', 'progress', { step: 'text', percent: 18 });
      } else if (state === 'start') {
        renderUsedKeywords({ enabled: false, reason: 'wordstat_running' });
        setStatus('Wordstat: старт сбора ключей…', 'progress', { step: 'text', percent: 12 });
      } else if (state === 'request') {
        const done = Number(msg.done) || 0;
        const total = Math.max(1, Number(msg.total) || 1);
        const phrase = (msg.phrase || '').toString().slice(0, 80);
        const pct = Math.min(19, 12 + Math.round((done / total) * 7));
        setStatus(`Wordstat: запрос ${done + 1}/${total} — ${phrase}`, 'progress', { step: 'text', percent: pct });
      } else if (state === 'success' || state === 'error') {
        const done = Number(msg.done) || 0;
        const total = Math.max(1, Number(msg.total) || 1);
        const pct = Math.min(19, 12 + Math.round((done / total) * 7));
        const label = state === 'success' ? 'ok' : 'ошибка';
        setStatus(`Wordstat: ${label} ${done}/${total}`, 'progress', { step: 'text', percent: pct });
      } else if (state === 'done') {
        const made = Number(msg.callsMade) || 0;
        const failed = Number(msg.callsFailed) || 0;
        const kw = (msg.topKeyword || '').toString().slice(0, 80);
        const suffix = kw ? `, топ: ${kw}` : '';
        setStatus(`Wordstat: готово (${made} ok, ${failed} fail${suffix})`, 'progress', { step: 'text', percent: 19 });
        renderUsedKeywords({
          enabled: true,
          primaryKeyword: msg.topKeyword || '',
          coverKeyword: msg.coverKeyword || '',
          totalCount: Number(msg.totalCount) || 0,
          selectedTotalCount: Number(msg.selectedTotalCount) || 0,
          topKeywords: Array.isArray(msg.topKeywords) ? msg.topKeywords : []
        });
      } else if (state === 'empty') {
        const made = Number(msg.callsMade) || 0;
        const failed = Number(msg.callsFailed) || 0;
        const why = String(msg.reason || 'empty').trim();
        setStatus(`Wordstat: пусто (${made} ok, ${failed} fail). Причина: ${why}.`, 'progress', { step: 'text', percent: 14 });
        renderUsedKeywords({ enabled: false, reason: `empty:${why}` });
      } else if (state === 'error') {
        setStatus('Wordstat: ошибка API, продолжаю без ключей.', 'progress', { step: 'text', percent: 14 });
        renderUsedKeywords({ enabled: false, reason: 'api_error' });
      } else if (state === 'skipped_disabled') {
        setStatus('Wordstat: SEO-агент выключен (toggle off).', 'progress', { step: 'text', percent: 14 });
        renderUsedKeywords({ enabled: false, reason: 'disabled' });
      } else if (state === 'cache_hit') {
        setStatus('Wordstat: использован сохраненный семантический отчёт.', 'progress', { step: 'text', percent: 17 });
        renderUsedKeywords({
          enabled: true,
          primaryKeyword: msg.topKeyword || '',
          coverKeyword: msg.coverKeyword || '',
          totalCount: Number(msg.totalCount) || 0,
          selectedTotalCount: Number(msg.selectedTotalCount) || 0,
          topKeywords: Array.isArray(msg.topKeywords) ? msg.topKeywords : []
        });
      } else if (state === 'regions_tree') {
        setStatus('Wordstat: обновляю дерево регионов (getRegionsTree)…', 'progress', { step: 'text', percent: 11 });
      } else if (state === 'insight') {
        const reasoning = String(msg.reasoning || '').trim();
        if (reasoning) {
          setStatus('Wordstat reasoning: ' + reasoning, 'progress', { step: 'text', percent: 19 });
        }
      } else if (state === 'calls_short') {
        const made = Number(msg.callsMade) || 0;
        const expected = Number(msg.callsExpected) || 0;
        setStatus(`Wordstat: выполнено ${made}/${expected} вызовов (часть фраз отклонена/ошибки API).`, 'progress', { step: 'text', percent: 18 });
      }
    }
    if (msg.type === 'imageProgress' && msg.state) {
      const state = String(msg.state).toLowerCase();
      const progressMap = { waiting: 50, queuing: 54, generating: 63, success: 76, fail: 63, created: 52 };
      const p = progressMap[state] || 60;
      setStatus('Обложка: ' + msg.state + '…', 'progress', { step: state === 'success' ? 'upload' : 'cover', percent: p });
    }
  });

  window.TildaFlowsDebug = {
    findTitleField,
    findDescriptionField,
    findBodyField,
    findSeoTitleField,
    findSeoDescriptionField,
    findSeoKeywordsField,
    findSlugField,
    findAuthorNameField,
    findAuthorLinkField,
    findVisibilityField,
    findTagsField,
    findFbTitleField,
    findFbDescriptionField,
    findCoverField,
    expandSectionsIfNeeded,
    isDescriptionField,
    insertText,
    insertHtmlIntoBody,
    highlight: highlightElement,
    check: onDebugFields
  };
  console.log('[Tilda Kovcheg] TildaFlowsDebug: .check(), .expandSectionsIfNeeded(), .find*Field(), .insertHtmlIntoBody(el, html), .highlight(el)');

function tryCreatePanel() {
    try {
      if (document.body) {
        try { createPanel(); } catch (e) { console.error('[Tilda Kovcheg] createPanel error', e); }
        return;
      }
      var attempts = 0;
      var t = setInterval(function () {
        attempts++;
        if (document.body) {
          clearInterval(t);
          try { createPanel(); } catch (e) { console.error('[Tilda Kovcheg] createPanel error', e); }
          return;
        }
        if (attempts >= 150) {
          clearInterval(t);
          console.warn('[Tilda Kovcheg] no document.body after 30s');
        }
      }, 200);
    } catch (e) {
      console.error('[Tilda Kovcheg] tryCreatePanel error', e);
    }
  }

  // Инжектируем перехватчик XHR в контекст страницы (только в top frame)
  if (window === window.top) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectPageScript);
    } else {
      injectPageScript();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryCreatePanel);
  } else {
    tryCreatePanel();
  }
  window.addEventListener('load', function () {
    if (!document.getElementById('tilda-flows-extension-root') && shouldShowPanelHere() && document.body) {
      try { createPanel(); } catch (e) { console.error('[Tilda Kovcheg] createPanel on load error', e); }
    }
  });
})();
