# Guide pour réinitialiser complètement la base de données

Ce guide explique comment supprimer **TOUS** les enregistrements de la base de données pour recommencer à zéro.

## ⚠️ ATTENTION CRITIQUE

**Cette opération est IRRÉVERSIBLE!**

- ✅ La **structure** des tables sera préservée (colonnes, contraintes, index, etc.)
- ❌ **TOUTES les données** seront définitivement supprimées :
  - Tous les utilisateurs
  - Tous les profils
  - Toutes les demandes de compagnie
  - Toutes les offres et candidatures
  - Tous les messages et conversations
  - Tous les avis/notes
  - Toutes les photos
  - Et toutes les autres données

**Faites une sauvegarde complète avant d'exécuter cette migration!**

## Méthode 1 : Via la migration SQL (Recommandée)

### Étape 1 : Exécuter la migration

La migration `036_reset_all_data.sql` supprime automatiquement tous les enregistrements de toutes les tables.

**Pour exécuter la migration :**

1. **Via Supabase CLI :**
   ```bash
   supabase db push
   ```

2. **Via le Dashboard Supabase :**
   - Allez dans **SQL Editor**
   - Copiez le contenu de `supabase/migrations/036_reset_all_data.sql`
   - Collez et exécutez le script
   - **Confirmez** que vous voulez supprimer toutes les données

### Étape 2 : Vérifier la réinitialisation

La migration affiche automatiquement un rapport de vérification à la fin, montrant que toutes les tables sont vides.

## Méthode 2 : Via le script Node.js (Alternative)

Si la migration SQL ne fonctionne pas, utilisez le script Node.js.

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

**Important :** Utilisez la **Service Role Key**, pas l'anon key.

### Étape 3 : Exécuter le script

```bash
node supabase/scripts/reset_database.js
```

## Méthode 3 : Via TRUNCATE (Méthode rapide)

Si vous avez accès direct à la base de données avec les privilèges nécessaires :

```sql
-- Désactiver les contraintes de clés étrangères temporairement
SET session_replication_role = 'replica';

-- Vider toutes les tables
TRUNCATE TABLE 
  messages,
  conversations,
  offer_applications,
  offers,
  user_album_photos,
  push_tokens,
  user_likes,
  blocked_users,
  ratings,
  info_access_requests,
  bookings,
  subscriptions,
  profiles
CASCADE;

-- Supprimer tous les utilisateurs de auth.users
DO $$
DECLARE
  user_id UUID;
BEGIN
  FOR user_id IN SELECT id FROM auth.users
  LOOP
    DELETE FROM auth.users WHERE id = user_id;
  END LOOP;
END $$;

-- Réactiver les contraintes
SET session_replication_role = 'origin';
```

## Tables vidées

La migration supprime les données de toutes ces tables :

1. **messages** - Tous les messages
2. **conversations** - Toutes les conversations
3. **offer_applications** - Toutes les candidatures aux offres
4. **offers** - Toutes les offres
5. **user_album_photos** - Toutes les photos d'album
6. **push_tokens** - Tous les tokens de notification
7. **user_likes** - Tous les likes
8. **blocked_users** - Tous les blocages
9. **ratings** - Tous les avis/notes
10. **info_access_requests** - Toutes les demandes d'accès
11. **bookings** - Toutes les demandes de compagnie
12. **subscriptions** - Tous les abonnements
13. **profiles** - Tous les profils
14. **auth.users** - Tous les utilisateurs

## Vérification après réinitialisation

Après la réinitialisation, vérifiez que toutes les tables sont vides :

```sql
-- Vérifier le nombre d'enregistrements dans chaque table
SELECT 
  'auth.users' as table_name,
  COUNT(*) as count
FROM auth.users
UNION ALL
SELECT 'profiles', COUNT(*) FROM profiles
UNION ALL
SELECT 'bookings', COUNT(*) FROM bookings
UNION ALL
SELECT 'offers', COUNT(*) FROM offers
UNION ALL
SELECT 'offer_applications', COUNT(*) FROM offer_applications
UNION ALL
SELECT 'ratings', COUNT(*) FROM ratings
UNION ALL
SELECT 'messages', COUNT(*) FROM messages
UNION ALL
SELECT 'conversations', COUNT(*) FROM conversations
UNION ALL
SELECT 'user_likes', COUNT(*) FROM user_likes
UNION ALL
SELECT 'blocked_users', COUNT(*) FROM blocked_users
UNION ALL
SELECT 'user_album_photos', COUNT(*) FROM user_album_photos
UNION ALL
SELECT 'push_tokens', COUNT(*) FROM push_tokens
UNION ALL
SELECT 'subscriptions', COUNT(*) FROM subscriptions
UNION ALL
SELECT 'info_access_requests', COUNT(*) FROM info_access_requests;
```

Tous les compteurs doivent être à **0**.

## Après la réinitialisation

Une fois la base de données réinitialisée :

1. ✅ La structure des tables est intacte
2. ✅ Toutes les migrations sont toujours appliquées
3. ✅ Vous pouvez créer de nouveaux utilisateurs
4. ✅ L'application fonctionnera normalement avec une base vide

## Sauvegarde recommandée

Avant d'exécuter cette migration, faites une sauvegarde :

```bash
# Via Supabase CLI
supabase db dump -f backup.sql

# Ou via le dashboard Supabase
# Settings → Database → Backups → Create backup
```

## Problèmes courants

### Erreur de permissions

Si vous obtenez une erreur de permissions, utilisez la **Service Role Key** dans le script Node.js.

### Tables non vidées

Si certaines tables ne sont pas vidées :
1. Vérifiez les logs pour voir les erreurs
2. Vérifiez les contraintes de clés étrangères
3. Supprimez manuellement les enregistrements restants

### Erreur avec auth.users

La suppression depuis `auth.users` nécessite des privilèges élevés. Si cela échoue :
- Utilisez le script Node.js avec la Service Role Key
- Ou supprimez manuellement via le dashboard Supabase

