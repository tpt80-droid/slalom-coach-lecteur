// Archive v1: preserve business fields; accept only sibling filenames for media.
export const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
export function validateArchive(raw) {
  if (!raw || raw.documentType !== 'archive' || raw.schemaVersion !== 1) throw new Error('Format archive non pris en charge.');
  if (!raw.collection || typeof raw.collection.name !== 'string' || !Array.isArray(raw.runs) || !Array.isArray(raw.athletes)) throw new Error('Archive incomplète.');
  if (raw.runs.length > 10000) throw new Error('Archive trop volumineuse.');
  for (const run of raw.runs) {
    if (!run || typeof run !== 'object' || Array.isArray(run)) throw new Error('Passage invalide.');
    for (const field of ['videoFile','thumbnailFile','sensorFile']) {
      const name = run[field];
      if (name != null && (typeof name !== 'string' || !name || /[\\/:\x00-\x1f]/.test(name) || name === '.' || name === '..')) throw new Error('Nom de média invalide.');
    }
  }
  if (raw.athletes.some(a => !a || typeof a !== 'object' || Array.isArray(a))) throw new Error('Profil athlète invalide.');
  return raw;
}
export function archiveMedia(archive) {
  return archive.runs.flatMap((run,i) => [['video','videoFile'],['thumbnail','thumbnailFile'],['sensor','sensorFile']].filter(([,field]) => run[field]).map(([type,field]) => [`r${i}-${type}`,{file:run[field]}]));
}
export function athleteFor(archive, run) {return archive.athletes.find(a => String(a.id) === String(run.athleteId));}
export function rankFor(archive, run) {
  const total = number(run.totalTime);
  if (total === null || total < 0) return null;
  const peers = archive.runs.filter(r => ['category','sector','descent'].every(k => String(r[k] ?? '') === String(run[k] ?? '')) && number(r.totalTime) !== null && r.totalTime >= 0);
  const best = Math.min(...peers.map(r => r.totalTime));
  return {place:1+peers.filter(r => r.totalTime < total).length,count:peers.length,gap:total-best};
}
export function rawTime(run) {
  const total=number(run.totalTime),penalty=number(run.penalties);
  return total !== null && penalty !== null && total >= penalty*1000 ? total-penalty*1000 : null;
}
export function sectors(run) {
  const result=[];let previous=0;
  for (const time of Array.isArray(run.splits) ? run.splits : []) {
    if (number(time) === null || time < previous) return result;
    result.push({label:`Intermédiaire ${result.length+1}`,cumulative:time,segment:time-previous});previous=time;
  }
  const finish=rawTime(run);
  if (finish !== null && finish >= previous) result.push({label:'Arrivée (hors pénalités)',cumulative:finish,segment:finish-previous});
  return result;
}
export function nearest(samples, ms) {
  if (!Array.isArray(samples)) return null;
  return samples.filter(s => s && number(s.time) !== null).reduce((best,s) => !best || Math.abs(s.time-ms)<Math.abs(best.time-ms) ? s : best,null);
}
