-- Migration pour créer les politiques de sécurité du bucket "albums"
-- Ce bucket stocke les photos d'album des utilisateurs (jusqu'à 5 photos par utilisateur)

-- 1. Politique pour permettre la lecture publique de toutes les photos d'album
-- Tous les utilisateurs (authentifiés et non authentifiés) peuvent lire les fichiers
CREATE POLICY "Public Access for albums"
ON storage.objects FOR SELECT
USING (bucket_id = 'albums');

-- 2. Politique pour permettre l'upload de photos d'album uniquement aux utilisateurs authentifiés
-- Les utilisateurs peuvent uploader dans le dossier albums/ (format: albums/{userId}-{timestamp}.{ext})
-- Le nom du fichier commence par {userId}- pour garantir que l'utilisateur upload uniquement ses propres photos
CREATE POLICY "Authenticated users can upload album photos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'albums' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = 'albums'
  AND (storage.foldername(name))[2] LIKE (auth.uid()::text || '-%')
);

-- 3. Politique pour permettre la mise à jour de ses propres photos d'album
-- Les utilisateurs peuvent mettre à jour uniquement leurs propres fichiers (nom commence par leur user_id)
CREATE POLICY "Users can update own album photos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'albums' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = 'albums'
  AND (storage.foldername(name))[2] LIKE (auth.uid()::text || '-%')
)
WITH CHECK (
  bucket_id = 'albums' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = 'albums'
  AND (storage.foldername(name))[2] LIKE (auth.uid()::text || '-%')
);

-- 4. Politique pour permettre la suppression de ses propres photos d'album
-- Les utilisateurs peuvent supprimer uniquement leurs propres fichiers (nom commence par leur user_id)
CREATE POLICY "Users can delete own album photos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'albums' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = 'albums'
  AND (storage.foldername(name))[2] LIKE (auth.uid()::text || '-%')
);

