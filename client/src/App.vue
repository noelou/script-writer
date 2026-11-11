<script setup>
import { ref, onUnmounted } from 'vue';

// Form inputs
const username = ref('');
const niche = ref('');
const password = ref('');

// Page state
const loading = ref(false);
const error = ref('');
const result = ref(null); // { reels, patterns, scripts }
const seconds = ref(0); // how long we've been waiting
const copiedIndex = ref(null);

let timer = null;

async function generate() {
  error.value = '';
  result.value = null;
  loading.value = true;
  seconds.value = 0;
  timer = setInterval(() => seconds.value++, 1000);

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: username.value,
        niche: niche.value,
        password: password.value,
      }),
    });
    const data = await res.json();

    // The server sends { error: "..." } with a 4xx/5xx status when something goes wrong
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    result.value = data;
  } catch (err) {
    error.value = err.message || 'Something went wrong. Please try again.';
  } finally {
    loading.value = false;
    clearInterval(timer);
  }
}

// Message that changes while waiting, so the user knows what's happening
function loadingMessage() {
  if (seconds.value < 90) return 'Fetching reels… this can take 1–2 minutes';
  return 'Transcribing and writing scripts… almost there';
}

async function copyScript(script, index) {
  const text = `${script.hook}\n\n${script.body}\n\n${script.cta}`;
  await navigator.clipboard.writeText(text);
  copiedIndex.value = index;
  setTimeout(() => (copiedIndex.value = null), 2000);
}

onUnmounted(() => clearInterval(timer));
</script>

<template>
  <main>
    <header>
      <h1>Script Writer</h1>
      <p class="subtitle">Learn from a creator's top reels, then write new scripts for your client.</p>
    </header>

    <!-- Form -->
    <form class="card" @submit.prevent="generate">
      <label>
        Instagram username
        <input v-model="username" placeholder="e.g. natgeo" required :disabled="loading" />
      </label>
      <label>
        Client niche
        <input v-model="niche" placeholder="e.g. travel agency in Cebu" required :disabled="loading" />
      </label>
      <label>
        Password
        <input v-model="password" type="password" required :disabled="loading" />
      </label>
      <button type="submit" :disabled="loading">
        {{ loading ? 'Generating…' : 'Generate' }}
      </button>
    </form>

    <!-- Loading -->
    <div v-if="loading" class="card status">
      <div class="spinner"></div>
      <p>{{ loadingMessage() }}</p>
      <p class="muted">{{ seconds }}s</p>
    </div>

    <!-- Error -->
    <div v-if="error" class="card error">{{ error }}</div>

    <!-- Results -->
    <template v-if="result">
      <section>
        <h2>Top reels</h2>
        <ol class="card reels">
          <li v-for="reel in result.reels" :key="reel.url">
            <a :href="reel.url" target="_blank" rel="noopener">{{ reel.url }}</a>
            <span class="muted">
              {{ reel.views.toLocaleString() }} views · {{ reel.likes.toLocaleString() }} likes
              <template v-if="reel.duration"> · {{ reel.duration }}s</template>
            </span>
            <details>
              <summary>Transcript</summary>
              <p>{{ reel.transcript || '(none)' }}</p>
            </details>
          </li>
        </ol>
      </section>

      <section>
        <h2>Patterns found</h2>
        <div class="card" v-for="pattern in result.patterns" :key="pattern.category">
          <h3>{{ pattern.category }}</h3>
          <p>{{ pattern.insight }}</p>
        </div>
      </section>

      <section>
        <h2>Scripts</h2>
        <div class="card script" v-for="(script, i) in result.scripts" :key="i">
          <div class="script-header">
            <h3>Script {{ i + 1 }}</h3>
            <button class="secondary" @click="copyScript(script, i)">
              {{ copiedIndex === i ? 'Copied!' : 'Copy' }}
            </button>
          </div>
          <p class="label">Hook</p>
          <p>{{ script.hook }}</p>
          <p class="label">Body</p>
          <p>{{ script.body }}</p>
          <p class="label">CTA</p>
          <p>{{ script.cta }}</p>
        </div>
      </section>
    </template>
  </main>
</template>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: system-ui, -apple-system, sans-serif;
  background: #f5f5f7;
  color: #1d1d1f;
  line-height: 1.5;
}

main {
  max-width: 760px;
  margin: 0 auto;
  padding: 32px 16px 64px;
}

h1 {
  margin: 0;
}

h2 {
  margin: 32px 0 12px;
  font-size: 1.25rem;
}

h3 {
  margin: 0 0 6px;
  font-size: 1rem;
}

.subtitle,
.muted {
  color: #6e6e73;
}

.subtitle {
  margin: 4px 0 24px;
}

.card {
  background: #fff;
  border: 1px solid #e5e5ea;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 12px;
}

/* Form */
form {
  display: grid;
  gap: 14px;
}

label {
  display: grid;
  gap: 6px;
  font-weight: 600;
  font-size: 0.9rem;
}

input {
  font: inherit;
  font-weight: 400;
  padding: 10px 12px;
  border: 1px solid #d2d2d7;
  border-radius: 8px;
}

input:focus {
  outline: 2px solid #0071e3;
  border-color: transparent;
}

button {
  font: inherit;
  font-weight: 600;
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  background: #0071e3;
  color: #fff;
  cursor: pointer;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

button.secondary {
  background: #e8e8ed;
  color: #1d1d1f;
  padding: 6px 14px;
}

/* Loading */
.status {
  text-align: center;
}

.status p {
  margin: 8px 0 0;
}

.spinner {
  width: 32px;
  height: 32px;
  margin: 0 auto;
  border: 3px solid #e5e5ea;
  border-top-color: #0071e3;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Error */
.error {
  background: #fff0f0;
  border-color: #ffc9c9;
  color: #c00;
}

/* Reels */
.reels {
  padding-left: 40px;
  margin: 0;
}

.reels li {
  margin-bottom: 14px;
}

.reels li:last-child {
  margin-bottom: 0;
}

.reels a {
  display: block;
  color: #0071e3;
  word-break: break-all;
}

.reels details {
  margin-top: 4px;
  font-size: 0.9rem;
}

.reels summary {
  cursor: pointer;
  color: #6e6e73;
}

/* Scripts */
.script-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.label {
  margin: 12px 0 2px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6e6e73;
}

.script p:not(.label) {
  margin: 0;
}
</style>
