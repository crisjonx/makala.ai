// server.cjs (fixed: correct OpenRouter URL, improved error handling)
const express = require('express');
const path = require('path');
const fetch = globalThis.fetch || require('node-fetch');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// small helper to extract text from provider response
function extractTextFromProviderData(data){
  if(!data) return '';
  if(typeof data === 'string') return data;
  if(data.reply && typeof data.reply === 'string') return data.reply;
  if(data.raw && data.raw.choices && data.raw.choices[0]){
    const c = data.raw.choices[0];
    if(c.message && c.message.content) return c.message.content;
    if(c.text) return c.text;
  }
  if(data.choices && data.choices[0]){
    const c = data.choices[0];
    if(c.message && c.message.content) return c.message.content;
    if(c.text) return c.text;
  }
  try { const s = JSON.stringify(data); return s.length > 1500 ? s.slice(0,1500) + '...' : s; } catch(e){ return String(data); }
}

app.get('/health', (req, res) => res.send('ok'));

// POST /api/chat
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, model } = req.body;
    if (!messages) return res.status(400).send('Missing messages');

    const OR_KEY = process.env.OPENROUTER_API_KEY;
    const OA_KEY = process.env.OPENAI_API_KEY;
    // prefer an explicit model from client, otherwise env override or default
    const chosenModel = model || process.env.OPENROUTER_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';

    // Try OpenRouter if key provided
    if (OR_KEY) {
      // NOTE: correct base/url per OpenRouter docs: openrouter.ai/api/v1
      const url = 'https://openrouter.ai/api/v1/chat/completions';
      const payload = { model: chosenModel, messages, temperature: 0.3, max_tokens: 800 };

      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OR_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        // optional: timeout handling may be added later
      });

      if (!r.ok) {
        const txt = await r.text().catch(()=>`status ${r.status}`);
        return res.status(502).json({ error: `OpenRouter returned ${r.status}`, details: txt });
      }

      const data = await r.json();
      const reply = extractTextFromProviderData({ raw: data, reply: data.reply });
      return res.json({ reply, raw: data });
    }

    // Fallback to OpenAI if available
    if (OA_KEY) {
      const url = 'https://api.openai.com/v1/chat/completions';
      const payload = { model: chosenModel, messages, temperature: 0.3, max_tokens: 800 };

      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OA_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!r.ok) {
        const txt = await r.text().catch(()=>`status ${r.status}`);
        return res.status(502).json({ error: `OpenAI returned ${r.status}`, details: txt });
      }

      const data = await r.json();
      const reply = extractTextFromProviderData({ raw: data, reply: data.reply });
      return res.json({ reply, raw: data });
    }

    // no key configured
    return res.status(500).send('No API key configured. Set OPENROUTER_API_KEY or OPENAI_API_KEY.');
  } catch (err) {
    console.error('chat error', err);
    // network/DNS errors will appear here; return a helpful message to client
    return res.status(500).json({ error: 'chat error', message: String(err) });
  }
});

// Title generation endpoint (optional)
app.post('/api/title', async (req, res) => {
  try {
    const { text } = req.body;
    if(!text) return res.status(400).send('Missing text');

    const OR_KEY = process.env.OPENROUTER_API_KEY;
    const OA_KEY = process.env.OPENAI_API_KEY;
    const chosenModel = process.env.OPENROUTER_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';

    const prompt = [
      { role:'system', content: 'You are a concise title generator. Given a user prompt, return a 3-6 word Title Case title, no trailing punctuation.' },
      { role:'user', content: `Create a short conversation title for: "${text}"` }
    ];

    if (OR_KEY) {
      const url = 'https://openrouter.ai/api/v1/chat/completions';
      const payload = { model: chosenModel, messages: prompt, temperature: 0.2, max_tokens: 30 };
      const r = await fetch(url, { method:'POST', headers:{ 'Authorization': `Bearer ${OR_KEY}`, 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
      if(!r.ok) return res.status(502).send(await r.text());
      const data = await r.json();
      const possible = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || '';
      return res.json({ title: String(possible).split('\n')[0].trim() });
    }

    if (OA_KEY) {
      const url = 'https://api.openai.com/v1/chat/completions';
      const payload = { model: chosenModel, messages: prompt, temperature: 0.2, max_tokens: 30 };
      const r = await fetch(url, { method:'POST', headers:{ 'Authorization': `Bearer ${OA_KEY}`, 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
      if(!r.ok) return res.status(502).send(await r.text());
      const data = await r.json();
      const possible = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || '';
      return res.json({ title: String(possible).split('\n')[0].trim() });
    }

    return res.status(500).send('No API key configured for title generation.');
  } catch(err){
    console.error('title error', err);
    res.status(500).send(String(err));
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
