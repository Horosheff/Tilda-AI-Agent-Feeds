/**
 * Gemini 3 Pro (kie.ai) — стрим чат и структурированный пост для Tilda (все поля + HTML по STYLE_GUIDE).
 */
const GEMINI_CHAT_URL = 'https://api.kie.ai/gemini-3-pro/v1/chat/completions';
const GEMINI_GOOGLE_SEARCH_TOOL = [
  {
    type: 'function',
    function: { name: 'googleSearch' }
  }
];

const TILDA_HTML_RULES = `
Разметка контента (поле content) — ТОЛЬКО HTML с inline-стилями, без DOCTYPE/html/body и без комментариев.
• Параграф: <p style="font-family: Arial, sans-serif; font-size: 18px; line-height: 1.7; color: #333; margin-bottom: 25px;">Текст</p>
• Заголовок H2: <h2 style="font-family: Arial, sans-serif; font-size: 32px; font-weight: 700; color: #000; margin-top: 45px; margin-bottom: 25px;">Заголовок</h2>
• Заголовок H3: <h3 style="font-family: Arial, sans-serif; font-size: 24px; font-weight: 600; color: #333; margin-top: 35px; margin-bottom: 20px;">Подзаголовок</h3>
• Список: <ul style="margin-bottom: 30px; padding-left: 20px;"><li style="font-size: 18px; line-height: 1.7; margin-bottom: 10px;"><b>Тезис:</b> пояснение.</li></ul>
• Цитата/блок: <div style="background-color: #f5f5f5; border-left: 5px solid #6B46C1; padding: 20px; margin-bottom: 30px;"><p style="font-family: Arial, sans-serif; font-size: 18px; line-height: 1.7; color: #333; margin: 0;">💡 <b>Совет:</b> текст.</p></div>
• В тексте: жирный <b>...</b>, ссылка <a href="URL" target="_blank" style="color: #6B46C1; text-decoration: underline;"><b>текст</b></a>
Не используй <blockquote> и HTML-комментарии. Контент — несколько абзацев и подзаголовков по теме.`;

const SUPER_PROMPT_V4_BLOCK = `
Режим SUPER-PROMPT SEO/GEO v4:
- Действуй как Senior SEO Editor + GEO (Generative Engine Optimization).
- Тема пользователя — это направление, а не готовый заголовок. Придумай свой кликабельный title с главным ключевиком.
- Стремись к объёму около 20 000 символов (допустимо 18 000–22 000), но не жертвуй качеством.
- Стиль: хуманизированный, живой, с примерами и объяснениями, без SEO-воды.
- Структура:
  1) Блок 1: Direct Answer (первый абзац). Сразу дай ответ на интент пользователя. Без вступлений, приветствий и "в этой статье вы узнаете". Формула: «[Суть] — [Что делает/зачем нужно] — [Ключевой результат для читателя]». Объём: 40-60 слов. Это кандидат на сниппет.
  2) 4-8 содержательных разделов (H2/H3), ключевики в начале H2.
  3) Практические списки/сравнения/кейсы.
  4) FAQ в конце (минимум 3-4 вопроса с развёрнутыми ответами).
- SEO:
  - Встраивай релевантные ключевые фразы естественно, без переспама.
  - seo_title до 60, seo_description 150-160, excerpt 160-200.
- GEO:
  - Добавь snippet-ready фрагменты: краткие точные ответы 40-60 слов на ключевые вопросы.
  - Дай чёткие определения вида "X — это ...".
- ВАЖНО: не выдумывай конкретные статистические данные и даты без уверенности; если данных нет, формулируй аккуратно без фейковых цифр.
`;

async function streamChatCompletions(apiKey, prompt, options = {}) {
  const { onChunk, includeThoughts = false, useWebSearch = true, apiProvider } = options;
  const isOfficial = apiProvider === 'official';
  const url = isOfficial ? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions' : GEMINI_CHAT_URL;
  
  const bodyPayload = {
    messages: [
      { role: 'user', content: [{ type: 'text', text: prompt }] }
    ],
    stream: true
  };

  // В потоковом режиме kie.ai тоже ломается, если передать tools.
  // Делаем поиск только для Official API (т.к. там нет конфликта JSON vs Tools для обычного чата)
  // Но для обычной потоковой генерации текста (onGenerateText) мы не просим JSON.
  // Тем не менее, для стабильности kie.ai лучше отключить tools в стриме.
  if (useWebSearch && isOfficial) {
    bodyPayload.tools = GEMINI_GOOGLE_SEARCH_TOOL;
  }

  if (isOfficial) {
    bodyPayload.model = 'gemini-3.1-pro-preview';
  } else {
    bodyPayload.include_thoughts = includeThoughts;
    bodyPayload.reasoning_effort = 'low';
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(bodyPayload)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') return fullContent;
        try {
          const json = JSON.parse(data);
          const choice = json.choices && json.choices[0];
          if (!choice || !choice.delta) continue;
          const delta = choice.delta;
          if (delta.content != null && delta.content !== '') {
            fullContent += delta.content;
            if (typeof onChunk === 'function') onChunk(delta.content);
          }
          if (choice.finish_reason === 'stop') return fullContent;
        } catch (_) {}
      }
    }
  }

  return fullContent;
}

async function generateWordstatSeedPhrases(apiKey, topic, options = {}) {
  const targetCount = Math.max(3, Math.min(10, Number(options.count) || 6));
  const prompt = String(topic || '').trim();
  if (!prompt) return [];
  const extraInstruction = String(options.extraInstruction || '').trim();

  function extractTopicEntities(text) {
    // Отключено: принудительные английские сущности ломают Wordstat
    return [];
  }

  const topicEntities = extractTopicEntities(prompt);
  const entitiesLine = topicEntities.length
    ? `\n- Обязательно: каждая seed-фраза должна содержать хотя бы одну сущность из списка: ${topicEntities.join(', ')}.`
    : '';

  const systemPrompt = `Ты — эксперт по семантике и генерации ключевых запросов под Яндекс.Wordstat.
ОБЯЗАТЕЛЬНО: Если тема дана на английском языке, СНАЧАЛА ПОЙМИ ЕЁ СМЫСЛ, ПЕРЕВЕДИ НА РУССКИЙ ЯЗЫК, и только потом составляй поисковые запросы ИСКЛЮЧИТЕЛЬНО ДЛЯ РУССКОЯЗЫЧНОЙ АУДИТОРИИ.
ЕСли есть слово завод то ЭТО КОНТЕНТ ЗАВОД а не обычный.

ЗАДАЧА
По предоставленному тексту/заголовку выдели РОВНО ${targetCount} максимально коротких и сильных поисковых запроса («сидов») для дальнейшего расширения в Wordstat.

ВХОД
Заголовок/Текст пользователя: ${prompt}

ТРЕБОВАНИЯ К ЗАПРОСАМ
1) Коротко: 1–2 слова, максимум 3. Без «мусора» и кликбейта. Самые возможные и ПОПУЛЯРНЫЕ ПО СМЫСЛУ запросы реальных людей.
2) Смысл ядра: сохраняй тему заголовка и доминирующее намерение (коммерческое/информационное/навигационное).
3) Нормализация:
   - Приводи к наиболее частотной разговорной форме (авто → машина, смартфон → телефон, и т. п.), если это упростит и расширит охват.
   - Лемматизируй (ед. число, именительный), если не критична конкретная форма.
   - Бренды/модели/индексы и гео из заголовка — сохраняй; год/номер оставляй только если это ключ к намерению (модель, поколение).
4) Операторы Wordstat:
   - Используй операторы только когда это действительно полезно.
   - + перед обязательным стоп-словом (например, «+на», «+в»), если без него меняется смысл.
   - ! — только когда нужна фиксированная словоформа (модель, аббревиатура, редкая форма).
   - "..." — если требуется точная фраза без лишних слов (устойчивое выражение/бренд-сочетание).
   - [...] — если важен порядок слов, но допускаются формы и служебные.
   - Не используй ( )| в финальном наборе — запросы должны быть простыми.
5) Язык и стиль: СТРОГО ПО-РУССКИ, строчные буквы; транслитерируй или переводи англ. термины к наиболее употребимому русскому варианту, если такой есть (исключение: ИТ-бренды типа Apple, AI, Claude, GPT).
6) Разнообразие:
   - 1-й запрос — самый широкий и частотный «ядровой».
   - 2-й — средне-уточнённый (модель/тип/гео при наличии).
   - 3-й — по намерению (например, коммерческий «купить/цена/заказать» или инфо «как/инструкция/ремонт») — только если это логично по заголовку.
   - И так далее до ${targetCount} запросов.
7) Никаких пояснений, текста, примеров и комментариев — ТОЛЬКО JSON-массив: {"seeds":["..."]}${entitiesLine}
${extraInstruction ? `- Доп.инструкция: ${extraInstruction}` : ''}`;

  const { apiProvider } = options;
  const isOfficial = apiProvider === 'official';
  const url = isOfficial ? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions' : GEMINI_CHAT_URL;
  
  const bodyPayload = {
    messages: [
      { role: 'system', content: [{ type: 'text', text: systemPrompt }] },
      { role: 'user', content: [{ type: 'text', text: `Тема: ${prompt}` }] }
    ],
    stream: false
  };

  if (isOfficial) {
    bodyPayload.model = 'gemini-3.1-pro-preview';
    bodyPayload.response_format = { type: 'json_object' };
  } else {
    bodyPayload.include_thoughts = false;
    bodyPayload.reasoning_effort = 'medium';
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(bodyPayload)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  const data = await res.json();
  let content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (Array.isArray(content)) {
    content = content
      .map((p) => (p && typeof p.text === 'string' ? p.text : ''))
      .join('\n')
      .trim();
  }
  content = String(content || '').trim().replace(/^```(?:json)?\s*|\s*```$/gi, '');
  if (!content) return [];
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    try {
      content = content.replace(/,\s*([}\]])/g, '$1');
      parsed = JSON.parse(content);
    } catch (e2) {
      console.warn('[Wordstat Seeds] JSON parse fallback error:', e2);
      return [];
    }
  }
  const seeds = Array.isArray(parsed && parsed.seeds) ? parsed.seeds : [];
  const stopTail = new Set(['и', 'в', 'во', 'на', 'по', 'о', 'об', 'от', 'для', 'из', 'к', 'с', 'у', 'за', 'как', 'что', 'это', 'или', 'а', 'но', 'при', 'со', 'под', 'над', 'между']);
  const out = [];
  const seen = new Set();
  for (const s of seeds) {
    let phrase = String(s || '')
      .replace(/https?:\/\/\S+/gi, ' ')
      .replace(/[^\p{L}\p{N}\s+\-!"\[\]\(\)\|]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!phrase) continue;
    const words = phrase.split(/\s+/).filter(Boolean);
    while (words.length && stopTail.has(words[words.length - 1].toLowerCase())) words.pop();
    while (words.length && stopTail.has(words[0].toLowerCase())) words.shift();
    if (words.length < 1 || words.length > 5) continue;
    phrase = words.join(' ');
    if (!phrase || seen.has(phrase)) continue;
    seen.add(phrase);
    out.push(phrase);
    if (out.length >= targetCount) break;
  }
  return out;
}

async function buildWordstatSemanticCore(apiKey, topic, wordstatData, options = {}) {
  const maxKeywords = Math.max(5, Math.min(20, Number(options.maxKeywords) || 12));
  const candidates = Array.isArray(wordstatData && wordstatData.keywords) ? wordstatData.keywords : [];
  if (!apiKey || !candidates.length) return null;

  const engStopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'am', 'was', 'were', 'be', 'been', 'being', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'that', 'this', 'it', 'they', 'he', 'she', 'we', 'you', 'i', 'my', 'your', 'his', 'her', 'their', 'our', 'what', 'who', 'how', 'when', 'where', 'why']);

  const compactCandidates = candidates
    .slice(0, 200)
    .map((k) => ({
      phrase: String(k && k.phrase || '').replace(/\s+/g, ' ').trim(),
      count: Number(k && k.count) || 0
    }))
    .filter((k) => {
      if (!k.phrase) return false;
      const tokens = k.phrase.toLowerCase().split(/\s+/);
      const hasEngStopWord = tokens.some(t => engStopWords.has(t));
      return !hasEngStopWord;
    })
    .slice(0, 120);

  if (!compactCandidates.length) return null;

  function extractTopicEntities(text) {
    // Отключено: принудительные сущности (особенно из длинных текстов)
    // заставляют ИИ придумывать ключи с английскими словами/цифрами, игнорируя реальный Wordstat
    return [];
  }

  const topicEntities = extractTopicEntities(topic);
  const entitiesLine = topicEntities.length
    ? `\n- Обязательно: каждый ключ должен содержать минимум одну сущность из списка: ${topicEntities.join(', ')}.`
    : '';

  const systemPrompt = `Ты AI SEO-агент. Твоя задача: из кандидатов Wordstat собрать семантическое ядро для статьи.
Правила:
- Верни СТРОГО JSON без markdown:
{
  "primaryKeyword":"...",
  "coverKeyword":"...",
  "topKeywords":[{"phrase":"...","count":123}],
  "reasoning":"..."
}
- ВАЖНО: Ключевые слова ДОЛЖНЫ БЫТЬ НА РУССКОМ ЯЗЫКЕ (допускаются только бренды на английском: Apple, Claude, AI).
- КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО использовать английские стоп-слова, предлоги, артикли ("the", "is", "are", "in", "of", "being" и т.д.). Исключай такие кандидаты.
- Фразы должны быть построены на основе кандидатов Wordstat (можно сжимать длинные фразы до коротких смысловых ключей 1-3 слова).
- Нельзя придумывать темы, которых нет в кандидатах.
- Каждый ключ 1-3 слова максимум, без общих мусорных слов.
- Не допускай generic-ключей без сущности темы ("новый", "обзор", "купить", "цена" без указания модели/бренда).${entitiesLine}
- Выбери 8-12 лучших ключей по релевантности теме, частотности и разнообразию интентов.
- Исключай мусорные/слишком общие фразы, если они не раскрывают тему.
- primaryKeyword — лучший главный ключ статьи.
- coverKeyword — короткий и визуально понятный ключ для обложки.
- reasoning — 1-2 коротких предложения, почему выбраны эти ключи.`;

  const userPayload = {
    topic: String(topic || ''),
    totalCount: Number(wordstatData && wordstatData.totalCount) || 0,
    callsMade: Number(wordstatData && wordstatData.callsMade) || 0,
    seeds: Array.isArray(wordstatData && wordstatData.seeds) ? wordstatData.seeds.slice(0, 20) : [],
    candidates: compactCandidates
  };

  const { apiProvider } = options;
  const isOfficial = apiProvider === 'official';
  const url = isOfficial ? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions' : GEMINI_CHAT_URL;
  
  const bodyPayload = {
    messages: [
      { role: 'system', content: [{ type: 'text', text: systemPrompt }] },
      { role: 'user', content: [{ type: 'text', text: JSON.stringify(userPayload) }] }
    ],
    stream: false
  };

  if (isOfficial) {
    bodyPayload.model = 'gemini-3.1-pro-preview';
    bodyPayload.response_format = { type: 'json_object' };
  } else {
    bodyPayload.include_thoughts = false;
    bodyPayload.reasoning_effort = 'high';
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(bodyPayload)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }

  const data = await res.json();
  let content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (Array.isArray(content)) {
    content = content.map((p) => (p && typeof p.text === 'string' ? p.text : '')).join('\n').trim();
  }
  content = String(content || '').trim().replace(/^```json?\s*|\s*```$/g, '');
  if (!content) return null;

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (_) {
    return null;
  }

  const candidateMap = new Map(compactCandidates.map((k) => [k.phrase.toLowerCase(), k.count]));
  const entityLows = topicEntities.map((e) => e.toLowerCase());
  function normPhrase(v) {
    const p = String(v || '').replace(/\s+/g, ' ').trim();
    const words = p.split(/\s+/).filter(Boolean);
    if (!p || words.length < 1 || words.length > 3) return '';
    return p;
  }

  function aggregateCountForDerivedPhrase(phrase) {
    const tokens = String(phrase || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return 0;
    let best = 0;
    for (const c of compactCandidates) {
      const p = String(c.phrase || '').toLowerCase();
      const ok = tokens.every((t) => p.includes(t));
      if (ok) best = Math.max(best, c.count || 0);
    }
    return best;
  }

  const rawTop = Array.isArray(parsed && parsed.topKeywords) ? parsed.topKeywords : [];
  const topKeywords = [];
  const seen = new Set();
  for (const item of rawTop) {
    const phrase = normPhrase(item && item.phrase);
    if (!phrase) continue;
    const key = phrase.toLowerCase();
    if (seen.has(key)) continue;
    const exactCount = candidateMap.has(key) ? candidateMap.get(key) : 0;
    const derivedCount = exactCount || aggregateCountForDerivedPhrase(phrase);
    if (!derivedCount) continue;
    if (entityLows.length > 0) {
      const phraseLow = phrase.toLowerCase();
      const hasEntity = entityLows.some((e) => phraseLow.includes(e));
      if (!hasEntity) continue;
    }
    seen.add(key);
    topKeywords.push({ phrase, count: derivedCount });
    if (topKeywords.length >= maxKeywords) break;
  }

  const primaryKeyword = normPhrase(parsed && parsed.primaryKeyword) || (topKeywords[0] && topKeywords[0].phrase) || '';
  const coverKeyword = normPhrase(parsed && parsed.coverKeyword) || (topKeywords[1] && topKeywords[1].phrase) || primaryKeyword;
  const reasoning = String(parsed && parsed.reasoning || '').replace(/\s+/g, ' ').trim().slice(0, 400);
  if (!primaryKeyword || !topKeywords.length) return null;

  return {
    primaryKeyword,
    coverKeyword,
    topKeywords,
    reasoning
  };
}

async function generateStructuredPost(apiKey, prompt, options = {}) {
  const wordsMin = options.wordsMin > 0 ? options.wordsMin : 400;
  const wordsMax = options.wordsMax > 0 ? options.wordsMax : 0;
  const seoGeo = options.seoGeo !== false;
  const volumeRule = wordsMax > 0
    ? `Объём статьи: не менее ${wordsMin} и не более ${wordsMax} слов.`
    : `Объём статьи: не менее ${wordsMin} слов (полноценная статья).`;
  const seoGeoRule = seoGeo
    ? ' Оптимизируй текст под SEO и геозапросы: естественные ключевые слова, локальные уточнения где уместно.'
    : '';
  const useSuperPrompt = options.useSuperPrompt !== false;
  const useWebSearch = options.useWebSearch !== false;
  const keywordDensityGuard = options.keywordDensityGuard !== false;
  
  // Custom Content Settings
  const toneOfVoiceMap = {
    'default': 'Экспертный, информативный, сбалансированный.',
    'official': 'Официально-деловой, строгий, B2B, без сленга.',
    'friendly': 'Дружелюбный, неформальный, обращающийся на "ты", как к другу.',
    'clickbait': 'Кликбейтный, эмоциональный, интригующий, заставляющий дочитать до конца.',
    'educational': 'Обучающий, пошаговый, разжевывающий сложные вещи простым языком.',
    'selling': 'Продающий, с фокусом на выгоды, преимущества и призыв к действию (AIDA/PAS).'
  };
  const toneInstruction = options.toneOfVoice && toneOfVoiceMap[options.toneOfVoice] 
    ? `\n\nTONE OF VOICE (КРИТИЧНО):\nСтиль написания должен быть строго: ${toneOfVoiceMap[options.toneOfVoice]}`
    : '';
    
  const brandKnowledgeInstruction = options.brandKnowledge 
    ? `\n\nЗНАНИЯ О КОМПАНИИ (RAG / ФАКТЫ):\nОбязательно используй эти реальные факты в статье, не придумывай отсебятину, если это касается компании:\n"""${options.brandKnowledge}"""`
    : '';

  const keywordResearch = options.keywordResearch && options.keywordResearch.enabled ? options.keywordResearch : null;
  const keywordBlock = keywordResearch
    ? `\n\nWORDSTAT TOP REQUESTS (используй как приоритет SEO):
- primary_keyword: ${keywordResearch.primaryKeyword || ''}
- cover_keyword: ${keywordResearch.coverKeyword || ''}
- calls_made: ${keywordResearch.callsMade || 0}
- top_keywords: ${(keywordResearch.keywords || []).slice(0, 12).map((k) => `${k.phrase} (${k.count})`).join('; ')}
Требования:
- Используй primary_keyword в начале title и seo_title (естественно).
- Включи 4-8 ключей из top_keywords в текст и seo_keywords без переспама.
- Добавь cover_keyword в tags и учитывай в image_alt.
- Не выдумывай частотности: используй данные только как ориентир релевантности.
${keywordDensityGuard ? `- Keyword density guard: primary_keyword держи в среднем 0.8-1.2%, любой secondary keyword <= 0.9%; избегай повторов в соседних предложениях.` : ''}`
    : '';

  const systemPrompt = `Ты — редактор статей для Tilda Потоки. Ответь СТРОГО одним валидным JSON (без markdown, без \`\`\`), со всеми ключами ниже. Все строки в UTF-8.${toneInstruction}${brandKnowledgeInstruction}

Ключи JSON:
- title: заголовок поста (одна строка, кликабельный).
- cover_title: КОРОТКИЙ ЗАГОЛОВОК на баннер (1-4 слова), отражающий самую суть статьи. Никаких длинных фраз!
- excerpt: краткое описание для превью — ОБЯЗАТЕЛЬНО заполни, ровно 160–200 символов, 1–2 предложения, суть статьи.
- content: основной текст поста в HTML. ${TILDA_HTML_RULES}
- seo_title: SEO-заголовок, до 60 символов, ключевик в начале.
- seo_description: SEO-описание, 150–160 символов, с ключевыми словами.
- seo_keywords: ключевые слова через запятую (например: "ключ1, ключ2, ключ3").
- slug: транслит заголовка для URL (латиница, дефисы, без пробелов).
- author_name: оставь пустой строкой "" (автор подставится из настроек).
- author_link: оставь пустой строкой "" (ссылка подставится из настроек).
- visibility: "Опубликовано" или "Черновик".
- fb_title: заголовок для соцсетей, до 60 символов.
- fb_description: описание для превью в соцсетях, до 160 символов.
- tags: строка с тегами через запятую (например: "Тема1, Тема2, Тема3").
- image_alt: краткий alt-текст для обложки — 5–10 слов, описание изображения по теме статьи.

${volumeRule}${seoGeoRule}
Контент (content): несколько параграфов, 2–4 подзаголовка H2/H3, при необходимости список или выделенный блок. Используй ТОЧНО указанные inline-стили для p, h2, h3, ul/li, div.
${keywordBlock}`;
  const finalSystemPrompt = useSuperPrompt
    ? `${systemPrompt}\n\n${SUPER_PROMPT_V4_BLOCK}`
    : systemPrompt;

  const { apiProvider } = options;
  const isOfficial = apiProvider === 'official';
  const url = isOfficial ? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions' : GEMINI_CHAT_URL;

  let enrichedPrompt = `Инструкции генерации:\n${prompt || 'Напиши статью.'}\n\nТема/Исходный текст:\n${options.topicInfo || 'Без темы'}`;

  // Если нужен веб-поиск, делаем отдельный подготовительный запрос
  // ВАЖНО: для kie.ai это обход ограничения "нельзя JSON + Tools одновременно"
  // Для Official это тоже полезно, чтобы разделить контекст ресерча от жесткой генерации JSON
  if (useWebSearch) {
    try {
      const searchUrl = isOfficial ? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions' : GEMINI_CHAT_URL;
      const searchBody = {
        messages: [
          { role: 'system', content: [{ type: 'text', text: 'Ты — опытный ресерчер. Собери самую актуальную и подробную информацию в интернете по теме пользователя, используя Google Search. Напиши развернутую справку со всеми важными фактами, чтобы на ее основе можно было написать отличную статью.' }] },
          { role: 'user', content: [{ type: 'text', text: options.topicInfo || prompt }] }
        ],
        stream: false,
        tools: GEMINI_GOOGLE_SEARCH_TOOL
      };
      
      if (isOfficial) {
        searchBody.model = 'gemini-3.1-pro-preview';
      } else {
        searchBody.include_thoughts = false;
        searchBody.reasoning_effort = 'low';
      }

      const searchRes = await fetch(searchUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(searchBody)
      });
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        let searchContent = searchData && searchData.choices && searchData.choices[0] && searchData.choices[0].message && searchData.choices[0].message.content;
        if (Array.isArray(searchContent)) {
          searchContent = searchContent
            .filter((p) => p && (p.type === 'text' || typeof p.text === 'string'))
            .map((p) => (typeof p.text === 'string' ? p.text : ''))
            .filter(Boolean)
            .join('\n');
        }
        if (typeof searchContent === 'string' && searchContent.trim().length > 0) {
          enrichedPrompt = `Инструкции генерации:\n${prompt || 'Напиши статью.'}\n\nТема/Исходный текст:\n${options.topicInfo || 'Без темы'}\n\nСобранная актуальная информация из интернета для статьи:\n${searchContent}`;
        }
      }
    } catch (e) {
      console.warn('[TK-API] Ошибка предварительного поиска, продолжаем без него:', e);
    }
  }

  async function callStructuredOnce() {
    const bodyPayload = {
      messages: [
        { role: 'system', content: [{ type: 'text', text: finalSystemPrompt }] },
        { role: 'user', content: [{ type: 'text', text: enrichedPrompt }] }
      ],
      stream: false
    };

    if (isOfficial) {
      bodyPayload.model = 'gemini-3.1-pro-preview';
      bodyPayload.response_format = { type: 'json_object' };
    } else {
      bodyPayload.include_thoughts = false;
      bodyPayload.reasoning_effort = 'high';
      bodyPayload.response_format = { type: 'json_object' };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(bodyPayload)
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }
    return res.json();
  }

  function extractTextFromResponse(data) {
    let content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      const parts = content
        .filter((p) => p && (p.type === 'text' || typeof p.text === 'string'))
        .map((p) => (typeof p.text === 'string' ? p.text : ''))
        .filter(Boolean);
      if (parts.length) return parts.join('\n');
    }
    return '';
  }

  let data = await callStructuredOnce();
  let content = extractTextFromResponse(data);
  if (!content || typeof content !== 'string') throw new Error('Нет контента в ответе API');
  let raw = content.trim().replace(/^```(?:json)?\s*|\s*```$/gi, '');
  
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    // Иногда модель добавляет запятую перед закрывающей скобкой или возвращает оборванный JSON
    console.warn('[TK-API] Ошибка парсинга JSON, пробуем очистить:', err);
    try {
      raw = raw.replace(/,\s*([}\]])/g, '$1'); // убираем trailing commas
      parsed = JSON.parse(raw);
    } catch (e2) {
      // Игнорируем промежуточные tool-сообщения, если они просочились
      if (raw.includes('Google') || raw.includes('googleSearch')) {
        throw new Error('Не удалось спарсить JSON (модель вернула мусор от поиска). Отключите Web Search.');
      }
      throw new Error('Модель вернула некорректный JSON: ' + err.message + '\\n' + raw.substring(0, 100));
    }
  }

  const str = (v) => (v != null && v !== undefined ? String(v).trim() : '');
  const arr = (v) => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

  return {
    title: str(parsed.title),
    shortDescription: str(parsed.excerpt),
    body: str(parsed.content),
    seoTitle: str(parsed.seo_title),
    seoDescription: str(parsed.seo_description),
    seoKeywords: str(parsed.seo_keywords),
    slug: str(parsed.slug),
    authorName: str(parsed.author_name),
    authorLink: str(parsed.author_link),
    visibility: str(parsed.visibility),
    fbTitle: str(parsed.fb_title),
    fbDescription: str(parsed.fb_description),
    tags: arr(parsed.tags),
    imageAlt: str(parsed.image_alt)
  };
}
