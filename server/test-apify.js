import 'dotenv/config';
import { getTopReels } from './apify.js';

const username = process.argv[2];
if (!username) {
  console.log('Usage: node test-apify.js <username>');
  process.exit(1);
}

console.log(`Fetching reels for @${username}... (can take 1–2 minutes)`);
const reels = await getTopReels(username);
console.log(JSON.stringify(reels, null, 2));
console.log(`\nGot ${reels.length} reels.`);