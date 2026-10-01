// googleAuth.js — Google Identity Services (popup, pas de backend)
const CLIENT_ID = '55070905550-94pvc5kenub1dt3rracdfi0nq2a1haek.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.file openid email profile';

let gisLoaded = null;
let tokenClient = null;
let currentToken = null;
let expiresAt = 0;
let currentAccount = null;

function loadGis() {
  if (gisLoaded) return gisLoaded;
  gisLoaded = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Impossible de charger Google. Vérifie ta connexion.'));
    document.head.appendChild(s);
  });
  return gisLoaded;
}

export async function ready() { await loadGis(); }

export async function connect() {
  await loadGis();
  return new Promise((resolve, reject) => {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: async (response) => {
        if (response.error) return reject(new Error(response.error_description || `Erreur Google : ${response.error}`));
        currentToken = response.access_token;
        expiresAt = Date.now() + (response.expires_in - 60) * 1000;
        try { currentAccount = await fetchAccount(response.access_token); }
        catch { currentAccount = { email: 'Compte Google' }; }
        resolve(currentAccount);
      },
      error_callback: (err) => {
        if (err.type === 'popup_closed') return reject(new Error('Connexion annulée.'));
        reject(new Error(err.message || 'Connexion Google impossible.'));
      },
    });
    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
}

async function fetchAccount(token) {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Infos compte Google indisponibles.');
  const d = await res.json();
  return { email: d.email, name: d.name, picture: d.picture };
}

export async function accessToken() {
  if (currentToken && Date.now() < expiresAt) return currentToken;
  await loadGis();
  return new Promise((resolve, reject) => {
    if (!tokenClient) return reject(new Error('Connecte ton compte Google.'));
    const original = tokenClient.callback;
    tokenClient.callback = (response) => {
      tokenClient.callback = original;
      if (response.error) return reject(new Error(response.error_description || response.error));
      currentToken = response.access_token;
      expiresAt = Date.now() + (response.expires_in - 60) * 1000;
      resolve(currentToken);
    };
    tokenClient.requestAccessToken({ prompt: '' });
  });
}

export function disconnect() {
  if (currentToken && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(currentToken, () => {});
  }
  currentToken = null; expiresAt = 0; currentAccount = null;
}

export function getAccount() { return currentAccount; }