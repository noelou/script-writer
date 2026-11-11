import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: process.env.APIFY_TOKEN });

// Turn one raw Apify item into the shape our app uses.
// ⚠️ Adjust field names here to match your sample-reel.json.
export function toReel(item) {
  return {
    url: item.url,
    views: item.videoPlayCount ?? item.videoViewCount ?? 0,
    likes: item.likesCount ?? 0,
    duration: Math.round(item.videoDuration ?? 0), // seconds
    audioUrl: item.audioUrl ?? null,
    caption: item.caption ?? '',
    // If there is no transcript, fall back to the caption
    transcript: item.transcript || item.caption || '',
  };
}

export async function getTopReels(username, limit = 10) {
  // 1. Run the actor and wait for it to finish (can take 1–2 minutes)
  const run = await client.actor('apify/instagram-reel-scraper').call({
    username: [username],
    resultsLimit: 10,
  });

  if (run.status !== 'SUCCEEDED') {
    throw new Error(`Apify run ended with status ${run.status}`);
  }

  // 2. Read the results
  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  // 3. Clean up, sort by views (highest first), keep the top `limit`
  return items
    .filter((item) => !item.error && item.url) // skip "not found" / "private" error items
    .map(toReel)
    .sort((a, b) => b.views - a.views)
    .slice(0, limit);
}