# Architecture des Push Notifications - Pas besoin de Firebase

## ✅ Solution actuelle : Expo Push Notification Service (EPNS)

Votre application utilise **Expo Push Notification Service (EPNS)**, qui est le service natif d'Expo. **Aucune configuration Firebase n'est nécessaire.**

### Comment ça fonctionne :

```
┌─────────────────┐
│   Votre App     │
│  (React Native) │
└────────┬────────┘
         │
         │ 1. Obtient un token Expo
         │    (ExponentPushToken[...])
         │
         ▼
┌─────────────────┐
│   Expo Servers  │
│  (EPNS Service) │
└────────┬────────┘
         │
         │ 2. Stocke le token
         │    dans Supabase
         │
         ▼
┌─────────────────┐
│    Supabase     │
│  (push_tokens)  │
└─────────────────┘
```

### Flux complet :

1. **Côté App (React Native)** :
   - L'app obtient un token Expo via `Notifications.getExpoPushTokenAsync()`
   - Le token est automatiquement enregistré dans Supabase (table `push_tokens`)
   - Format du token : `ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]`

2. **Côté Backend (Supabase Functions ou votre serveur)** :
   - Vous récupérez les tokens depuis Supabase
   - Vous envoyez les notifications via l'API Expo Push Notification Service
   - Utilisez le package `expo-server-sdk` (Node.js) ou l'API HTTP d'Expo

3. **Expo Push Notification Service** :
   - Reçoit votre requête
   - Convertit automatiquement pour Android (FCM) et iOS (APNs)
   - Envoie la notification à l'appareil

## 🔄 Comparaison : EPNS vs Firebase

### Expo Push Notification Service (EPNS) - ✅ Votre solution actuelle

**Avantages :**
- ✅ Pas besoin de Firebase
- ✅ Configuration simple (juste le project ID Expo)
- ✅ Fonctionne automatiquement avec Android (FCM) et iOS (APNs)
- ✅ Gratuit pour un usage raisonnable
- ✅ Gestion automatique des tokens
- ✅ Support natif dans Expo

**Comment envoyer des notifications :**
```javascript
// Avec expo-server-sdk (Node.js)
const { Expo } = require('expo-server-sdk');
const expo = new Expo();

const messages = [{
  to: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
  sound: 'default',
  title: 'Nouvelle demande',
  body: 'Vous avez reçu une nouvelle demande de compagnie',
  data: { bookingId: '123' },
}];

await expo.sendPushNotificationsAsync(messages);
```

### Firebase Cloud Messaging (FCM) - ❌ Pas nécessaire

**Si vous utilisiez Firebase directement :**
- ❌ Nécessiterait la configuration Firebase
- ❌ Nécessiterait les fichiers `google-services.json` (Android) et certificats iOS
- ❌ Plus complexe à configurer
- ❌ Nécessiterait Firebase SDK dans votre app

**Mais avec Expo, vous n'en avez pas besoin !** Expo gère FCM en arrière-plan pour vous.

## 📋 Ce dont vous avez besoin

### ✅ Déjà configuré :
1. ✅ Project ID Expo : `4f1f2d3b-815d-48ff-9d5a-0e61d16ae278`
2. ✅ Table `push_tokens` dans Supabase
3. ✅ Code pour obtenir et enregistrer les tokens
4. ✅ Plugin `expo-notifications` configuré

### 📝 Pour envoyer des notifications depuis votre backend :

**Option 1 : Supabase Edge Functions (Recommandé)**

Créez une Edge Function dans Supabase qui utilise `expo-server-sdk` :

```typescript
// supabase/functions/send-push-notification/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { Expo } from 'https://esm.sh/expo-server-sdk@3.7.0'

const expo = new Expo()

serve(async (req) => {
  const { token, title, body, data } = await req.json()
  
  const messages = [{
    to: token,
    sound: 'default',
    title,
    body,
    data,
  }]
  
  const chunks = expo.chunkPushNotifications(messages)
  const tickets = []
  
  for (const chunk of chunks) {
    const ticketChunk = await expo.sendPushNotificationsAsync(chunk)
    tickets.push(...ticketChunk)
  }
  
  return new Response(JSON.stringify({ success: true, tickets }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
```

**Option 2 : Votre serveur Node.js**

```javascript
// server.js
const { Expo } = require('expo-server-sdk');
const { createClient } = require('@supabase/supabase-js');

const expo = new Expo();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function sendPushNotification(userId, title, body, data) {
  // Récupérer le token depuis Supabase
  const { data: tokens } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('user_id', userId);
  
  if (!tokens || tokens.length === 0) {
    console.log('No push token found for user:', userId);
    return;
  }
  
  // Envoyer la notification
  const messages = tokens.map(token => ({
    to: token.token,
    sound: 'default',
    title,
    body,
    data,
  }));
  
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

## 🎯 Résumé

| Question | Réponse |
|----------|---------|
| **Besoin de Firebase ?** | ❌ Non |
| **Service utilisé ?** | ✅ Expo Push Notification Service (EPNS) |
| **Configuration nécessaire ?** | ✅ Project ID Expo (déjà fait) |
| **Fonctionne avec Android ?** | ✅ Oui (Expo utilise FCM en arrière-plan) |
| **Fonctionne avec iOS ?** | ✅ Oui (Expo utilise APNs en arrière-plan) |
| **Gratuit ?** | ✅ Oui, pour un usage raisonnable |

## 📚 Ressources

- [Documentation Expo Push Notifications](https://docs.expo.dev/push-notifications/overview/)
- [Expo Server SDK](https://github.com/expo/expo-server-sdk-node)
- [API Expo Push Notifications](https://docs.expo.dev/push-notifications/sending-notifications/)

## 🔍 Vérification

Pour vérifier que tout fonctionne :

1. **Dans votre app** : Le token devrait être affiché dans les logs :
   ```
   📱 Push notification token: ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]
   ✅ Push token enregistré dans Supabase
   ```

2. **Dans Supabase** : Vérifiez la table `push_tokens` :
   ```sql
   SELECT * FROM push_tokens WHERE user_id = 'votre-user-id';
   ```

3. **Tester l'envoi** : Utilisez l'outil de test d'Expo :
   - Allez sur https://expo.dev/notifications
   - Entrez votre token
   - Envoyez une notification de test






