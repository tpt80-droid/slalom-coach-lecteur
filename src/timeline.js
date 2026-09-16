export const TYPES = {path:'Tracé',arrow:'Flèche',circle:'Cercle',angle:'Angle',text:'Texte',audio:'Note vocale',clear_all:'Gomme'};
const finite = x => typeof x === 'number' && Number.isFinite(x);
const unit = x => finite(x) && x >= 0 && x <= 1;
const point = p => p && unit(p.x) && unit(p.y);
export function validate(raw) {
  const fail = message => { throw new Error(`Analyse non reconnue : ${message}`); };
  if (!raw || (raw.schemaVersion !== undefined && raw.schemaVersion !== 1)) fail('version du format.');
  if (!Array.isArray(raw.events) || raw.events.length > 20000) fail('tableau events absent ou trop long.');
  if (!Array.isArray(raw.videos) || !raw.videos.length || raw.videos.length > 4) fail('1 à 4 vidéos attendues.');
  if (!Array.isArray(raw.syncOffsets) || raw.syncOffsets.length !== 4 || raw.syncOffsets[0] !== 0 || !raw.syncOffsets.every(finite)) fail('syncOffsets invalide.');
  if (raw.coordinateSpace && raw.coordinateSpace !== 'normalized') fail('coordonnées en pixels non prises en charge.');
  if ((raw.layout && raw.layout !== 'grid') || (raw.contentFit && raw.contentFit !== 'contain')) fail('disposition vidéo non prise en charge.');
  const ratio = raw.canvasAspectRatio ?? 16/9;
  if (!finite(ratio) || ratio < .25 || ratio > 4) fail('proportions du canevas.');
  const videos = raw.videos.map((v, i) => {
    if (!v || typeof v !== 'object' || typeof (v.file || v.uri) !== 'string') fail(`fichier vidéo ${i+1}.`);
    return {uri:v.uri || '',file:v.file || '',name:typeof v.name==='string'?v.name:`Angle ${i+1}`};
  });
  let totalPoints=0;
  const events = raw.events.map((e,i) => {
    if (!e || !finite(e.time) || e.time < 0 || !Object.hasOwn(TYPES,e.type)) fail(`événement ${i+1}.`);
    const base = {id:`event-${i}`,time:e.time,type:e.type};
    if (e.type==='clear_all') return base;
    if (e.type==='audio') {
      if (typeof (e.file || e.uri || e.url) !== 'string') fail('fichier audio.');
      if (e.duration!==undefined && (!finite(e.duration) || e.duration<=0)) fail('durée audio.');
      return {...base,uri:e.uri || e.url || '',file:e.file || '',...(e.duration!==undefined?{duration:e.duration}:{})};
    }
    const duration=e.duration??3000, d=e.data;
    if (!finite(duration) || duration<=0 || !d || typeof d.color!=='string' || !/^(#[\da-f]{3,8}|[a-z]{1,24})$/i.test(d.color)) fail('durée/couleur du dessin.');
    if (d.strokeWidth!==undefined && (!unit(d.strokeWidth)||d.strokeWidth===0)) fail('épaisseur.');
    if (e.type==='path') {
      if (!Array.isArray(d.points)||!d.points.length||!d.points.every(point)) fail('coordonnées du tracé.');
      totalPoints+=d.points.length; if(totalPoints>200000)fail('trop de points.');
    } else if(e.type==='text') {
      if(!point(d)||typeof d.text!=='string'||d.text.length>2000||(d.fontSize!==undefined&&(!unit(d.fontSize)||d.fontSize===0)))fail('texte.');
    } else if(!point(d.p1)||!point(d.p2))fail('coordonnées du dessin.');
    return {...base,duration,data:d};
  }).sort((a,b)=>a.time-b.time); // Stable : ordre des événements à temps égal conservé.
  return {schemaVersion:1,canvasAspectRatio:ratio,coordinateSpace:'normalized',layout:'grid',contentFit:'contain',syncOffsets:[...raw.syncOffsets],videos,events};
}
export function visibleEvents(events,time) {
  let clearTime=-Infinity,clearIndex=-1;
  events.forEach((e,i)=>{if(e.type==='clear_all'&&e.time<=time&&(e.time>clearTime||(e.time===clearTime&&i>clearIndex))){clearTime=e.time;clearIndex=i;}});
  return events.filter((e,i)=>e.type!=='clear_all'&&e.type!=='audio'&&e.time<=time&&time<=e.time+e.duration&&(e.time>clearTime||(e.time===clearTime&&i>clearIndex)));
}
export function activeAudio(events,time) {
  let event=null;
  events.forEach(e=>{if(e.type==='audio'&&e.time<=time&&(!event||e.time>=event.time))event=e;});
  return event && (event.duration===undefined||time<event.time+event.duration)?event:null;
}
export function followerTarget(time,offset,duration=Infinity) {
  const seconds=(time+offset)/1000;
  return {time:Math.max(0,Math.min(seconds,duration)),inRange:seconds>=0&&seconds<duration};
}
export function baseName(media){const raw=media.file||media.uri||'';try{return decodeURIComponent(raw.split(/[?#]/)[0].split('/').pop());}catch{return raw.split('/').pop();}}
export function formatTime(ms){const s=Math.max(0,ms)/1000;return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toFixed(2).padStart(5,'0')}`;}
