// server.cjs
// CommonJS server for Render using OpenRouter (stateless: client sends full messages array)

const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// rate limiter
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/chat', chatLimiter);

// POST /api/chat expects { messages: [ { role, content }, ... ] }
app.post('/api/chat', async (req, res) => {
  try {
    const messages = req.body?.messages;
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

    if (!OPENROUTER_API_KEY) {
      return res.status(500).json({ error: 'Missing OPENROUTER_API_KEY env variable' });
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Missing messages array' });
    }

    // forward to OpenRouter
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: messages,
        temperature: 0.7,
        max_tokens: 512
      })
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error('OpenRouter API error:', resp.status, text);
      return res.status(502).json({ error: 'OpenRouter API error', detail: text });
    }

    const data = await resp.json();
    const reply = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || null;

    if (!reply) {
      console.error('Unexpected OpenRouter response:', JSON.stringify(data).slice(0, 2000));
      return res.status(502).json({ error: 'No reply from model' });
    }

    // Return reply (client will append to its local history)
    res.json({ reply });
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`makala.ai server listening on port ${PORT}`);
});
