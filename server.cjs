const express = require('express');
const path = require('path');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const fetchFn =
  globalThis.fetch ||
  ((...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args)));

function normalizeModel(model) {
  const m = String(model || '').trim();

  // Keep real OpenRouter model IDs if you pass them later.
  if (m.includes('/')) return m;

  // Persona labels from the UI should never be sent as raw model IDs.
  return 'openrouter/free';
}

app.get('/health', (req, res) => res.send('ok'));

app.get('/api/country', (req, res) => {
  // Placeholder so the front end never breaks if geo lookup is unavailable.
  res.json({ country: null });
});

app.post('/api/chat', async (req, res) => {
  try {
    const { messages, model } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Missing messages' });
    }

    const OR_KEY = process.env.OPENROUTER_API_KEY;
    if (!OR_KEY) {
      return res.status(500).json({ error: 'OPENROUTER_API_KEY is not set' });
    }

    const selectedModel = normalizeModel(model);

    const response = await fetchFn('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OR_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: selectedModel,
        messages,
        temperature: 0.6,
        max_tokens: 800
      })
    });

    const text = await response.text();
    if (!response.ok) {
      return res.status(502).send(text);
    }

    const data = JSON.parse(text);
    const reply = data?.choices?.[0]?.message?.content || 'No response.';
    return res.json({ reply, raw: data });
  } catch (err) {
    console.error('chat error', err);
    return res.status(500).json({ error: 'chat error', message: String(err) });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
