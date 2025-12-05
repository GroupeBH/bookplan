# Guide Rapide : Déployer la Fonction Push Notification

## 🚀 Méthode la plus simple (avec npx)

Vous n'avez pas besoin d'installer Supabase CLI. Utilisez `npx` :

### 1. Se connecter à Supabase

```bash
cd D:\labs\bookplan
npx supabase login
```

Cela ouvrira votre navigateur pour vous connecter.

### 2. Lier votre projet

Trouvez d'abord votre **Project Reference ID** :
1. Allez sur https://supabase.com/dashboard
2. Sélectionnez votre projet
3. Allez dans **Settings** > **General**
4. Copiez le **Reference ID** (ex: `etmfpkoghsvkrvbxazlt`)

Ensuite, liez le projet :

```bash
npx supabase link --project-ref VOTRE_PROJECT_REF_ICI
```

### 3. Déployer la fonction

```bash
npx supabase functions deploy send-push-notification
```

## ✅ Vérification

Une fois déployé, vous pouvez tester la fonction :

```bash
# Vérifier que la fonction est déployée
npx supabase functions list

# Voir les logs
npx supabase functions logs send-push-notification
```

## 📝 Alternative : Déploiement via Dashboard Supabase

Si vous préférez ne pas utiliser la CLI, vous pouvez aussi :

1. Allez sur https://supabase.com/dashboard
2. Sélectionnez votre projet
3. Allez dans **Edge Functions**
4. Cliquez sur **Create a new function**
5. Nommez-la `send-push-notification`
6. Copiez le contenu de `supabase/functions/send-push-notification/index.ts`
7. Collez-le dans l'éditeur
8. Cliquez sur **Deploy**

## 🔧 Configuration requise

La fonction utilise automatiquement :
- `SUPABASE_URL` - Disponible automatiquement dans les Edge Functions
- `SUPABASE_SERVICE_ROLE_KEY` - Disponible automatiquement dans les Edge Functions

Vous n'avez **pas besoin** de configurer ces variables manuellement.

## 🧪 Test rapide

Une fois déployé, testez depuis votre app React Native :

```typescript
import { sendPushNotification } from '../lib/pushNotifications';

// Test avec votre propre ID utilisateur
const result = await sendPushNotification({
  userId: 'votre-user-id',
  title: 'Test',
  body: 'Ceci est un test de notification',
});

console.log('Résultat:', result);
```



