import {PublicClientApplication, InteractionRequiredAuthError} from '@azure/msal-browser';

export const msal = new PublicClientApplication({
  auth: {clientId:'08d02d32-d154-4760-a5f4-6b6b766fa1ef', authority:'https://login.microsoftonline.com/common', redirectUri:new URL('auth.html',document.baseURI).href},
  cache: {cacheLocation:'sessionStorage'}
});
export const ready = msal.initialize();
const scopes=['Files.ReadWrite'];
export async function connect(){
  await ready;
  const result=await msal.loginPopup({scopes,prompt:'select_account'});
  msal.setActiveAccount(result.account);
  return result.account;
}
export async function accessToken(){
  await ready;
  const account=msal.getActiveAccount();
  if(!account)throw new Error('Connecte ton compte Microsoft avant d’ouvrir le dossier.');
  try{return (await msal.acquireTokenSilent({scopes,account})).accessToken;}
  catch(error){
    if(error instanceof InteractionRequiredAuthError)throw new Error('Ta connexion nécessite une confirmation. Clique à nouveau sur « Connecter Microsoft », puis ouvre le dossier.');
    throw error;
  }
}
