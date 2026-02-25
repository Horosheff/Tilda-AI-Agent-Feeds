(function () {
  'use strict';

  // Данные для инжекции в запрос сохранения
  let pendingData = null;
  let pendingUntil = 0;
  let successfulInjects = 0;

  // Принимаем данные от content script через postMessage
  window.addEventListener('message', function (e) {
    if (e.source !== window) return;
    if (e.data && e.data.__tildaKovcheg === 'setData') {
      pendingData = e.data.payload;
      pendingUntil = Date.now() + 90 * 1000; // держим payload до 90с на серию save-запросов
      successfulInjects = 0;
      console.log('[TK-inject] Данные получены для инжекции:', Object.keys(pendingData || {}));
    }
  });

  // Конвертация HTML → JSON-блоки Tilda (формат textarea[name="text"])
  function htmlToTildaBlocks(html) {
    if (!html) return [];
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const root = doc.body;
      const blocks = [];
      const buf = [];
      function flush() {
        if (!buf.length) return;
        const s = buf.join('').trim();
        if (s) blocks.push({ ty: 'text', te: s });
        buf.length = 0;
      }
      for (const el of root.children) {
        const tag = (el.tagName || '').toLowerCase();
        if (['h2', 'h3', 'h4'].includes(tag)) {
          flush();
          blocks.push({ ty: 'heading', te: el.outerHTML });
        } else if (tag === 'blockquote') {
          flush();
          blocks.push({ ty: 'quote', te: el.innerHTML.trim() });
        } else if (tag === 'pre') {
          flush();
          const code = el.querySelector('code');
          blocks.push({ ty: 'code', te: (code || el).textContent.trim() });
        } else if (tag === 'hr') {
          flush();
          blocks.push({ ty: 'delimiter' });
        } else {
          const s = el.outerHTML.trim();
          if (s) buf.push(s);
        }
      }
      flush();
      if (!blocks.length) blocks.push({ ty: 'text', te: html });
      return blocks;
    } catch (e) {
      return [{ ty: 'text', te: html }];
    }
  }

  // Инжектируем наши данные в POST-тело запроса сохранения
  function readLiveEditorData() {
    try {
      const bodyEditor =
        document.querySelector('.tstore__editbox__form-text .ql-editor[contenteditable="true"]') ||
        document.querySelector('.tore__editbox__form-text .ql-editor[contenteditable="true"]') ||
        document.querySelector('.tte-block-text__editable .ql-editor[contenteditable="true"]') ||
        document.querySelector('.ql-editor[contenteditable="true"][data-placeholder*="Введите текст"]');

      const descEditor =
        document.querySelector('.tstore__editbox__form-params .ql-editor[contenteditable="true"]') ||
        document.querySelector('.tstore__editbox__form-param .ql-editor[contenteditable="true"]') ||
        document.querySelector('.tore__editbox__form-param .ql-editor[contenteditable="true"]');

      const bodyHtml = bodyEditor ? (bodyEditor.innerHTML || '').trim() : '';
      const bodyText = bodyEditor ? (bodyEditor.textContent || '').trim() : '';

      const descTa = document.querySelector('textarea[name="descr"]');
      const descFromTa = descTa ? (descTa.value || '').trim() : '';
      const descFromEditor = descEditor ? (descEditor.textContent || '').trim() : '';

      return {
        bodyHtml,
        bodyText,
        shortDescription: descFromTa || descFromEditor
      };
    } catch (_) {
      return { bodyHtml: '', bodyText: '', shortDescription: '' };
    }
  }

  function isSaveRequestBody(body) {
    if (typeof body !== 'string') return false;
    return body.includes('action=posts_Edit') || body.includes('comm=savepost');
  }

  function injectIntoBody(rawBody, data) {
    try {
      const p = new URLSearchParams(rawBody);
      const live = readLiveEditorData();
      const merged = Object.assign({}, data);

      // Если пользователь изменил текст в редакторе — отправляем ИМЕННО его
      if (live.bodyText && live.bodyText.length > 10 && live.bodyHtml) {
        merged.body = live.bodyHtml;
      }
      // Если пользователь изменил краткое описание — отправляем его
      if (live.shortDescription) {
        merged.shortDescription = live.shortDescription;
      }

      if (merged.body) {
        const blocks = htmlToTildaBlocks(merged.body);
        p.set('text', JSON.stringify(blocks));
        console.log('[TK-inject] text injected:', blocks.length, 'blocks');
      }
      if (merged.shortDescription) {
        p.set('descr', merged.shortDescription);
        console.log('[TK-inject] descr injected:', merged.shortDescription.slice(0, 60));
      }
      if (merged.seoTitle) p.set('seo_title', merged.seoTitle);
      if (merged.seoDescription) p.set('seo_descr', merged.seoDescription);
      if (merged.seoKeywords) p.set('seo_keywords', merged.seoKeywords);
      if (merged.slug) p.set('postalias', merged.slug);
      if (merged.authorName) p.set('authorname', merged.authorName);
      if (merged.authorLink) p.set('authorurl', merged.authorLink);
      if (merged.fbTitle) p.set('fb_title', merged.fbTitle);
      if (merged.fbDescription) p.set('fb_descr', merged.fbDescription);
      if (merged.visibility) {
        const isPublished = /опубликовано|published|y/i.test(merged.visibility);
        p.set('visibility', isPublished ? 'y' : '');
      }
      if (merged.tags) {
        const tagsStr = Array.isArray(merged.tags) ? merged.tags.join(', ') : merged.tags;
        if (tagsStr) p.set('tags', tagsStr);
      }

      successfulInjects += 1;
      // После нескольких успешных инъекций можно очистить payload
      if (successfulInjects >= 4) {
        pendingData = null;
        pendingUntil = 0;
        successfulInjects = 0;
      }

      return p.toString();
    } catch (e) {
      console.error('[TK-inject] Ошибка инжекции:', e);
      return rawBody;
    }
  }

  // Перехват XMLHttpRequest
  const _origOpen = XMLHttpRequest.prototype.open;
  const _origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this.__tkMethod = method;
    this.__tkUrl = String(url);
    return _origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function (body) {
    if (
      pendingData &&
      Date.now() < pendingUntil &&
      this.__tkMethod === 'POST' &&
      isSaveRequestBody(body)
    ) {
      console.log('[TK-inject] XHR перехвачен! Инжектируем данные...');
      body = injectIntoBody(body, pendingData);
    }
    return _origSend.call(this, body);
  };

  // Перехват fetch
  const _origFetch = window.fetch;
  window.fetch = function (url, options) {
    try {
      let fetchOptions = options || {};
      let reqBody = fetchOptions.body;
      
      // Обработка случая, когда первый аргумент — это объект Request
      if (typeof url === 'object' && url !== null && 'body' in url && !options) {
        // Мы не можем легко извлечь и изменить body из Request, 
        // но Tilda обычно использует options.body для POST-запросов
        reqBody = undefined;
      }

      if (
        pendingData &&
        Date.now() < pendingUntil &&
        isSaveRequestBody(reqBody)
      ) {
        console.log('[TK-inject] fetch перехвачен! Инжектируем данные...');
        fetchOptions = Object.assign({}, fetchOptions, {
          body: injectIntoBody(reqBody, pendingData)
        });
        return _origFetch.call(window, url, fetchOptions);
      }
    } catch (e) {
      console.error('[TK-inject] Ошибка в перехватчике fetch:', e);
    }
    return _origFetch.apply(this, arguments);
  };

  console.log('[TK-inject] XHR/fetch перехватчик установлен ✓');
})();
