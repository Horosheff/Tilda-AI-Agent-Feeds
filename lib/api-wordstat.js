const WORDSTAT_BASE_URL = 'https://api.wordstat.yandex.net/v1';

function wordstatNormalizePhrase(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function wordstatNormalizeKeywordForOutput(value) {
  const stopTail = new Set(['и', 'в', 'во', 'на', 'по', 'о', 'об', 'от', 'для', 'из', 'к', 'с', 'у', 'за', 'как', 'что', 'это', 'или', 'а', 'но', 'при', 'со', 'под', 'над', 'между']);
  const cleaned = String(value || '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[^\p{L}\p{N}\s+\-!"\[\]\(\)\|]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  const words = cleaned.split(/\s+/).filter(Boolean);
  while (words.length > 0 && stopTail.has(words[words.length - 1].toLowerCase())) {
    words.pop();
  }
  while (words.length > 0 && stopTail.has(words[0].toLowerCase())) {
    words.shift();
  }
  return words.join(' ').trim();
}

function wordstatNormalizeSeed(value) {
  return String(value || '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[^\p{L}\p{N}\s+\-!"\[\]\(\)\|]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordstatContainsOperators(phrase) {
  return /[-!+\[\]\(\)"|]/.test(String(phrase || ''));
}

function wordstatStripOperators(value) {
  return String(value || '')
    .replace(/[-!+\[\]\(\)"|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordstatBuildSeeds(topic, maxCalls) {
  const rawTopic = wordstatNormalizePhrase(topic);
  const cleanTopic = wordstatContainsOperators(rawTopic) ? wordstatStripOperators(rawTopic) : rawTopic;
  const words = cleanTopic
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s+-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const stop = new Set(['и', 'в', 'во', 'на', 'по', 'о', 'об', 'от', 'для', 'из', 'к', 'с', 'у', 'за', 'как', 'что', 'это']);
  const strong = words.filter((w) => w.length > 2 && !stop.has(w));

  const seeds = [];
  if (rawTopic) seeds.push(rawTopic);
  if (cleanTopic && cleanTopic !== rawTopic) seeds.push(cleanTopic);
  if (strong.length >= 2) seeds.push(strong.slice(0, 2).join(' '));
  if (strong.length >= 3) seeds.push(strong.slice(0, 3).join(' '));
  if (strong[0]) seeds.push(strong[0]);
  if (strong[1]) seeds.push(strong[1]);
  if (strong[2]) seeds.push(strong[2]);
  if (strong[0]) seeds.push(strong[0] + ' как');
  if (strong[0]) seeds.push(strong[0] + ' что это');
  if (strong[0]) seeds.push(strong[0] + ' цена');
  if (strong[0]) seeds.push(strong[0] + ' примеры');

  const unique = [];
  const seen = new Set();
  for (const seed of seeds) {
    const s = wordstatNormalizeSeed(seed);
    if (!s || seen.has(s)) continue;
    const words = s.split(/\s+/).filter(Boolean);
    if (words.length > 8 || s.length > 80) continue;
    seen.add(s);
    unique.push(s);
    if (unique.length >= maxCalls) break;
  }
  return unique;
}

function wordstatTopicSignals(topic) {
  const clean = wordstatStripOperators(topic)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const stop = new Set(['и', 'в', 'во', 'на', 'по', 'о', 'об', 'от', 'для', 'из', 'к', 'с', 'у', 'за', 'как', 'что', 'это', 'или', 'а', 'но']);
  const tokens = clean
    .split(' ')
    .map((w) => w.trim())
    .filter(Boolean)
    .filter((w) => w.length >= 3)
    .filter((w) => !stop.has(w));
  const uniq = [];
  const seen = new Set();
  for (const t of tokens) {
    if (seen.has(t)) continue;
    seen.add(t);
    uniq.push(t);
  }
  return uniq;
}

function wordstatBuildTopicAnchors(topicSignals) {
  const generic = new Set([
    'суд', 'суда', 'суде', 'суды', 'судом', 'судья', 'судьи', 'дело', 'дела', 'решение', 'решения',
    'право', 'закона', 'закон', 'правосудие', 'принцип', 'определение', 'часть'
  ]);
  return (topicSignals || [])
    .filter((t) => t.length >= 4)
    .filter((t) => !generic.has(t))
    .slice(0, 16);
}

function wordstatExtractTopicEntities(topic) {
  const src = String(topic || '');
  const out = [];
  const seen = new Set();
  const parts = src.match(/[A-Za-zА-Яа-яЁё0-9\.\-]{3,}/g) || [];
  for (const p of parts) {
    const t = p.trim();
    if (!t) continue;
    const low = t.toLowerCase();
    if (seen.has(low)) continue;
    if (/[0-9]/.test(t) || /[A-Z]/.test(t) || /(openclaw|claude|code|gpt|sonnet|opus|kimi|glm|minimax|терминал|агент|нейросет|ии|ai)/i.test(t)) {
      seen.add(low);
      out.push(low);
    }
    if (out.length >= 12) break;
  }
  return out;
}

function wordstatIsTechTopic(topic) {
  return /(openclaw|claude|code|gpt|sonnet|opus|kimi|glm|minimax|терминал|агент|нейросет|ии|ai)/i.test(String(topic || ''));
}

function wordstatHasEntity(phrase, entities) {
  const p = String(phrase || '').toLowerCase();
  if (!p || !Array.isArray(entities) || !entities.length) return false;
  return entities.some((e) => e && p.includes(e));
}

function wordstatExtractCompactKey(phrase, topicAnchors) {
  const stop = new Set([
    'и', 'в', 'во', 'на', 'по', 'о', 'об', 'от', 'для', 'из', 'к', 'с', 'у', 'за', 'как', 'что', 'это',
    'или', 'а', 'но', 'при', 'со', 'под', 'над', 'между', 'все', 'весь', 'вся'
  ]);
  const weak = new Set([
    'показал', 'показывает', 'абсолютное', 'сравнении', 'результаты', 'эксперимент', 'классический',
    'гипотетическое', 'изменяемыми', 'стороны', 'часто', 'иногда', 'полностью', 'примерно'
  ]);
  const clean = wordstatNormalizeKeywordForOutput(phrase).toLowerCase();
  if (!clean) return '';
  const tokens = clean.split(/\s+/).filter(Boolean);
  const good = tokens.filter((t) => !stop.has(t) && !weak.has(t) && t.length >= 2);
  if (!good.length) return '';

  const picked = [];
  const seen = new Set();
  const push = (t) => {
    if (!t || seen.has(t)) return;
    seen.add(t);
    picked.push(t);
  };

  const anchors = Array.isArray(topicAnchors) ? topicAnchors : [];
  for (const t of good) {
    if (anchors.includes(t)) push(t);
    if (picked.length >= 3) break;
  }
  for (const t of good) {
    if (/[0-9]/.test(t) || /[a-z]/i.test(t)) push(t);
    if (picked.length >= 3) break;
  }
  for (const t of good) {
    push(t);
    if (picked.length >= 3) break;
  }
  return picked.join(' ').trim();
}

function wordstatHasAnchor(phrase, anchors) {
  if (!anchors || !anchors.length) return true;
  const p = ` ${String(phrase || '').toLowerCase()} `;
  return anchors.some((a) => p.includes(` ${a} `) || p.includes(a));
}

function wordstatIsValidKeywordCandidate(phrase) {
  const p = wordstatNormalizeKeywordForOutput(phrase);
  if (!p) return false;
  const words = p.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 3) return false;
  if (p.length < 3 || p.length > 45) return false;
  if (/https?:\/\//i.test(p)) return false;
  return true;
}

function wordstatBuildCompactTopicFallback(topic) {
  const normalized = wordstatNormalizeKeywordForOutput(topic);
  if (!normalized) return '';
  const words = normalized.split(/\s+/).filter(Boolean).slice(0, 5);
  return words.join(' ').trim();
}

function wordstatBuildFallbackSeedsFromTopic(topic, targetCount) {
  const signals = wordstatTopicSignals(topic);
  const anchors = wordstatBuildTopicAnchors(signals);
  const out = [];
  const seen = new Set();
  function add(v) {
    const s = wordstatNormalizeSeed(v);
    if (!s || seen.has(s)) return;
    const words = s.split(/\s+/).filter(Boolean);
    if (words.length < 1 || words.length > 3) return;
    if (s.length < 3 || s.length > 45) return;
    seen.add(s);
    out.push(s);
  }
  // Do not inject raw topic sentence fragments into fallback seeds.
  anchors.slice(0, 6).forEach((a) => add(a));
  for (let i = 0; i < anchors.length; i++) {
    for (let j = i + 1; j < anchors.length; j++) {
      add(`${anchors[i]} ${anchors[j]}`);
      if (out.length >= targetCount) return out;
    }
    if (out.length >= targetCount) return out;
  }
  signals.slice(0, 8).forEach((s) => add(s));
  return out.slice(0, targetCount);
}

function wordstatIsNoisePhrase(phrase, topicText) {
  const p = String(phrase || '').toLowerCase();
  const topic = String(topicText || '').toLowerCase();
  const noisy = [
    /бесплатн/,
    /скачат/,
    /без\s+регистрац/,
    /курс(ы|а)?\b/,
    /для\s+решени(я|й)\s+задач/
  ];
  for (const rx of noisy) {
    if (rx.test(p) && !rx.test(topic)) return true;
  }
  return false;
}

function wordstatRelevanceScore(phrase, signals, anchors) {
  const p = String(phrase || '').toLowerCase();
  if (!p) return 0;
  let score = 0;
  for (const s of signals) {
    if (!s) continue;
    if (p === s) score += 6;
    else if (p.includes(' ' + s + ' ') || p.startsWith(s + ' ') || p.endsWith(' ' + s)) score += 3;
    else if (p.includes(s)) score += 1;
  }
  if (wordstatHasAnchor(p, anchors)) score += 5;
  return score;
}

async function wordstatGetRegionsTree(token) {
  const res = await fetch(`${WORDSTAT_BASE_URL}/getRegionsTree`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({})
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Wordstat getRegionsTree HTTP ${res.status}`);
  }
  return res.json();
}

async function wordstatTopRequests(token, payload) {
  const res = await fetch(`${WORDSTAT_BASE_URL}/topRequests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Wordstat topRequests HTTP ${res.status}`);
  }
  return res.json();
}

async function collectWordstatKeywords(token, topic, options = {}) {
  const maxCalls = Math.max(1, Math.min(10, Number(options.calls) || 6));
  const numPhrases = Math.max(10, Math.min(2000, Number(options.numPhrases) || 50));
  const regions = Array.isArray(options.regions) && options.regions.length ? options.regions : undefined;
  const devices = Array.isArray(options.devices) && options.devices.length ? options.devices : ['all'];
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

  const requestedSeeds = Array.isArray(options.seeds) ? options.seeds : [];
  const preparedSeeds = requestedSeeds
    .map((s) => wordstatNormalizeSeed(s))
    .filter(Boolean)
    .filter((s) => {
      const w = s.split(/\s+/).filter(Boolean);
      return w.length >= 1 && w.length <= 5 && s.length <= 80;
    });
  const seeds = [];
  const seenSeeds = new Set();
  const feed = preparedSeeds.length > 0
    ? preparedSeeds
    : wordstatBuildSeeds(topic, maxCalls * 2).concat(wordstatBuildFallbackSeedsFromTopic(topic, maxCalls * 2));
  for (const s of feed) {
    const key = s.toLowerCase();
    if (!s || seenSeeds.has(key)) continue;
    seenSeeds.add(key);
    seeds.push(s);
    if (seeds.length >= maxCalls) break;
  }
  if (!seeds.length) {
    return {
      enabled: false,
      callsMade: 0,
      seeds: [],
      keywords: [],
      primaryKeyword: '',
      coverKeyword: '',
      error: 'Empty topic'
    };
  }
  if (onProgress) onProgress({ stage: 'start', total: seeds.length, done: 0, phrase: '' });

  const map = new Map();
  let callsMade = 0;
  let callsFailed = 0;
  let totalCount = 0;
  const topicSignals = wordstatTopicSignals(topic);
  const topicAnchors = wordstatBuildTopicAnchors(topicSignals);
  const topicEntities = wordstatExtractTopicEntities(topic);
  const techTopic = wordstatIsTechTopic(topic);

  for (let i = 0; i < seeds.length; i++) {
    const phrase = seeds[i];
    if (onProgress) onProgress({ stage: 'request', total: seeds.length, done: i, phrase });
    try {
      const response = await wordstatTopRequests(token, {
        phrase,
        numPhrases,
        regions,
        devices
      });
      callsMade += 1;
      if (onProgress) onProgress({ stage: 'success', total: seeds.length, done: i + 1, phrase });
      if (response && typeof response.totalCount === 'number') totalCount += response.totalCount;
      const top = Array.isArray(response && response.topRequests) ? response.topRequests : [];
      const assoc = Array.isArray(response && response.associations) ? response.associations : [];
      const merged = top.concat(assoc);
      for (const item of merged) {
        const p = wordstatNormalizePhrase(item && item.phrase);
        const c = Number(item && item.count) || 0;
        if (!p || c <= 0) continue;
        map.set(p, (map.get(p) || 0) + c);
      }
    } catch (_) {
      callsFailed += 1;
      if (onProgress) onProgress({ stage: 'error', total: seeds.length, done: i + 1, phrase });
      // Continue with remaining seeds to keep resilient fallback behavior.
    }
  }

  const scored = Array.from(map.entries())
    .map(([phrase, count]) => {
      const cleanPhrase = wordstatNormalizeKeywordForOutput(phrase);
      const relevanceScore = wordstatRelevanceScore(cleanPhrase, topicSignals, topicAnchors);
      const noise = wordstatIsNoisePhrase(cleanPhrase, topic) || !cleanPhrase;
      const hasEntity = wordstatHasEntity(cleanPhrase, topicEntities);
      const weightedCount = noise ? Math.round(count * 0.05) : Math.round(count * (1 + relevanceScore * 0.14));
      return { phrase: cleanPhrase, count, weightedCount, relevanceScore, noise, hasEntity };
    })
    .filter((k) => !k.noise)
    .filter((k) => !techTopic || k.hasEntity)
    .sort((a, b) => b.weightedCount - a.weightedCount);

  let finalKeywords = scored
    .map((k) => ({ phrase: k.phrase, count: k.count }))
    .filter((k) => {
      const words = String(k.phrase || '').split(/\s+/).filter(Boolean);
      return words.length >= 1 && words.length <= 8;
    });

  if (!finalKeywords.length && callsMade > 0) {
    // Fallback: preserve at least meaningful topic-related phrases for downstream generation.
    const fallback = [];
    const seenFallback = new Set();
    const topicPhrase = wordstatBuildCompactTopicFallback(topic);
    if (topicPhrase) {
      fallback.push({ phrase: topicPhrase, count: Math.max(1, Math.round(totalCount / Math.max(1, callsMade))) });
      seenFallback.add(topicPhrase.toLowerCase());
    }
    for (const s of seeds) {
      const p = wordstatNormalizeKeywordForOutput(s);
      if (!p) continue;
      const key = p.toLowerCase();
      if (seenFallback.has(key)) continue;
      if (wordstatIsNoisePhrase(p, topic)) continue;
      const words = p.split(/\s+/).filter(Boolean);
      if (words.length < 1 || words.length > 8) continue;
      if (techTopic && !wordstatHasEntity(p, topicEntities)) continue;
      seenFallback.add(key);
      fallback.push({ phrase: p, count: 1 });
      if (fallback.length >= 6) break;
    }
    finalKeywords = fallback;
  }

  if (!finalKeywords.length && callsMade === 0) {
    return {
      enabled: false,
      callsMade,
      callsFailed,
      seeds,
      totalCount,
      primaryKeyword: '',
      coverKeyword: '',
      keywords: [],
      error: 'All Wordstat requests failed'
    };
  }

  const primaryKeyword = (finalKeywords[0] && finalKeywords[0].phrase) || wordstatNormalizePhrase(topic);
  const coverKeyword = (finalKeywords[1] && finalKeywords[1].phrase) || primaryKeyword;

  return {
    enabled: true,
    callsMade,
    callsFailed,
    seeds,
    totalCount,
    primaryKeyword,
    coverKeyword,
    keywords: finalKeywords.slice(0, 30)
  };
}
