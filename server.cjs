// server.cjs
const express = require('express');
const fetch = globalThis.fetch || require('node-fetch');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // static assets (index.html, images, etc)

// Environment variables
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || null;
const OPENAI_KEY = process.env.OPENAI_API_KEY || null;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || null;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'; // fallback

if(!OPENROUTER_KEY && !OPENAI_KEY){
  console.warn('Warning: No OPENROUTER_API_KEY or OPENAI_API_KEY set. Server will fail to call APIs.');
}

// helper: send to chosen API
async function callModelAPI(payload){
  if(OPENROUTER_KEY){
    // OpenRouter endpoint (common official path)
    const url = 'https://api.openrouter.ai/v1/chat/completions';
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENROUTER_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await resp.json();
    return data;
  } else {
    // OpenAI fallback
    const url = 'https://api.openai.com/v1/chat/completions';
    const resp = await fetch(url, {
      method:'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await resp.json();
    return data;
  }
}

// Endpoint: /api/chat
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, model } = req.body;
    if(!messages) return res.status(400).send('Missing messages');

    const chosenModel = model || (OPENROUTER_KEY ? OPENROUTER_MODEL : OPENAI_MODEL);

    const payload = {
      model: chosenModel,
      messages: messages,
      temperature: 0.3,
      max_tokens: 800
    };

    const data = await callModelAPI(payload);
    // extract assistant reply safely
    const reply = (data && data.choices && data.choices[0] && (data.choices[0].message?.content || data.choices[0].text)) || null;
    res.json({ reply, raw: data });
  } catch(err){
    console.error(err);
    res.status(500).send(String(err));
  }
});

// Endpoint: /api/title (short title generation)
app.post('/api/title', async (req, res) => {
  try {
    const { messages, model } = req.body;
    const chosenModel = model || (OPENROUTER_KEY ? OPENROUTER_MODEL : OPENAI_MODEL);
    // craft a very strict prompt to return only the title
    const system = { role:'system', content: 'You are a title generator. Produce a short descriptive title (max 6 words) for the user conversation. Return ONLY the title.' };
    const user = { role:'user', content: 'Please provide a short descriptive title for the following conversation.' };
    const payloadMessages = [ system, user ];
    // add last user message if provided
    if(Array.isArray(messages) && messages.length){
      // provide most recent user messages (last 3)
      const tail = messages.slice(-6);
      payloadMessages.push(...tail.map(m => ({ role: m.role, content: m.content })));
    }

    const payload = { model: chosenModel, messages: payloadMessages, temperature: 0.2, max_tokens: 20 };
    const data = await callModelAPI(payload);
    const raw = data;
    const reply = (data && data.choices && data.choices[0] && (data.choices[0].message?.content || data.choices[0].text)) || null;
    res.json({ title: reply ? String(reply).split('\n')[0].trim() : null, raw });
  } catch(err){
    console.error(err);
    res.status(500).send(String(err));
  }
});

// Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log('Server running on port', PORT));
