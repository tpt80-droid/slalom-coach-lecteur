// drive.js — une seule API pour OneDrive et Google Drive
import * as msAuth from './microsoftAuth.js';
import * as gAuth from './googleAuth.js';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const GDRIVE = 'https://www.googleapis.com/drive/v3';
const APP_FOLDER_NAME = 'Slalom Coach Pro';

async function msFetch(path, options = {}) {
  const token = await msAuth.accessToken();
  const res = await fetch(`${GRAPH}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body && !options.headers?.['Content-Type'] ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new Error(`OneDrive : ${b.error?.message || `HTTP ${res.status}`}`);
  }
  return res;
}

async function gFetch(path, options = {}) {
  const token = await gAuth.accessToken();
  const url = path.startsWith('http') ? path : `${GDRIVE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new Error(`Google Drive : ${b.error?.message || `HTTP ${res.status}`}`);
  }
  return res;
}

export async function ensureAppFolder(provider) {
  if (provider === 'microsoft') {
    // approot est créé automatiquement par Graph
    const res = await msFetch('/me/drive/special/approot');
    return (await res.json()).id;
  }
  if (provider === 'google') {
    const q = encodeURIComponent(
      `name='${APP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
    );
    const search = await gFetch(`/files?q=${q}&fields=files(id,name)`);
    const found = await search.json();
    if (found.files?.length) return found.files[0].id;
    const create = await gFetch('/files?fields=id,name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: APP_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
    });
    return (await create.json()).id;
  }
  throw new Error('Provider inconnu.');
}