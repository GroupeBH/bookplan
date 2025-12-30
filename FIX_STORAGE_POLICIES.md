# Correction des politiques de stockage Supabase

## Problème
Erreur lors de l'upload de photos : `StorageApiError: new row violates row-level security policy`

## Solution

Les politiques RLS pour les buckets `avatars` et `albums` doivent être appliquées dans Supabase. Deux nouvelles migrations ont été créées pour corriger et simplifier les politiques.

### Option 1 : Appliquer les migrations via Supabase CLI (Recommandé)

```bash
# Appliquer les migrations
npx supabase db push

# Ou si vous utilisez Supabase CLI directement
supabase db push
```

### Option 2 : Appliquer manuellement dans Supabase Dashboard

1. Allez dans **Supabase Dashboard** → **SQL Editor**
2. Exécutez d'abord la migration `039_fix_avatars_policies.sql` :
   - Ouvrez le fichier `supabase/migrations/039_fix_avatars_policies.sql`
   - Copiez tout le contenu
   - Collez-le dans l'éditeur SQL
   - Cliquez sur **Run**

3. Ensuite, exécutez la migration `040_fix_albums_policies.sql` :
   - Ouvrez le fichier `supabase/migrations/040_fix_albums_policies.sql`
   - Copiez tout le contenu
   - Collez-le dans l'éditeur SQL
   - Cliquez sur **Run**

### Option 3 : Vérifier et créer les politiques manuellement

Si les migrations ne fonctionnent pas, vous pouvez créer les politiques directement dans Supabase Dashboard :

1. Allez dans **Storage** → **Policies** pour le bucket `avatars`
2. Supprimez toutes les politiques existantes
3. Créez les nouvelles politiques avec ces conditions :

#### Pour INSERT (Upload) :
```sql
bucket_id = 'avatars' 
AND auth.role() = 'authenticated'
AND (storage.foldername(name))[1] = 'profiles'
AND split_part((storage.foldername(name))[2], '-', 1) = auth.uid()::text
```

#### Pour SELECT (Lecture) :
```sql
bucket_id = 'avatars'
```

#### Pour UPDATE (Mise à jour) :
```sql
bucket_id = 'avatars' 
AND auth.role() = 'authenticated'
AND (storage.foldername(name))[1] = 'profiles'
AND split_part((storage.foldername(name))[2], '-', 1) = auth.uid()::text
```

#### Pour DELETE (Suppression) :
```sql
bucket_id = 'avatars' 
AND auth.role() = 'authenticated'
AND (storage.foldername(name))[1] = 'profiles'
AND split_part((storage.foldername(name))[2], '-', 1) = auth.uid()::text
```

Répétez la même chose pour le bucket `albums` en remplaçant `'avatars'` par `'albums'` et `'profiles'` par `'albums'`.

## Vérification

Après avoir appliqué les migrations :

1. Rechargez l'application
2. Essayez d'uploader une photo de profil
3. L'upload devrait maintenant fonctionner sans erreur RLS

## Notes

- Les nouvelles migrations utilisent `split_part()` au lieu de `LIKE` pour une vérification plus précise de l'user_id
- Les politiques garantissent que chaque utilisateur ne peut uploader/modifier/supprimer que ses propres fichiers
- La lecture est publique pour permettre l'affichage des photos à tous les utilisateurs



