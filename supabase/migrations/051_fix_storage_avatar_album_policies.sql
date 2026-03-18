-- Fix robuste des policies Storage pour uploads avatars/albums.
-- Objectif: éliminer les erreurs RLS à l'upload des photos de profil et d'album.

-- =========================
-- AVATARS (bucket: avatars)
-- =========================
DROP POLICY IF EXISTS "Public Access for avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Simple upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Simple update avatars" ON storage.objects;
DROP POLICY IF EXISTS "Simple delete avatars" ON storage.objects;
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
DROP POLICY IF EXISTS "avatars_auth_insert_own_files" ON storage.objects;
DROP POLICY IF EXISTS "avatars_auth_update_own_files" ON storage.objects;
DROP POLICY IF EXISTS "avatars_auth_delete_own_files" ON storage.objects;

CREATE POLICY "avatars_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "avatars_auth_insert_own_files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = 'profiles'
  AND storage.filename(name) LIKE (auth.uid()::text || '-%')
);

CREATE POLICY "avatars_auth_update_own_files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = 'profiles'
  AND storage.filename(name) LIKE (auth.uid()::text || '-%')
)
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = 'profiles'
  AND storage.filename(name) LIKE (auth.uid()::text || '-%')
);

CREATE POLICY "avatars_auth_delete_own_files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = 'profiles'
  AND storage.filename(name) LIKE (auth.uid()::text || '-%')
);

-- =======================
-- ALBUMS (bucket: albums)
-- =======================
DROP POLICY IF EXISTS "Public Access for albums" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload album photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own album photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own album photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload albums" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own albums" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own albums" ON storage.objects;
DROP POLICY IF EXISTS "Simple upload albums" ON storage.objects;
DROP POLICY IF EXISTS "Simple update albums" ON storage.objects;
DROP POLICY IF EXISTS "Simple delete albums" ON storage.objects;
DROP POLICY IF EXISTS "albums_public_read" ON storage.objects;
DROP POLICY IF EXISTS "albums_auth_insert_own_files" ON storage.objects;
DROP POLICY IF EXISTS "albums_auth_update_own_files" ON storage.objects;
DROP POLICY IF EXISTS "albums_auth_delete_own_files" ON storage.objects;

CREATE POLICY "albums_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'albums');

CREATE POLICY "albums_auth_insert_own_files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'albums'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = 'albums'
  AND storage.filename(name) LIKE (auth.uid()::text || '-%')
);

CREATE POLICY "albums_auth_update_own_files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'albums'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = 'albums'
  AND storage.filename(name) LIKE (auth.uid()::text || '-%')
)
WITH CHECK (
  bucket_id = 'albums'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = 'albums'
  AND storage.filename(name) LIKE (auth.uid()::text || '-%')
);

CREATE POLICY "albums_auth_delete_own_files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'albums'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = 'albums'
  AND storage.filename(name) LIKE (auth.uid()::text || '-%')
);
