import React,{useState} from 'react';
import {athleteFor,rankFor,rawTime,sectors,nearest,number} from './archive.js';
const value = x => x == null || x === '' ? 'Non renseigné' : typeof x === 'object' ? JSON.stringify(x) : String(x);
const chrono = ms => number(ms) === null ? 'Non chronométré' : `${(ms/1000).toFixed(2)} s`;
function Passage({archive,run,index,sources,onMessage}) {
  const [time,setTime]=useState(0);
  const athlete=athleteFor(archive,run),rank=rankFor(archive,run),bpm=nearest(run.cardioData,time),telemetry=nearest(run.telemetryData,time);
  const rows=sectors(run),src=sources[`r${index}-video`];
  return <section className="archive-detail" aria-label="Détails du passage">
    <p className="eyebrow">PASSAGE {index+1}</p><h2>{value(athlete?.name || run.athleteName || 'Athlète non renseigné')}</h2>
    <p className="hint">{value(run.category)} · Secteur {value(run.sector)} · Descente {value(run.descent)}</p>
    {src?<video key={src} src={src} poster={sources[`r${index}-thumbnail`]} controls playsInline preload="metadata" onTimeUpdate={e=>setTime(e.currentTarget.currentTime*1000)} onSeeked={e=>setTime(e.currentTarget.currentTime*1000)} onError={()=>onMessage('Vidéo indisponible : actualise le dossier OneDrive ou vérifie le format du fichier.')}/>:<p className="archive-no-video">{run.videoFile?'Vidéo absente des fichiers sélectionnés. Rouvre le dossier complet.':'Aucune vidéo enregistrée pour ce passage.'}</p>}
    <dl className="archive-stats">{[
      ['Temps total',chrono(run.totalTime)],['Temps sans pénalités',chrono(rawTime(run))],
      ['Pénalités',number(run.penalties)===null?'Non renseignées':`${run.penalties} s`],
      ['Cadence',number(run.cadence)===null?'Non renseignée':`${run.cadence} coups/min`],
      ['Rang du passage',rank?`${rank.place} / ${rank.count}`:'Non classé'],
      ['Écart au meilleur',rank?`+${chrono(rank.gap)}`:'—'],
      ['Dossard',value(run.bib ?? athlete?.bib)],['Étiquette',value(run.tag)],
    ].map(([label,text])=><div key={label}><dt>{label}</dt><dd>{text}</dd></div>)}</dl>
    <p className="hint">Rang parmi les passages de cette archive ayant la même catégorie, le même secteur et la même descente. Ce n’est pas un classement officiel de course.</p>
    {(run.comment || run.notes || run.comments)&&<p className="archive-note">{value(run.comment || run.notes || run.comments)}</p>}
    {!!rows.length&&<div className="archive-table"><table><caption>Temps intermédiaires</caption><thead><tr><th>Repère</th><th>Cumul</th><th>Segment</th></tr></thead><tbody>{rows.map((r,i)=><tr key={i}><th>{r.label}</th><td>{chrono(r.cumulative)}</td><td>{chrono(r.segment)}</td></tr>)}</tbody></table></div>}
    {(bpm||telemetry)&&<section className="archive-sensors"><h3>Capteurs au temps vidéo · {chrono(time)}</h3><dl className="archive-stats">{bpm&&<div><dt>Fréquence cardiaque</dt><dd>{value(bpm.bpm)} bpm</dd></div>}{telemetry&&[['Vitesse','speed','km/h'],['Accélération','accel','m/s²'],['Tangage','pitch','°'],['Roulis','roll','°']].map(([label,key,unit])=><div key={key}><dt>{label}</dt><dd>{number(telemetry[key])===null?'—':`${telemetry[key].toFixed(2)} ${unit}`}</dd></div>)}</dl></section>}
    {sources[`r${index}-sensor`]&&<a className="button" href={sources[`r${index}-sensor`]} target="_blank" rel="noreferrer">Ouvrir le fichier des capteurs</a>}
    <details className="archive-data"><summary>Toutes les données du passage et du profil</summary><p className="hint">Données enregistrées dans l’application, y compris les champs qui n’ont pas encore de présentation dédiée.</p><pre>{JSON.stringify({passage:run,athlete:athlete||null},null,2)}</pre></details>
  </section>;
}
export default function ArchiveViewer({archive,sources,onMessage}) {
  const [selected,setSelected]=useState(null),[filters,setFilters]=useState({athleteId:'',category:'',sector:'',descent:''});
  const displayed=archive.runs.map((run,index)=>({run,index})).filter(({run})=>Object.entries(filters).every(([key,val])=>!val||String(run[key]??'')===val));
  function filter(key,val){setFilters(old=>({...old,[key]:val}));setSelected(null);}
  return <div className="archive">
    <div className="archive-heading"><div><p className="eyebrow">DOSSIER D’ARCHIVES</p><h2>{archive.collection.name}</h2><p className="hint">{archive.runs.length} passages · {archive.athletes.length} athlètes{archive.collection.date&&` · ${new Date(archive.collection.date).toLocaleDateString('fr-FR')}`}</p></div><span className="archive-badge">Consultation</span></div>
    <div className="archive-filters">{[['athleteId','Athlète'],['category','Catégorie'],['sector','Secteur'],['descent','Descente']].map(([key,label])=><label key={key}>{label}<select value={filters[key]} onChange={e=>filter(key,e.target.value)}><option value="">Tous</option>{[...new Set(archive.runs.map(r=>String(r[key]??'')).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr',{numeric:true})).map(v=><option key={v} value={v}>{key==='athleteId'?value(archive.athletes.find(a=>String(a.id)===v)?.name||v):v}</option>)}</select></label>)}</div>
    <p className="hint" role="status">{displayed.length} passage(s) affiché(s)</p>
    {selected===null?<div className="archive-cards">{displayed.map(({run,index})=>{const athlete=athleteFor(archive,run);return <button className="archive-card" key={index} onClick={()=>setSelected(index)} aria-label={`Ouvrir le passage ${index+1} de ${athlete?.name||'cet athlète'}`}>
      <div className="archive-thumbnail">{sources[`r${index}-thumbnail`]?<img src={sources[`r${index}-thumbnail`]} loading="lazy" alt="" onError={e=>{e.currentTarget.hidden=true;}}/>:<span>{run.videoFile?'Vidéo':'Chronométrage'}</span>}<span className="archive-play">Ouvrir le passage</span></div>
      <div className="archive-card-body"><strong>{value(athlete?.name || run.athleteName || 'Athlète non renseigné')}</strong><span>{value(run.category)} · Secteur {value(run.sector)} · D{value(run.descent)}</span><b>{chrono(run.totalTime)}</b><span>Pénalités : {number(run.penalties)===null?'—':`${run.penalties} s`} · Cadence : {number(run.cadence)===null?'—':run.cadence}</span></div>
    </button>;})}</div>:<><button className="archive-back" onClick={()=>setSelected(null)}>Retour aux passages</button><Passage key={selected} archive={archive} run={archive.runs[selected]} index={selected} sources={sources} onMessage={onMessage}/></>}
    {!!archive.warnings?.length&&<details className="archive-data"><summary>Informations sur l’export</summary><pre>{JSON.stringify(archive.warnings,null,2)}</pre></details>}
    <details className="archive-data"><summary>Données du dossier</summary><pre>{JSON.stringify(archive.collection,null,2)}</pre></details>
  </div>;
}
