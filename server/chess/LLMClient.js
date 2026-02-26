import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_FILE = path.resolve(__dirname, '..', '..', 'llm_requests.log');

/**
 * Append a structured entry to the LLM request log file.
 */
function logLLMExchange(entry) {
  const line = JSON.stringify(entry) + '\n';
  fs.appendFile(LOG_FILE, line, (err) => {
    if (err) console.error('Failed to write LLM log:', err.message);
  });
}

/**
 * Shared rate limiter — 0.5 RPS = 1 request every 2000 ms.
 * Both white and black clients share this limiter so the combined
 * outbound rate never exceeds 0.5 req/s.
 */
const RATE_LIMIT_MS = 3000; // 1000 / 0.5
let _nextAllowedAt = 0;

function _rateLimit() {
  const now = Date.now();
  const wait = Math.max(0, _nextAllowedAt - now);
  _nextAllowedAt = Math.max(now, _nextAllowedAt) + RATE_LIMIT_MS;
  return wait > 0 ? new Promise(resolve => setTimeout(resolve, wait)) : Promise.resolve();
}

/**
 * Returns the length of the longest suffix of `text` that matches a
 * prefix of `tag`.  Used to detect partial `<think>` / `</think>` tags
 * at the boundary of a streaming chunk.
 */
function trailingPartialMatch(text, tag) {
  const maxLen = Math.min(text.length, tag.length - 1);
  for (let len = maxLen; len >= 1; len--) {
    if (text.endsWith(tag.slice(0, len))) return len;
  }
  return 0;
}

/**
 * Streaming HTTP client for OpenAI-compatible LLM APIs.
 * Ported from LLMClient.java.
 */
export class LLMClient {
  constructor(apiUrl, apiKey, model) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
    this.model = model;
  }

  /**
   * Sends a streaming chat completion request.
   * Rate-limited to 0.5 RPS (shared across all LLMClient instances).
   * @param {string} systemPrompt
   * @param {string} userMessage
   * @param {(type: string, text: string) => void} onChunk  callback for streamed chunks
   * @returns {Promise<string>} the final content (the move)
   */
  async chat(systemPrompt, userMessage, onChunk) {
    await _rateLimit();
    const requestTimestamp = new Date().toISOString();
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];
    const body = JSON.stringify({
      model: this.model,
      messages,
      temperature: 0.3,
      max_tokens: 4096,
      stream: true,
    });

    const res = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body,
    });

    if (!res.ok) {
      const errText = await res.text();
      logLLMExchange({
        timestamp: requestTimestamp,
        model: this.model,
        apiUrl: this.apiUrl,
        request: { messages },
        error: { status: res.status, body: errText },
      });
      throw new Error(`LLM API returned ${res.status}: ${errText}`);
    }

    let thinkingBuf = '';
    let contentBuf = '';

    // State for parsing <think>...</think> tags that arrive within
    // the content stream (e.g. DeepSeek R1 in some providers).
    let insideThinkTag = false;
    // Partial tag buffer — holds characters that *might* be the start
    // of a <think> or </think> tag but haven't been confirmed yet.
    let tagMatchBuf = '';
    const OPEN_TAG = '<think>';
    const CLOSE_TAG = '</think>';

    /**
     * Route a piece of content text, parsing any inline <think>
     * blocks and forwarding the appropriate chunks.
     */
    const processContentText = (text) => {
      // Append to a working buffer so we can detect tags that span chunks
      let work = tagMatchBuf + text;
      tagMatchBuf = '';

      while (work.length > 0) {
        if (insideThinkTag) {
          // Look for </think>
          const closeIdx = work.indexOf(CLOSE_TAG);
          if (closeIdx !== -1) {
            // Everything before the tag is thinking content
            const thinkPart = work.slice(0, closeIdx);
            if (thinkPart) {
              thinkingBuf += thinkPart;
              if (onChunk) onChunk('thinking', thinkPart);
            }
            insideThinkTag = false;
            work = work.slice(closeIdx + CLOSE_TAG.length);
          } else {
            // Check if the trailing chars could be the start of </think>
            const possiblePartial = trailingPartialMatch(work, CLOSE_TAG);
            if (possiblePartial > 0) {
              const safe = work.slice(0, work.length - possiblePartial);
              if (safe) {
                thinkingBuf += safe;
                if (onChunk) onChunk('thinking', safe);
              }
              tagMatchBuf = work.slice(work.length - possiblePartial);
            } else {
              thinkingBuf += work;
              if (onChunk) onChunk('thinking', work);
            }
            break;
          }
        } else {
          // Look for <think>
          const openIdx = work.indexOf(OPEN_TAG);
          if (openIdx !== -1) {
            // Everything before the tag is real content
            const contentPart = work.slice(0, openIdx);
            if (contentPart) {
              contentBuf += contentPart;
              if (onChunk) onChunk('content', contentPart);
            }
            insideThinkTag = true;
            work = work.slice(openIdx + OPEN_TAG.length);
          } else {
            // Check if trailing chars could be the start of <think>
            const possiblePartial = trailingPartialMatch(work, OPEN_TAG);
            if (possiblePartial > 0) {
              const safe = work.slice(0, work.length - possiblePartial);
              if (safe) {
                contentBuf += safe;
                if (onChunk) onChunk('content', safe);
              }
              tagMatchBuf = work.slice(work.length - possiblePartial);
            } else {
              contentBuf += work;
              if (onChunk) onChunk('content', work);
            }
            break;
          }
        }
      }
    };

    // Process the SSE stream line by line
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let rawChunks = []; // collect raw SSE data lines for debug logging

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep the last incomplete line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;
        const json = trimmed.substring(6).trim();
        rawChunks.push(json);

        try {
          const parsed = JSON.parse(json);
          const delta = parsed.choices?.[0]?.delta;
          if (!delta) continue;

          // Thinking / reasoning (native API fields)
          const thinkText = delta.reasoning_content || delta.thinking || null;
          if (thinkText) {
            thinkingBuf += thinkText;
            if (onChunk) onChunk('thinking', thinkText);
          }

          // Content — route through <think> tag parser
          const contentText = delta.content || null;
          if (contentText) {
            processContentText(contentText);
          }
        } catch {
          // Skip malformed JSON chunks
        }
      }
    }

    // Flush any remaining partial-tag buffer as content
    if (tagMatchBuf) {
      if (insideThinkTag) {
        thinkingBuf += tagMatchBuf;
      } else {
        contentBuf += tagMatchBuf;
      }
      tagMatchBuf = '';
    }

    const finalContent = contentBuf.trim();

    // Log the full request/response exchange
    logLLMExchange({
      timestamp: requestTimestamp,
      model: this.model,
      apiUrl: this.apiUrl,
      request: { messages },
      response: {
        content: finalContent,
        thinking: thinkingBuf || null,
        rawChunkCount: rawChunks.length,
        rawFirstChunk: rawChunks[0] || null,
      },
    });

    return finalContent;
  }

  getModel() {
    return this.model;
  }
}
