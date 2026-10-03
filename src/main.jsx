import ArchiveViewer from './ArchiveViewer.jsx';
import { validateArchive, archiveMedia } from './archive.js';
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { validate, visibleEvents, activeAudio, followerTarget, baseName, formatTime, TYPES } from './timeline.js';
import './style.css';
import OneDrivePanel from './OneDrivePanel.jsx';
import { loadAnalysis } from './onedrive.js';
import * as storage from './storage.js';
import SpacePanel from './SpacePanel.jsx';
import LibraryPanel from './LibraryPanel.jsx';
import * as library from './library.js';
import * as msAuth from './microsoftAuth.js';
import * as gAuth from './googleAuth.js';

function Drawing({ event, ratio }) {
  const d = event.data, w = 1000, h = w / ratio, u = Math.min(w, h);
  const p = p => ({ x: p.x * w, y: p.y * h });
  const paint = { stroke: d.color, strokeWidth: (d.strokeWidth || .006) * u, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (event.type === 'text') return <text x={d.x * w} y={d.y * h} fill={d.color} fontSize={(d.fontSize || .045) * u}>{d.text}</text>;
  if (event.type === 'path') return d.points.length === 1 ? <circle cx={d.points[0].x * w} cy={d.points[0].y * h} r={paint.strokeWidth / 2} fill={d.color} /> : <polyline points={d.points.map(v => `${v.x * w},${v.y * h}`).join(' ')} {...paint} />;
  const a = p(d.p1), b = p(d.p2);
  if (event.type === 'circle') return <circle cx={a.x} cy={a.y} r={Math.hypot(b.x - a.x, b.y - a.y)} {...paint} />;
  if (event.type === 'angle') return <g><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} {...paint} /><line x1={a.x} y1={a.y} x2={a.x + .1 * w} y2={a.y} {...paint} /><text x={a.x} y={a.y - .025 * h} fill={d.color} fontSize={.045 * u}>{Math.abs(Math.atan2(a.y - b.y, b.x - a.x) * 180 / Math.PI).toFixed(1)}°</text></g>;
  const angle = Math.atan2(b.y - a.y, b.x - a.x), size = u * .035;
  const head = [b, { x: b.x - size * Math.cos(angle - Math.PI / 6), y: b.y - size * Math.sin(angle - Math.PI / 6) }, { x: b.x - size * Math.cos(angle + Math.PI / 6), y: b.y - size * Math.sin(angle + Math.PI / 6) }];
  return <g><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} {...paint} /><polygon points={head.map(p => `${p.x},${p.y}`).join(' ')} fill={d.color} /></g>;
}

function Player({ model, sources, onMessage }) {
  const refs = useRef([]), audioRef = useRef(null), frameRef = useRef(null), containerRef = useRef(null);
  const dismissed = useRef(new Set());
  const [time, setTime] = useState(0), [duration, setDuration] = useState(0), [playing, setPlaying] = useState(false), [rate, setRate] = useState(1), [showDrawings, setShowDrawings] = useState(true), [notes, setNotes] = useState(true);
  const current = useRef({ time: 0, run: false, rate: 1, notes: true });
  const alive = useRef(true), audioKey = useRef(null), audioBlocked = useRef(false), playGeneration = useRef(0);
  const previousTime = useRef(0), triggered = useRef(new Set());
  current.current.rate = rate; current.current.notes = notes;
  const available = model.videos.every((_, i) => sources[`v${i}`]);
  const drawings = visibleEvents(model.events, time, dismissed.current);
  function stopFollowers() { refs.current.slice(1).forEach(v => v?.pause()); audioRef.current?.pause(); }
  function pause() { playGeneration.current++; refs.current.forEach(v => v?.pause()); current.current.run = false; audioRef.current?.pause(); setPlaying(false); }
  function syncAudio(ms, run) {
    const a = audioRef.current; if (!a) return;
    const event = current.current.notes ? activeAudio(model.events, ms) : null;
    const src = event ? sources[event.id] : null;
    const key = src ? `${event.id}:${src}` : null;
    if (audioKey.current !== key) { a.pause(); audioKey.current = key; audioBlocked.current = false; if (src) { a.src = src; a.load(); } else { a.removeAttribute('src'); a.load(); } }
    if (!event || !src) { a.pause(); return; }
    const elapsed = Math.max(0, (ms - event.time) / 1000), limit = Math.min((event.duration ?? Infinity) / 1000, Number.isFinite(a.duration) ? a.duration : Infinity);
    a.playbackRate = current.current.rate;
    if (a.readyState >= 1 && elapsed < limit && Math.abs(a.currentTime - elapsed) > .12) a.currentTime = elapsed;
    if (run && elapsed < limit && a.paused && !audioBlocked.current) {
      const expected = key;
      a.play().then(() => { if (!alive.current || audioKey.current !== expected || !current.current.run) a.pause(); }).catch(error => {
        if (error.name === 'AbortError') return; audioBlocked.current = true; onMessage('Le navigateur a bloqué une note. Active de nouveau « Notes vocales », puis relance la lecture.');
      });
    } else if (!run || elapsed >= limit) a.pause();
  }
  function playTriggeredAudio(event) {
    const a = audioRef.current, src = sources[event.id];
    if (!a || !src) return;
    const key = `${event.id}:${src}`;
    audioBlocked.current = false;
    audioKey.current = key;
    a.src = src;
    a.load();
    a.currentTime = 0;
    a.play().catch(error => {
      if (error.name !== 'AbortError') onMessage('Le navigateur a bloqué la note vocale. Relance la lecture ou autorise le son.');
    });
  }
  function sync(ms, run, force = false) {
    const crossed = run && ms >= previousTime.current
      ? model.events.filter(event => previousTime.current < event.time && event.time <= ms && !triggered.current.has(event.id))
      : [];
    if (ms < previousTime.current) {
      triggered.current.clear();
    }
    previousTime.current = ms;
    if (crossed.length) {
      crossed.forEach(event => triggered.current.add(event.id));
      refs.current.forEach(video => video?.pause());
      run = false;
    }
    current.current.time = ms; current.current.run = run; setTime(ms); setPlaying(run);
    refs.current.slice(1).forEach((v, index) => {
      if (!v || v.readyState < 1) return;
      const target = followerTarget(ms, model.syncOffsets[index + 1], Number.isFinite(v.duration) ? v.duration : Infinity);
      v.playbackRate = current.current.rate;
      const drift = Math.abs(v.currentTime - target.time);
      if ((force && drift > .001) || (!v.seeking && drift > .12)) v.currentTime = target.time;
      if (run && target.inRange) { if (v.paused) { const generation = playGeneration.current; v.play().then(() => { if (!alive.current || !current.current.run || generation !== playGeneration.current) v.pause(); }).catch(e => { if (e.name !== 'AbortError') onMessage(`Angle ${index + 2} : lecture refusée par le navigateur.`); }); } }
      else v.pause();
    });
    syncAudio(ms, run);
    if (crossed.length) {
      const audioEvent = crossed.find(event => event.type === 'audio');
      if (audioEvent) playTriggeredAudio(audioEvent);
    }
  }
  // Seul le lecteur maître fournit le temps. Aucune horloge autonome.
  const syncRef = useRef(sync); syncRef.current = sync;
  useEffect(() => {
    alive.current = true;
    const master = refs.current[0]; if (!master) return;
    const read = () => {
      const run = !master.paused && !master.seeking && master.readyState >= 3 && !master.ended;
      syncRef.current(master.currentTime * 1000, run, master.paused);
      setDuration(Number.isFinite(master.duration) ? master.duration * 1000 : 0);
    };
    const freeze = () => { current.current.run = false; setPlaying(false); stopFollowers(); };
    const frame = (_now, metadata) => {
      if (!alive.current) return;
      syncRef.current(metadata.mediaTime * 1000, !master.paused && !master.seeking && master.readyState >= 3 && !master.ended);
      frameRef.current = master.requestVideoFrameCallback(frame);
    };
    const fallbackRead = () => {
      const at = master.currentTime * 1000;
      syncRef.current(at, !master.paused && !master.seeking && master.readyState >= 3 && !master.ended);
    };
    const events = ['loadedmetadata', 'seeked', 'pause', 'playing', 'ended', 'durationchange'];
    events.forEach(name => master.addEventListener(name, read));
    master.addEventListener('waiting', freeze); master.addEventListener('seeking', freeze);
    if (master.requestVideoFrameCallback) frameRef.current = master.requestVideoFrameCallback(frame);
    else master.addEventListener('timeupdate', fallbackRead);
    const hidden = () => { if (document.hidden) { master.pause(); freeze(); } };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      alive.current = false; playGeneration.current++;
      if (frameRef.current !== null && master.cancelVideoFrameCallback) master.cancelVideoFrameCallback(frameRef.current);
      events.forEach(name => master.removeEventListener(name, read)); master.removeEventListener('waiting', freeze); master.removeEventListener('seeking', freeze); master.removeEventListener('timeupdate', fallbackRead); document.removeEventListener('visibilitychange', hidden);
      refs.current.forEach(v => v?.pause()); audioRef.current?.pause();
    };
  }, []);
  useEffect(() => { refs.current.forEach(v => { if (v) v.playbackRate = rate; }); syncAudio(current.current.time, current.current.run); }, [rate, notes]);
  function seek(ms) {
    const wasTime = current.current.time;
    pause();
    const target = Math.max(0, Math.min(ms, duration));
    // ⏪ Retour en arrière : les dessins situés après la nouvelle position
    // redeviennent affichables s'ils avaient été consommés.
    if (target < wasTime) {
      model.events.forEach(e => { if (e.time > target) dismissed.current.delete(e.id); });
    }
    previousTime.current = target; triggered.current.clear();
    const m = refs.current[0]; if (m && m.readyState >= 1) m.currentTime = target / 1000;
  } async function toggle() {
    const m = refs.current[0]; if (!m || !available) return;
    if (!m.paused) { pause(); return; }
    if (m.ended) m.currentTime = 0;
    // 🎬 Reprise de lecture : on « consomme » les dessins actuellement affichés
    // afin qu'ils disparaissent pour la lecture en cours.
    visibleEvents(model.events, current.current.time).forEach(e => dismissed.current.add(e.id));
    const generation = ++playGeneration.current;
    audioBlocked.current = false;
    // Appels directs dans le geste utilisateur pour les politiques autoplay mobiles.
    refs.current.slice(1).forEach((v, i) => {
      if (v && followerTarget(m.currentTime * 1000, model.syncOffsets[i + 1], v.duration || Infinity).inRange) v.play().then(() => { if (!alive.current || generation !== playGeneration.current) v.pause(); }).catch(() => { });
    });
    syncAudio(m.currentTime * 1000, true);
    try { await m.play(); if (!alive.current || generation !== playGeneration.current) m.pause(); }
    catch (e) { pause(); onMessage(`Lecture impossible : ${e.message}`); }
  }
  const selection = e => { const i = Number(e.currentTarget.dataset.index); seek(model.events[i].time); };
  return <div className="workspace">
    <section className="viewer" aria-label="Lecture de l’analyse" style={{ '--ratio': model.canvasAspectRatio }}>
      <div className="stage" ref={containerRef} style={{ aspectRatio: model.canvasAspectRatio }}>
        <div className={`grid count-${model.videos.length}`}>
          {model.videos.map((video, i) => <div className="angle" key={i}>
            <video ref={element => { refs.current[i] = element; }} src={sources[`v${i}`] || undefined} playsInline preload="metadata" muted={i !== 0} onError={() => onMessage(`Angle ${i + 1} : fichier illisible, format incompatible ou lien expiré. Pour OneDrive, utilise « Ouvrir / actualiser ».`)} onLoadedMetadata={() => { if (i) syncRef.current(current.current.time, current.current.run, true); }} />
            <span className="angle-label">{String(i + 1).padStart(2, '0')} · {i === 0 ? 'MAÎTRE' : `ANGLE · ${model.syncOffsets[i]} ms`}</span>
            {!sources[`v${i}`] && <div className="unavailable">Sélectionne la vidéo {i + 1}</div>}
            {i > 0 && sources[`v${i}`] && !followerTarget(time, model.syncOffsets[i], refs.current[i]?.duration || Infinity).inRange && <div className="unavailable">Angle hors plage</div>}
          </div>)}
        </div>
        <svg className="overlay" viewBox={`0 0 1000 ${1000 / model.canvasAspectRatio}`} aria-label="Dessins du coach" data-visible-count={drawings.length}>
          {showDrawings && drawings.map(e => <Drawing key={e.id} event={e} ratio={model.canvasAspectRatio} />)}
        </svg>
      </div>
      <div className="transport">
        <div className="time-row"><span className="eyebrow">TEMPS MAÎTRE</span><output>{formatTime(time)} <span>/ {formatTime(duration)}</span></output></div>
        <input aria-label="Position dans la vidéo" className="scrubber" type="range" min="0" max={duration || 1} step="10" value={Math.min(time, duration)} disabled={!duration} onInput={e => seek(Number(e.currentTarget.value))} onChange={() => { }} />
        <div className="buttons"><button className="primary" onClick={toggle} disabled={!available}>{playing ? 'Ⅱ Pause' : '▶ Lecture'}</button><button onClick={() => seek(time - 1000)} disabled={!duration}>−1 s</button><button onClick={() => seek(time + 1000)} disabled={!duration}>+1 s</button><label className="speed">Vitesse <select aria-label="Vitesse" value={rate} onChange={e => setRate(Number(e.target.value))}>{[.25, .5, 1, 1.5, 2].map(r => <option key={r} value={r}>×{r}</option>)}</select></label><button onClick={() => containerRef.current?.parentElement?.requestFullscreen?.().catch(() => onMessage('Le plein écran n’est pas disponible dans ce navigateur.'))}>Plein écran</button></div>
        <div className="toggles"><label><input type="checkbox" checked={showDrawings} onChange={e => setShowDrawings(e.target.checked)} /> Dessins</label><label><input type="checkbox" checked={notes} onChange={e => { audioBlocked.current = false; setNotes(e.target.checked); }} /> Notes vocales</label><span>Les annotations suivent le temps vidéo.</span></div>
      </div>
      <audio ref={audioRef} preload="metadata" onLoadedMetadata={() => syncAudio(current.current.time, current.current.run)} onEnded={() => { audioBlocked.current = true; audioRef.current?.pause(); }} onError={() => onMessage('Une note vocale ne peut pas être décodée. Choisis le fichier audio correspondant.')} />
    </section>
    <aside className="events"><div className="section-title"><h2>Annotations</h2><span>{model.events.length}</span></div><p className="hint">Choisis un événement pour retrouver son instant.</p><ol>{model.events.map((e, i) => <li key={e.id}><button data-index={i} onClick={selection} className={drawings.includes(e) ? 'event active' : 'event'}><span className="event-time">{formatTime(e.time)}</span><span className="event-name">{TYPES[e.type]}{e.type === 'text' && <small>{e.data.text}</small>}</span><span className="event-duration">{e.duration ? `${e.duration / 1000} s` : '—'}</span></button></li>)}</ol>{!model.events.length && <p className="hint">Cette analyse ne contient pas encore d’annotation.</p>}</aside>
  </div>;
}

function App() {
  const [archive, setArchive] = useState(null);
  const [headerView, setHeaderView] = useState('reader');
  const [session, setSession] = useState({ provider: null, account: null });
  const [sessionTick, setSessionTick] = useState(0);
  const [cloudSource, setCloudSource] = useState(null);
  const [copyProgress, setCopyProgress] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { await msAuth.ready; } catch { }
      if (cancelled) return;
      const preferred = localStorage.getItem('scp.activeProvider');
      const msAcc = msAuth.msal?.getActiveAccount?.();
      const gAcc = gAuth.getAccount?.();
      const pick = (p) => {
        if (p === 'microsoft' && msAcc) {
          setSession({ provider: 'microsoft', account: { email: msAcc.username, name: msAcc.name } });
          return true;
        }
        if (p === 'google' && gAcc) {
          setSession({ provider: 'google', account: { email: gAcc.email, name: gAcc.name } });
          return true;
        }
        return false;
      };
      if (pick(preferred)) return;
      if (pick('microsoft')) return;
      if (pick('google')) return;
      setSession({ provider: null, account: null });
    })();
    return () => { cancelled = true; };
  }, [sessionTick]);

  const switchTab = (v) => {
    setHeaderView(v);
    setSessionTick(x => x + 1);
  };
  const [model, setModel] = useState(null), [sources, setSources] = useState({}), [name, setName] = useState(''), [message, setMessage] = useState(''), [revision, setRevision] = useState(0);
  const urls = useRef(new Map()), loadId = useRef(0);
  function clearUrls() { urls.current.forEach(url => URL.revokeObjectURL(url)); urls.current.clear(); }
  useEffect(() => () => { loadId.current++; clearUrls(); }, []);
  function bind(key, file) { const url = URL.createObjectURL(file); const previous = urls.current.get(key); urls.current.set(key, url); if (previous) URL.revokeObjectURL(previous); return url; }
  async function openFiles(list) {
    const files = Array.from(list), jsons = files.filter(f => ['analyse.json', 'archive.json'].includes(f.name.toLowerCase()));
    const id = ++loadId.current;
    try {
      if (jsons.length !== 1) throw new Error('Sélectionne un archive.json ou un analyse.json, accompagné de ses médias.');
      if (jsons[0].size > 10 * 1024 * 1024) throw new Error('Le JSON dépasse 10 Mo.');
      const raw = JSON.parse(await jsons[0].text());
      const nextArchive = raw.documentType === 'archive' ? validateArchive(raw) : null;
      const next = nextArchive ? null : validate(raw); if (id !== loadId.current) return;
      const mapping = new Map(); files.forEach(f => { if (mapping.has(f.name)) mapping.set(f.name, null); else mapping.set(f.name, f); });
      clearUrls(); const linked = {};
      if (nextArchive) { archiveMedia(nextArchive).forEach(([key, item]) => { const f = mapping.get(item.file); if (f) linked[key] = bind(key, f); }); }
      else {
        next.videos.forEach((v, i) => { const f = mapping.get(baseName(v)); if (f) linked[`v${i}`] = bind(`v${i}`, f); });
        next.events.filter(e => e.type === 'audio').forEach(e => { const f = mapping.get(baseName(e)); if (f) linked[e.id] = bind(e.id, f); });
      }
      setArchive(nextArchive); setSources(linked); setModel(next); setName(jsons[0].webkitRelativePath?.split('/')[0] || jsons[0].name); setRevision(n => n + 1); setMessage('');
    } catch (error) { setMessage(error.message); }
  }
  function choose(key, file) { if (!file) return; setSources(previous => ({ ...previous, [key]: bind(key, file) })); setRevision(n => n + 1); setMessage(''); }
  function closeAnalysis() { loadId.current++; setModel(null); setArchive(null); setSources({}); setCloudSource(null); setCopyProgress(null); clearUrls(); return loadId.current; }
  function detectProvider() {
    try {
      const msAcc = msAuth.msal?.getActiveAccount?.();
      if (msAcc) return 'microsoft';
      const gAcc = gAuth.getAccount?.();
      if (gAcc) return 'google';
    } catch { }
    return null;
  }

  function openCloud(result, ticket) {
    if (ticket !== loadId.current) return;
    loadId.current++;
    clearUrls();
    setArchive(result.archive || null);
    setModel(result.model || null);
    setSources(result.sources);
    setName(result.name);
    setRevision(n => n + 1);
    const provider = session.provider || detectProvider() || result.sourceProvider || null;
    if (provider && result.sourceLink) {
      (async () => {
        try {
          if (!library.getLibrary()) {
            await library.loadLibrary(provider, session.account || { email: '', name: '' });
          }
          const entry = library.addFromShare({
            sourceUrl: result.sourceLink,
            sourceProvider: provider,
            name: result.name,
            videoCount: result.model?.videos?.length || 0,
          });
          if (entry) {
            setMessage(`📚 Analyse ajoutée à ta bibliothèque : « ${entry.name} »`);
            setCloudSource({
              link: result.sourceLink,
              provider,
              libraryId: entry.id,
              name: entry.name,
              localCopy: !!entry.localCopy,
            });
          }
        } catch (e) {
          console.warn('Ajout bibliothèque impossible :', e);
        }
      })();
    }
  }
  async function saveToMyDrive() {
    if (!cloudSource || !model || copyProgress) return;
    // C3 : garde-fou si aucun provider actif
    if (!session.provider || !session.account) {
      setMessage('Connecte-toi d’abord à Microsoft ou Google (voir « Mon espace athlète » plus haut) pour sauvegarder l’analyse dans ton Drive.');
      return;
    }
    try {
      setCopyProgress({ done: 0, total: 1, label: 'Préparation…' });
      const result = await storage.copyAnalysisToStorage({
        provider: cloudSource.provider,
        analysisId: cloudSource.libraryId,
        name: cloudSource.name,
        model,
        sources,
        onProgress: p => setCopyProgress(p),
      });
      library.updateLocalCopy(cloudSource.libraryId, result);
      setCloudSource(prev => (prev ? { ...prev, localCopy: true } : prev));
      setCopyProgress(null);
      setMessage(`✅ Analyse copiée dans ton Drive. Tu peux la revoir même si le coach supprime la sienne.`);
    } catch (e) {
      setCopyProgress(null);
      setMessage('Copie impossible : ' + e.message);
    }
  }

  async function openFromLibrary(analysis) {
    if (!analysis) return;

    // 🎯 Cas 1 : copie locale disponible → on charge depuis le Drive de l'athlète
    if (analysis.localCopy && analysis.localFiles && analysis.localCopyProvider) {
      try {
        setMessage('Ouverture depuis ta copie locale…');
        const ticket = closeAnalysis();
        const provider = analysis.localCopyProvider;
        const result = await storage.loadLocalAnalysis({
          provider,
          localFiles: analysis.localFiles,
        });
        // On garde la trace du cloud source pour info (mais localCopy déjà true)
        setArchive(null);
        setModel(result.model);
        setSources(result.sources);
        setName(analysis.name || 'Analyse locale');
        setRevision(n => n + 1);
        setCloudSource({
          link: analysis.sourceUrl,
          provider: analysis.sourceProvider,
          libraryId: analysis.id,
          name: analysis.name,
          localCopy: true,
        });
        library.markViewed(analysis.id);
        return;
      } catch (e) {
        setMessage('Copie locale corrompue, on retente depuis la source… (' + e.message + ')');
        // On continue vers le fallback ci-dessous
      }
    }

    // 🎯 Cas 2 : pas de copie locale → on retente depuis le lien source du coach
    if (!analysis.sourceUrl) {
      setMessage('Cette analyse ne contient pas de lien source. Elle ne peut pas être rouverte automatiquement.');
      return;
    }
    const isOneDriveSource = /1drv\.ms|onedrive\.live\.com|sharepoint\.com/i.test(analysis.sourceUrl || '');
    if (!isOneDriveSource) {
      setMessage("Cette analyse n'a pas de copie locale. Les liens sources non-OneDrive ne sont pas encore supportés en re-téléchargement.");
      return;
    }
    try {
      setMessage('Ouverture de l’analyse en cours…');
      const ticket = closeAnalysis();
      const result = await loadAnalysis(analysis.sourceUrl, {
        getToken: msAuth.accessToken,
      });
      openCloud(result, ticket);
      library.markViewed(analysis.id);
    } catch (e) {
      setMessage('Impossible d’ouvrir l’analyse : ' + e.message);
    }
  }
  const audioEvents = model?.events.filter(e => e.type === 'audio') || [];
  return <main>
    <header><div className="brand"><span className="brand-mark">SC</span><div><strong>SLALOM COACH</strong><span>ANALYSE VIDÉO</span></div></div><nav className="header-tabs">
      <button className={headerView === 'reader' ? 'active' : ''} onClick={() => switchTab('reader')}>📖 Lecteur</button>
      <button className={headerView === 'library' ? 'active' : ''} onClick={() => switchTab('library')}>📚 Ma bibliothèque</button>
    </nav><div className="header-actions"><span className="local-badge">Fichiers locaux ou OneDrive</span><label className="button secondary">Ouvrir un dossier<input type="file" multiple accept=".json,video/*,audio/*,image/*" onChange={e => { openFiles(e.target.files); e.target.value = ''; }} /></label></div></header>
    <div className="page-title-actions">
      {model && cloudSource && !cloudSource.localCopy && (
        <button className="primary" onClick={saveToMyDrive} disabled={!!copyProgress}>
          {copyProgress ? `⏳ ${copyProgress.done}/${copyProgress.total}` : '💾 Sauvegarder dans mon Drive'}
        </button>
      )}
      {(model || archive) && <button onClick={closeAnalysis}>Fermer</button>}
    </div>    {message && <div className="message" role="alert"><span>{message}</span><button aria-label="Fermer le message" onClick={() => setMessage('')}>×</button></div>}
    <SpacePanel onMessage={setMessage} />
    <OneDrivePanel onLoad={openCloud} onClear={closeAnalysis} onMessage={setMessage} />
    {headerView === 'library' ? (
      <LibraryPanel
        provider={session.provider}
        account={session.account}
        onOpen={(a) => { switchTab('reader'); openFromLibrary(a); }} onMessage={setMessage}
      />
    ) : (
      <>
        {archive ? <ArchiveViewer key={revision} archive={archive} sources={sources} onMessage={setMessage} /> : !model ? <section className="empty"><div className="empty-mark" aria-hidden="true">▶</div><h2>Ton analyse, dans le navigateur</h2><p>Sélectionne <strong>archive.json</strong> ou <strong>analyse.json</strong> et les médias exportés par l’application. Tu peux aussi associer chaque fichier après l’ouverture.</p><div className="buttons"><label className="button primary">Choisir les fichiers<input type="file" multiple accept=".json,video/*,audio/*,image/*" onChange={e => { openFiles(e.target.files); e.target.value = ''; }} /></label><label className="button">Ouvrir un dossier<input type="file" webkitdirectory="" multiple onChange={e => { openFiles(e.target.files); e.target.value = ''; }} /></label></div><p className="hint">Les fichiers restent sur ton appareil. Aucun compte nécessaire pour ce test.</p></section> : <>
          <Player key={revision} model={model} sources={sources} onMessage={setMessage} />
          <details className="media" open={!model.videos.every((_, i) => sources[`v${i}`])}><summary>Fichiers de l’analyse <span>{Object.keys(sources).length} associé(s)</span></summary><div className="media-grid">{model.videos.map((v, i) => <label className="media-item" key={i}><strong>Vidéo {i + 1}{i === 0 ? ' · Maître' : ''}</strong><span>{baseName(v)}</span><span className={sources[`v${i}`] ? 'ready' : 'missing'}>{sources[`v${i}`] ? 'Fichier associé' : 'Fichier à sélectionner'}</span><input aria-label={`Fichier vidéo ${i + 1}`} type="file" accept="video/*" onChange={e => choose(`v${i}`, e.target.files[0])} /></label>)}{audioEvents.map(e => <label className="media-item" key={e.id}><strong>Note · {formatTime(e.time)}</strong><span>{baseName(e)}</span><span className={sources[e.id] ? 'ready' : 'missing'}>{sources[e.id] ? 'Fichier associé' : 'Fichier à sélectionner'}</span><input aria-label={`Note ${formatTime(e.time)}`} type="file" accept="audio/*,video/mp4" onChange={event => choose(e.id, event.target.files[0])} /></label>)}</div></details>
        </>}
      </>
    )}
    <footer><span>SLALOM COACH PRO</span><span>Portail de lecture · OneDrive</span></footer>
  </main>;
}
createRoot(document.getElementById('root')).render(<App />);
