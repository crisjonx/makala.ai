import express from "express";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_API_KEY) {
  console.error("Missing OPENROUTER_API_KEY");
  process.exit(1);
}

app.use("/api/chat", rateLimit({ windowMs: 60 * 1000, max: 20 }));

app.post("/api/chat", async (req, res) => {
  try {
    const userMessage = req.body.message;

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini", 
          messages: [
            { role: "user", content: userMessage }
          ],
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(502).json({ reply: "Error: " + errorText });
    }

    const data = await response.json();
    const reply =
      data.choices && data.choices[0]?.message?.content
        ? data.choices[0].message.content
        : "No reply";
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ reply: "Server error." });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("makala.ai running on port", PORT));
