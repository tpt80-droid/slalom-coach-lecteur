# Sortir les fichiers du dossier privé Android

Dans ton dernier App.js, à l'intérieur de `shareCloudAnalysis`, repère :

```js
Alert.alert('Export local terminé', createdPaths.join('\n\n'));
```

Remplace UNIQUEMENT cette ligne par :

```js
const proposeShare = (index = 0) => {
  if (index >= createdPaths.length) return;
  const path = createdPaths[index];
  Alert.alert(
    `Partager le fichier ${index + 1}/${createdPaths.length}`,
    path.split('/').pop(),
    [
      { text: 'Fermer', style: 'cancel' },
      { text: 'Passer', onPress: () => proposeShare(index + 1) },
      {
        text: 'Partager',
        onPress: async () => {
          try {
            if (!await Sharing.isAvailableAsync()) {
              throw new Error('Partage indisponible sur cet appareil.');
            }
            await Sharing.shareAsync(path, {
              ...(path.endsWith('.json')
                ? { mimeType: 'application/json', UTI: 'public.json' }
                : {}),
              dialogTitle: path.split('/').pop(),
            });
            if (mountedRef.current) proposeShare(index + 1);
          } catch (error) {
            Alert.alert('Partage impossible', error.message);
          }
        },
      },
    ]
  );
};
Alert.alert('Export local terminé', createdPaths.join('\n\n'), [
  { text: 'Fermer', style: 'cancel' },
  { text: 'Partager les fichiers', onPress: () => proposeShare() },
]);
```

L'import `Sharing` est déjà présent dans App.js. Cette modification utilise le partage natif, fichier par fichier. Tu choisis toi-même la destination (OneDrive installé, messagerie, etc.) : ce n'est pas encore une intégration Microsoft Graph. Les fichiers sont copiés par le système de partage, sans conversion complète en base64 dans JavaScript.

Pour tester le portail, rassemble les fichiers reçus dans un même dossier. Si une application de transfert les renomme, utilise les sélecteurs individuels du portail.
