import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { toReel } from './apify.js';
import { addTranscripts, analyzeAndWrite } from './llm.js';

const niche = process.argv[2] || 'coffee shop';

const raw = JSON.parse(readFileSync('./sample-reel.json', 'utf8'));
let reels = raw.map(toReel).sort((a, b) => b.views - a.views);

console.log(`Transcribing ${reels.length} reels...`);
reels = await addTranscripts(reels);
for (const r of reels) {
  console.log(`\n${r.url} (${r.views.toLocaleString()} views)\n  "${r.transcript.slice(0, 150)}..."`);
}

console.log(`\nSending to Gemini for niche: "${niche}"...`);
const result = await analyzeAndWrite(reels, niche);
console.log(JSON.stringify(result, null, 2));