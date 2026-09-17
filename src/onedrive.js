import {validateArchive,archiveMedia} from './archive.js';
import {validate,baseName} from './timeline.js';
export function sharingToken(value){
  const url=new URL(value.trim());
  if(url.protocol!=='https:'||url.username||url.password||!(url.hostname==='1drv.ms'||url.hostname==='onedrive.live.com'||url.hostname.endsWith('.sharepoint.com')))throw new Error('Colle un lien de partage de dossier OneDrive (https).');
  const bytes=new TextEncoder().encode(url.href);
  return 'u!'+btoa(Array.from(bytes,b=>String.fromCharCode(b)).join('')).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}
function safeDownload(value){
  if(typeof value!=='string')throw new Error('OneDrive n’a pas fourni de lien de téléchargement.');
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password)throw new Error('Lien de téléchargement OneDrive invalide.');
  return url.href;
}
export async function loadAnalysis(link,{signal,fetcher=fetch,getToken}={}){
  const root='https://graph.microsoft.com/v1.0';
  const endpoint=`${root}/shares/${sharingToken(link)}/driveItem`;
  async function graph(url){
    const parsed=new URL(url);
    if(parsed.origin!=='https://graph.microsoft.com'||!parsed.pathname.startsWith('/v1.0/'))throw new Error('Adresse Graph inattendue.');
    const response=await fetcher(url,{signal,headers:{Authorization:`Bearer ${await getToken()}`,Prefer:'redeemSharingLinkIfNecessary'}});
    if(!response.ok){
      const messages={401:'Reconnecte ton compte Microsoft.',403:'Ce compte n’a pas accès au dossier. Demande au coach de le partager avec ce compte. Une politique Microsoft 365 peut aussi bloquer le consentement.',404:'Dossier introuvable ou lien de partage expiré.',429:'OneDrive limite les requêtes. Patiente, puis réessaie.'};
      throw new Error(messages[response.status]||`OneDrive : erreur HTTP ${response.status}.`);
    }
    return response.json();
  }
  const folder=await graph(endpoint);
  if(!folder.folder)throw new Error('Le lien doit désigner un dossier contenant archive.json ou analyse.json et les médias.');
  const files=[];let next=endpoint+'/children';const visited=new Set();
  while(next){
    if(visited.has(next)||visited.size>=100)throw new Error('Dossier trop volumineux ou pagination invalide.');
    visited.add(next);const page=await graph(next);
    if(!Array.isArray(page.value))throw new Error('Liste de fichiers OneDrive invalide.');
    files.push(...page.value.filter(item=>item.file));next=page['@odata.nextLink'];
  }
  const jsons=files.filter(item=>['analyse.json','archive.json'].includes(item.name.toLowerCase()));
  if(jsons.length!==1)throw new Error('Le dossier doit contenir exactement un manifeste : archive.json ou analyse.json.');
  async function download(item){
    if(item['@microsoft.graph.downloadUrl'])return safeDownload(item['@microsoft.graph.downloadUrl']);
    const drive=item.parentReference?.driveId||folder.parentReference?.driveId;
    if(!drive||!item.id)throw new Error('Identifiants OneDrive manquants.');
    const detail=await graph(`${root}/drives/${encodeURIComponent(drive)}/items/${encodeURIComponent(item.id)}`);
    return safeDownload(detail['@microsoft.graph.downloadUrl']);
  }
  if(jsons[0].size>10*1024*1024)throw new Error('Le JSON dépasse 10 Mo.');
  // Seul le petit JSON est téléchargé en mémoire. Les médias restent des URL directes.
  const response=await fetcher(await download(jsons[0]),{signal,credentials:'omit',referrerPolicy:'no-referrer'});
  if(!response.ok)throw new Error(`Téléchargement du JSON impossible (${response.status}). Rouvre le dossier.`);
  const reader=response.body.getReader();const chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>10*1024*1024){await reader.cancel();throw new Error('Le JSON dépasse 10 Mo.');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const raw=JSON.parse(new TextDecoder().decode(bytes));
  const archive=raw.documentType==='archive'?validateArchive(raw):null;
  const model=archive?null:validate(raw),sources={};
  const media=archive?archiveMedia(archive):[...model.videos.map((v,i)=>[`v${i}`,v]),...model.events.filter(e=>e.type==='audio').map(e=>[e.id,e])];
  const cache=new Map();
  for(const [key,item] of media){
    const name=baseName(item),matches=files.filter(file=>file.name===name);
    if(matches.length!==1)throw new Error(`Fichier absent ou ambigu dans le dossier : ${name}`);
    if(!cache.has(name))cache.set(name,await download(matches[0]));
    sources[key]=cache.get(name);
  }
  return {model,archive,sources,name:archive?.collection.name||folder.name||'Analyse OneDrive'};
}

