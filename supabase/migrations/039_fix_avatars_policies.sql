-- Migration pour corriger les politiques de sécurité du bucket "avatars"
-- Cette migration supprime les anciennes politiques et les recrée avec une syntaxe corrigée

-- Supprimer les anciennes politiques si elles existent
DROP POLICY IF EXISTS "Public Access for avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatars" ON storage.objects;

-- 1. Politique pour permettre la lecture publique de toutes les photos
CREATE POLICY "Public Access for avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- 2. Politique pour permettre l'upload de photos de profil uniquement aux utilisateurs authentifiés
-- Format du chemin: profiles/{userId}-{timestamp}.{ext}
CREATE POLICY "Authenticated users can upload avatars"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = 'profiles'
  AND split_part((storage.foldername(name))[2], '-', 1) = auth.uid()::text
);

-- 3. Politique pour permettre la mise à jour de ses propres photos de profil
CREATE POLICY "Users can update own avatars"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = 'profiles'
  AND split_part((storage.foldername(name))[2], '-', 1) = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'avatars' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = 'profiles'
  AND split_part((storage.foldername(name))[2], '-', 1) = auth.uid()::text
);

-- 4. Politique pour permettre la suppression de ses propres photos de profil
CREATE POLICY "Users can delete own avatars"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = 'profiles'
  AND split_part((storage.foldername(name))[2], '-', 1) = auth.uid()::text
);

