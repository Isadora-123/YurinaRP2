// upstashChatHistory.js — Data Access Layer for Upstash Redis Chat History & Summary
const fs = require('fs');
const path = require('path');

function getUpstashConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ''), token };
}

// Memory fallback for local testing
let memoryChatHistory = [];
let memoryChatSummary = '';
let memoryChatContext = '';

/**
 * Fetches the latest chat history array from Upstash Redis.
 */
async function fetchChatHistory() {
  const config = getUpstashConfig();
  if (!config) {
    return memoryChatHistory;
  }

  try {
    const res = await fetch(`${config.url}/get/chat_history`, {
      headers: { Authorization: `Bearer ${config.token}` }
    });
    if (!res.ok) return memoryChatHistory;
    const data = await res.json();
    if (!data || data.result === null || data.result === undefined) return memoryChatHistory;
    
    let parsed = data.result;
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed);
      } catch (e) {}
    }
    // Safeguard for double-stringified JSON payload if any legacy string exists
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed);
      } catch (e) {}
    }

    return Array.isArray(parsed) ? parsed : memoryChatHistory;
  } catch (err) {
    console.warn('[UPSTASH-HISTORY] Failed to fetch chat history:', err.message);
    return memoryChatHistory;
  }
}

/**
 * Overwrites the entire chat history array on Upstash Redis.
 */
async function saveChatHistory(messages) {
  if (!Array.isArray(messages)) return false;
  memoryChatHistory = messages;

  const config = getUpstashConfig();
  if (!config) return true;

  try {
    const payload = JSON.stringify(messages);
    const res = await fetch(`${config.url}/set/chat_history`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json'
      },
      body: payload
    });
    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[UPSTASH-HISTORY] Upstash error status ${res.status}: ${errText}`);
    }
    return res.ok;
  } catch (err) {
    console.warn('[UPSTASH-HISTORY] Failed to save chat history:', err.message);
    return false;
  }
}

/**
 * Fetches the latest chat context string from Upstash Redis.
 */
async function fetchChatContext() {
  const config = getUpstashConfig();
  if (!config) {
    return memoryChatContext;
  }

  try {
    const res = await fetch(`${config.url}/get/chat_context`, {
      headers: { Authorization: `Bearer ${config.token}` }
    });
    if (!res.ok) return memoryChatContext;
    const data = await res.json();
    if (!data || data.result === null || data.result === undefined) return memoryChatContext;
    
    let parsed = data.result;
    if (typeof parsed === 'string') {
      try {
        const jsonVal = JSON.parse(parsed);
        if (typeof jsonVal === 'string') parsed = jsonVal;
      } catch (e) {}
    }
    return typeof parsed === 'string' ? parsed : String(parsed);
  } catch (err) {
    console.warn('[UPSTASH-HISTORY] Failed to fetch chat context:', err.message);
    return memoryChatContext;
  }
}

/**
 * Overwrites the chat context string on Upstash Redis.
 */
async function saveChatContext(contextText) {
  const text = typeof contextText === 'string' ? contextText : '';
  memoryChatContext = text;

  const config = getUpstashConfig();
  if (!config) return true;

  try {
    const res = await fetch(`${config.url}/set/chat_context`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(text)
    });
    return res.ok;
  } catch (err) {
    console.warn('[UPSTASH-HISTORY] Failed to save chat context:', err.message);
    return false;
  }
}

/**
 * Fetches the latest chat summary text from Upstash Redis.
 */
async function fetchChatSummary() {
  const config = getUpstashConfig();
  if (!config) {
    return memoryChatSummary;
  }

  try {
    const res = await fetch(`${config.url}/get/chat_summary`, {
      headers: { Authorization: `Bearer ${config.token}` }
    });
    if (!res.ok) return memoryChatSummary;
    const data = await res.json();
    if (!data || data.result === null || data.result === undefined) return memoryChatSummary;
    return typeof data.result === 'string' ? data.result : String(data.result);
  } catch (err) {
    console.warn('[UPSTASH-HISTORY] Failed to fetch chat summary:', err.message);
    return memoryChatSummary;
  }
}

/**
 * Overwrites the chat summary text on Upstash Redis.
 */
async function saveChatSummary(summaryText) {
  const text = typeof summaryText === 'string' ? summaryText : '';
  memoryChatSummary = text;

  const config = getUpstashConfig();
  if (!config) return true;

  try {
    const res = await fetch(`${config.url}/set/chat_summary`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(text)
    });
    return res.ok;
  } catch (err) {
    console.warn('[UPSTASH-HISTORY] Failed to save chat summary:', err.message);
    return false;
  }
}

/**
 * Clears chat history, context, or summary from Upstash Redis & Memory.
 */
async function clearChatData(options = { history: true, context: false, summary: false }) {
  const promises = [];
  if (options.history) {
    promises.push(saveChatHistory([]));
  }
  if (options.context) {
    promises.push(saveChatContext(''));
  }
  if (options.summary) {
    promises.push(saveChatSummary(''));
  }
  const results = await Promise.all(promises);
  return results.every(Boolean);
}

module.exports = {
  fetchChatHistory,
  saveChatHistory,
  fetchChatContext,
  saveChatContext,
  fetchChatSummary,
  saveChatSummary,
  clearChatData
};
