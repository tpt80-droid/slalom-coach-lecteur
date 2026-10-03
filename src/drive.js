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
    const err = new Error(`OneDrive : ${b.error?.message || `HTTP ${res.status}`}`);
    err.status = res.status;
    throw err;
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


// ============================================================
// Lecture / écriture de fichiers dans le dossier app
// ============================================================

const folderIdCache = { microsoft: null, google: null };

async function getFolderId(provider) {
  if (folderIdCache[provider]) return folderIdCache[provider];
  const id = await ensureAppFolder(provider);
  folderIdCache[provider] = id;
  return id;
}

export async function readAppFile(provider, filename) {
  const folderId = await getFolderId(provider);
  if (provider === 'microsoft') {
    const res = await msFetch(
      `/me/drive/items/${encodeURIComponent(folderId)}:/${encodeURIComponent(filename)}:/content`
    );
    return res.text();
  }
  if (provider === 'google') {
    const q = encodeURIComponent(`name='${filename}' and '${folderId}' in parents and trashed=false`);
    const search = await gFetch(`/files?q=${q}&fields=files(id,name)`);
    const found = await search.json();
    if (!found.files?.length) throw new Error('__NOT_FOUND__');
    const res = await gFetch(`/files/${found.files[0].id}?alt=media`);
    return res.text();
  }
  throw new Error('Provider inconnu.');
}

export async function writeAppFile(provider, filename, content) {
  const folderId = await getFolderId(provider);
  if (provider === 'microsoft') {
    // PUT /content met à jour si existe, crée sinon
    await msFetch(
      `/me/drive/items/${encodeURIComponent(folderId)}:/${encodeURIComponent(filename)}:/content`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: content,
      }
    );
    return;
  }
  if (provider === 'google') {
    const q = encodeURIComponent(`name='${filename}' and '${folderId}' in parents and trashed=false`);
    const search = await gFetch(`/files?q=${q}&fields=files(id,name)`);
    const found = await search.json();
    if (found.files?.length) {
      await gFetch(
        `https://www.googleapis.com/upload/drive/v3/files/${found.files[0].id}?uploadType=media`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: content,
        }
      );
    } else {
      const boundary = '----scp' + Date.now();
      const metadata = { name: filename, parents: [folderId] };
      const body =
        `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        JSON.stringify(metadata) + `\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: application/json\r\n\r\n` +
        content + `\r\n` +
        `--${boundary}--`;
      await gFetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
        {
          method: 'POST',
          headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
          body,
        }
      );
    }
    return;
  }
  throw new Error('Provider inconnu.');
}

export async function getQuota(provider) {
  if (provider === 'microsoft') {
    const res = await msFetch('/me/drive?$select=quota');
    const data = await res.json();
    const q = data.quota || {};
    return {
      total: Number(q.total || 0),
      used: Number(q.used || 0),
      remaining: Number(q.remaining || 0),
      state: q.state || 'normal',
    };
  }
  if (provider === 'google') {
    const res = await gFetch('/about?fields=storageQuota');
    const data = await res.json();
    const q = data.storageQuota || {};
    const total = Number(q.limit || 0);
    const used = Number(q.usage || 0);
    return {
      total,
      used,
      remaining: total > 0 ? total - used : 0,
      state: 'normal',
    };
  }
  throw new Error('Provider inconnu.');
}

export function resetFolderCache() {
  folderIdCache.microsoft = null;
  folderIdCache.google = null;
}


// ============================================================
// Fichiers binaires (vidéos, audios)
// ============================================================

export async function writeAppBinaryFile(provider, filename, blob, mimeType) {
  const folderId = await getFolderId(provider);
  if (provider === 'microsoft') {
    // PUT /content écrase si existe, crée sinon. Le body est le Blob brut.
    await msFetch(
      `/me/drive/items/${encodeURIComponent(folderId)}:/${encodeURIComponent(filename)}:/content`,
      {
        method: 'PUT',
        headers: { 'Content-Type': mimeType || 'application/octet-stream' },
        body: blob,
      }
    );
    return filename;
  }
  if (provider === 'google') {
    // Google : 2 étapes (create metadata, puis upload content)
    const q = encodeURIComponent(`name='${filename}' and '${folderId}' in parents and trashed=false`);
    const search = await gFetch(`/files?q=${q}&fields=files(id,name)`);
    const found = await search.json();
    let fileId;
    if (found.files?.length) {
      fileId = found.files[0].id;
    } else {
      const create = await gFetch('/files?fields=id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: filename, parents: [folderId] }),
      });
      fileId = (await create.json()).id;
    }
    await gFetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': mimeType || 'application/octet-stream' },
        body: blob,
      }
    );
    return fileId;
  }
  throw new Error('Provider inconnu.');
}

export async function readAppBinaryFile(provider, filename) {
  const folderId = await getFolderId(provider);
  if (provider === 'microsoft') {
    const res = await msFetch(
      `/me/drive/items/${encodeURIComponent(folderId)}:/${encodeURIComponent(filename)}:/content`
    );
    return res.blob();
  }
  if (provider === 'google') {
    const q = encodeURIComponent(`name='${filename}' and '${folderId}' in parents and trashed=false`);
    const search = await gFetch(`/files?q=${q}&fields=files(id)`);
    const found = await search.json();
    if (!found.files?.length) throw new Error('__NOT_FOUND__');
    const res = await gFetch(`/files/${found.files[0].id}?alt=media`);
    return res.blob();
  }
  throw new Error('Provider inconnu.');
}

export async function listAppFiles(provider) {
  const folderId = await getFolderId(provider);
  if (provider === 'microsoft') {
    const res = await msFetch(
      `/me/drive/items/${encodeURIComponent(folderId)}/children?$select=id,name,size`
    );
    const data = await res.json();
    return (data.value || []).map(f => ({ id: f.id, name: f.name, size: f.size }));
  }
  if (provider === 'google') {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const res = await gFetch(`/files?q=${q}&fields=files(id,name,size)&pageSize=1000`);
    const data = await res.json();
    return (data.files || []).map(f => ({ id: f.id, name: f.name, size: Number(f.size || 0) }));
  }
  throw new Error('Provider inconnu.');
}

export async function deleteAppFile(provider, filename) {
  const folderId = await getFolderId(provider);
  if (provider === 'microsoft') {
    await msFetch(
      `/me/drive/items/${encodeURIComponent(folderId)}:/${encodeURIComponent(filename)}`,
      { method: 'DELETE' }
    );
    return;
  }
  if (provider === 'google') {
    const q = encodeURIComponent(`name='${filename}' and '${folderId}' in parents and trashed=false`);
    const search = await gFetch(`/files?q=${q}&fields=files(id)`);
    const found = await search.json();
    for (const f of found.files || []) {
      await gFetch(`/files/${f.id}`, { method: 'DELETE' });
    }
    return;
  }
  throw new Error('Provider inconnu.');
}