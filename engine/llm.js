/* noema-lite — one interface for the curriculum agents and the in-browser pack generator, over two vendors:
     Claude  (the learner's API key, engine/claude.js Key)  → a forced tool call whose input is the JSON
             (streamed, so long answers never time out)
     Gemini  (the learner's free key, ⚙️ Settings)          → JSON mode; research() uses Google Search grounding
   json() validates the answer against a JSON Schema (+ an optional semantic check) and asks the model to
   repair its own answer when something is wrong (up to `repairs` times). Keys never leave the browser. */
window.NoemaLLM = (() => {
  const CFG = () => window.NOEMA_CONFIG || {};
  const CLAUDE = () => (CFG().anthropicBase || 'https://api.anthropic.com').replace(/\/$/, '');
  const GEMINI = () => (CFG().geminiBase || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const settingsOf = acc => { try { return JSON.parse(localStorage.getItem(`noema1:${acc}:a:settings`) || '{}'); } catch (e) { return {}; } };

  /* ---------- which vendors can this learner use? ---------- */
  const keys = acc => ({ claude: window.NoemaClaude?.Key.get(acc) || '', gemini: settingsOf(acc).apiKey || window.Noema?.local?.geminiKey || window.DEFAULT_GEMINI_KEY || '' });
  function available(acc) { const k = keys(acc); return { claude: !!k.claude, gemini: !!k.gemini }; }
  /** pref: 'claude' | 'gemini' | 'auto' (Claude when its key exists — best quality — else Gemini). */
  function pick(acc, pref = 'auto') { const a = available(acc); if (pref !== 'auto' && a[pref]) return pref; return a.claude ? 'claude' : a.gemini ? 'gemini' : null; }

  /* ---------- a small JSON-Schema checker (the subset our schemas use) ---------- */
  function check(schema, v, path = '$', out = []) {
    if (!schema || out.length > 40) return out;
    const t = schema.type, at = path;
    const typeOk = !t || (t === 'array' ? Array.isArray(v) : t === 'object' ? v && typeof v === 'object' && !Array.isArray(v) : t === 'integer' ? Number.isInteger(v) : t === 'number' ? typeof v === 'number' && isFinite(v) : typeof v === t);
    if (!typeOk) { out.push(`${at}: expected ${t}`); return out; }
    if (schema.enum && !schema.enum.includes(v)) out.push(`${at}: must be one of ${schema.enum.join(', ')}`);
    if (schema.const !== undefined && v !== schema.const) out.push(`${at}: must be ${JSON.stringify(schema.const)}`);
    if (t === 'string') { if (schema.minLength && v.trim().length < schema.minLength) out.push(`${at}: too short`); if (schema.maxLength && v.length > schema.maxLength) out.push(`${at}: longer than ${schema.maxLength} characters`); if (schema.pattern && !new RegExp(schema.pattern).test(v)) out.push(`${at}: must match ${schema.pattern}`); }
    if (t === 'integer' || t === 'number') { if (schema.minimum !== undefined && v < schema.minimum) out.push(`${at}: ≥ ${schema.minimum}`); if (schema.maximum !== undefined && v > schema.maximum) out.push(`${at}: ≤ ${schema.maximum}`); }
    if (t === 'array') { if (schema.minItems && v.length < schema.minItems) out.push(`${at}: needs ≥ ${schema.minItems} items`); if (schema.maxItems && v.length > schema.maxItems) out.push(`${at}: at most ${schema.maxItems} items`); if (schema.items) v.forEach((x, i) => check(schema.items, x, `${at}[${i}]`, out)); }
    if (t === 'object') {
      for (const r of schema.required || []) if (v[r] === undefined) out.push(`${at}.${r}: missing`);
      for (const [k, x] of Object.entries(v)) { if (schema.properties?.[k]) check(schema.properties[k], x, `${at}.${k}`, out); else if (schema.additionalProperties === false) out.push(`${at}.${k}: unknown field`); else if (typeof schema.additionalProperties === 'object') check(schema.additionalProperties, x, `${at}.${k}`, out); }
    }
    return out;
  }

  /* ---------- Claude: a tool call (forced when the model allows it), streamed ----------
     Some models refuse a forced tool_choice ("type tool/any not supported for this model", e.g. models that always
     think). Then the same request is sent with tool_choice auto (the prompt asks for the tool), and — if a model
     even refuses tools — as plain text with the JSON Schema in the prompt. What works is remembered per model. */
  class LLMError extends Error { constructor(m, status, kind) { super(m); this.status = status; this.kind = kind; } }
  const MODES = ['forced', 'auto', 'text'];
  const modeKey = m => 'noema-device:claude-json-mode:' + m;
  const modeOf = m => { try { const v = localStorage.getItem(modeKey(m)); return MODES.includes(v) ? v : 'forced'; } catch (e) { return 'forced'; } };
  const setMode = (m, v) => { try { localStorage.setItem(modeKey(m), v); } catch (e) { } };
  async function claudeCall(acc, { model, system, messages, tool, maxTokens = 16000, signal, onProgress }) {
    const key = keys(acc).claude; if (!key) throw new LLMError('No Claude API key on this device.', 401, 'nokey');
    let mode = modeOf(model);
    const bodyFor = md => {
      const b = { model, max_tokens: maxTokens, stream: true, system: [{ type: 'text', text: system + (md === 'text' ? `\n\nAnswer with exactly one JSON object (no prose, no code fence) that matches this JSON Schema:\n${JSON.stringify(tool.input_schema)}` : md === 'auto' ? `\n\nAlways answer by calling the tool "${tool.name}" with the complete result — never in plain text.` : ''), cache_control: { type: 'ephemeral' } }], messages };
      if (md !== 'text') { b.tools = [tool]; b.tool_choice = md === 'forced' ? { type: 'tool', name: tool.name } : { type: 'auto' }; }
      return b;
    };
    let body = bodyFor(mode);
    for (let attempt = 0; ; attempt++) {
      let r;
      try { r = await fetch(CLAUDE() + '/v1/messages', { method: 'POST', signal, headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
      catch (e) { if (signal?.aborted) throw new LLMError('Stopped.', 0, 'aborted'); if (attempt < 5) { await wait(1500 * 2 ** attempt); continue; } throw new LLMError('No connection to Claude: ' + e.message, 0, 'network'); }
      if (!r.ok) {
        let m = ''; try { m = (await r.json())?.error?.message || ''; } catch (e) { }
        // the model does not take a forced tool call (or tools at all): fall back, and remember it for this model
        const noTools = !/tool_choice/i.test(m) && /\btools?\b[^.]*not supported|does not support tools/i.test(m);
        if (r.status === 400 && mode !== 'text' && (noTools || (mode === 'forced' && /tool_choice|forced tool|not supported for this model/i.test(m)))) {
          mode = noTools ? 'text' : 'auto'; setMode(model, mode); body = bodyFor(mode); attempt--; continue;
        }
        if ((r.status === 429 || r.status === 529 || r.status >= 500) && attempt < 6 && !/credit balance/i.test(m)) { const ra = +r.headers.get('retry-after'); await wait(ra > 0 ? Math.min(ra * 1000, 60000) : Math.min(60000, 2000 * 2 ** attempt)); continue; }
        throw new LLMError(r.status === 401 ? 'The Claude API key was not accepted.' : /credit balance/i.test(m) ? 'Your Claude API account has no credit left (platform.claude.com → Settings → Billing).' : `Claude: ${m || 'HTTP ' + r.status}`, r.status, 'api');
      }
      // server-sent events: input_json_delta pieces of the tool input
      const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '', json = '', text = '', usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, stop = null, n = 0;
      try {
        for (; ;) {
          const { done, value } = await reader.read(); if (done) break;
          buf += dec.decode(value, { stream: true });
          let i; while ((i = buf.indexOf('\n\n')) >= 0) {
            const ev = buf.slice(0, i); buf = buf.slice(i + 2);
            const data = ev.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('');
            if (!data) continue; let d; try { d = JSON.parse(data); } catch (e) { continue; }
            if (d.type === 'message_start') { const u = d.message?.usage || {}; usage.input += u.input_tokens || 0; usage.cacheRead += u.cache_read_input_tokens || 0; usage.cacheWrite += u.cache_creation_input_tokens || 0; }
            else if (d.type === 'content_block_delta' && d.delta?.type === 'input_json_delta') { json += d.delta.partial_json || ''; if (onProgress && ++n % 40 === 0) onProgress(json.length); }
            else if (d.type === 'content_block_delta' && d.delta?.type === 'text_delta') { text += d.delta.text || ''; if (onProgress && ++n % 40 === 0) onProgress(text.length); }
            else if (d.type === 'message_delta') { usage.output += d.usage?.output_tokens || 0; stop = d.delta?.stop_reason || stop; }
            else if (d.type === 'error') throw new LLMError('Claude: ' + (d.error?.message || 'stream error'), 0, d.error?.type === 'overloaded_error' ? 'overloaded' : 'api');
          }
        }
      } catch (e) {
        if (signal?.aborted) throw new LLMError('Stopped.', 0, 'aborted');
        if ((e.kind === 'overloaded' || !(e instanceof LLMError)) && attempt < 5) { await wait(2000 * 2 ** attempt); continue; }
        throw e;
      }
      // the tool input when the model called the tool; else the JSON it wrote as text (auto / text mode)
      return { text: json || text, usage, truncated: stop === 'max_tokens', mode };
    }
  }

  /* ---------- Gemini ---------- */
  function gemModel(acc, want) {
    if (want) return want;
    const s = settingsOf(acc); return s.model || (s.models || [])[0] || 'gemini-flash-latest';
  }
  async function geminiCall(acc, { model, system, contents, json = true, tools, maxTokens = 65536, signal }) {
    const key = keys(acc).gemini; if (!key) throw new LLMError('No Gemini key (⚙️ Settings).', 401, 'nokey');
    const m = gemModel(acc, model);
    const gc = { temperature: 0.6, maxOutputTokens: maxTokens };
    if (json) gc.responseMimeType = 'application/json';
    if (/gemini-3/.test(m)) gc.thinkingConfig = { thinkingLevel: 'low' }; else if (/2\.5-flash/.test(m)) gc.thinkingConfig = { thinkingBudget: 0 };
    const body = { contents, generationConfig: gc, systemInstruction: { parts: [{ text: system }] }, ...(tools ? { tools } : {}) };
    for (let attempt = 0; ; attempt++) {
      let r;
      try { r = await fetch(`${GEMINI()}/models/${m}:generateContent`, { method: 'POST', signal, headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) }); }
      catch (e) { if (signal?.aborted) throw new LLMError('Stopped.', 0, 'aborted'); if (attempt < 4) { await wait(1500 * 2 ** attempt); continue; } throw new LLMError('No connection to Gemini: ' + e.message, 0, 'network'); }
      if (!r.ok) {
        const t = await r.text();
        if (r.status === 400 && /thinking/i.test(t) && gc.thinkingConfig) { delete gc.thinkingConfig; continue; }
        if ((r.status === 429 || r.status >= 500) && attempt < 5) { await wait(Math.min(60000, 4000 * 2 ** attempt)); continue; }
        throw new LLMError(r.status === 429 ? 'Gemini’s free quota is used up for now (429) — wait a minute or use Claude.' : `Gemini ${r.status}: ${t.slice(0, 200)}`, r.status, 'api');
      }
      const d = await r.json(); const c = d.candidates?.[0];
      const text = (c?.content?.parts || []).map(p => p.text || '').join('');
      const gm = c?.groundingMetadata || {};
      const sources = (gm.groundingChunks || []).map(x => x.web).filter(Boolean).map(w => ({ title: w.title || w.uri, url: w.uri }));
      const u = d.usageMetadata || {};
      return { text, sources, queries: gm.webSearchQueries || [], usage: { input: u.promptTokenCount || 0, output: u.candidatesTokenCount || 0 }, truncated: c?.finishReason === 'MAX_TOKENS' };
    }
  }

  const stripFence = t => String(t || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  function parseJSON(t) {
    const s = stripFence(t);
    try { return JSON.parse(s); } catch (e) { }
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { } }
    throw new LLMError('The answer was not valid JSON.', 0, 'json');
  }

  /**
   * Ask for one JSON object that matches `schema`.
   * { acc, provider: 'claude'|'gemini', model, system, prompt, schema, name, validate(obj) → [errors], repairs = 2 }
   * → { data, usage, provider }
   */
  /** A Claude call needs a model: the one chosen in ⚙️ Settings → Claude, else the newest Sonnet the key can use. */
  const modelCache = {};
  async function claudeModel(acc) {
    try { const v = JSON.parse(localStorage.getItem(`noema1:${acc}:a:claudeModel`) || 'null'); if (v) return v; } catch (e) { }
    const CL = window.NoemaClaude, key = CL?.Key.get(acc); if (!key) throw new LLMError('Add a Claude API key first (⚙️ Settings → Claude).', 401, 'nokey');
    if (!modelCache[key]) modelCache[key] = CL.models(key).then(ms => CL.defaultModel(ms)).catch(e => { delete modelCache[key]; throw e; });
    return modelCache[key];
  }
  async function json(o) {
    const provider = o.provider || pick(o.acc); if (!provider) throw new LLMError('Add a Claude API key or a Gemini key first.', 401, 'nokey');
    if (provider === 'claude' && !o.model) o = { ...o, model: await claudeModel(o.acc) };
    const name = o.name || 'submit';
    const tool = { name, description: o.toolDescription || 'Submit the answer (the whole JSON object) with this tool.', input_schema: o.schema };
    const total = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    const add = u => { for (const k in total) total[k] += u?.[k] || 0; };
    let history = [{ role: 'user', text: o.prompt + (provider === 'gemini' ? `\n\nReturn exactly one JSON object that matches this JSON Schema (no prose, no code fence):\n${JSON.stringify(o.schema)}` : `\n\nSubmit the result by calling the tool "${name}".`) }];
    let last = '', errs = [];
    for (let round = 0; round <= (o.repairs ?? 2); round++) {
      let r;
      if (provider === 'claude') {
        const messages = history.map(h => ({ role: h.role, content: h.role === 'assistant' ? [{ type: 'text', text: h.text }] : [{ type: 'text', text: h.text }] }));
        r = await claudeCall(o.acc, { model: o.model, system: o.system, messages, tool, maxTokens: o.maxTokens || 32000, signal: o.signal, onProgress: o.onProgress });
      } else {
        const contents = history.map(h => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.text }] }));
        r = await geminiCall(o.acc, { model: o.model, system: o.system, contents, signal: o.signal, maxTokens: o.maxTokens });
      }
      add(r.usage); last = r.text;
      let data = null;
      try { data = parseJSON(r.text); errs = check(o.schema, data); if (!errs.length && o.validate) errs = o.validate(data) || []; }
      catch (e) { errs = [r.truncated ? 'The answer was cut off (too long). Be more concise: shorter texts, same structure.' : e.message]; }
      if (!errs.length) return { data, usage: total, provider };
      o.onRepair?.(errs, round);
      history = history.concat({ role: 'assistant', text: last.slice(0, 60000) || '(no answer)' }, { role: 'user', text: `Your answer has these problems:\n- ${errs.slice(0, 30).join('\n- ')}\nFix ALL of them and ${provider === 'claude' && r.mode !== 'text' ? `call the tool "${name}" again with the complete corrected object` : 'return the complete corrected JSON object'}.` });
    }
    throw new LLMError(`The ${provider === 'claude' ? 'Claude' : 'Gemini'} answer still had problems: ${errs.slice(0, 5).join('; ')}`, 0, 'invalid');
  }

  /** Gemini + Google Search: a research brief with its sources (for in-browser generation of new material). */
  async function research(acc, { system, prompt, model, signal }) {
    const r = await geminiCall(acc, { model, system, contents: [{ role: 'user', parts: [{ text: prompt }] }], json: false, tools: [{ google_search: {} }], signal, maxTokens: 16000 });
    return { text: r.text, sources: r.sources, usage: r.usage };
  }

  return { available, pick, keys, json, research, check, parseJSON, claudeCall, geminiCall, claudeModel, LLMError };
})();
