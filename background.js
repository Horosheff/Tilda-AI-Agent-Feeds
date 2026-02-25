importScripts('lib/api-text.js', 'lib/api-image.js', 'lib/api-wordstat.js');

const API_KEY_STORAGE = 'tilda_flows_api_key';
const OFFICIAL_API_KEY_STORAGE = 'tilda_flows_official_gemini_api_key';
const API_PROVIDER_STORAGE = 'tilda_flows_api_provider';
const WORDSTAT_API_KEY_STORAGE = 'tilda_flows_wordstat_api_key';
const WORDSTAT_REPORTS_STORAGE = 'tilda_flows_wordstat_reports';
const WORDSTAT_REGIONS_TREE_STORAGE = 'tilda_flows_wordstat_regions_tree';
const BRAND_KNOWLEDGE_KEY = 'tilda_flows_brand_knowledge';
const TONE_OF_VOICE_KEY = 'tilda_flows_tone_of_voice';
const CUSTOM_FOOTER_KEY = 'tilda_flows_custom_footer';
const HISTORY_STORAGE = 'tilda_flows_history';
const WORDSTAT_REPORT_VERSION = 3;
const STORAGE_KEYS = [API_KEY_STORAGE, OFFICIAL_API_KEY_STORAGE, API_PROVIDER_STORAGE, WORDSTAT_API_KEY_STORAGE, 'tilda_flows_author_name', 'tilda_flows_author_link', BRAND_KNOWLEDGE_KEY, TONE_OF_VOICE_KEY, CUSTOM_FOOTER_KEY, HISTORY_STORAGE];

function detectTopicContext(text) {
  const t = (text || '').toLowerCase();
  const platforms = [];
  if (/\bvk\b|вк|vkontakte/.test(t)) platforms.push('VK');
  if (/telegram|телеграм/.test(t)) platforms.push('Telegram');
  if (/tilda|тильда/.test(t)) platforms.push('Tilda');
  if (/notion|ноушн/.test(t)) platforms.push('Notion');
  if (/youtube|ютуб/.test(t)) platforms.push('YouTube');
  if (/instagram|инстаграм/.test(t)) platforms.push('Instagram');
  if (/openai|chatgpt|gpt/.test(t)) platforms.push('OpenAI/ChatGPT');
  if (/gemini|google ai/.test(t)) platforms.push('Gemini');
  return {
    platforms: Array.from(new Set(platforms)),
    hasAiTopic: /ai|ии|нейросет|gpt|gemini|llm/.test(t),
    hasMarketingTopic: /маркет|ads|реклама|smm|seo|контент/.test(t)
  };
}

function buildTopicTrigger(titleHint, customPrompt) {
  const src = `${titleHint || ''} ${customPrompt || ''}`.trim();
  if (!src) return 'главный инсайт';
  const cleaned = src
    .replace(/["'`]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const stopWords = new Set([
    'и', 'в', 'во', 'на', 'по', 'о', 'об', 'от', 'для', 'из', 'к', 'ко', 'с', 'со', 'у', 'за',
    'как', 'что', 'это', 'при', 'или', 'а', 'но', 'же', 'ли', 'the', 'a', 'an', 'of', 'to', 'in'
  ]);
  const words = cleaned
    .split(' ')
    .map((w) => w.trim())
    .filter(Boolean)
    .filter((w) => !stopWords.has(w.toLowerCase()));
  const picked = words.slice(0, 4);
  if (picked.length >= 2) return picked.join(' ');
  // fallback
  const raw = cleaned.split(' ').filter(Boolean).slice(0, 3);
  return raw.join(' ') || 'главный инсайт';
}

function buildCoverPromptWithPreset(model, titleHint, customPrompt, coverText) {
  const shortTitle = (titleHint || customPrompt || 'ТЕМА СТАТЬИ').toString().trim();
  const topicTrigger = buildTopicTrigger(titleHint, customPrompt);
  const extra = (customPrompt || '').toString().trim();
  const coverTextLine = (coverText || '').toString().trim();
  const textForRender = coverTextLine || topicTrigger;
  const topic = detectTopicContext(`${shortTitle}\n${extra}`);
  const primaryBrief = (extra || shortTitle || 'Тема статьи').trim();
  const platformLine = topic.platforms.length
    ? `Include ONLY these relevant platform logos as stickers: ${topic.platforms.join(', ')}.`
    : 'Do not force random platform logos. Add a logo ONLY if clearly relevant to the topic.';

  // Единые safety-ограничения и требования к кириллице
  const safetyBlock = [
    'SAFETY GUIDELINES (STRICT):',
    '- NO politics, NO presidents, NO political figures.',
    '- NO war, NO weapons, NO violence, NO military symbols.',
    '- NO drugs, NO alcohol, NO illegal substances.',
    '- NO NSFW, NO offensive content.',
    '- Focus on DIGITAL marketing culture, office memes, deadlines, CRM, code.'
  ].join('\n');

  if (model === 'nano-banana-pro' || model === 'gemini-3-pro-image-preview') {
    return [
      'Create a cover image for a Tilda article.',
      `PRIMARY USER REQUIREMENT (highest priority): "${primaryBrief}".`,
      'Do not ignore this requirement and do not replace it with generic imagery.',
      'MANDATORY STYLE LOCK (must follow all points below):',
      'Style: cultural-digital collage, 2016 Runet aesthetics.',
      'Background: bright yellow #FFD700.',
      'Main text: large bold purple #6B46C1, uppercase sans-serif, 2-3 lines.',
      'The main cover text MUST be in Russian (Cyrillic), high contrast.',
      `TEXT TO RENDER ON COVER (high priority): "${textForRender}".`,
      `Use this text (or minimal adaptation preserving meaning), avoid full article title. Topic trigger fallback: "${topicTrigger}".`,
      'Do NOT place the full article headline on the cover.',
      'Include relevant internet meme stickers by topic.',
      platformLine,
      'Visual elements: cut-out UI fragments (Windows 95/XP style errors), pixel icons, thumbs up, money symbols, charts.',
      'STRICTLY NON-POLITICAL.',
      safetyBlock,
      'Technical params to follow:',
      '- aspect ratio: 4:3',
      '- resolution: STRICTLY 1K',
      '- output should be suitable for Tilda upload',
      '- if any instruction conflicts, prioritize STYLE LOCK and PRIMARY USER REQUIREMENT',
      extra ? `Extra user instructions: ${extra}` : ''
    ].filter(Boolean).join('\n');
  }

  if (model === 'gpt-image/1.5-text-to-image') {
    return [
      'Create a high-quality article cover image.',
      `PRIMARY USER REQUIREMENT (highest priority): "${primaryBrief}".`,
      'Follow this requirement strictly; do not replace the concept with unrelated visuals.',
      'MANDATORY STYLE LOCK (must follow all points below):',
      'Style: cultural-digital collage, 2016 Runet aesthetics, sticker/cut-out composition.',
      'Background MUST be bright yellow #FFD700 and visually dominant.',
      'Main text color MUST be purple #6B46C1.',
      'Text should be uppercase sans-serif, 2-3 lines, high contrast.',
      `TEXT TO RENDER ON COVER (high priority): "${textForRender}".`,
      `If adaptation is needed, keep meaning and keep it short. Topic trigger fallback: "${topicTrigger}".`,
      'Do NOT render the full article headline on cover.',
      'Use Russian (Cyrillic) for rendered text.',
      platformLine,
      'Visual elements: cut-out UI fragments, pixel/glitch icons, thumbs up, money symbols, charts.',
      'Avoid photorealistic style; prefer digital art collage.',
      safetyBlock,
      'Technical params to follow:',
      '- keep composition suitable for 4:3/3:2 cover framing',
      '- if any instruction conflicts, prioritize STYLE LOCK and PRIMARY USER REQUIREMENT',
      extra ? `Extra user instructions: ${extra}` : ''
    ].filter(Boolean).join('\n');
  }

  if (model === 'gpt-image/1.5-image-to-image') {
    return [
      'Edit the provided input image(s) into an article cover while preserving key identity/composition.',
      `PRIMARY USER REQUIREMENT (highest priority): "${primaryBrief}".`,
      'Follow this requirement strictly; keep the concept from user brief.',
      'MANDATORY STYLE LOCK (must follow all points below):',
      'Transform into cultural-digital collage, 2016 Runet aesthetics, sticker/cut-out composition.',
      'Background should be bright yellow #FFD700 when possible.',
      'Main text color MUST be purple #6B46C1.',
      `TEXT TO RENDER ON COVER (high priority): "${textForRender}".`,
      `If adaptation is needed, keep meaning and keep it short. Topic trigger fallback: "${topicTrigger}".`,
      'Do NOT render the full article headline on cover.',
      'Use Russian (Cyrillic) for rendered text.',
      platformLine,
      'Visual elements: cut-out UI fragments, pixel/glitch icons, thumbs up, money symbols, charts.',
      safetyBlock,
      'Technical params to follow:',
      '- preserve key identity from source image, but enforce STYLE LOCK',
      '- if any instruction conflicts, prioritize STYLE LOCK and PRIMARY USER REQUIREMENT',
      extra ? `Extra user instructions: ${extra}` : ''
    ].filter(Boolean).join('\n');
  }

  return extra || shortTitle || 'Article cover image';
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'generateText') {
    handleGenerateText(message.prompt, message.topicInfo, sender.tab?.id, sendResponse);
    return true;
  }
  if (message.action === 'generateImage') {
    handleGenerateImage(message.prompt, message.input || {}, sender.tab?.id, sendResponse);
    return true;
  }
  if (message.action === 'generateStructuredText') {
    handleGenerateStructuredText(message.prompt, message.topicInfo, message.generationOptions, sender.tab?.id, sendResponse);
    return true;
  }
  if (message.action === 'generateFullPost') {
    handleGenerateFullPost(message, sender.tab?.id, sendResponse);
    return true;
  }
  if (message.action === 'getApiKey') {
    chrome.storage.local.get([API_KEY_STORAGE], (r) => sendResponse({ key: r[API_KEY_STORAGE] || null }));
    return true;
  }
  if (message.action === 'getStorage') {
    chrome.storage.local.get(STORAGE_KEYS, sendResponse);
    return true;
  }
  if (message.action === 'getWordstatRegions') {
    handleGetWordstatRegions(sendResponse);
    return true;
  }
  return false;
});

async function getApiConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get([API_KEY_STORAGE, OFFICIAL_API_KEY_STORAGE, API_PROVIDER_STORAGE], (r) => {
      const provider = r[API_PROVIDER_STORAGE] || 'kie';
      const key = provider === 'official' ? r[OFFICIAL_API_KEY_STORAGE] : r[API_KEY_STORAGE];
      resolve({ apiKey: key || null, apiProvider: provider });
    });
  });
}

async function getApiKey() {
  const cfg = await getApiConfig();
  return cfg.apiKey;
}

async function getWordstatApiKey() {
  return new Promise((resolve) => {
    chrome.storage.local.get([WORDSTAT_API_KEY_STORAGE], (r) => resolve(r[WORDSTAT_API_KEY_STORAGE] || null));
  });
}

function normalizeWordstatPromptKey(prompt) {
  return String(prompt || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function normalizeKeywordPhraseShort(value) {
  const stopTail = new Set(['и', 'в', 'во', 'на', 'по', 'о', 'об', 'от', 'для', 'из', 'к', 'с', 'у', 'за', 'как', 'что', 'это', 'или', 'а', 'но', 'при', 'со', 'под', 'над', 'между']);
  const cleaned = String(value || '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[^\p{L}\p{N}\s+\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  let words = cleaned.split(/\s+/).filter(Boolean);
  while (words.length && stopTail.has(words[words.length - 1].toLowerCase())) words.pop();
  while (words.length && stopTail.has(words[0].toLowerCase())) words.shift();
  if (words.length > 3) return '';
  return words.join(' ').trim();
}

function normalizeKeywordListShort(list) {
  const out = [];
  const seen = new Set();
  const src = Array.isArray(list) ? list : [];
  for (const item of src) {
    const phrase = normalizeKeywordPhraseShort(item && item.phrase);
    const count = Number(item && item.count) || 0;
    if (!phrase) continue;
    const words = phrase.split(/\s+/).filter(Boolean);
    if (words.length < 1 || words.length > 3) continue;
    const key = phrase.toLowerCase();
    const compactKey = key.replace(/[\s\-]+/g, '');
    if (seen.has(key)) continue;
    if (compactKey && seen.has(compactKey)) continue;
    seen.add(key);
    if (compactKey) seen.add(compactKey);
    out.push({ phrase, count });
    if (out.length >= 20) break;
  }
  return out;
}

function normalizeKeywordResearchPayload(report) {
  const topKeywords = normalizeKeywordListShort(report && report.keywords ? report.keywords : report && report.topKeywords ? report.topKeywords : []);
  const primaryKeyword = normalizeKeywordPhraseShort((report && report.primaryKeyword) || (topKeywords[0] && topKeywords[0].phrase) || '');
  const coverKeyword = normalizeKeywordPhraseShort((report && report.coverKeyword) || (topKeywords[1] && topKeywords[1].phrase) || primaryKeyword || '');
  const selectedTotalCount = topKeywords.reduce((sum, k) => sum + (Number(k && k.count) || 0), 0);
  return {
    topKeywords,
    primaryKeyword: primaryKeyword || (topKeywords[0] && topKeywords[0].phrase) || '',
    coverKeyword: coverKeyword || (topKeywords[1] && topKeywords[1].phrase) || (primaryKeyword || ''),
    totalCount: Number(report && report.totalCount) || 0,
    selectedTotalCount,
    callsMade: Number(report && report.callsMade) || 0,
    callsFailed: Number(report && report.callsFailed) || 0,
    source: report && report.source ? report.source : 'live'
  };
}

function extractTopicEntitiesForValidation(topic) {
  // Отключено: агрессивная фильтрация по точным словам ломает семантику для длинных промптов
  return [];
}

function filterKeywordsByTopicEntities(payload, topic) {
  // Отключено: возвращаем оригинальный ответ AI без жесткой фильтрации
  return payload;
}

async function getCachedWordstatReport(prompt, generationOptions) {
  const key = normalizeWordstatPromptKey(prompt);
  if (!key) return null;
  return new Promise((resolve) => {
    chrome.storage.local.get([WORDSTAT_REPORTS_STORAGE], (r) => {
      const list = Array.isArray(r[WORDSTAT_REPORTS_STORAGE]) ? r[WORDSTAT_REPORTS_STORAGE] : [];
      const geoMode = (generationOptions && generationOptions.wordstatGeoMode) || 'ru';
      const depth = (generationOptions && generationOptions.wordstatDepth) || 'light';
      const now = Date.now();
      const hit = list.find((x) =>
        x &&
        x.promptKey === key &&
        x.version === WORDSTAT_REPORT_VERSION &&
        x.geoMode === geoMode &&
        x.depth === depth &&
        typeof x.createdAt === 'number' &&
        (now - x.createdAt) <= 7 * 24 * 60 * 60 * 1000
      );
      resolve(hit || null);
    });
  });
}

async function saveWordstatReport(prompt, generationOptions, report) {
  const promptKey = normalizeWordstatPromptKey(prompt);
  if (!promptKey || !report || !report.enabled) return;
  return new Promise((resolve) => {
    chrome.storage.local.get([WORDSTAT_REPORTS_STORAGE], (r) => {
      const list = Array.isArray(r[WORDSTAT_REPORTS_STORAGE]) ? r[WORDSTAT_REPORTS_STORAGE] : [];
      const item = {
        version: WORDSTAT_REPORT_VERSION,
        createdAt: Date.now(),
        promptKey,
        prompt: String(prompt || '').slice(0, 300),
        depth: (generationOptions && generationOptions.wordstatDepth) || 'light',
        geoMode: (generationOptions && generationOptions.wordstatGeoMode) || 'ru',
        primaryKeyword: normalizeKeywordPhraseShort(report.primaryKeyword || ''),
        coverKeyword: normalizeKeywordPhraseShort(report.coverKeyword || ''),
        totalCount: Number(report.totalCount) || 0,
        callsMade: report.callsMade || 0,
        callsFailed: report.callsFailed || 0,
        topKeywords: normalizeKeywordListShort(report.keywords || []).slice(0, 20)
      };
      const next = [item].concat(list.filter((x) => !(x && x.promptKey === promptKey))).slice(0, 30);
      chrome.storage.local.set({ [WORDSTAT_REPORTS_STORAGE]: next }, () => resolve());
    });
  });
}

function extractRegionId(node) {
  if (!node || typeof node !== 'object') return null;
  const id = node.regionId || node.id || node.value;
  const n = Number(id);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function walkRegionTree(tree, cb) {
  const stack = Array.isArray(tree) ? tree.slice() : [tree];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    cb(node);
    const children = node.children || node.childs || node.items || node.regions;
    if (Array.isArray(children)) {
      for (const ch of children) stack.push(ch);
    }
  }
}

function flattenWordstatRegions(tree, limit) {
  const out = [];
  walkRegionTree(tree, (node) => {
    const id = extractRegionId(node);
    if (!id) return;
    const name = String(node.name || node.title || node.regionName || '').trim();
    if (!name) return;
    out.push({ id, name });
  });
  const uniq = [];
  const seen = new Set();
  for (const r of out) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    uniq.push(r);
    if (uniq.length >= (limit || 400)) break;
  }
  return uniq;
}

function detectRussiaRegionId(tree) {
  let found = null;
  walkRegionTree(tree, (node) => {
    if (found) return;
    const name = String(node.name || node.title || node.regionName || '').toLowerCase();
    if (!name) return;
    if (/росси|российск|russia/.test(name)) {
      found = extractRegionId(node);
    }
  });
  return found;
}

async function getWordstatRegionsTreeCached(token, tabId) {
  if (!token) return null;
  return new Promise((resolve) => {
    chrome.storage.local.get([WORDSTAT_REGIONS_TREE_STORAGE], async (r) => {
      const cache = r[WORDSTAT_REGIONS_TREE_STORAGE];
      const now = Date.now();
      if (cache && cache.updatedAt && (now - cache.updatedAt) < 24 * 60 * 60 * 1000 && cache.tree) {
        resolve(cache.tree);
        return;
      }
      try {
        if (tabId) chrome.tabs.sendMessage(tabId, { type: 'wordstatProgress', state: 'regions_tree' }).catch(() => {});
        const tree = await wordstatGetRegionsTree(token);
        chrome.storage.local.set({
          [WORDSTAT_REGIONS_TREE_STORAGE]: {
            updatedAt: now,
            tree: tree
          }
        }, () => resolve(tree));
      } catch (_) {
        resolve(cache && cache.tree ? cache.tree : null);
      }
    });
  });
}

async function handleGetWordstatRegions(sendResponse) {
  try {
    const token = await getWordstatApiKey();
    if (!token) {
      sendResponse({ regions: [{ id: 225, name: 'Россия (fallback)' }], source: 'fallback_no_key' });
      return;
    }
    const tree = await getWordstatRegionsTreeCached(token, null);
    if (!tree) {
      sendResponse({ regions: [{ id: 225, name: 'Россия (fallback)' }], source: 'fallback_no_tree' });
      return;
    }
    const regions = flattenWordstatRegions(tree, 600);
    sendResponse({ regions, source: 'wordstat_tree' });
  } catch (err) {
    sendResponse({ regions: [{ id: 225, name: 'Россия (fallback)' }], source: 'fallback_error', error: err && err.message ? err.message : String(err) });
  }
}

async function buildWordstatRegions(generationOptions, token, tabId) {
  const mode = (generationOptions && generationOptions.wordstatGeoMode) || 'ru';
  if (mode === 'all') return undefined;
  const tree = await getWordstatRegionsTreeCached(token, tabId);
  if (mode === 'custom') {
    const ids = Array.isArray(generationOptions && generationOptions.wordstatRegionIds)
      ? generationOptions.wordstatRegionIds.filter((n) => Number.isFinite(n) && n > 0)
      : [];
    if (!ids.length) return undefined;
    if (!tree) return ids;
    const allow = new Set();
    walkRegionTree(tree, (node) => {
      const id = extractRegionId(node);
      if (id) allow.add(id);
    });
    const filtered = ids.filter((id) => allow.has(id));
    return filtered.length ? filtered : ids;
  }
  // RU by default; try to resolve from getRegionsTree, fallback to 225.
  const ruId = tree ? detectRussiaRegionId(tree) : null;
  return [ruId || 225];
}

function buildKeywordReasoningText(report, generationOptions, source) {
  const primary = String((report && report.primaryKeyword) || '').trim();
  const cover = String((report && report.coverKeyword) || '').trim();
  const top = Array.isArray(report && report.keywords) ? report.keywords : (Array.isArray(report && report.topKeywords) ? report.topKeywords : []);
  const top3 = top.slice(0, 3).map((k) => String(k && k.phrase || '').trim()).filter(Boolean);
  const depth = (generationOptions && generationOptions.wordstatDepth) === 'pro' ? 'Pro' : 'Light';
  const geoMode = (generationOptions && generationOptions.wordstatGeoMode) || 'ru';
  const geoText = geoMode === 'custom'
    ? `custom(${Array.isArray(generationOptions.wordstatRegionIds) ? generationOptions.wordstatRegionIds.join(',') : ''})`
    : geoMode;
  const src = source === 'cache' ? 'cache' : 'live';
  const lead = primary ? `Primary "${primary}"` : 'Primary не определён';
  const coverTxt = cover ? `, cover "${cover}"` : '';
  const cluster = top3.length ? `. Кластер: ${top3.join(' | ')}` : '';
  return `${lead}${coverTxt}. Depth=${depth}, geo=${geoText}, source=${src}${cluster}`;
}

async function getWordstatKeywordResearch(prompt, generationOptions, tabId, geminiApiKey) {
  if (generationOptions && generationOptions.useWordstatAgent === false) {
    if (tabId) chrome.tabs.sendMessage(tabId, { type: 'wordstatProgress', state: 'skipped_disabled' }).catch(() => {});
    return { enabled: false, reason: 'wordstat_disabled' };
  }
  const wordstatApiKey = await getWordstatApiKey();
  if (!wordstatApiKey) {
    if (tabId) chrome.tabs.sendMessage(tabId, { type: 'wordstatProgress', state: 'skipped_no_key' }).catch(() => {});
    return { enabled: false, reason: 'no_wordstat_key' };
  }
  const cached = await getCachedWordstatReport(prompt, generationOptions || {});
  if (cached && Array.isArray(cached.topKeywords) && cached.topKeywords.length) {
    const normalized = normalizeKeywordResearchPayload({
      source: 'cache',
      primaryKeyword: cached.primaryKeyword,
      coverKeyword: cached.coverKeyword,
      totalCount: cached.totalCount,
      callsMade: cached.callsMade,
      callsFailed: cached.callsFailed,
      topKeywords: cached.topKeywords
    });
    const insight = buildKeywordReasoningText(cached, generationOptions || {}, 'cache');
    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        type: 'wordstatProgress',
        state: 'cache_hit',
        topKeyword: normalized.primaryKeyword || '',
        coverKeyword: normalized.coverKeyword || '',
        totalCount: normalized.totalCount || 0,
        selectedTotalCount: normalized.selectedTotalCount || 0,
        topKeywords: normalized.topKeywords.slice(0, 12)
      }).catch(() => {});
      chrome.tabs.sendMessage(tabId, {
        type: 'wordstatProgress',
        state: 'insight',
        reasoning: insight
      }).catch(() => {});
    }
    return {
      enabled: true,
      source: 'cache',
      callsMade: normalized.callsMade || 0,
      callsFailed: normalized.callsFailed || 0,
      totalCount: normalized.totalCount || 0,
      primaryKeyword: normalized.primaryKeyword || '',
      coverKeyword: normalized.coverKeyword || '',
      keywords: normalized.topKeywords || []
    };
  }
  if (tabId) chrome.tabs.sendMessage(tabId, { type: 'fullPostProgress', step: 'wordstat' }).catch(() => {});
  try {
    if (tabId) chrome.tabs.sendMessage(tabId, { type: 'wordstatProgress', state: 'ai_seed_start' }).catch(() => {});
    const requestedCalls = (generationOptions && generationOptions.wordstatDepth) === 'pro' ? 10 : 3;
    let aiSeeds = [];
    try {
      const cfg = await getApiConfig();
      const geminiApiKey = cfg.apiKey;
      const apiProvider = cfg.apiProvider;
      if (geminiApiKey) {
        aiSeeds = await generateWordstatSeedPhrases(geminiApiKey, prompt, {
          count: requestedCalls,
          apiProvider
        });
        // Retry once via AI if not enough distinct semantic seeds.
        if (aiSeeds.length < requestedCalls) {
          const missing = requestedCalls - aiSeeds.length;
          const extra = await generateWordstatSeedPhrases(geminiApiKey, prompt, {
            count: missing,
            apiProvider,
            extraInstruction: `Сформируй ${missing} НОВЫХ смысловых seed-фраз, не повторяющих уже использованные: ${aiSeeds.join(', ')}`
          });
          const seen = new Set(aiSeeds.map((s) => String(s).toLowerCase()));
          for (const e of extra) {
            const k = String(e || '').toLowerCase();
            if (!k || seen.has(k)) continue;
            seen.add(k);
            aiSeeds.push(e);
            if (aiSeeds.length >= requestedCalls) break;
          }
        }
      }
    } catch (_) {
      aiSeeds = [];
    }
    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        type: 'wordstatProgress',
        state: aiSeeds.length ? 'ai_seed_done' : 'ai_seed_fallback',
        aiSeedCount: aiSeeds.length
      }).catch(() => {});
    }
    let result = await collectWordstatKeywords(wordstatApiKey, prompt, {
      calls: requestedCalls,
      numPhrases: Math.max(
        10,
        Math.min(
          2000,
          Number((generationOptions && generationOptions.wordstatNumPhrases) || ((generationOptions && generationOptions.wordstatDepth) === 'pro' ? 60 : 30))
        )
      ),
      regions: await buildWordstatRegions(generationOptions || {}, wordstatApiKey, tabId),
      devices: ['all'],
      seeds: aiSeeds,
      onProgress: (p) => {
        if (!tabId) return;
        chrome.tabs.sendMessage(tabId, {
          type: 'wordstatProgress',
          state: p.stage,
          done: p.done,
          total: p.total,
          phrase: p.phrase || ''
        }).catch(() => {});
      }
    });
    if (!result || !result.enabled || !Array.isArray(result.keywords) || !result.keywords.length) {
      if (tabId) {
        chrome.tabs.sendMessage(tabId, {
          type: 'wordstatProgress',
          state: 'empty',
          callsMade: result && result.callsMade ? result.callsMade : 0,
          callsFailed: result && result.callsFailed ? result.callsFailed : 0,
          reason: result && result.error ? result.error : 'no_keywords'
        }).catch(() => {});
      }
      return { enabled: false, reason: 'empty_wordstat_result' };
    }
    
    if (tabId && result.callsMade < requestedCalls) {
      chrome.tabs.sendMessage(tabId, {
        type: 'wordstatProgress',
        state: 'calls_short',
        callsMade: result.callsMade || 0,
        callsExpected: requestedCalls
      }).catch(() => {});
    }
    if (tabId) chrome.tabs.sendMessage(tabId, { type: 'wordstatProgress', state: 'ai_core_start' }).catch(() => {});
    try {
      // Re-fetch config to get provider for the core generation step
      const cfg = await getApiConfig();
      const geminiApiKeyCore = cfg.apiKey;
      const apiProviderCore = cfg.apiProvider;
      
      if (geminiApiKeyCore) {
        const aiCore = await buildWordstatSemanticCore(geminiApiKeyCore, prompt, result, { maxKeywords: 12, apiProvider: apiProviderCore });
        if (aiCore && aiCore.primaryKeyword && Array.isArray(aiCore.topKeywords) && aiCore.topKeywords.length) {
          result = {
            ...result,
            primaryKeyword: aiCore.primaryKeyword,
            coverKeyword: aiCore.coverKeyword || aiCore.primaryKeyword,
            keywords: aiCore.topKeywords,
            aiReasoning: aiCore.reasoning || ''
          };
          if (tabId) chrome.tabs.sendMessage(tabId, { type: 'wordstatProgress', state: 'ai_core_done' }).catch(() => {});
        } else if (tabId) {
          chrome.tabs.sendMessage(tabId, { type: 'wordstatProgress', state: 'ai_core_fallback' }).catch(() => {});
        }
      } else if (tabId) {
        chrome.tabs.sendMessage(tabId, { type: 'wordstatProgress', state: 'ai_core_fallback' }).catch(() => {});
      }
    } catch (_) {
      if (tabId) chrome.tabs.sendMessage(tabId, { type: 'wordstatProgress', state: 'ai_core_fallback' }).catch(() => {});
    }

    const normalizedResultBase = normalizeKeywordResearchPayload({
      ...result,
      source: 'live',
      keywords: result.keywords || []
    });
    const normalizedResult = filterKeywordsByTopicEntities(normalizedResultBase, prompt);
    await saveWordstatReport(prompt, generationOptions || {}, {
      ...result,
      primaryKeyword: normalizedResult.primaryKeyword,
      coverKeyword: normalizedResult.coverKeyword,
      keywords: normalizedResult.topKeywords
    });
    const insight = (result && result.aiReasoning)
      ? String(result.aiReasoning)
      : buildKeywordReasoningText(result, generationOptions || {}, 'live');
    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        type: 'wordstatProgress',
        state: 'done',
        callsMade: normalizedResult.callsMade || 0,
        callsFailed: normalizedResult.callsFailed || 0,
        totalCount: normalizedResult.totalCount || 0,
        selectedTotalCount: normalizedResult.selectedTotalCount || 0,
        topKeyword: normalizedResult.primaryKeyword || '',
        coverKeyword: normalizedResult.coverKeyword || '',
        topKeywords: (normalizedResult.topKeywords || []).slice(0, 12)
      }).catch(() => {});
      chrome.tabs.sendMessage(tabId, {
        type: 'wordstatProgress',
        state: 'insight',
        reasoning: insight
      }).catch(() => {});
    }
    return {
      ...result,
      callsMade: normalizedResult.callsMade,
      callsFailed: normalizedResult.callsFailed,
      totalCount: normalizedResult.totalCount,
      primaryKeyword: normalizedResult.primaryKeyword,
      coverKeyword: normalizedResult.coverKeyword,
      keywords: normalizedResult.topKeywords
    };
  } catch (err) {
    console.warn('[Tilda Kovcheg/bg] Wordstat error:', err && err.message ? err.message : err);
    if (tabId) chrome.tabs.sendMessage(tabId, { type: 'wordstatProgress', state: 'error' }).catch(() => {});
    return { enabled: false, reason: 'wordstat_error' };
  }
}

async function handleGenerateText(prompt, topicInfo, tabId, sendResponse) {
  try {
    const { apiKey, apiProvider } = await getApiConfig();
    if (!apiKey) {
      sendResponse({ error: 'API Key не задан. Откройте расширение и сохраните ключ.' });
      return;
    }
    const fullPrompt = `Инструкции генерации:\n${prompt || 'Напиши статью.'}\n\nТема/Исходный текст:\n${topicInfo || ''}`;
    const fullText = await streamChatCompletions(apiKey, fullPrompt, { includeThoughts: false, apiProvider });
    sendResponse({ text: fullText });
  } catch (err) {
    sendResponse({ error: err.message || String(err) });
  }
}

async function handleGenerateImage(prompt, input, tabId, sendResponse) {
  try {
    const { apiKey, apiProvider } = await getApiConfig();
    if (!apiKey) {
      sendResponse({ error: 'API Key не задан. Откройте расширение и сохраните ключ.' });
      return;
    }
    let model = (input && input.model) || 'nano-banana-pro';
    if (apiProvider === 'official' && model === 'nano-banana-pro') model = 'gemini-3-pro-image-preview';
    const usePreset = !input || input.use_cover_preset !== false;
    const coverText = String((input && (input.cover_text || input.coverText)) || '').trim();
    const finalPrompt = usePreset
      ? buildCoverPromptWithPreset(model, prompt, prompt || input.prompt || '', coverText)
      : `${(prompt || input.prompt || '').trim()}${coverText ? `\nТекст на обложке: ${coverText}` : ''}`;
    const finalInput = {
      ...input,
      model,
      prompt: finalPrompt,
      cover_text: coverText || undefined,
      apiProvider
    };
    if (input.image_input && Array.isArray(input.image_input)) {
      finalInput.image_input = input.image_input;
    }
    console.log('[Tilda Kovcheg/bg] image model:', model, 'preset:', usePreset ? 'on' : 'off', 'promptLen:', (finalPrompt || '').length);
    // Для Nano Banana принудительно 1K (ограничение загрузки в Tilda)
    if (model === 'nano-banana-pro' && apiProvider !== 'official') {
      finalInput.resolution = '1K';
      if (!finalInput.aspect_ratio) finalInput.aspect_ratio = '4:3';
    }

    const url = await generateImage(apiKey, finalInput, (progress) => {
      if (tabId && progress.state) {
        chrome.tabs.sendMessage(tabId, { type: 'imageProgress', state: progress.state }).catch(() => {});
      }
    });
    sendResponse({ url });
  } catch (err) {
    sendResponse({ error: err.message || String(err) });
  }
}

async function handleGenerateStructuredText(prompt, topicInfo, generationOptions, tabId, sendResponse) {
  try {
    const { apiKey, apiProvider } = await getApiConfig();
    if (!apiKey) {
      sendResponse({ error: 'API Key не задан. Откройте расширение и сохраните ключ.' });
      return;
    }
    
    // Load Content Settings
    const storageValues = await new Promise(res => chrome.storage.local.get([BRAND_KNOWLEDGE_KEY, TONE_OF_VOICE_KEY], res));
    const mergedOptions = {
      ...(generationOptions || {}),
      brandKnowledge: storageValues[BRAND_KNOWLEDGE_KEY] || '',
      toneOfVoice: storageValues[TONE_OF_VOICE_KEY] || 'default',
      apiProvider,
      topicInfo: topicInfo
    };

    const keywordResearch = await getWordstatKeywordResearch(topicInfo || prompt, mergedOptions, tabId, apiKey, apiProvider);
    const structured = await generateStructuredPost(apiKey, prompt, {
      ...mergedOptions,
      keywordResearch
    });
    structured._keywordResearch = keywordResearch && keywordResearch.enabled ? {
      enabled: true,
      source: keywordResearch.source || 'live',
      primaryKeyword: keywordResearch.primaryKeyword || '',
      coverKeyword: keywordResearch.coverKeyword || '',
      topKeywords: (keywordResearch.keywords || []).slice(0, 12),
      totalCount: keywordResearch.totalCount || 0,
      selectedTotalCount: keywordResearch.selectedTotalCount || 0,
      callsMade: keywordResearch.callsMade || 0,
      callsFailed: keywordResearch.callsFailed || 0
    } : { enabled: false, reason: keywordResearch && keywordResearch.reason ? keywordResearch.reason : 'off' };
    sendResponse({ data: structured });
  } catch (err) {
    sendResponse({ error: err.message || String(err) });
  }
}

async function handleGenerateFullPost(msg, tabId, sendResponse) {
  const { prompt, topicInfo, coverPrompt, coverText, referenceUrls, generationOptions, imageOptions } = msg;
  try {
    const { apiKey, apiProvider } = await getApiConfig();
    if (!apiKey) {
      sendResponse({ error: 'API Key не задан. Откройте расширение и сохраните ключ.' });
      return;
    }
    if (!prompt && !topicInfo) {
      sendResponse({ error: 'Введите промпт генерации или тему поста.' });
      return;
    }
    
    // Load Content Settings
    const storageValues = await new Promise(res => chrome.storage.local.get([BRAND_KNOWLEDGE_KEY, TONE_OF_VOICE_KEY], res));
    const mergedOptions = {
      ...(generationOptions || {}),
      brandKnowledge: storageValues[BRAND_KNOWLEDGE_KEY] || '',
      toneOfVoice: storageValues[TONE_OF_VOICE_KEY] || 'default',
      apiProvider,
      topicInfo: topicInfo
    };

    const keywordResearch = await getWordstatKeywordResearch(topicInfo || prompt, mergedOptions, tabId, apiKey, apiProvider);
    if (tabId) chrome.tabs.sendMessage(tabId, { type: 'fullPostProgress', step: 'text' }).catch(() => {});
    const data = await generateStructuredPost(apiKey, prompt, {
      ...mergedOptions,
      keywordResearch
    });
    data._keywordResearch = keywordResearch && keywordResearch.enabled ? {
      enabled: true,
      source: keywordResearch.source || 'live',
      primaryKeyword: keywordResearch.primaryKeyword || '',
      coverKeyword: keywordResearch.coverKeyword || '',
      topKeywords: (keywordResearch.keywords || []).slice(0, 12),
      totalCount: keywordResearch.totalCount || 0,
      selectedTotalCount: keywordResearch.selectedTotalCount || 0,
      callsMade: keywordResearch.callsMade || 0,
      callsFailed: keywordResearch.callsFailed || 0
    } : { enabled: false, reason: keywordResearch && keywordResearch.reason ? keywordResearch.reason : 'off' };
    if (tabId) chrome.tabs.sendMessage(tabId, { type: 'fullPostProgress', step: 'text_done' }).catch(() => {});
    let model = (imageOptions && imageOptions.model) || 'nano-banana-pro';
    if (apiProvider === 'official' && model === 'nano-banana-pro') model = 'gemini-3-pro-image-preview';
    const useCoverPreset = !imageOptions || imageOptions.use_cover_preset !== false;
    const coverKeyword = keywordResearch && keywordResearch.enabled ? keywordResearch.coverKeyword : '';
    const coverTextValue = String(coverText || data.cover_title || '').trim();
    const coverPromptBase = (coverPrompt && coverPrompt.trim()) || data.title || prompt;
    const coverPromptExtended = coverKeyword ? `${coverPromptBase}\nФокус-ключ для обложки: ${coverKeyword}` : coverPromptBase;
    const finalCoverPrompt = useCoverPreset
      ? buildCoverPromptWithPreset(model, data.title || prompt, coverPromptExtended, coverTextValue)
      : `${coverPromptExtended}${coverTextValue ? `\nТекст на обложке: ${coverTextValue}` : ''}`;
    if (tabId) chrome.tabs.sendMessage(tabId, { type: 'fullPostProgress', step: 'cover' }).catch(() => {});
    const imageInput = {
      prompt: finalCoverPrompt,
      model: model,
      aspect_ratio: (imageOptions && imageOptions.aspect_ratio) || '4:3',
      resolution: (imageOptions && imageOptions.resolution) || '1K',
      output_format: (imageOptions && imageOptions.output_format) || 'png',
      quality: (imageOptions && imageOptions.quality) || undefined,
      cover_text: coverTextValue || undefined,
      apiProvider: apiProvider
    };
    if (referenceUrls && referenceUrls.length > 0) {
      imageInput.image_input = referenceUrls;
    }
    console.log('[Tilda Kovcheg/bg] fullPost image model:', model, 'preset:', useCoverPreset ? 'on' : 'off', 'promptLen:', (finalCoverPrompt || '').length);
    // Для Nano Banana держим строго 1K
    if (model === 'nano-banana-pro' && apiProvider !== 'official') imageInput.resolution = '1K';
    const imageUrl = await generateImage(apiKey, imageInput, (progress) => {
      if (tabId && progress.state) {
        chrome.tabs.sendMessage(tabId, { type: 'imageProgress', state: progress.state }).catch(() => {});
      }
    });
    if (tabId) chrome.tabs.sendMessage(tabId, { type: 'fullPostProgress', step: 'cover_done' }).catch(() => {});
    sendResponse({ data, imageUrl });
  } catch (err) {
    sendResponse({ error: err.message || String(err) });
  }
}
