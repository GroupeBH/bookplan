# Guide de Configuration des Push Notifications

## ⚠️ Important
Les push notifications **ne fonctionnent PAS dans Expo Go** avec SDK 53+. Vous devez créer un **development build** ou un **production build** pour utiliser les push notifications.

## Étape 1 : Installer EAS CLI

```bash
npm install -g eas-cli
```

## Étape 2 : Se connecter à Expo

```bash
eas login
```

## Étape 3 : Initialiser EAS dans votre projet

```bash
eas init
```

Cela créera un fichier `eas.json` dans votre projet.

## Étape 4 : Configurer app.json

Ajoutez la configuration suivante dans votre `app.json` :

```json
{
  "expo": {
    "extra": {
      "eas": {
        "projectId": "votre-project-id-ici"
      }
    },
    "plugins": [
      [
        "expo-notifications",
        {
          "icon": "./assets/images/notification-icon.png",
          "color": "#ffffff",
          "sounds": ["./assets/sounds/notification.wav"]
        }
      ]
    ]
  }
}
```

## Étape 5 : Créer un Development Build

### Pour Android :
```bash
eas build --profile development --platform android
```

### Pour iOS :
```bash
eas build --profile development --platform ios
```

### Pour les deux :
```bash
eas build --profile development --platform all
```

## Étape 6 : Installer le build sur votre appareil

Une fois le build terminé, EAS vous donnera un lien pour télécharger et installer l'application sur votre appareil.

## Étape 7 : Obtenir le Project ID

Après avoir exécuté `eas init`, votre `projectId` sera automatiquement ajouté dans `app.json` sous `extra.eas.projectId`.

Si vous n'avez pas encore de project ID, vous pouvez le créer manuellement :

1. Allez sur https://expo.dev
2. Créez un nouveau projet
3. Copiez le Project ID
4. Ajoutez-le dans `app.json` :

```json
{
  "expo": {
    "extra": {
      "eas": {
        "projectId": "votre-project-id"
      }
    }
  }
}
```

## Étape 8 : Configurer les certificats (iOS uniquement)

Pour iOS, vous devez configurer les certificats push :

```bash
eas credentials
```

Sélectionnez votre projet et suivez les instructions pour configurer les certificats Apple Push Notification.

## Étape 9 : Tester les push notifications

Une fois le development build installé, les push notifications devraient fonctionner. Le token push sera automatiquement récupéré et affiché dans les logs.

## Envoyer des push notifications depuis votre backend

### Utiliser Expo Push Notification Service

```javascript
// Exemple avec Node.js
const { Expo } = require('expo-server-sdk');

const expo = new Expo();

async function sendPushNotification(pushToken, title, body, data) {
  const messages = [{
    to: pushToken,
    sound: 'default',
    title: title,
    body: body,
    data: data,
  }];

  const chunks = expo.chunkPushNotifications(messages);
  const tickets = [];

  for (const chunk of chunks) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);
    } catch (error) {
      console.error('Error sending push notification:', error);
    }
  }

  return tickets;
}
```

### Stocker les tokens dans Supabase

Créez une table pour stocker les tokens push :

```sql
CREATE TABLE push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  token TEXT NOT NULL,
  platform TEXT NOT NULL, -- 'ios' ou 'android'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, token)
);
```

## Alternative : Utiliser Supabase Realtime pour les notifications

Si vous ne pouvez pas utiliser les push notifications, vous pouvez utiliser Supabase Realtime pour envoyer des notifications en temps réel via WebSocket.

## Résumé

1. ✅ Installer EAS CLI
2. ✅ Se connecter à Expo
3. ✅ Initialiser EAS (`eas init`)
4. ✅ Configurer `app.json` avec le project ID
5. ✅ Créer un development build (`eas build`)
6. ✅ Installer le build sur votre appareil
7. ✅ Configurer les certificats iOS (si nécessaire)
8. ✅ Tester les notifications

## Notes importantes

- Les push notifications ne fonctionnent que sur des appareils physiques (pas sur les simulateurs/émulateurs)
- Vous devez avoir un compte Expo gratuit ou payant
- Les development builds expirent après 30 jours (gratuit) ou sont illimités (payant)
- Pour la production, créez un build de production avec `eas build --profile production`












