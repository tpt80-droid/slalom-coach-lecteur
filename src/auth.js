import {broadcastResponseToMainFrame} from '@azure/msal-browser/redirect-bridge';
if(location.hash||location.search){
  broadcastResponseToMainFrame().catch(()=>{document.getElementById('status').textContent='Connexion non terminée. Ferme cette fenêtre et réessaie depuis le portail.';});
}else{document.getElementById('status').textContent='Tu peux fermer cette fenêtre et revenir au portail.';}
