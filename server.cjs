// server.cjs
const express = require('express');
const path = require('path');
const fetch = globalThis.fetch || require('node-fetch');

const app = express();
app.use(express.json());

// Serve static files from ./public
app.use(express.static(path.join(__dirname, 'public')));

// Health
app.get('/health', (req, res) => res.send('ok'));

// Normalizer for incoming responses from provider
function extractTextFromProviderData(data){
  if(!data) return '';
  try {
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
    // fallback to stringified JSON (short)
    const s = JSON.stringify(data);
    return s.length > 1500 ? s.slice(0,1500) + '...' : s;
  } catch(e){
    return String(data);
  }
}

// /api/chat
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, model } = req.body;
    if (!messages) return res.status(400).send('Missing messages');

    const OR_KEY = process.env.OPENROUTER_API_KEY;
    const OA_KEY = process.env.OPENAI_API_KEY;
    const chosenModel = model || process.env.OPENROUTER_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';

    if(OR_KEY){
      // OpenRouter endpoint (adapt if your OpenRouter provider uses different URL)
      const url = 'https://api.openrouter.ai/v1/chat/completions';
      const payload = { model: chosenModel, messages, temperature: 0.3, max_tokens: 800 };
      const r = await fetch(url, { method:'POST', headers:{ 'Authorization': `Bearer ${OR_KEY}`, 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
      const data = await r.json();
      const reply = extractTextFromProviderData({ raw: data });
      return res.json({ reply, raw: data });
    }

    if(OA_KEY){
      // OpenAI fallback
      const url = 'https://api.openai.com/v1/chat/completions';
      const payload = { model: chosenModel, messages, temperature: 0.3, max_tokens: 800 };
      const r = await fetch(url, { method:'POST', headers:{ 'Authorization': `Bearer ${OA_KEY}`, 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
      const data = await r.json();
      const reply = extractTextFromProviderData({ raw: data });
      return res.json({ reply, raw: data });
    }

    return res.status(500).send('No API key configured. Set OPENROUTER_API_KEY or OPENAI_API_KEY.');
  } catch(err){
    console.error('chat error', err);
    res.status(500).send(String(err));
  }
});

// /api/title - create a concise user-facing title for the conversation
app.post('/api/title', async (req, res) => {
  try {
    const { text } = req.body;
    if(!text) return res.status(400).send('Missing text');

    const OR_KEY = process.env.OPENROUTER_API_KEY;
    const OA_KEY = process.env.OPENAI_API_KEY;
    const chosenModel = process.env.OPENROUTER_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';

    const prompt = [
      { role:'system', content: 'You are a helpful title generator. Given a user prompt, return a short descriptive title (3-6 words) in Title Case, suitable as a conversation title. Do NOT include punctuation at the end.' },
      { role:'user', content: `Create a short conversational title for this user request: "${text}"` }
    ];

    if(OR_KEY){
      const url = 'https://api.openrouter.ai/v1/chat/completions';
      const payload = { model: chosenModel, messages: prompt, temperature: 0.2, max_tokens: 30 };
      const r = await fetch(url, { method:'POST', headers:{ 'Authorization': `Bearer ${OR_KEY}`, 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
      const data = await r.json();
      const possible = (data && data.choices && data.choices[0] && (data.choices[0].message?.content || data.choices[0].text)) || '';
      return res.json({ title: String(possible).split('\n')[0].trim() });
    }

    if(OA_KEY){
      const url = 'https://api.openai.com/v1/chat/completions';
      const payload = { model: chosenModel, messages: prompt, temperature: 0.2, max_tokens: 30 };
      const r = await fetch(url, { method:'POST', headers:{ 'Authorization': `Bearer ${OA_KEY}`, 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
      const data = await r.json();
      const possible = (data && data.choices && data.choices[0] && (data.choices[0].message?.content || data.choices[0].text)) || '';
      return res.json({ title: String(possible).split('\n')[0].trim() });
    }

    return res.status(500).send('No API key configured.');
  } catch(err){
    console.error('title error', err);
    res.status(500).send(String(err));
  }
});

// Fallback SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
