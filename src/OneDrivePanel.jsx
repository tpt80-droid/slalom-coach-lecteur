import React,{useEffect,useRef,useState} from 'react';
import {ready,msal,connect,accessToken} from './microsoftAuth.js';
import {loadAnalysis} from './onedrive.js';
export default function OneDrivePanel({onLoad,onClear,onMessage}){
  const [account,setAccount]=useState(null),[initialized,setInitialized]=useState(false),[busy,setBusy]=useState(false);
  const [link,setLink]=useState(()=>new URLSearchParams(location.hash.slice(1)).get('onedrive')||'');
  const request=useRef(null),alive=useRef(true);
  useEffect(()=>{alive.current=true;ready.then(()=>{if(alive.current){setInitialized(true);setAccount(msal.getActiveAccount());}}).catch(()=>onMessage('Impossible d’initialiser la connexion Microsoft.'));return()=>{alive.current=false;request.current?.abort();};},[]);
  async function login(){onClear();setBusy(true);try{const next=await connect();if(alive.current)setAccount(next);}catch(e){if(alive.current)onMessage(e.errorCode==='user_cancelled'?'Connexion annulée.':`Connexion Microsoft : ${e.message}`);}finally{if(alive.current)setBusy(false);}}
  async function open(){
    request.current?.abort();const controller=new AbortController();request.current=controller;setBusy(true);const ticket=onClear();
    try{const result=await loadAnalysis(link,{signal:controller.signal,getToken:accessToken});if(alive.current&&!controller.signal.aborted){onLoad(result,ticket);onMessage('Analyse OneDrive chargée. Si un média cesse de répondre, clique sur « Ouvrir / actualiser » pour renouveler les liens (la lecture repartira au début).');}}
    catch(e){if(alive.current&&e.name!=='AbortError')onMessage(e.message);}
    finally{if(alive.current)setBusy(false);}
  }
  async function share(){
    const url=new URL(location.href);url.search='';url.hash=new URLSearchParams({onedrive:link.trim()}).toString();
    try{await navigator.clipboard.writeText(url.href);onMessage('Lien du portail copié. Le destinataire doit se connecter avec un compte autorisé sur ce dossier.');}
    catch{onMessage(`Lien à copier : ${url.href}`);}
  }
  async function logout(){
    setBusy(true);onClear();
    try{await msal.logoutPopup({account,postLogoutRedirectUri:new URL('auth.html',document.baseURI).href});setAccount(null);}
    catch{onMessage('Déconnexion incomplète. Ferme cet onglet si nécessaire.');}
    finally{if(alive.current)setBusy(false);}
  }
  return <section className="onedrive" aria-label="OneDrive"><h2>Ouvrir depuis OneDrive</h2><p>Le coach partage un dossier contenant analyse.json, les vidéos et les notes vocales.</p><div className="buttons"><button onClick={login} disabled={!initialized||busy}>{account?'Changer / reconnecter Microsoft':'Connecter Microsoft'}</button>{account&&<><span>{account.username}</span><button onClick={logout} disabled={busy}>Déconnexion</button></>}</div><label>Lien de partage du dossier<input type="url" value={link} onChange={e=>setLink(e.target.value)} placeholder="https://1drv.ms/f/…" disabled={busy}/></label><div className="buttons"><button className="primary" onClick={open} disabled={!account||!link.trim()||busy}>{busy?'Opération en cours…':'Ouvrir / actualiser'}</button><button onClick={share} disabled={!link.trim()||busy}>Copier le lien du portail</button></div></section>;
}
