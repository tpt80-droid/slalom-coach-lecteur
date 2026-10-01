import React, { useEffect, useState } from 'react';
import * as msAuth from './microsoftAuth.js';
import * as gAuth from './googleAuth.js';
import { ensureAppFolder } from './drive.js';

export default function SpacePanel({ onMessage }) {
  const [msAccount, setMsAccount] = useState(null);
  const [gAccount, setGAccount] = useState(null);
  const [msReady, setMsReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [folders, setFolders] = useState({ microsoft: null, google: null });

  useEffect(() => {
    msAuth.ready.then(() => { setMsReady(true); setMsAccount(msAuth.msal.getActiveAccount()); })
      .catch(() => onMessage('Connexion Microsoft indisponible.'));
    gAuth.ready().then(() => setGAccount(gAuth.getAccount())).catch(() => {});
  }, [onMessage]);

  const connectMs = async () => {
    setBusy(true);
    try { setMsAccount(await msAuth.connect()); onMessage('Compte Microsoft connecté.'); }
    catch (e) { onMessage(e.message); } finally { setBusy(false); }
  };
  const connectG = async () => {
    setBusy(true);
    try { setGAccount(await gAuth.connect()); onMessage('Compte Google connecté.'); }
    catch (e) { onMessage(e.message); } finally { setBusy(false); }
  };
  const logout = async (p) => {
    if (p === 'microsoft') { try { await msAuth.msal.logoutPopup(); } catch {} setMsAccount(null); }
    else { gAuth.disconnect(); setGAccount(null); }
    setFolders(prev => ({ ...prev, [p]: null }));
  };
  const testFolder = async (p) => {
    setBusy(true);
    try {
      const id = await ensureAppFolder(p);
      setFolders(prev => ({ ...prev, [p]: id }));
      onMessage(`Dossier ${p === 'microsoft' ? 'OneDrive' : 'Google Drive'} prêt.`);
    } catch (e) { onMessage(e.message); } finally { setBusy(false); }
  };

  return (
    <section className="space">
      <h2>Mon espace athlète</h2>
      <p className="hint">Connecte ton compte Microsoft ou Google. Tes analyses restent chez toi.</p>
      <div className="provider-grid">
        <article className="provider-card">
          <h3>Microsoft OneDrive</h3>
          {msAccount ? <>
            <p className="ready">Connecté : {msAccount.username || msAccount.name}</p>
            <div className="buttons">
              <button onClick={() => testFolder('microsoft')} disabled={busy}>
                {folders.microsoft ? '✓ Dossier prêt' : 'Créer le dossier'}
              </button>
              <button onClick={() => logout('microsoft')} disabled={busy}>Déconnexion</button>
            </div>
          </> : <button onClick={connectMs} disabled={!msReady || busy}>
            {msReady ? 'Connecter Microsoft' : 'Chargement…'}
          </button>}
        </article>
        <article className="provider-card">
          <h3>Google Drive</h3>
          {gAccount ? <>
            <p className="ready">Connecté : {gAccount.email}</p>
            <div className="buttons">
              <button onClick={() => testFolder('google')} disabled={busy}>
                {folders.google ? '✓ Dossier prêt' : 'Créer le dossier'}
              </button>
              <button onClick={() => logout('google')} disabled={busy}>Déconnexion</button>
            </div>
          </> : <button onClick={connectG} disabled={busy}>Connecter Google Drive</button>}
        </article>
      </div>
    </section>
  );
}