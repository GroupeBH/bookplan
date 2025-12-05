# Configuration des Push Notifications avec Supabase

## 📋 Vue d'ensemble

Cette solution utilise **Supabase Edge Functions** pour envoyer des push notifications via **Expo Push Notification Service (EPNS)**. Aucune configuration Firebase n'est nécessaire.

## 🏗️ Architecture

```
┌─────────────────┐
│  React Native   │
│      App        │
└────────┬────────┘
         │
         │ 1. Appel HTTP POST
         │
         ▼
┌─────────────────┐
│ Supabase Edge   │
│   Function      │
│ send-push-      │
│ notification    │
└────────┬────────┘
         │
         │ 2. Récupère tokens depuis Supabase
         │
         ▼
┌─────────────────┐
│  Expo Push      │
│ Notification    │
│    Service      │
└────────┬────────┘
         │
         │ 3. Envoie notification
         │
         ▼
┌─────────────────┐
│   Appareil      │
│   Utilisateur   │
└─────────────────┘
```

## 📦 Fichiers créés

1. **`supabase/functions/send-push-notification/index.ts`**
   - Edge Function Supabase qui envoie les notifications
   - Utilise `expo-server-sdk` pour communiquer avec Expo

2. **`lib/pushNotifications.ts`**
   - Utilitaire TypeScript pour appeler la Edge Function depuis votre app
   - Fonctions helper pour différents types de notifications

3. **`supabase/migrations/028_create_send_push_notification_function.sql`**
   - Fonctions SQL helper (optionnel, pour référence)

## 🚀 Déploiement de la Edge Function

### Étape 1 : Installer Supabase CLI

**⚠️ Important** : Supabase CLI ne peut pas être installé via `npm install -g`. Utilisez une des méthodes suivantes :

#### Option A : Utiliser npx (Recommandé - Pas d'installation nécessaire)

Vous pouvez utiliser `npx` pour exécuter Supabase CLI sans l'installer :

```bash
npx supabase --version
```

#### Option B : Installer avec Scoop (Windows)

```powershell
# Installer Scoop d'abord (si pas déjà installé)
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
irm get.scoop.sh | iex

# Installer Supabase CLI
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

#### Option C : Télécharger depuis GitHub

1. Allez sur https://github.com/supabase/cli/releases
2. Téléchargez `supabase_windows_amd64.zip`
3. Extrayez et ajoutez au PATH

### Étape 2 : Se connecter à Supabase

**Si vous utilisez npx :**
```bash
npx supabase login
```

**Si vous avez installé Supabase CLI :**
```bash
supabase login
```

### Étape 3 : Lier votre projet

**Si vous utilisez npx :**
```bash
cd D:\labs\bookplan
npx supabase link --project-ref votre-project-ref
```

**Si vous avez installé Supabase CLI :**
```bash
cd D:\labs\bookplan
supabase link --project-ref votre-project-ref
```

Pour trouver votre `project-ref` :
1. Allez sur https://supabase.com/dashboard
2. Sélectionnez votre projet
3. Allez dans **Settings** > **General**
4. Copiez le **Reference ID** (format : `xxxxxxxxxxxxxxxxxx`)

### Étape 4 : Déployer la Edge Function

**Si vous utilisez npx :**
```bash
npx supabase functions deploy send-push-notification
```

**Si vous avez installé Supabase CLI :**
```bash
supabase functions deploy send-push-notification
```

### Étape 5 : Configurer les secrets (si nécessaire)

Les variables d'environnement `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont automatiquement disponibles dans les Edge Functions Supabase. Vous n'avez pas besoin de les configurer manuellement.

## 💻 Utilisation dans votre code

### Exemple 1 : Envoyer une notification simple

```typescript
import { sendPushNotification } from '../lib/pushNotifications';

// Dans votre code (par exemple, après qu'un utilisateur accepte une demande)
const result = await sendPushNotification({
  userId: 'user-uuid-here',
  title: 'Demande acceptée',
  body: 'Votre demande de compagnie a été acceptée !',
  data: {
    bookingId: 'booking-uuid',
    type: 'booking_accepted',
  },
});

if (result.success) {
  console.log(`✅ Notification envoyée à ${result.sent} appareil(s)`);
} else {
  console.error('❌ Erreur:', result.error);
}
```

### Exemple 2 : Notification de booking

```typescript
import { sendBookingNotification } from '../lib/pushNotifications';

// Quand une demande est acceptée
await sendBookingNotification(
  providerUserId,
  bookingId,
  'accepted',
  'Demande acceptée',
  'Votre demande de compagnie a été acceptée !'
);
```

### Exemple 3 : Notification de message

```typescript
import { sendMessageNotification } from '../lib/pushNotifications';

// Quand un nouveau message arrive
await sendMessageNotification(
  recipientUserId,
  conversationId,
  senderName,
  messagePreview
);
```

### Exemple 4 : Dans un trigger Supabase (automatique)

Créez une migration pour déclencher automatiquement les notifications :

```sql
-- Trigger pour envoyer une notification quand une demande est acceptée
CREATE OR REPLACE FUNCTION notify_booking_accepted()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status != 'accepted' THEN
    -- Appeler la Edge Function via HTTP (nécessite pg_net extension)
    PERFORM
      net.http_post(
        url := current_setting('app.supabase_url') || '/functions/v1/send-push-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
        ),
        body := jsonb_build_object(
          'userId', NEW.requester_id,
          'title', 'Demande acceptée',
          'body', 'Votre demande de compagnie a été acceptée !',
          'data', jsonb_build_object(
            'type', 'booking',
            'bookingType', 'accepted',
            'bookingId', NEW.id
          )
        )
      );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER booking_accepted_notification
  AFTER UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION notify_booking_accepted();
```

## 🔧 Intégration dans votre code existant

### Dans BookingContext.tsx

```typescript
import { sendBookingNotification } from '../lib/pushNotifications';

// Après avoir accepté une demande
const handleAcceptBooking = async (bookingId: string) => {
  // ... votre code existant ...
  
  // Envoyer la notification
  await sendBookingNotification(
    booking.requesterId,
    bookingId,
    'accepted',
    'Demande acceptée',
    'Votre demande de compagnie a été acceptée !'
  );
};
```

### Dans MessageContext.tsx

```typescript
import { sendMessageNotification } from '../lib/pushNotifications';

// Quand un nouveau message est envoyé
const sendMessage = async (conversationId: string, content: string) => {
  // ... votre code existant ...
  
  // Envoyer la notification au destinataire
  const conversation = await getConversation(conversationId);
  const recipientId = conversation.otherUser.id;
  
  await sendMessageNotification(
    recipientId,
    conversationId,
    currentUser.pseudo,
    content.substring(0, 50) // Preview du message
  );
};
```

## 🧪 Tester les notifications

### Test manuel via curl

```bash
curl -X POST 'https://votre-projet.supabase.co/functions/v1/send-push-notification' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "userId": "user-uuid",
    "title": "Test",
    "body": "Ceci est un test",
    "data": {"test": true}
  }'
```

### Test depuis votre app

```typescript
// Dans un écran de test ou dans votre code
import { sendPushNotification } from '../lib/pushNotifications';

const testNotification = async () => {
  const result = await sendPushNotification({
    userId: currentUser.id, // Votre propre ID pour tester
    title: 'Test',
    body: 'Ceci est une notification de test',
  });
  
  console.log('Résultat:', result);
};
```

## 📝 Notes importantes

1. **Authentification** : La Edge Function nécessite un token d'authentification valide
2. **Tokens valides** : Seuls les tokens Expo valides seront utilisés (format `ExponentPushToken[...]`)
3. **Rate limiting** : Expo limite à 100 messages par requête, la fonction gère automatiquement le chunking
4. **Erreurs** : Les erreurs sont loggées mais n'empêchent pas l'envoi des autres notifications
5. **Multiple devices** : Si un utilisateur a plusieurs appareils, tous recevront la notification

## 🔍 Vérification

1. **Vérifier que la fonction est déployée** :
   ```bash
   supabase functions list
   ```

2. **Vérifier les logs** :
   ```bash
   supabase functions logs send-push-notification
   ```

3. **Vérifier dans Supabase Dashboard** :
   - Allez dans **Edge Functions** > **send-push-notification**
   - Consultez les logs et les métriques

## 🐛 Dépannage

### Erreur : "Missing authorization header"
- Assurez-vous que l'utilisateur est authentifié
- Vérifiez que le token est bien passé dans les headers

### Erreur : "No push tokens found"
- Vérifiez que l'utilisateur a bien enregistré un token push
- Vérifiez la table `push_tokens` dans Supabase

### Erreur : "No valid Expo push tokens"
- Vérifiez que les tokens sont au format `ExponentPushToken[...]`
- Vérifiez que le build est un development build (pas Expo Go)

## 📚 Ressources

- [Documentation Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Documentation Expo Push Notifications](https://docs.expo.dev/push-notifications/overview/)
- [Expo Server SDK](https://github.com/expo/expo-server-sdk-node)

