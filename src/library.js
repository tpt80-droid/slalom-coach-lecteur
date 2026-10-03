// library.js — gestion de la bibliothèque personnelle de l'athlète
// Écriture batch (30s) + sauvegarde immédiate sur actions critiques.
import * as drive from './drive.js';

const CACHE_KEY = 'scp.libraryCache.v1';

function saveToLocalCache(provider, data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ provider, data, cachedAt: Date.now() }));
  } catch { /* quota ou mode privé : on ignore */ }
}

export function readCache(provider) {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.provider !== provider) return null;
    return parsed.data;
  } catch { return null; }
}

export function clearCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch { }
}

const FILENAME = 'library.json';
const BATCH_DELAY = 30000; // 30 secondes

let cache = { provider: null, data: null, dirty: false, timer: null };

function emptyLibrary(owner) {
  return {
    schemaVersion: 1,
    owner: owner || { email: '', name: '' },
    lastUpdate: new Date().toISOString(),
    analyses: [],
  };
}

async function flush(provider) {
  if (!cache.dirty || !cache.data) return;
  cache.data.lastUpdate = new Date().toISOString();
  await drive.writeAppFile(provider, FILENAME, JSON.stringify(cache.data, null, 2));
  cache.dirty = false;
  saveToLocalCache(provider, cache.data);
}

function scheduleBatch() {
  if (cache.timer) return;
  cache.timer = setTimeout(async () => {
    cache.timer = null;
    try { await flush(cache.provider); }
    catch (e) { console.warn('Sauvegarde bibliothèque différée impossible :', e); }
  }, BATCH_DELAY);
}

export async function loadLibrary(provider, owner) {
  try {
    const text = await drive.readAppFile(provider, FILENAME);
    const data = JSON.parse(text);
    if (!data || data.schemaVersion !== 1) throw new Error('Format bibliothèque inconnu.');
    cache = { provider, data, dirty: false, timer: null };
    saveToLocalCache(provider, data);
    return data;
  } catch (e) {
    const notFound = e.status === 404 || /__NOT_FOUND__|itemNotFound|not found|could not be found|The resource/i.test(e.message || '');
    if (notFound) {
      const fresh = emptyLibrary(owner);
      cache = { provider, data: fresh, dirty: true, timer: null };
      await flush(provider);
      saveToLocalCache(provider, fresh);
      return fresh;
    }
    throw e;
  }
}

export function getLibrary() { return cache.data; }

export function upsertAnalysis(analysis, { immediate = false } = {}) {
  if (!cache.data) return;
  const idx = cache.data.analyses.findIndex(a => a.id === analysis.id);
  if (idx >= 0) cache.data.analyses[idx] = { ...cache.data.analyses[idx], ...analysis };
  else cache.data.analyses.unshift(analysis);
  cache.dirty = true;
  if (immediate) flush(cache.provider).catch(e => console.warn(e));
  else scheduleBatch();
}

export function markViewed(id) {
  if (!cache.data) return;
  const a = cache.data.analyses.find(x => x.id === id);
  if (!a) return;
  a.viewedAt = new Date().toISOString();
  cache.dirty = true;
  scheduleBatch();
}

export function toggleFavorite(id) {
  if (!cache.data) return null;
  const a = cache.data.analyses.find(x => x.id === id);
  if (!a) return null;
  a.favorite = !a.favorite;
  cache.dirty = true;
  flush(cache.provider).catch(e => console.warn(e)); // critique
  return a.favorite;
}

export function removeAnalysis(id) {
  if (!cache.data) return;
  cache.data.analyses = cache.data.analyses.filter(a => a.id !== id);
  cache.dirty = true;
  flush(cache.provider).catch(e => console.warn(e)); // critique
}

export async function flushNow() {
  if (cache.timer) { clearTimeout(cache.timer); cache.timer = null; }
  await flush(cache.provider);
}

export function findBySource(sourceUrl) {
  if (!cache.data || !sourceUrl) return null;
  return cache.data.analyses.find(a => a.sourceUrl === sourceUrl) || null;
}

export function addFromShare({ sourceUrl, sourceProvider, name, videoCount, duration, coachName }) {
  if (!cache.data) return null;
  const existing = findBySource(sourceUrl);
  if (existing) {
    if (name) existing.name = name;
    if (videoCount) existing.videoCount = videoCount;
    if (duration) existing.duration = duration;
    if (coachName) existing.coachName = coachName;
    cache.dirty = true;
    scheduleBatch();
    return existing;
  }
  const entry = {
    id: 'lib-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
    name: name || 'Analyse',
    coachName: coachName || '',
    sourceProvider: sourceProvider || 'microsoft',
    sourceUrl,
    receivedAt: new Date().toISOString(),
    viewedAt: null,
    favorite: false,
    videoCount: videoCount || 0,
    duration: duration || 0,
    localCopy: false,
  };
  cache.data.analyses.unshift(entry);
  cache.dirty = true;
  flush(cache.provider).catch(e => console.warn(e));
  return entry;
}

export function analysisSize(analysis) {
  if (!analysis || !analysis.localFiles) return 0;
  return Object.values(analysis.localFiles).reduce(
    (sum, f) => sum + (Number(f && f.size) || 0),
    0
  );
}

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return n + ' o';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' Ko';
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' Mo';
  return (n / 1024 / 1024 / 1024).toFixed(2) + ' Go';
}

export function findById(id) {
  if (!cache.data) return null;
  return cache.data.analyses.find(a => a.id === id) || null;
}

export function updateLocalCopy(id, localData) {
  if (!cache.data) return;
  const a = cache.data.analyses.find(x => x.id === id);
  if (!a) return;
  Object.assign(a, localData);
  cache.dirty = true;
  flush(cache.provider).catch(e => console.warn(e));
}

export function resetLibrary() {
  if (cache.timer) clearTimeout(cache.timer);
  cache = { provider: null, data: null, dirty: false, timer: null };
}