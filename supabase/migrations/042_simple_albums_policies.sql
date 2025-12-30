-- Migration simplifiée pour les politiques du bucket "albums"
-- Version de test - moins restrictive pour diagnostiquer le problème

-- Supprimer toutes les politiques existantes
DROP POLICY IF EXISTS "Public Access for albums" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload albums" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own albums" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own albums" ON storage.objects;
DROP POLICY IF EXISTS "Simple upload albums" ON storage.objects;
DROP POLICY IF EXISTS "Simple update albums" ON storage.objects;
DROP POLICY IF EXISTS "Simple delete albums" ON storage.objects;

-- 1. Lecture publique
CREATE POLICY "Public Access for albums"
ON storage.objects FOR SELECT
USING (bucket_id = 'albums');

-- 2. Upload simplifié - tous les utilisateurs authentifiés peuvent uploader dans albums/
CREATE POLICY "Simple upload albums"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'albums' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = 'albums'
);

-- 3. Update simplifié
CREATE POLICY "Simple update albums"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'albums' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = 'albums'
)
WITH CHECK (
  bucket_id = 'albums' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = 'albums'
);

-- 4. Delete simplifié
CREATE POLICY "Simple delete albums"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'albums' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = 'albums'
);

