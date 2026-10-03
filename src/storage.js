// storage.js — copie une analyse partagée dans le Drive de l'athlète
import * as drive from './drive.js';

const FOLDER_PREFIX = 'analysis-';

function safeExt(name, kind) {
    const m = (name || '').split(/[?#]/)[0].match(/\.([a-zA-Z0-9]{1,8})$/);
    if (m) return '.' + m[1].toLowerCase();
    return kind === 'video' ? '.mp4' : kind === 'audio' ? '.m4a' : '.json';
}

async function fetchAsBlob(url, signal) {
    const res = await fetch(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res.ok) throw new Error(`Téléchargement impossible (HTTP ${res.status}) sur ${url.slice(0, 80)}…`);
    const type = res.headers.get('content-type') || '';
    if (/text\/html|application\/json/i.test(type) && !url.endsWith('.json')) {
        throw new Error('La source renvoie une page au lieu d’un média. Le lien OneDrive a peut-être expiré.');
    }
    return { blob: await res.blob(), type: type.split(';')[0] || 'application/octet-stream' };
}

export async function copyAnalysisToStorage({ provider, analysisId, name, model, sources, signal, onProgress }) {
    if (!provider) throw new Error('Aucun provider actif.');
    if (!sources || !Object.keys(sources).length) throw new Error('Aucune source à copier.');

    const prefix = FOLDER_PREFIX + analysisId;
    const files = {};
    const total = Object.keys(sources).length + 1; // +1 pour le manifest
    let done = 0;

    const report = (label) => {
        done++;
        if (onProgress) onProgress({ done, total, label });
    };

    // 1. Copier chaque média
    for (const [key, url] of Object.entries(sources)) {
        if (signal?.aborted) throw new Error('Copie annulée.');
        const kind = key.startsWith('v') ? 'video' : 'audio';
        const { blob, type } = await fetchAsBlob(url, signal);
        const ext = safeExt(url, kind);
        const filename = `${prefix}-${key}${ext}`;
        report(`Copie de ${filename} (${(blob.size / 1024 / 1024).toFixed(1)} Mo)…`);
        await drive.writeAppBinaryFile(provider, filename, blob, type);
        files[key] = { name: filename, size: blob.size, mime: type };
    }

    // 2. Copier le manifest
    if (signal?.aborted) throw new Error('Copie annulée.');
    const manifestBlob = new Blob([JSON.stringify(model, null, 2)], { type: 'application/json' });
    const manifestName = `${prefix}-analyse.json`;
    report(`Copie du manifest…`);
    await drive.writeAppBinaryFile(provider, manifestName, manifestBlob, 'application/json');
    files.__manifest = { name: manifestName, size: manifestBlob.size, mime: 'application/json' };

    return {
        localCopy: true,
        localCopyProvider: provider,
        localCopyAt: new Date().toISOString(),
        localFiles: files,
    };
}

export async function loadLocalAnalysis({ provider, localFiles }) {
    if (!provider || !localFiles || !localFiles.__manifest) {
        throw new Error('Copie locale incomplète.');
    }
    // 1. Lire le manifest
    const manifestBlob = await drive.readAppBinaryFile(provider, localFiles.__manifest.name);
    const model = JSON.parse(await manifestBlob.text());

    // 2. Charger chaque média en Blob URL
    const sources = {};
    for (const [key, info] of Object.entries(localFiles)) {
        if (key === '__manifest') continue;
        const blob = await drive.readAppBinaryFile(provider, info.name);
        sources[key] = URL.createObjectURL(blob);
    }
    return { model, sources, manifest: model };
}

export async function deleteLocalCopy(provider, localFiles) {
    if (!localFiles) return;
    const names = Object.values(localFiles).map(f => f.name).filter(Boolean);
    for (const name of names) {
        try { await drive.deleteAppFile(provider, name); }
        catch (e) { console.warn('Suppression locale impossible :', name, e.message); }
    }
}