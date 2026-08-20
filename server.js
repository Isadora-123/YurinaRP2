// server.js — Robust Hybrid OpenAI ↔ NIM Proxy
// Express 5 Compatible
// Fixes: auth bypass, startup DDoS, silent stream failures, memory leaks, Express 5 deprecations

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const { StringDecoder } = require('string_decoder');
const { timingSafeEqual } = require('crypto');

const { processEventTriggers } = require('./scripts/eventTriggers');
const { applyAutoLineBreak, fixTextFormatting, StreamTextProcessor } = require('./scripts/formatFixer');
const { fetchRemoteLorebookStore, saveRemoteLorebookStore, fetchRemoteLorebook, saveRemoteLorebook } = require('./scripts/upstashLorebook');
const { fetchRemoteSystemPromptStore, saveRemoteSystemPromptStore } = require('./scripts/upstashSystemPrompt');
const { compileLorebookStore, extractCurrentDay, isLorebookStoreActive, shouldIncludeWorldState } = require('./scripts/lorebookCompiler');
const { processWorldStateTick, compileWorldStateSnapshot } = require('./scripts/worldStateEngine');
const { analyzeAndUpdateState } = require('./scripts/stateTracker');
const { fetchFullWorldState, saveFullWorldState } = require('./scripts/upstashWorldState');
const {
  fetchChatHistory,
  saveChatHistory,
  fetchChatContext,
  saveChatContext,
  fetchChatSummary,
  saveChatSummary,
  clearChatData
} = require('./scripts/upstashChatHistory');
const { fetchRemoteModelConfigStore, saveRemoteModelConfigStore, getDefaultModelConfig } = require('./scripts/upstashModelConfig');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Configuration ───────────────────────────────────────────────────────────

const NIM_API_BASE = process.env.NIM_API_BASE || 'https://integrate.api.nvidia.com/v1';
const NIM_API_KEY = process.env.NIM_API_KEY;
const CLIENT_AUTH_KEY = process.env.CLIENT_AUTH_KEY;

const SHOW_REASONING = process.env.SHOW_REASONING === 'true';
const ENABLE_THINKING_MODE = process.env.ENABLE_THINKING_MODE === 'true';
const SKIP_VALIDATION = process.env.SKIP_VALIDATION === 'true';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

const MAX_TOKENS_LIMIT = 65536;
const REQUEST_TIMEOUT_MS = 180000;
const VALIDATION_TIMEOUT_MS = 15000;
const MAX_BUFFER_SIZE = 1024 * 1024; // 1MB

if (SHOW_REASONING) console.log('[CONFIG] Reasoning display: ENABLED');
if (ENABLE_THINKING_MODE) console.log('[CONFIG] Thinking mode: ENABLED');

// ─── Config validation ──────────────────────────────────────────────────────

function validateConfig() {
  const fatal = (msg) => { console.error(`[FATAL] ${msg}`); process.exit(1); };
  
  if (!NIM_API_KEY) fatal('NIM_API_KEY is required. Get one at https://build.nvidia.com/');
  
  if (!CLIENT_AUTH_KEY) {
    console.warn('[WARN] CLIENT_AUTH_KEY not set. All requests will be rejected with 403.');
  }
}

validateConfig();

// ─── Model Mapping ─────────────────────────────────────────────────────────

const MODEL_MAPPING = {
  'gpt-3.5-turbo': 'nvidia/nemotron-3-super-120b-a12b',
  'gpt-3.5-ultra': 'nvidia/nemotron-3-ultra-550b-a55b',
  'gpt-4': 'qwen/qwen3-coder-480b-a35b-instruct',
  'gpt-3.5': 'qwen/qwen3.5-397b-a17b',
  'gpt-4-turbo': 'moonshotai/kimi-k2.6',
  'gpt-4o': 'deepseek-ai/deepseek-v4-pro',
  'claude-3-opus': 'openai/gpt-oss-120b',
  'claude-3-sonnet': 'openai/gpt-oss-20b',
  'gemini-pro': 'nvidia/llama-3.3-nemotron-super-49b-v1.5',
  'gemini-turbo': 'meta/llama-3.3-70b-instruct',
  'gemini-turbo?': 'abacusai/dracarys-llama-3.1-70b-instruct',
  'gpt-3.5o': 'nvidia/nemotron-mini-4b-instruct',
  'gpt-4-flash': 'deepseek-ai/deepseek-v4-flash',
  'glm-5.1': 'z-ai/glm-5.1',
  'mistral': 'mistralai/mistral-large-3-675b-instruct-2512',
  'mistral-turbo': 'mistralai/mistral-medium-3.5-128b',
  'mistral-pro': 'mistralai/mistral-small-4-119b-2603',
  'mistral-nemo': 'mistralai/mistral-nemotron',
  'mistral-fast': 'mistralai/ministral-14b-instruct-2512',
  'google-light': 'google/gemma-4-31b-it',
  'google-lightest': 'google/gemma-2-2b-it',
  'google-lighter': 'google/gemma-3n-e4b-it',
  'm2.7': 'minimaxai/minimax-m2.7',
  'm3': 'minimaxai/minimax-m3',
  'step-3.5-flash': 'stepfun-ai/step-3.5-flash',
  'step-3.7-flash': 'stepfun-ai/step-3.7-flash',
  'deepseek-v4-flash': 'deepseek-ai/deepseek-v4-flash',
  'deepseek-v4-pro': 'deepseek-ai/deepseek-v4-pro',
  'glm-5.2': 'z-ai/glm-5.2'
};

// Dynamic Model Configuration stored in Upstash Redis
let modelConfig = getDefaultModelConfig();

async function initModelConfig() {
  try {
    modelConfig = await fetchRemoteModelConfigStore();
    console.log(`[CONFIG] Model config loaded from Upstash Redis (fallback_enabled: ${modelConfig.fallback_enabled}, registry_count: ${modelConfig.model_registry?.length || 0})`);
  } catch (err) {
    console.warn('[CONFIG] Failed to load model config on startup:', err.message);
  }
}
initModelConfig();

function getActiveModelChain(primaryModel) {
  const fallbacks = (modelConfig.fallback_enabled && Array.isArray(modelConfig.fallback_models))
    ? modelConfig.fallback_models.filter(m => m.enabled).map(m => m.id)
    : [];
  
  if (!primaryModel) return fallbacks;
  return [primaryModel, ...fallbacks.filter(id => id !== primaryModel)];
}

function getModelRegistryEntry(modelId) {
  if (!Array.isArray(modelConfig.model_registry)) {
    modelConfig.model_registry = [];
  }
  return modelConfig.model_registry.find(m => m.id === modelId) || null;
}

function updateThinkingCapability(modelId, capable, reqBody) {
  if (!Array.isArray(modelConfig.model_registry)) {
    modelConfig.model_registry = [];
  }
  let entry = modelConfig.model_registry.find(m => m.id === modelId);
  const now = new Date().toISOString();

  let thinkingType = 'none';
  if (capable && reqBody) {
    if (reqBody.reasoning_effort || reqBody.extra_body?.chat_template_kwargs?.reasoning_effort) {
      thinkingType = 'nemotron';
    } else if (reqBody.extra_body?.chat_template_kwargs?.thinking_mode) {
      thinkingType = 'minimax';
    } else {
      thinkingType = 'standard';
    }
  }

  if (!entry) {
    entry = {
      id: modelId,
      label: modelId.includes('/') ? modelId.split('/').pop() : modelId,
      last_used: now,
      thinking_capable: capable,
      thinking_type: thinkingType,
      thinking_enabled: capable
    };
    modelConfig.model_registry.unshift(entry);
    if (modelConfig.model_registry.length > 10) {
      modelConfig.model_registry.splice(10);
    }
  } else {
    entry.last_used = now;
    if (capable) {
      const wasUnknownOrNone = !entry.thinking_capable;
      entry.thinking_capable = true;
      entry.thinking_type = thinkingType;
      if (wasUnknownOrNone) {
        entry.thinking_enabled = true;
      }
    } else {
      entry.thinking_capable = false;
      entry.thinking_type = 'none';
      entry.thinking_enabled = false;
    }
  }

  saveRemoteModelConfigStore(modelConfig).catch(err => {
    console.warn('[REGISTRY] Failed to auto-persist registry update:', err.message);
  });
}

function registerModelUsage(modelId) {
  if (!Array.isArray(modelConfig.model_registry)) {
    modelConfig.model_registry = [];
  }
  const now = new Date().toISOString();
  let entry = modelConfig.model_registry.find(m => m.id === modelId);

  if (!entry) {
    entry = {
      id: modelId,
      label: modelId.includes('/') ? modelId.split('/').pop() : modelId,
      last_used: now,
      thinking_capable: false,
      thinking_type: 'unknown',
      thinking_enabled: false
    };
    modelConfig.model_registry.unshift(entry);
    if (modelConfig.model_registry.length > 10) {
      modelConfig.model_registry.splice(10);
    }
  } else {
    entry.last_used = now;
    const idx = modelConfig.model_registry.indexOf(entry);
    if (idx > 0) {
      modelConfig.model_registry.splice(idx, 1);
      modelConfig.model_registry.unshift(entry);
    }
  }

  saveRemoteModelConfigStore(modelConfig).catch(err => {
    console.warn('[REGISTRY] Failed to auto-persist model usage:', err.message);
  });
  return entry;
}


// ─── Auth Helpers ────────────────────────────────────────────────────────────

function extractBearerToken(authHeader) {
  if (!authHeader || typeof authHeader !== 'string') return null;
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return authHeader.trim();
}

function safeTimingEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// ─── Middleware ─────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/v1/auth/verify', (req, res) => {
  if (!CLIENT_AUTH_KEY) {
    return res.status(401).json({ 
      ok: false, 
      message: 'CLIENT_AUTH_KEY chưa được cài đặt trong Environment Variables trên server Vercel!' 
    });
  }
  const token = extractBearerToken(req.headers.authorization);
  if (token && safeTimingEqual(token, CLIENT_AUTH_KEY)) {
    return res.json({ ok: true, message: 'Authenticated successfully' });
  }
  return res.status(403).json({ ok: false, message: 'Mật khẩu/CLIENT_AUTH_KEY không chính xác!' });
});

app.use((req, res, next) => {
  if (
    req.path === '/' ||
    req.path === '/health' ||
    req.path === '/v1/models' ||
    req.path === '/v1/auth/verify' ||
    req.path.endsWith('.html') ||
    req.path.endsWith('.css') ||
    req.path.endsWith('.js') ||
    req.path.endsWith('.png') ||
    req.path.endsWith('.ico') ||
    req.path.endsWith('.svg')
  ) {
    return next();
  }

  const token = extractBearerToken(req.headers.authorization);
  
  if (!token || !CLIENT_AUTH_KEY) {
    return res.status(403).json({
      error: {
        message: 'Forbidden: Invalid or missing authentication',
        type: 'authentication_error',
        code: 403
      }
    });
  }

  if (!safeTimingEqual(token, CLIENT_AUTH_KEY)) {
    return res.status(403).json({
      error: {
        message: 'Forbidden: Invalid authentication credentials',
        type: 'authentication_error',
        code: 403
      }
    });
  }

  next();
});

// ─── Validation ─────────────────────────────────────────────────────────────

// FIX: Use lightweight model listing instead of burning inference quota
// If NIM doesn't support /models, skip validation entirely rather than DDoS-ing yourself
async function validateModels() {
  if (SKIP_VALIDATION) {
    console.log('[VALIDATION] Skipped (SKIP_VALIDATION=true)');
    return;
  }

  console.log('[VALIDATION] Checking model availability via /v1/models...');

  try {
    const response = await axios.get(`${NIM_API_BASE}/models`, {
      headers: {
        Authorization: `Bearer ${NIM_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: VALIDATION_TIMEOUT_MS
    });

    const availableModels = new Set(
      (response.data.data || []).map(m => m.id)
    );

    const invalid = [];
    
    for (const [alias, nimId] of Object.entries(MODEL_MAPPING)) {
      if (availableModels.has(nimId)) {
        console.log(`[VALIDATION] ✓ ${alias} → ${nimId}`);
      } else {
        console.warn(`[VALIDATION] ✗ ${alias} → ${nimId} (not in catalog)`);
        invalid.push({ alias, nimId, error: 'Model not found in NIM catalog' });
      }
    }

    if (invalid.length > 0) {
      await sendDiscordAlert(invalid);
    } else {
      console.log('[VALIDATION] All models valid.');
    }

  } catch (err) {
    console.warn(`[VALIDATION] /v1/models endpoint failed: ${err.message}. Skipping validation.`);
    console.warn('[VALIDATION] Consider setting SKIP_VALIDATION=true if your NIM provider lacks a model listing endpoint.');
  }
}

async function sendDiscordAlert(invalidModels) {
  if (!DISCORD_WEBHOOK_URL) return;

  const embed = {
    title: '⚠️ NIM Proxy: Model Validation Failed',
    description: `${invalidModels.length} model(s) failed validation. Check NIM catalog for deprecations.`,
    color: 0xff4444,
    timestamp: new Date().toISOString(),
    fields: invalidModels.map(m => ({
      name: `\`${m.alias}\``,
      value: `Backend: \`${m.nimId}\`\nError: \`${m.error}\``,
      inline: true
    }))
  };

  try {
    await axios.post(DISCORD_WEBHOOK_URL, {
      embeds: [embed],
      username: 'NIM Proxy Monitor'
    }, { timeout: 5000 });
    console.log('[DISCORD] Alert sent.');
  } catch (err) {
    console.error('[DISCORD] Failed to send alert:', err.message);
  }
}

// ─── Helper: Safe Stream Writing ───────────────────────────────────────────

// FIX: Wrap res.write in try/catch to prevent crashes on closed sockets
function safeWrite(res, data) {
  try {
    if (!res.writableEnded && !res.destroyed && res.writable) {
      res.write(data);
      return true;
    }
  } catch (err) {
    console.warn('[STREAM] Write failed:', err.message);
  }
  return false;
}

// ─── Helper: Fallback Chain ─────────────────────────────────────────────────

function hasThinkingParams(reqBody) {
  return !!(reqBody.extra_body || reqBody.reasoning_effort || reqBody.reasoning_budget);
}

function removeThinkingParams(reqBody) {
  const clean = { ...reqBody };
  delete clean.extra_body;
  delete clean.reasoning_effort;
  delete clean.reasoning_budget;
  return clean;
}

async function callWithFallback(baseRequest, models) {
  let lastError = null;

  const makeRequest = async (reqBody, modelName) => {
    // If streaming, timeout after 25 seconds of no headers. If not, timeout after 90 seconds.
    const requestTimeout = reqBody.stream ? 25000 : 90000;
    return await axios.post(
      `${NIM_API_BASE}/chat/completions`,
      { ...reqBody, model: modelName },
      {
        headers: {
          Authorization: `Bearer ${NIM_API_KEY}`,
          'Content-Type': 'application/json'
        },
        responseType: reqBody.stream ? 'stream' : 'json',
        timeout: requestTimeout
      }
    );
  };

  for (const model of models) {
    try {
      const res = await makeRequest(baseRequest, model);
      if (hasThinkingParams(baseRequest)) {
        updateThinkingCapability(model, true, baseRequest);
      }
      return { response: res, model };

    } catch (err) {
      if (hasThinkingParams(baseRequest) && err.response?.status === 400) {
        console.warn(`[FALLBACK] Model ${model} failed with 400 and thinking params, retrying without thinking mode...`);
        updateThinkingCapability(model, false, null);
        try {
          const cleanRequest = removeThinkingParams(baseRequest);
          const res = await makeRequest(cleanRequest, model);
          return { response: res, model };
        } catch (retryErr) {
          lastError = retryErr;
          console.warn(
            `[FALLBACK] Model failed (retry): ${model}`,
            retryErr.response?.status,
            retryErr.response?.data?.error?.message || retryErr.message
          );
        }
      } else {
        lastError = err;
        console.warn(
          `[FALLBACK] Model failed: ${model}`,
          err.response?.status,
          err.response?.data?.error?.message || err.message
        );
      }
    }
  }


  throw lastError || new Error('All models failed');
}

// ─── Helper: Extract & Relocate [OOC:...] Prompts ──────────────────────────

function processOocPrompts(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return messages;

  const oocRegex = /\[OOC:[\s\S]*?\]/gi;
  const extractedOocs = [];

  const updatedMessages = messages.map(msg => {
    const newMsg = { ...msg };

    if (typeof newMsg.content === 'string') {
      const matches = newMsg.content.match(oocRegex);
      if (matches) {
        extractedOocs.push(...matches);
        newMsg.content = newMsg.content.replace(oocRegex, '').replace(/\n\s*\n\s*\n/g, '\n\n').trim();
      }
    } else if (Array.isArray(newMsg.content)) {
      newMsg.content = newMsg.content.map(part => {
        if (part.type === 'text' && typeof part.text === 'string') {
          const matches = part.text.match(oocRegex);
          if (matches) {
            extractedOocs.push(...matches);
            return {
              ...part,
              text: part.text.replace(oocRegex, '').replace(/\n\s*\n\s*\n/g, '\n\n').trim()
            };
          }
        }
        return part;
      });
    }

    return newMsg;
  });

  if (extractedOocs.length > 0) {
    let lastUserIdx = -1;
    for (let i = updatedMessages.length - 1; i >= 0; i--) {
      if (updatedMessages[i].role === 'user') {
        lastUserIdx = i;
        break;
      }
    }

    const targetIdx = lastUserIdx !== -1 ? lastUserIdx : updatedMessages.length - 1;
    const targetMsg = updatedMessages[targetIdx];
    const combinedOoc = '\n\n' + extractedOocs.join('\n');

    if (typeof targetMsg.content === 'string') {
      targetMsg.content += combinedOoc;
    } else if (Array.isArray(targetMsg.content)) {
      const textPart = targetMsg.content.find(p => p.type === 'text');
      if (textPart) {
        textPart.text += combinedOoc;
      } else {
        targetMsg.content.push({ type: 'text', text: combinedOoc });
      }
    }
  }

  return updatedMessages;
}

// ─── Routes ────────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '2.1.0' });
});

app.get('/v1/models', (req, res) => {
  res.json({
    object: 'list',
    data: Object.keys(MODEL_MAPPING).map(id => ({
      id,
      object: 'model',
      created: Date.now(),
      owned_by: 'nim-proxy'
    }))
  });
});

// ─── Lorebooks Tiered Database Routes ────────────────────────────────────────

app.get('/v1/lorebooks', async (req, res) => {
  try {
    const store = await fetchRemoteLorebookStore();
    res.json({ status: 'ok', store });
  } catch (err) {
    res.status(500).json({ error: { message: err.message, type: 'lorebooks_fetch_error' } });
  }
});

app.post('/v1/lorebooks', async (req, res) => {
  try {
    const storeData = req.body?.store || req.body;
    if (!storeData || !Array.isArray(storeData.lorebooks)) {
      return res.status(400).json({ error: { message: 'Invalid store format. Body must contain a "lorebooks" array.', type: 'invalid_request_error' } });
    }
    const result = await saveRemoteLorebookStore(storeData);
    res.json({ status: 'ok', message: 'LorebookStore saved successfully to Upstash Redis', result });
  } catch (err) {
    res.status(500).json({ error: { message: err.message, type: 'lorebooks_save_error' } });
  }
});

app.post('/v1/lorebooks/compile', async (req, res) => {
  try {
    const { store: reqStore, systemPromptStore: reqSpStore, messages: reqMessages, sampleText, previousAssistantText } = req.body;
    const store = reqStore || await fetchRemoteLorebookStore();
    const systemPromptStore = reqSpStore || await fetchRemoteSystemPromptStore();

    let messages = [];
    if (Array.isArray(reqMessages) && reqMessages.length > 0) {
      messages = reqMessages.map(m => ({ ...m }));
    } else {
      if (previousAssistantText && previousAssistantText.trim()) {
        messages.push({ role: 'assistant', content: previousAssistantText.trim() });
      }
      messages.push({ role: 'user', content: sampleText || '[ 🕒 Day 242] Testing Context Compile' });
    }

    // 1. Evaluate Base System Prompt
    const baseSystemPrompt = (systemPromptStore && systemPromptStore.system_prompt) ? systemPromptStore.system_prompt.trim() : '';

    // Check if Lorebook System is active and whether World State is enabled for active Lorebooks
    const loreActive = isLorebookStoreActive(store);
    const worldStateActive = shouldIncludeWorldState(store);

    let worldSnapshot = '';
    let compiledLore = { compiledPrompt: '', insertionMode: 'context', activeCount: 0 };

    if (loreActive) {
      compiledLore = compileLorebookStore(store, messages);
    }

    if (worldStateActive) {
      const worldState = await processWorldStateTick(messages);
      worldSnapshot = compileWorldStateSnapshot(worldState);
    }

    // 4. Evaluate System Prompt Rules & Event Triggers
    const {
      messages: eventProcessedMessages,
      fixFormat,
      autoLineBreak,
      triggeredPrompts
    } = processEventTriggers(messages, systemPromptStore);

    const dayExtracted = extractCurrentDay(eventProcessedMessages);

    // Separate System Context parts and User Message injected parts
    const systemContextSections = [];

    if (baseSystemPrompt) {
      systemContextSections.push(`--- [1] Base System Prompt ---\n${baseSystemPrompt}`);
    }

    if (worldStateActive && worldSnapshot) {
      systemContextSections.push(`--- [2] World State Snapshot ---\n${worldSnapshot}`);
    } else {
      systemContextSections.push(`--- [2] World State Snapshot ---\n(World State System Disabled for active Lorebook(s))`);
    }

    if (loreActive && compiledLore.compiledPrompt && compiledLore.insertionMode === 'context') {
      systemContextSections.push(`--- [3] Lorebook Database Context ---\n${compiledLore.compiledPrompt}`);
    } else {
      systemContextSections.push(`--- [3] Lorebook Database Context ---\n(Lorebooks disabled or no matching keywords found)`);
    }

    // Find system context rules vs user message rules in triggeredPrompts
    const userMsgInjectedParts = [];
    if (compiledLore.compiledPrompt && compiledLore.insertionMode === 'user_msg') {
      userMsgInjectedParts.push(`[Lorebook User Prompt]:\n${compiledLore.compiledPrompt}`);
    }

    if (triggeredPrompts && triggeredPrompts.length > 0) {
      userMsgInjectedParts.push(`[Triggered Prompt Rules]:\n${triggeredPrompts.join('\n\n')}`);
    }

    const outputLines = [];
    outputLines.push('=== ⚙️ COMPILED SYSTEM CONTEXT ===');
    outputLines.push(systemContextSections.join('\n\n'));

    outputLines.push('\n=== 📩 INJECTED USER MESSAGE PROMPTS ===');
    if (userMsgInjectedParts.length > 0) {
      outputLines.push(userMsgInjectedParts.join('\n\n'));
    } else {
      outputLines.push('(None)');
    }

    const fullPromptOutput = outputLines.join('\n\n');

    res.json({
      status: 'ok',
      current_day: dayExtracted,
      insertion_mode: compiledLore.insertionMode,
      active_count: compiledLore.activeCount,
      triggered_rules_count: triggeredPrompts.length,
      fix_format: fixFormat,
      auto_line_break: autoLineBreak,
      compiled_prompt: fullPromptOutput,
      triggered_prompts: triggeredPrompts
    });
  } catch (err) {
    res.status(500).json({ error: { message: err.message, type: 'lorebooks_compile_error' } });
  }
});

app.get('/v1/lorebooks/export', async (req, res) => {
  try {
    const store = await fetchRemoteLorebookStore();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="lorebook_store.json"');
    res.send(JSON.stringify(store, null, 2));
  } catch (err) {
    res.status(500).json({ error: { message: err.message, type: 'lorebooks_export_error' } });
  }
});

app.post('/v1/lorebooks/import', async (req, res) => {
  try {
    const storeData = req.body;
    if (!storeData || !Array.isArray(storeData.lorebooks)) {
      return res.status(400).json({ error: { message: 'Import payload must be a valid JSON with a "lorebooks" array.' } });
    }
    await saveRemoteLorebookStore(storeData);
    res.json({ status: 'ok', message: 'Lorebook database imported and saved successfully.' });
  } catch (err) {
    res.status(500).json({ error: { message: err.message, type: 'lorebooks_import_error' } });
  }
});

// ─── System Prompt & Rules Store Routes ──────────────────────────────────────

app.get('/v1/system-prompt', async (req, res) => {
  try {
    const store = await fetchRemoteSystemPromptStore();
    res.json({ status: 'ok', store });
  } catch (err) {
    res.status(500).json({ error: { message: err.message, type: 'system_prompt_fetch_error' } });
  }
});

app.post('/v1/system-prompt', async (req, res) => {
  try {
    const storeData = req.body?.store || req.body;
    if (!storeData || typeof storeData !== 'object') {
      return res.status(400).json({ error: { message: 'Invalid payload. Payload must be a JSON object.', type: 'invalid_request_error' } });
    }
    const result = await saveRemoteSystemPromptStore(storeData);
    res.json({ status: 'ok', message: 'System Prompt Store saved successfully to Upstash Redis', result });
  } catch (err) {
    res.status(500).json({ error: { message: err.message, type: 'system_prompt_save_error' } });
  }
});

app.get('/v1/system-prompt/export', async (req, res) => {
  try {
    const store = await fetchRemoteSystemPromptStore();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="system_prompt_store.json"');
    res.send(JSON.stringify(store, null, 2));
  } catch (err) {
    res.status(500).json({ error: { message: err.message, type: 'system_prompt_export_error' } });
  }
});

// ─── Model Configuration Routes ─────────────────────────────────────────────

app.get('/v1/model-config', async (req, res) => {
  try {
    const config = await fetchRemoteModelConfigStore();
    modelConfig = config;
    res.json({ ok: true, config });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/v1/model-config', async (req, res) => {
  try {
    const newConfig = req.body;
    if (typeof newConfig.fallback_enabled !== 'boolean' || !Array.isArray(newConfig.fallback_models)) {
      return res.status(400).json({ ok: false, error: 'Invalid model_config format. Expected fallback_enabled (boolean) and fallback_models (array).' });
    }
    await saveRemoteModelConfigStore(newConfig);
    modelConfig = newConfig;
    console.log('[CONFIG] Updated model config saved to Upstash Redis');
    res.json({ ok: true, message: 'Model configuration updated successfully', config: modelConfig });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/v1/model-test', async (req, res) => {
  const { model_id } = req.body;
  if (!model_id || typeof model_id !== 'string') {
    return res.status(400).json({ ok: false, error: 'model_id is required' });
  }
  
  const start = Date.now();
  try {
    const response = await axios.post(`${NIM_API_BASE}/chat/completions`, {
      model: model_id,
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 5,
      stream: false
    }, {
      headers: {
        Authorization: `Bearer ${NIM_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });
    const latency_ms = Date.now() - start;
    return res.json({ ok: true, latency_ms, model: model_id });
  } catch (err) {
    const latency_ms = Date.now() - start;
    const errorMsg = err.response?.data?.error?.message || err.response?.data?.detail || err.message;
    return res.json({ ok: false, latency_ms, model: model_id, error: errorMsg });
  }
});

// Legacy backward compatibility route
app.get('/v1/lorebook', async (req, res) => {
  try {
    const store = await fetchRemoteLorebookStore();
    res.json({ status: 'ok', store });
  } catch (err) {
    res.status(500).json({ error: { message: err.message, type: 'lorebook_fetch_error' } });
  }
});

app.post('/v1/lorebook', async (req, res) => {
  try {
    const storeData = req.body?.store || req.body;
    if (storeData && Array.isArray(storeData.lorebooks)) {
      await saveRemoteLorebookStore(storeData);
      return res.json({ status: 'ok', message: 'LorebookStore saved to Upstash' });
    }
    const content = req.body?.lorebook || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
    const result = await saveRemoteLorebook(content);
    res.json({ status: 'ok', message: 'Lorebook saved to Upstash', result });
  } catch (err) {
    res.status(500).json({ error: { message: err.message, type: 'lorebook_save_error' } });
  }
});

// ─── World State Routes ──────────────────────────────────────────────────────

app.get('/v1/worldstate', async (req, res) => {
  try {
    const state = await processWorldStateTick();
    const snapshot = compileWorldStateSnapshot(state);
    res.json({ status: 'ok', snapshot, state });
  } catch (err) {
    res.status(500).json({ error: { message: err.message, type: 'worldstate_error' } });
  }
});

app.post('/v1/worldstate/tick', async (req, res) => {
  try {
    const deltaDays = req.body?.delta_days ? parseInt(req.body.delta_days, 10) : 1;
    const currentState = await fetchFullWorldState();
    if (currentState && currentState.meta) {
      currentState.meta.current_day = (currentState.meta.current_day || 242) + deltaDays;
    }
    await saveFullWorldState(currentState);
    const newState = await processWorldStateTick();
    res.json({ status: 'ok', message: `Advanced simulation by ${deltaDays} day(s)`, current_day: newState?.meta?.current_day, state: newState });
  } catch (err) {
    res.status(500).json({ error: { message: err.message, type: 'worldstate_tick_error' } });
  }
});

app.post('/v1/worldstate/save_domain', async (req, res) => {
  try {
    const { domain, data } = req.body;
    if (!domain || !data) {
      return res.status(400).json({ error: { message: 'Missing domain or data' } });
    }
    const { saveWorldDomain } = require('./scripts/upstashWorldState');
    await saveWorldDomain(domain, data);
    const newState = await processWorldStateTick();
    res.json({ status: 'ok', message: `Saved domain '${domain}' to Upstash`, state: newState });
  } catch (err) {
    res.status(500).json({ error: { message: err.message, type: 'save_domain_error' } });
  }
});

app.post('/v1/worldstate/mutate', async (req, res) => {
  try {
    const { mutations } = req.body;
    if (!Array.isArray(mutations)) {
      return res.status(400).json({ error: { message: 'Mutations must be an array' } });
    }
    const { getNestedValue, setNestedValue } = require('./scripts/worldStateEngine');
    const currentState = await fetchFullWorldState();

    for (const mut of mutations) {
      if (mut.action === 'UPDATE_VAR' && mut.path) {
        let currentVal = getNestedValue(currentState, mut.path) || 0;
        if (mut.op === 'ADD') currentVal += mut.value;
        else if (mut.op === 'SUB') currentVal -= mut.value;
        else currentVal = mut.value;
        setNestedValue(currentState, mut.path, currentVal);
      } else if (mut.action === 'UPSERT_ENTITY' && mut.domain && mut.key) {
        if (!currentState[mut.domain]) currentState[mut.domain] = {};
        currentState[mut.domain][mut.key] = mut.data;
      } else if (mut.action === 'DELETE_ENTITY' && mut.domain && mut.key) {
        if (currentState[mut.domain]) delete currentState[mut.domain][mut.key];
      }
    }

    await saveFullWorldState(currentState);
    const newState = await processWorldStateTick();
    res.json({ status: 'ok', message: `Executed ${mutations.length} mutation(s)`, state: newState });
  } catch (err) {
    res.status(500).json({ error: { message: err.message, type: 'mutation_error' } });
  }
});

// ─── Chat History & Summary Endpoints ────────────────────────────────────────

app.get('/v1/chat/history', async (req, res) => {
  try {
    const history = await fetchChatHistory();
    const context = await fetchChatContext();
    res.json({ messages: history || [], context: context || '' });
  } catch (err) {
    res.status(500).json({ error: { message: err.message, type: 'chat_history_error' } });
  }
});

app.post('/v1/chat/history', async (req, res) => {
  try {
    const { messages, context } = req.body;
    if (Array.isArray(messages)) {
      await saveChatHistory(messages);
    }
    if (typeof context === 'string') {
      await saveChatContext(context);
    }
    res.json({ status: 'ok', message: 'Chat history and context saved successfully' });
  } catch (err) {
    res.status(500).json({ error: { message: err.message, type: 'chat_history_save_error' } });
  }
});

app.delete('/v1/chat/history', async (req, res) => {
  try {
    const clearContext = req.query.context === 'true';
    const clearSummary = req.query.summary === 'true';
    await clearChatData({ history: true, context: clearContext, summary: clearSummary });
    res.json({ status: 'ok', message: 'Chat history cleared successfully' });
  } catch (err) {
    res.status(500).json({ error: { message: err.message, type: 'chat_history_clear_error' } });
  }
});

app.get('/v1/chat/context', async (req, res) => {
  try {
    const context = await fetchChatContext();
    res.json({ context: context || '' });
  } catch (err) {
    res.status(500).json({ error: { message: err.message, type: 'chat_context_error' } });
  }
});

app.post('/v1/chat/context', async (req, res) => {
  try {
    const { context } = req.body;
    await saveChatContext(typeof context === 'string' ? context : '');
    res.json({ status: 'ok', message: 'Chat context saved successfully' });
  } catch (err) {
    res.status(500).json({ error: { message: err.message, type: 'chat_context_save_error' } });
  }
});

app.get('/v1/chat/summary', async (req, res) => {
  try {
    const summary = await fetchChatSummary();
    res.json({ summary: summary || '' });
  } catch (err) {
    res.status(500).json({ error: { message: err.message, type: 'chat_summary_error' } });
  }
});

app.post('/v1/chat/summary', async (req, res) => {
  try {
    const { prompt, model } = req.body;
    const history = await fetchChatHistory();

    if (!Array.isArray(history) || history.length === 0) {
      return res.status(400).json({ error: { message: 'Chat history is empty. Please send some messages first.' } });
    }

    const formattedHistory = history.map(m => {
      const roleName = m.role === 'user' ? 'User' : 'Assistant';
      const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      return `[${roleName}]: ${text}`;
    }).join('\n\n');

    const summarySystemPrompt = prompt || `Please Generate a detailed summary using bullet points day by day from your chat history.`;

    const cleanModel = typeof model === 'string' ? model.replace(/\[think\]/i, '').trim() : 'z-ai/glm-5.2';
    const primaryModel = MODEL_MAPPING[cleanModel] || cleanModel;
    const modelChain = getActiveModelChain(primaryModel);

    const baseRequest = {
      messages: [
        { role: 'system', content: summarySystemPrompt },
        { role: 'user', content: `Here is the chat history to summarize:\n\n${formattedHistory}` }
      ],
      temperature: 0.3,
      max_tokens: 4096,
      stream: true
    };

    const { response, model: usedModel } = await callWithFallback(baseRequest, modelChain);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const decoder = new StringDecoder('utf8');
    let buffer = '';
    let accumulatedSummary = '';

    const upstreamStream = response.data;

    upstreamStream.on('data', chunk => {
      buffer += decoder.write(chunk);
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          if (line.includes('[DONE]')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            const deltaContent = data.choices?.[0]?.delta?.content || '';
            if (deltaContent) {
              accumulatedSummary += deltaContent;
              res.write(`data: ${JSON.stringify({ content: deltaContent, model_used: usedModel })}\n\n`);
            }
          } catch (e) {}
        }
      }
    });

    upstreamStream.on('end', async () => {
      buffer += decoder.end();
      if (buffer.trim()) {
        for (const line of buffer.split('\n')) {
          if (line.startsWith('data: ') && !line.includes('[DONE]')) {
            try {
              const data = JSON.parse(line.slice(6));
              const deltaContent = data.choices?.[0]?.delta?.content || '';
              if (deltaContent) {
                accumulatedSummary += deltaContent;
                res.write(`data: ${JSON.stringify({ content: deltaContent, model_used: usedModel })}\n\n`);
              }
            } catch (e) {}
          }
        }
      }

      if (accumulatedSummary) {
        try {
          await saveChatSummary(accumulatedSummary);
        } catch (err) {
          console.warn('[SUMMARY] Failed to save summary to Redis:', err.message);
        }
      }

      res.write('data: [DONE]\n\n');
      res.end();
    });

    upstreamStream.on('error', err => {
      console.error('[SUMMARY] Stream error:', err.message);
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
    });

  } catch (err) {
    console.error('[SUMMARY] Failed to generate summary:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: { message: err.message || 'Failed to generate summary', type: 'summary_error' } });
    } else if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }
});

app.post('/v1/chat/completions', async (req, res) => {
  let streamEndedCleanly = false;
  let upstreamStream = null;

  try {
    const {
      model,
      messages,
      temperature,
      max_tokens,
      stream
    } = req.body;

    // 0. Auto-save incoming context (system messages) and dialogue history
    let chatOnlyMessages = [];
    if (Array.isArray(messages)) {
      const systemMessages = messages.filter(m => m && m.role === 'system');
      if (systemMessages.length > 0) {
        const contextText = systemMessages.map(m => {
          if (typeof m.content === 'string') return m.content;
          if (Array.isArray(m.content)) {
            return m.content.map(p => (p && typeof p.text === 'string' ? p.text : JSON.stringify(p))).join('\n');
          }
          return JSON.stringify(m.content);
        }).join('\n\n');
        
        saveChatContext(contextText).catch(err => {
          console.warn('[PROXY] Failed to auto-save chat context:', err.message);
        });
      }

      chatOnlyMessages = messages.filter(m => m && m.role !== 'system');
      if (chatOnlyMessages.length > 0) {
        saveChatHistory(chatOnlyMessages).catch(err => {
          console.warn('[PROXY] Failed to auto-save chat history:', err.message);
        });
      }
    }

    const cleanModel = typeof model === 'string' ? model.replace(/\[think\]/i, '').trim() : model;

    const primaryModel = MODEL_MAPPING[cleanModel] || cleanModel;
    const modelChain = getActiveModelChain(primaryModel);

    // 1. Fetch System Prompt Store & Tiered LorebookStore
    const systemPromptStore = await fetchRemoteSystemPromptStore();
    const lorebookStore = await fetchRemoteLorebookStore();

    // Prepend base system prompt if configured
    if (systemPromptStore && systemPromptStore.system_prompt && Array.isArray(messages) && messages.length > 0) {
      if (messages[0].role === 'system') {
        if (typeof messages[0].content === 'string' && !messages[0].content.includes(systemPromptStore.system_prompt)) {
          messages[0].content = systemPromptStore.system_prompt + '\n\n' + messages[0].content;
        }
      } else {
        messages.unshift({ role: 'system', content: systemPromptStore.system_prompt });
      }
    }

    // 2. Process World State & Lorebook Store ONLY if Lorebook System is active
    const loreActive = isLorebookStoreActive(lorebookStore);
    const worldStateActive = shouldIncludeWorldState(lorebookStore);

    if (loreActive) {
      const compiledLore = compileLorebookStore(lorebookStore, messages);
      const contextParts = [];

      if (worldStateActive) {
        const worldState = await processWorldStateTick(messages);
        const worldSnapshot = compileWorldStateSnapshot(worldState);
        if (worldSnapshot) contextParts.push(worldSnapshot);
      }

      if (compiledLore.compiledPrompt && compiledLore.insertionMode === 'context') {
        contextParts.push(compiledLore.compiledPrompt);
      }
      const combinedContext = contextParts.filter(Boolean).join('\n\n');

      if (combinedContext && Array.isArray(messages) && messages.length > 0) {
        if (messages[0].role === 'system') {
          if (typeof messages[0].content === 'string') {
            messages[0].content += '\n\n' + combinedContext;
          }
        } else {
          messages.unshift({ role: 'system', content: combinedContext });
        }
      }

      if (compiledLore.compiledPrompt && compiledLore.insertionMode === 'user_msg') {
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === 'user') {
            if (typeof messages[i].content === 'string') {
              messages[i].content += '\n\n' + compiledLore.compiledPrompt;
            }
            break;
          }
        }
      }
    }

    const {
      messages: eventProcessedMessages,
      fixFormat,
      autoLineBreak,
      triggeredPrompts
    } = processEventTriggers(messages, systemPromptStore);

    if (triggeredPrompts.length > 0) {
      console.log(`[PROXY] Activated ${triggeredPrompts.length} event trigger prompt(s)`);
    }
    if (fixFormat) console.log('[PROXY] Feature: Fix format ENABLED');
    if (autoLineBreak) console.log('[PROXY] Feature: Auto line break ENABLED');

    const processedMessages = processOocPrompts(eventProcessedMessages);

    // 3. Smart Thinking Mode & Model Registry Auto-Tracking
    const registryEntry = registerModelUsage(primaryModel);

    let requestEnableThinking = false;
    let requestShowReasoning = false;
    let detectedThinkingType = null; // 'standard' | 'minimax' | 'nemotron' | null

    if (registryEntry) {
      if (registryEntry.thinking_enabled) {
        requestEnableThinking = true;
        requestShowReasoning = true;
        detectedThinkingType = registryEntry.thinking_type;
      } else if (registryEntry.thinking_type === 'unknown') {
        // Auto-detect on first call
        requestEnableThinking = true;
        requestShowReasoning = true;
      }
    } else {
      // No entry yet, will auto-detect
      requestEnableThinking = true;
      requestShowReasoning = true;
    }

    // Resolve thinking type if not already known from registry
    if (requestEnableThinking && !detectedThinkingType) {
      const pLower = (typeof cleanModel === 'string' ? cleanModel : primaryModel).toLowerCase();
      if (pLower.includes('minimax')) {
        detectedThinkingType = 'minimax';
      } else if (pLower.includes('nemotron') || pLower.includes('ultra') || pLower.includes('super') || pLower.includes('nano')) {
        detectedThinkingType = 'nemotron';
      } else {
        detectedThinkingType = 'standard';
      }
    }

    // Build baseRequest with correct thinking param placement per model type
    // Nemotron: reasoning_effort & reasoning_budget are TOP-LEVEL request body fields
    // Standard: { thinking: true } goes inside extra_body.chat_template_kwargs
    // MiniMax:  { thinking_mode: 'enabled' } goes inside extra_body.chat_template_kwargs
    const baseRequest = {
      messages: processedMessages,
      temperature: temperature ?? 0.7,
      max_tokens: Math.min(max_tokens ?? 2048, MAX_TOKENS_LIMIT),
      stream: stream || false,
    };

    if (requestEnableThinking && detectedThinkingType) {
      if (detectedThinkingType === 'nemotron') {
        baseRequest.reasoning_effort = 'high';
        baseRequest.reasoning_budget = 16384;
      } else if (detectedThinkingType === 'minimax') {
        baseRequest.extra_body = { chat_template_kwargs: { thinking_mode: 'enabled' } };
      } else {
        // standard (DeepSeek, Qwen, etc.)
        baseRequest.extra_body = { chat_template_kwargs: { thinking: true } };
      }
    }


    const { response, model: usedModel } = await callWithFallback(baseRequest, modelChain);
    upstreamStream = response.data;
    console.log('[PROXY] Model used:', usedModel);

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const decoder = new StringDecoder('utf8');
      let buffer = '';
      let reasoningOpen = false;
      let doneSent = false;
      let cleanedUp = false;
      let streamTimer = null;
      let accumulatedAssistantText = '';

      const streamProcessor = (fixFormat || autoLineBreak)
        ? new StreamTextProcessor({ fixFormat, autoLineBreak })
        : null;

      const resetStreamTimer = () => {
        if (streamTimer) clearTimeout(streamTimer);
        streamTimer = setTimeout(() => {
          console.warn('[STREAM] Inactivity timeout reached, destroying stream');
          if (!res.headersSent) {
            res.status(504).json({ error: { message: 'Upstream read timeout', type: 'stream_timeout' } });
          } else if (!res.writableEnded) {
            safeWrite(res, `data: ${JSON.stringify({ 
              error: { 
                message: 'Stream read timeout / inactivity', 
                type: 'stream_timeout' 
              } 
            })}\n\n`);
            safeWrite(res, 'data: [DONE]\n\n');
            res.end();
          }
          if (upstreamStream && !upstreamStream.destroyed) {
            upstreamStream.destroy();
          }
          cleanup();
        }, 30000); // 30s read timeout
      };

      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        if (streamTimer) {
          clearTimeout(streamTimer);
          streamTimer = null;
        }
        if (upstreamStream) {
          upstreamStream.removeAllListeners();
        }
        req.removeAllListeners('close');
      };

      const processLine = (line) => {
        if (!line.startsWith('data: ')) return;

        if (line.includes('[DONE]')) {
          if (!doneSent) {
            safeWrite(res, 'data: [DONE]\n\n');
            doneSent = true;
          }
          streamEndedCleanly = true;
          return;
        }

        try {
          const data = JSON.parse(line.slice(6));
          const delta = data.choices?.[0]?.delta;

          if (delta) {
            let content = delta.content || '';
            const reasoning = delta.reasoning_content;

            const startTag = modelConfig.thinking_start_tag || '<think>';
            const endTag = modelConfig.thinking_end_tag || '</think>';

            if (requestShowReasoning) {
              if (reasoning && !reasoningOpen) {
                content = `${startTag}\n${reasoning.replace(/\n/g, '\\n')}`;
                reasoningOpen = true;
              } else if (reasoning) {
                content = reasoning.replace(/\n/g, '\\n');
              }

              if (delta.content && reasoningOpen) {
                content += `\n${endTag}\n\n${delta.content}`;
                reasoningOpen = false;
              }
            }

            if (streamProcessor && content) {
              content = streamProcessor.processChunk(content);
            }

            if (content) {
              accumulatedAssistantText += content;
            }

            delta.content = content;
            delete delta.reasoning_content;
          }

          safeWrite(res, `data: ${JSON.stringify(data)}\n\n`);

        } catch (parseErr) {
          console.warn('[STREAM] Invalid JSON line:', line.slice(0, 100));
          safeWrite(res, `data: ${JSON.stringify({ 
            error: { 
              message: 'Upstream sent malformed chunk', 
              type: 'stream_parse_error',
              details: line.slice(0, 100)
            } 
          })}\n\n`);
        }
      };

      // Start the inactivity timer when stream begins
      resetStreamTimer();

      upstreamStream.on('data', chunk => {
        resetStreamTimer();
        buffer += decoder.write(chunk);

        if (buffer.length > MAX_BUFFER_SIZE) {
          console.error('[STREAM] Buffer overflow, destroying connection');
          safeWrite(res, `data: ${JSON.stringify({ 
            error: { 
              message: 'Stream buffer overflow', 
              type: 'stream_error' 
            } 
          })}\n\n`);
          safeWrite(res, 'data: [DONE]\n\n');
          res.end();
          upstreamStream.destroy();
          cleanup();
          return;
        }

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          processLine(line);
        }
      });

      upstreamStream.on('end', () => {
        if (streamTimer) {
          clearTimeout(streamTimer);
          streamTimer = null;
        }
        buffer += decoder.end();

        if (buffer.trim()) {
          for (const line of buffer.split('\n')) {
            processLine(line);
          }
        }

        if (streamProcessor) {
          const finalChunk = streamProcessor.flush();
          if (finalChunk) {
            accumulatedAssistantText += finalChunk;
            safeWrite(res, `data: ${JSON.stringify({
              id: `chatcmpl-${Date.now()}`,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: model,
              choices: [{ index: 0, delta: { content: finalChunk }, finish_reason: null }]
            })}\n\n`);
          }
        }

        if (accumulatedAssistantText.trim() && Array.isArray(chatOnlyMessages) && chatOnlyMessages.length > 0) {
          saveChatHistory([...chatOnlyMessages, { role: 'assistant', content: accumulatedAssistantText }]).catch(err => {
            console.warn('[PROXY] Failed to update chat history with assistant stream:', err.message);
          });
        }

        if (!doneSent) {
          safeWrite(res, 'data: [DONE]\n\n');
        }

        streamEndedCleanly = true;
        if (!res.writableEnded) {
          res.end();
        }
        cleanup();
      });

      upstreamStream.on('error', err => {
        if (streamTimer) {
          clearTimeout(streamTimer);
          streamTimer = null;
        }
        console.error('[STREAM] Upstream error:', err.message);
        
        if (!res.writableEnded) {
          safeWrite(res, `data: ${JSON.stringify({
            error: {
              message: 'Stream interrupted by upstream error',
              type: 'stream_error'
            }
          })}\n\n`);
          safeWrite(res, 'data: [DONE]\n\n');
          res.end();
        }
        cleanup();
      });

      req.on('close', () => {
        const clientGone = req.destroyed || !res.writable;
        
        if (!streamEndedCleanly && clientGone) {
          console.warn('[STREAM] Client disconnected prematurely');
        }

        if (upstreamStream && !upstreamStream.destroyed && !streamEndedCleanly) {
          upstreamStream.destroy();
        }
        cleanup();
      });

    } else {
      // Non-streaming response
      const startTag = modelConfig.thinking_start_tag || '<think>';
      const endTag = modelConfig.thinking_end_tag || '</think>';

      const openaiResponse = {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model,
        choices: (response.data.choices || []).map((choice, i) => {
          let content = choice.message?.content || '';

          if (requestShowReasoning && choice.message?.reasoning_content) {
            const safeReasoning = choice.message.reasoning_content.replace(/\n/g, '\\n');
            content = `${startTag}\n${safeReasoning}\n${endTag}\n\n${content}`;
          }

          if (autoLineBreak) {
            content = applyAutoLineBreak(content);
          }
          if (fixFormat) {
            content = fixTextFormatting(content, true);
          }

          return {
            index: i,
            message: {
              role: choice.message?.role || 'assistant',
              content,
              tool_calls: choice.message?.tool_calls
            },
            finish_reason: choice.finish_reason || 'stop'
          };
        }),
        usage: response.data.usage || {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        }
      };

      res.json(openaiResponse);

      // Trigger background state tracker and update chat history asynchronously
      const fullAssistantText = openaiResponse.choices?.[0]?.message?.content || '';
      if (fullAssistantText) {
        if (Array.isArray(chatOnlyMessages) && chatOnlyMessages.length > 0) {
          saveChatHistory([...chatOnlyMessages, { role: 'assistant', content: fullAssistantText }]).catch(err => {
            console.warn('[PROXY] Failed to update chat history with assistant response:', err.message);
          });
        }
        setImmediate(() => {
          analyzeAndUpdateState(processedMessages, fullAssistantText).catch(err => {
            console.warn('[PROXY] Background state tracker failed:', err.message);
          });
        });
      }
    }

  } catch (error) {
    console.error('[PROXY] Fatal error:', error.message);
    if (error.response?.data) {
      if (typeof error.response.data.on === 'function') {
        let errorBody = '';
        error.response.data.on('data', chunk => {
          errorBody += chunk.toString();
        });
        error.response.data.on('end', () => {
          console.error('[PROXY] NIM response (stream):', errorBody);
        });
      } else {
        console.error('[PROXY] NIM response:', error.response.data);
      }
    }

    if (!res.headersSent) {
      res.status(error.response?.status || 500).json({
        error: {
          message: error.message,
          type: 'invalid_request_error',
          code: error.response?.status || 500
        }
      });
    } else if (!res.writableEnded) {
      safeWrite(res, `data: ${JSON.stringify({
        error: {
          message: error.message,
          type: 'proxy_error'
        }
      })}\n\n`);
      safeWrite(res, 'data: [DONE]\n\n');
      res.end();
    }

    // Clean up upstream stream if we have it
    if (upstreamStream && !upstreamStream.destroyed) {
      upstreamStream.destroy();
    }
  }
});

// FIX: Express 5 named wildcard — but use proper 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      message: `Endpoint ${req.method} ${req.path} not found`,
      type: 'invalid_request_error',
      code: 404
    }
  });
});

// ─── Startup ───────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[PROXY] Hybrid proxy running on port ${PORT}`);
  console.log(`[PROXY] Max tokens limit: ${MAX_TOKENS_LIMIT}`);
  
  // Run validation after server starts, non-blocking
  validateModels().catch(err => {
    console.error('[VALIDATION] Startup check failed:', err.message);
  });
});

module.exports = app;

