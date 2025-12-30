-- Migration simplifiée pour les politiques du bucket "avatars"
-- Version de test - moins restrictive pour diagnostiquer le problème

-- Supprimer toutes les politiques existantes
DROP POLICY IF EXISTS "Public Access for avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Simple upload avatars" ON storage.objects;

-- 1. Lecture publique
CREATE POLICY "Public Access for avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- 2. Upload simplifié - tous les utilisateurs authentifiés peuvent uploader dans profiles/
CREATE POLICY "Simple upload avatars"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = 'profiles'
);

-- 3. Update simplifié
CREATE POLICY "Simple update avatars"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = 'profiles'
)
WITH CHECK (
  bucket_id = 'avatars' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = 'profiles'
);

-- 4. Delete simplifié
CREATE POLICY "Simple delete avatars"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = 'profiles'
);

