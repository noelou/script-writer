import { GoogleGenAI, Type } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// The shape of the JSON we want back. Gemini is forced to follow it.
const responseSchema = {
  type: Type.OBJECT,
  properties: {
    patterns: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          category: { type: Type.STRING }, // e.g. "Hook", "Length", "Structure", "Tone"
          insight: { type: Type.STRING },
        },
        required: ['category', 'insight'],
      },
    },
    scripts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          hook: { type: Type.STRING },
          body: { type: Type.STRING },
          cta: { type: Type.STRING },
        },
        required: ['hook', 'body', 'cta'],
      },
    },
  },
  required: ['patterns', 'scripts'],
};

// The instructions we send to Gemini. This is the part you'll improve the most.
function buildPrompt(reels, clientNiche) {
  const reelList = reels
    .map(
      (r, i) => `Reel ${i + 1}
    Views: ${r.views.toLocaleString()}
    Length: ${r.duration ? `${r.duration} seconds` : 'unknown'}
    Transcript: ${r.transcript || '(none)'}
    Caption: ${r.caption || '(none)'}`
        )
        .join('\n\n---\n\n');

    return `You are an expert short-form video strategist.

    Below are the top-performing Instagram reels from one creator, sorted by views (highest first).

    ${reelList}

    TASK 1: Find what these top reels have in common. Cover:
    - Hook: how the first sentence grabs attention
    - Length: how long the reels are
    - Structure: how each reel is organized from start to end
    - Tone: the style of language and delivery
    Be specific and quote short examples from the reels.

    TASK 2: Write 3 new reel scripts for a client in this niche: "${clientNiche}".
    Use the patterns from Task 1, but do NOT copy the creator's content.
    Each script has:
    - hook: the first 1–2 sentences (the first 3 seconds)
    - body: the main part
    - cta: the call to action at the end
    Write words meant to be spoken out loud, in a natural, conversational way.`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function analyzeAndWrite(reels, clientNiche) {
  const response = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: buildPrompt(reels, clientNiche),
      config: {
        responseMimeType: 'application/json',
        responseSchema,
      },
    })
  );
  return JSON.parse(response.text);
}

async function withRetry(fn, maxTries = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const temporary = err.status === 503 || err.status === 429;
      if (!temporary || attempt === maxTries) throw err;
      const waitSeconds = err.status === 429 ? 60 : attempt * 5;
      console.log(`Gemini busy (attempt ${attempt}/${maxTries}), retrying in ${waitSeconds}s...`);
      await sleep(waitSeconds * 1000);
    }
  }
}

// Download every reel's audio and ask Gemini to transcribe them all in ONE call.
// If anything fails, the reels keep their captions, so the app still works.
export async function addTranscripts(reels) {
  const withAudio = reels.filter((r) => r.audioUrl);
  if (withAudio.length === 0) return reels;

  try {
    // 1. Download all audio files at the same time (a failed download becomes null)
    const audios = await Promise.all(
      withAudio.map(async (reel) => {
        try {
          const res = await fetch(reel.audioUrl);
          if (!res.ok) return null;
          return Buffer.from(await res.arrayBuffer()).toString('base64');
        } catch {
          return null;
        }
      })
    );

    // 2. Build one message: "Audio 1:" + audio, "Audio 2:" + audio, ... + the instruction
    const parts = [];
    withAudio.forEach((reel, i) => {
      if (!audios[i]) return;
      parts.push({ text: `Audio ${i + 1}:` });
      parts.push({ inlineData: { mimeType: 'audio/mp4', data: audios[i] } });
    });
    if (parts.length === 0) return reels;
    parts.push({
      text:
        'For each audio above, transcribe exactly what is spoken, word for word. ' +
        'Only the spoken words: no timestamps, no descriptions. ' +
        'If nobody speaks (only music), use an empty string.',
    });

    const response = await withRetry(() =>
      ai.models.generateContent({
        model: MODEL,
        contents: [{ role: 'user', parts }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                audio: { type: Type.INTEGER }, // the "Audio N" number
                transcript: { type: Type.STRING },
              },
              required: ['audio', 'transcript'],
            },
          },
        },
      })
    );

    // 3. Put each transcript back on its reel (no speech → keep the caption)
    const spoken = new Map();
    for (const t of JSON.parse(response.text)) {
      spoken.set(withAudio[t.audio - 1], t.transcript.trim());
    }
    return reels.map((reel) =>
      spoken.get(reel) ? { ...reel, transcript: spoken.get(reel) } : reel
    );
  } catch (err) {
    console.log(`Transcription failed, using captions instead: ${err.message}`);
    return reels;
  }
}