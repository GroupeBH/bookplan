-- Migration pour créer les politiques de sécurité du bucket "avatars"
-- Ce bucket stocke uniquement les photos de profil des utilisateurs (dossier profiles/)

-- 1. Politique pour permettre la lecture publique de toutes les photos
-- Tous les utilisateurs (authentifiés et non authentifiés) peuvent lire les fichiers
CREATE POLICY "Public Access for avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- 2. Politique pour permettre l'upload de photos de profil uniquement aux utilisateurs authentifiés
-- Les utilisateurs peuvent uploader dans le dossier profiles/ (format: profiles/{userId}-{timestamp}.{ext})
-- Le nom du fichier commence par {userId}- pour garantir que l'utilisateur upload uniquement ses propres photos
CREATE POLICY "Authenticated users can upload avatars"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = 'profiles'
  AND (storage.foldername(name))[2] LIKE (auth.uid()::text || '-%')
);

-- 3. Politique pour permettre la mise à jour de ses propres photos de profil
-- Les utilisateurs peuvent mettre à jour uniquement leurs propres fichiers (nom commence par leur user_id)
CREATE POLICY "Users can update own avatars"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = 'profiles'
  AND (storage.foldername(name))[2] LIKE (auth.uid()::text || '-%')
)
WITH CHECK (
  bucket_id = 'avatars' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = 'profiles'
  AND (storage.foldername(name))[2] LIKE (auth.uid()::text || '-%')
);

-- 4. Politique pour permettre la suppression de ses propres photos de profil
-- Les utilisateurs peuvent supprimer uniquement leurs propres fichiers (nom commence par leur user_id)
CREATE POLICY "Users can delete own avatars"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = 'profiles'
  AND (storage.foldername(name))[2] LIKE (auth.uid()::text || '-%')
);

