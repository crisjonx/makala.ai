const express = require('express');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const app = express();

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const REPORTS_FILE = path.join(DATA_DIR, 'reports.json');

const fetchFn = globalThis.fetch || ((...args) => import('node-fetch').then(({default: fetch}) => fetch(...args)));

app.use(express.json({ limit: '1mb' }));
app.use(express.static(PUBLIC_DIR));

async function ensureDataFiles(){
  await fsp.mkdir(DATA_DIR, { recursive: true });
  try{
    await fsp.access(REPORTS_FILE);
  }catch{
    await fsp.writeFile(REPORTS_FILE, JSON.stringify({ reports: [] }, null, 2));
  }
}
ensureDataFiles().catch(console.error);

function getClientIp(req){
  const xf = req.headers['x-forwarded-for'];
  if(typeof xf === 'string' && xf.trim()){
    return xf.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || '';
}

async function getCountryFromIp(ip){
  if(!ip) return '';
  const clean = ip.replace(/^::ffff:/, '');
  if(clean === '127.0.0.1' || clean === '::1' || clean === 'localhost') return 'your country';
  try{
    const res = await fetchFn(`https://ipapi.co/${encodeURIComponent(clean)}/json/`, {
      headers: { 'User-Agent': 'makala.ai/1.0' }
    });
    if(!res.ok) return '';
    const data = await res.json();
    return data?.country_name || data?.country || '';
  }catch{
    return '';
  }
}

function normalizeReply(data){
  if(!data) return '';
  if(typeof data === 'string') return data;
  if(data.reply && typeof data.reply === 'string') return data.reply;
  const choice = data?.choices?.[0];
  return choice?.message?.content || choice?.text || '';
}

function addSystemContext(messages = [], extra = ''){
  const m = Array.isArray(messages) ? [...messages] : [];
  if(extra){
    m.splice(1, 0, { role: 'system', content: extra });
  }
  return m;
}

app.get('/health', (req, res) => res.json({ ok: true }));

app.get('/api/country', async (req, res) => {
  const ip = getClientIp(req);
  const country = await getCountryFromIp(ip);
  res.json({ country: country || '' });
});

app.get('/api/reports', async (req, res) => {
  try{
    const raw = await fsp.readFile(REPORTS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    res.json({ reports: Array.isArray(parsed.reports) ? parsed.reports : [] });
  }catch (err){
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/report', async (req, res) => {
  try{
    const { username, conversationId, conversationTitle, message, reason } = req.body || {};
    if(!reason || !message) return res.status(400).json({ error: 'Missing report data' });
    const raw = await fsp.readFile(REPORTS_FILE, 'utf8').catch(()=> '{"reports":[]}' );
    const parsed = JSON.parse(raw || '{"reports":[]}');
    const reports = Array.isArray(parsed.reports) ? parsed.reports : [];
    reports.unshift({
      id: Date.now().toString(36),
      username: username || 'anon',
      conversationId: conversationId || '',
      conversationTitle: conversationTitle || '',
      message: String(message).slice(0, 4000),
      reason: String(reason).slice(0, 1000),
      createdAt: new Date().toISOString()
    });
    await fsp.writeFile(REPORTS_FILE, JSON.stringify({ reports }, null, 2));
    res.json({ ok: true });
  }catch(err){
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/chat', async (req, res) => {
  try{
    const { messages, model, country, personality, userName } = req.body || {};
    if(!Array.isArray(messages)) return res.status(400).send('Missing messages');

    const OR_KEY = process.env.OPENROUTER_API_KEY;
    const OA_KEY = process.env.OPENAI_API_KEY;
    const chosenModel = model || process.env.OPENROUTER_MODEL || process.env.OPENAI_MODEL || 'openai/gpt-4o-mini';

    const systemExtras = [];
    if(country) systemExtras.push(`The user is from ${country}.`);
    if(userName) systemExtras.push(`If you address the user, call them ${userName}.`);
    if(personality === 'makalina') systemExtras.push(`Use a more mature but still playful tone.`);
    const enhanced = addSystemContext(messages, systemExtras.join(' '));

    if(OR_KEY){
      const r = await fetchFn('https://openrouter.ai/api/v1/chat/completions', {
        method:'POST',
        headers:{
          'Authorization': `Bearer ${OR_KEY}`,
          'Content-Type':'application/json',
          'HTTP-Referer': process.env.SITE_URL || 'https://example.com',
          'X-Title': 'makala.ai'
        },
        body: JSON.stringify({
          model: chosenModel,
          messages: enhanced,
          temperature: 0.7,
          max_tokens: 900
        })
      });
      const data = await r.json().catch(()=>({}));
      if(!r.ok) return res.status(502).json({ error: 'OpenRouter error', details: data });
      return res.json({ reply: normalizeReply(data), raw: data });
    }

    if(OA_KEY){
      const r = await fetchFn('https://api.openai.com/v1/chat/completions', {
        method:'POST',
        headers:{
          'Authorization': `Bearer ${OA_KEY}`,
          'Content-Type':'application/json'
        },
        body: JSON.stringify({
          model: chosenModel,
          messages: enhanced,
          temperature: 0.7,
          max_tokens: 900
        })
      });
      const data = await r.json().catch(()=>({}));
      if(!r.ok) return res.status(502).json({ error: 'OpenAI error', details: data });
      return res.json({ reply: normalizeReply(data), raw: data });
    }

    return res.status(500).send('No API key configured');
  }catch(err){
    console.error('chat error', err);
    res.status(500).json({ error: String(err) });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
