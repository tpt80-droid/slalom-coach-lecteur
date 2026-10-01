import React, { useEffect, useState } from 'react';
import * as library from './library.js';

export default function LibraryPanel({ provider, account, onOpen, onMessage }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!provider || !account) { setData(null); return; }
    setLoading(true);
    library.loadLibrary(provider, {
      email: account.email || account.username || '',
      name: account.name || '',
    })
      .then(d => setData(d))
      .catch(e => onMessage('Bibliothèque : ' + e.message))
      .finally(() => setLoading(false));
  }, [provider, account, onMessage]);

  if (!provider || !account) {
    return (
      <section className="library">
        <div className="library-empty-state">
          <h2>📚 Ma bibliothèque</h2>
          <p>Connecte-toi à Microsoft ou Google pour voir ta bibliothèque personnelle.</p>
          <p className="hint">Tes analyses restent dans ton Drive. Aucune donnée n'est stockée chez le coach.</p>
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="library">
        <div className="library-empty-state"><p>Chargement de ta bibliothèque…</p></div>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="library">
        <div className="library-empty-state"><p>Aucune bibliothèque.</p></div>
      </section>
    );
  }

  const analyses = data.analyses || [];
  const filtered = analyses.filter(a => {
    if (filter === 'favorites') return a.favorite;
    if (filter === 'unviewed') return !a.viewedAt;
    return true;
  });

  const toggleFav = (id) => {
    const next = library.toggleFavorite(id);
    if (next === null) return;
    setData({ ...data, analyses: data.analyses.map(a => a.id === id ? { ...a, favorite: next } : a) });
  };

  const remove = (id, name) => {
    if (!window.confirm(`Retirer « ${name} » de ta bibliothèque ?\n\nLes fichiers dans ton Drive ne sont pas supprimés.`)) return;
    library.removeAnalysis(id);
    setData({ ...data, analyses: data.analyses.filter(a => a.id !== id) });
  };

  return (
    <section className="library">
      <div className="library-header">
        <h2>📚 Ma bibliothèque</h2>
        <span className="library-count">{analyses.length} analyse{analyses.length > 1 ? 's' : ''}</span>
      </div>
      <div className="library-filters">
        {[['all', 'Toutes'], ['unviewed', 'Non vues'], ['favorites', '⭐ Favoris']].map(([k, l]) => (
          <button key={k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="library-empty">
          {analyses.length === 0
            ? "Aucune analyse pour l'instant. Les analyses partagées par ton coach apparaîtront ici."
            : 'Aucune analyse dans cette vue.'}
        </p>
      ) : (
        <ul className="library-list">
          {filtered.map(a => (
            <li key={a.id} className={`library-item ${a.viewedAt ? 'viewed' : 'unviewed'}`}>
              <button className="library-item-main" onClick={() => onOpen(a)}>
                <div className="library-item-title">
                  {!a.viewedAt && <span className="badge-new">NOUVEAU</span>}
                  {a.favorite && <span className="badge-fav">⭐</span>}
                  <strong>{a.name}</strong>
                </div>
                <div className="library-item-meta">
                  {a.coachName && <span>Coach : {a.coachName}</span>}
                  <span>{a.receivedAt ? new Date(a.receivedAt).toLocaleDateString('fr-FR') : ''}</span>
                  {a.videoCount > 0 && <span>{a.videoCount} angle{a.videoCount > 1 ? 's' : ''}</span>}
                  {a.sourceProvider && <span className="provider-tag">{a.sourceProvider === 'google' ? 'Google' : 'OneDrive'}</span>}
                </div>
              </button>
              <div className="library-item-actions">
                <button onClick={() => toggleFav(a.id)} title={a.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}>
                  {a.favorite ? '⭐' : '☆'}
                </button>
                <button onClick={() => remove(a.id, a.name)} title="Retirer de la bibliothèque">🗑️</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}