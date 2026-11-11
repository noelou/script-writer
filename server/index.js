import './env.js';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { getTopReels } from './apify.js';
import { addTranscripts, analyzeAndWrite } from './llm.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Needed later behind nginx (Step 7) so the rate limit sees the real visitor's IP
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json());

// Max 5 generate requests per 15 minutes per IP (each one costs Apify + Gemini credits)
const generateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  message: { error: 'Too many requests. Please wait 15 minutes and try again.' },
});

// Accepts "natgeo", "@natgeo" or "https://www.instagram.com/natgeo/" → "natgeo"
function cleanUsername(input) {
  const text = String(input ?? '').trim();
  const fromUrl = text.match(/instagram\.com\/([^/?#]+)/i);
  return (fromUrl ? fromUrl[1] : text).replace(/^@/, '');
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.post('/api/generate', generateLimiter, async (req, res) => {
  const { username, niche, password } = req.body ?? {};

  // 1. Password (also blocks everything if APP_PASSWORD is empty in .env)
  if (!process.env.APP_PASSWORD || password !== process.env.APP_PASSWORD) {
    return res.status(401).json({ error: 'Wrong password.' });
  }

  // 2. Inputs
  const name = cleanUsername(username);
  if (!/^[a-zA-Z0-9._]{1,30}$/.test(name)) {
    return res.status(400).json({ error: 'Please enter a valid Instagram username.' });
  }
  if (!niche || !String(niche).trim()) {
    return res.status(400).json({ error: 'Please enter the client niche.' });
  }

  // 3. The real work. `step` remembers where we are, so errors say what failed.
  let step = 'Fetching reels from Instagram';
  try {
    let reels = await getTopReels(name);
    if (reels.length === 0) {
      return res.status(404).json({
        error: `No reels found for @${name}. The account may be private, not exist, or have no reels.`,
      });
    }

    step = 'Transcribing reels';
    reels = await addTranscripts(reels);

    step = 'Writing scripts';
    const { patterns, scripts } = await analyzeAndWrite(reels, String(niche).trim());

    // audioUrl expires in ~24h and the page doesn't need it, so leave it out
    const publicReels = reels.map(({ audioUrl, ...reel }) => reel);

    res.json({ reels: publicReels, patterns, scripts });
  } catch (err) {
    console.error(`[generate] ${step} failed:`, err); // full details in the terminal
    res.status(502).json({ error: `${step} failed. Please try again in a minute.` }); // short message for the user
  }
});

// Step 6: in production, also serve the built Vue page (client/dist), so one server runs everything
const clientDist = fileURLToPath(new URL('../client/dist', import.meta.url));
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
}

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));