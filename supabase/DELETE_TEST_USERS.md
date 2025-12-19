# Guide pour supprimer les utilisateurs fictifs

Ce guide explique comment supprimer les utilisateurs fictifs créés pour les tests de l'application.

## ⚠️ ATTENTION

**Cette opération est irréversible!** Toutes les données des utilisateurs fictifs seront définitivement supprimées, y compris :
- Profils
- Bookings (demandes de compagnie)
- Offres et candidatures
- Notes/avis
- Messages et conversations
- Photos d'album
- Likes
- Abonnements
- Et toutes les autres données associées

## Méthode 1 : Via la migration SQL (Recommandée)

### Étape 1 : Exécuter la migration

La migration `035_delete_test_users.sql` supprime automatiquement tous les utilisateurs fictifs identifiés par :
- Emails de test : `amina.test@kutana.com`, `joel.test@kutana.com`, `amina.test@bookplan.com`, `joel.test@bookplan.com`
- Téléphones de test : `+243900000001`, `+243900000002`
- Pseudos de test : `Amina`, `Joël`
- IDs spécifiques : `a1b2c3d4-e5f6-4789-a012-b3c4d5e6f789`, `b2c3d4e5-f6a7-4890-b123-c4d5e6f7a890`

**Pour exécuter la migration :**

1. Via Supabase CLI :
   ```bash
   supabase db push
   ```

2. Via le dashboard Supabase :
   - Allez dans **SQL Editor**
   - Copiez le contenu de `supabase/migrations/035_delete_test_users.sql`
   - Collez et exécutez le script

### Étape 2 : Vérifier la suppression

La migration affiche automatiquement un rapport de vérification à la fin.

## Méthode 2 : Via le script Node.js (Alternative)

Si la migration SQL ne fonctionne pas (problèmes de permissions), utilisez le script Node.js.

### Étape 1 : Installer les dépendances

```bash
npm install @supabase/supabase-js dotenv
```

### Étape 2 : Configurer les variables d'environnement

Créez un fichier `.env` à la racine du projet avec :

```env
SUPABASE_URL=votre_url_supabase
SUPABASE_SERVICE_ROLE_KEY=votre_service_role_key
```

**Important :** Utilisez la **Service Role Key**, pas l'anon key. Vous la trouvez dans :
- Supabase Dashboard → Settings → API → `service_role` key

### Étape 3 : Exécuter le script

```bash
node supabase/scripts/delete_test_users.js
```

Le script vous demandera confirmation avant de supprimer les utilisateurs.

## Méthode 3 : Via le Dashboard Supabase (Manuelle)

1. Allez dans **Authentication** → **Users**
2. Recherchez les utilisateurs par email, téléphone ou pseudo
3. Pour chaque utilisateur fictif :
   - Cliquez sur les trois points (⋯)
   - Sélectionnez **Delete user**
   - Confirmez la suppression

**Note :** Cette méthode supprime automatiquement toutes les données associées grâce aux contraintes `ON DELETE CASCADE`.

## Vérification après suppression

Après la suppression, vérifiez qu'il ne reste plus d'utilisateurs fictifs :

```sql
-- Vérifier les emails de test
SELECT id, email, phone FROM auth.users
WHERE email LIKE '%test%@%' 
   OR email LIKE '%@kutana.com' 
   OR email LIKE '%@bookplan.com';

-- Vérifier les téléphones de test
SELECT id, email, phone FROM auth.users
WHERE phone IN ('+243900000001', '+243900000002');

-- Vérifier les pseudos de test
SELECT id, pseudo FROM profiles
WHERE pseudo IN ('Amina', 'Joël');
```

Si ces requêtes ne retournent aucun résultat, la suppression a réussi.

## Tables affectées par la suppression

Lors de la suppression d'un utilisateur, les données suivantes sont automatiquement supprimées (grâce à `ON DELETE CASCADE`) :

- ✅ `profiles` - Profil utilisateur
- ✅ `bookings` - Demandes de compagnie (en tant que requester ou provider)
- ✅ `info_access_requests` - Demandes d'accès (en tant que requester ou target)
- ✅ `ratings` - Notes/avis (en tant que rater ou rated)
- ✅ `subscriptions` - Abonnements
- ✅ `offers` - Offres créées
- ✅ `offer_applications` - Candidatures aux offres
- ✅ `user_likes` - Likes donnés et reçus
- ✅ `blocked_users` - Utilisateurs bloqués
- ✅ `conversations` - Conversations (en tant que user1 ou user2)
- ✅ `messages` - Messages envoyés
- ✅ `user_album_photos` - Photos d'album
- ✅ `push_tokens` - Tokens de notification push

## Problèmes courants

### Erreur de permissions

Si vous obtenez une erreur de permissions lors de l'exécution de la migration SQL, utilisez la **Méthode 2** (script Node.js) avec la Service Role Key.

### Utilisateurs non supprimés

Si certains utilisateurs ne sont pas supprimés, vérifiez :
1. Que leurs identifiants correspondent aux critères de recherche
2. Que vous avez les permissions nécessaires
3. Les logs pour voir les erreurs spécifiques

## Support

Si vous rencontrez des problèmes, vérifiez :
- Les logs de la migration/script
- Les permissions de votre compte Supabase
- Que la Service Role Key est correcte (pour le script Node.js)

