// server.cjs
// CommonJS server for Render using OpenRouter
// Ensure OPENROUTER_API_KEY is set in Render environment variables

const express = require("express");
const rateLimit = require("express-rate-limit");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname))); // serve index.html + assets

// rate limit: 20 requests / minute per IP
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false
});
app.use("/api/chat", chatLimiter);

app.post("/api/chat", async (req, res) => {
  const userMessage = req.body?.message;
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

  if (!OPENROUTER_API_KEY) {
    return res.status(500).json({ error: "Missing OPENROUTER_API_KEY env variable" });
  }
  if (!userMessage || typeof userMessage !== "string") {
    return res.status(400).json({ error: "Missing message" });
  }

  // system instruction: enforce casual slang style
  const messages = [
    {
      role: "system",
      content:
        "You speak casual internet slang. Use lowercase, playful tone, use 'lol', 'fr', 'so', ignore strict grammar and punctuation, and keep replies short (1-3 sentences). Be friendly and informal."
    },
    { role: "user", content: userMessage }
  ];

  try {
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: messages,
        temperature: 0.7,
        max_tokens: 512
      })
    });

    if (!resp.ok) {
      const txt = await resp.text();
      console.error("OpenRouter error:", resp.status, txt);
      return res.status(502).json({ error: "OpenRouter API error", detail: txt });
    }

    const data = await resp.json();

    // OpenRouter returns choices[0].message.content for chat.
    const reply = data?.choices?.[0]?.message?.content || (data?.choices?.[0]?.text || null);

    if (!reply) {
      console.error("Unexpected OpenRouter response:", JSON.stringify(data).slice(0, 1000));
      return res.status(502).json({ error: "No reply from model" });
    }

    // Send reply back to client
    res.json({ reply: reply });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Fallback: serve index
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`makala.ai server listening on port ${PORT}`);
});
