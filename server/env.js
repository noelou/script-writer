// Loads server/.env no matter which folder you start the server from.
// Imported first in index.js, so the keys exist before apify.js and llm.js use them.
// On Render there is no .env file: the keys come from the dashboard instead.
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('./.env', import.meta.url)), quiet: true });
