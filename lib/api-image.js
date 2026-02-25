/**
 * Nano Banana Pro (kie.ai) — createTask, затем poll recordInfo до success/fail.
 */
const JOBS_BASE = 'https://api.kie.ai/api/v1/jobs';
const POLL_INTERVAL_MS = 1500;
const POLL_MAX_ATTEMPTS = 120; // ~3 min

async function createImageTask(apiKey, input) {
  const model = (input.model || 'nano-banana-pro').trim();
  const imageUrls = (input.image_input && Array.isArray(input.image_input))
    ? input.image_input.filter((url) => url && typeof url === 'string')
    : [];
  let payload = {};

  if (model === 'gpt-image/1.5-image-to-image') {
    if (imageUrls.length === 0) {
      throw new Error('Для модели GPT Image 1.5 (image-to-image) требуется минимум 1 input URL.');
    }
    payload = {
      input_urls: imageUrls.slice(0, 8),
      prompt: input.prompt || 'Edit this image for article cover',
      aspect_ratio: input.aspect_ratio || '3:2',
      quality: input.quality || 'medium'
    };
  } else if (model === 'gpt-image/1.5-text-to-image') {
    payload = {
      prompt: input.prompt || 'Create an image for article cover',
      aspect_ratio: input.aspect_ratio || '3:2',
      quality: input.quality || 'medium'
    };
  } else {
    payload = {
      prompt: input.prompt || 'Cover image for blog post',
      aspect_ratio: input.aspect_ratio || '4:3',
      resolution: input.resolution || '1K',
      output_format: input.output_format || 'png'
    };
    if (imageUrls.length > 0) payload.image_input = imageUrls.slice(0, 8);
  }

  const res = await fetch(`${JOBS_BASE}/createTask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({ model, input: payload })
  });

  const data = await res.json();
  if (data.code !== 200 || !data.data || !data.data.taskId) {
    throw new Error(data.message || data.msg || `HTTP ${res.status}`);
  }
  return data.data.taskId;
}

async function getTaskRecord(apiKey, taskId) {
  const res = await fetch(`${JOBS_BASE}/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  const data = await res.json();
  if (data.code !== 200 || !data.data) {
    throw new Error(data.message || data.msg || `HTTP ${res.status}`);
  }
  return data.data;
}

async function generateOfficialGeminiImage(apiKey, input, onProgress) {
  if (typeof onProgress === 'function') onProgress({ state: 'generating', taskId: 'official-sync' });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${apiKey}`;
  
  const contents = [];
  
  // Добавляем текстовый промпт (согласно документации, текст должен быть первым, если это prompt-массив)
  contents.push({ text: input.prompt });

  // Загружаем референсы
  if (input.image_input && Array.isArray(input.image_input)) {
    for (const imgUrl of input.image_input) {
      if (!imgUrl || typeof imgUrl !== 'string') continue;
      
      try {
        if (imgUrl.startsWith('data:image/')) {
          const mimeType = imgUrl.substring(5, imgUrl.indexOf(';'));
          const base64 = imgUrl.substring(imgUrl.indexOf(',') + 1);
          contents.push({
            inlineData: {
              mimeType: mimeType,
              data: base64
            }
          });
          continue;
        }

        if (typeof onProgress === 'function') onProgress({ state: 'downloading_reference', taskId: 'official-sync' });
        const imgRes = await fetch(imgUrl);
        if (imgRes.ok) {
          const buffer = await imgRes.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);
          const mimeType = imgRes.headers.get('content-type') || 'image/jpeg';
          contents.push({
            inlineData: {
              mimeType: mimeType,
              data: base64
            }
          });
        } else {
          throw new Error(`HTTP ${imgRes.status}`);
        }
      } catch (err) {
        console.warn('[TK-API] Не удалось загрузить референс-изображение:', imgUrl, err);
      }
    }
  }

  const body = {
    contents: [{
      role: 'user',
      parts: contents
    }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: {
        aspectRatio: input.aspect_ratio || '4:3'
      }
    }
  };

  if (input.resolution) {
    let res = input.resolution.toUpperCase();
    if (res === '1K' || res === '2K' || res === '4K') {
      body.generationConfig.imageConfig.imageSize = res;
    }
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error((data.error && data.error.message) || `HTTP ${res.status}`);
  }

  let base64Data = null;
  const candidates = data.candidates || [];
  if (candidates.length > 0 && candidates[0].content && candidates[0].content.parts) {
    const parts = candidates[0].content.parts;
    for (const part of parts) {
      if (part.inlineData && part.inlineData.data) {
        base64Data = `data:${part.inlineData.mimeType || 'image/jpeg'};base64,${part.inlineData.data}`;
      }
    }
  }

  if (!base64Data) {
    throw new Error('Ответ не содержит изображения (inlineData).');
  }

  if (typeof onProgress === 'function') onProgress({ state: 'success', taskId: 'official-sync' });
  return base64Data;
}

async function generateImage(apiKey, input, onProgress) {
  if (input.apiProvider === 'official') {
    return generateOfficialGeminiImage(apiKey, input, onProgress);
  }

  const taskId = await createImageTask(apiKey, input);
  if (typeof onProgress === 'function') onProgress({ state: 'created', taskId });

  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const record = await getTaskRecord(apiKey, taskId);
    if (typeof onProgress === 'function') onProgress({ state: record.state, taskId, record });

    if (record.state === 'success') {
      let urls = [];
      try {
        const parsed = JSON.parse(record.resultJson || '{}');
        urls = parsed.resultUrls || (parsed.resultUrl ? [parsed.resultUrl] : []);
      } catch (_) {}
      if (urls.length === 0) throw new Error('Нет URL в результате');
      return urls[0];
    }
    if (record.state === 'fail') {
      throw new Error(record.failMsg || record.failCode || 'Генерация не удалась');
    }
  }

  throw new Error('Превышено время ожидания генерации');
}
