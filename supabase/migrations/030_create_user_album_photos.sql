-- Migration pour créer la table user_album_photos
-- Permet aux utilisateurs d'ajouter jusqu'à 5 photos dans leur album

-- Créer la table user_album_photos
CREATE TABLE IF NOT EXISTS user_album_photos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  photo_url TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_user_photo_order UNIQUE (user_id, display_order)
);

-- Créer un index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_user_album_photos_user_id ON user_album_photos(user_id);
CREATE INDEX IF NOT EXISTS idx_user_album_photos_display_order ON user_album_photos(user_id, display_order);

-- Activer Row Level Security (RLS)
ALTER TABLE user_album_photos ENABLE ROW LEVEL SECURITY;

-- Politique : Tous les utilisateurs peuvent voir les photos d'album
CREATE POLICY "Album photos are viewable by everyone"
  ON user_album_photos FOR SELECT
  USING (true);

-- Politique : Les utilisateurs peuvent insérer leurs propres photos (max 5)
CREATE POLICY "Users can insert own album photos"
  ON user_album_photos FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    (SELECT COUNT(*) FROM user_album_photos WHERE user_id = auth.uid()) < 5
  );

-- Politique : Les utilisateurs peuvent mettre à jour leurs propres photos
CREATE POLICY "Users can update own album photos"
  ON user_album_photos FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Politique : Les utilisateurs peuvent supprimer leurs propres photos
CREATE POLICY "Users can delete own album photos"
  ON user_album_photos FOR DELETE
  USING (auth.uid() = user_id);

-- Fonction pour vérifier et limiter à 5 photos par utilisateur
CREATE OR REPLACE FUNCTION check_album_photo_limit()
RETURNS TRIGGER AS $$
DECLARE
  photo_count INTEGER;
BEGIN
  -- Compter les photos existantes pour cet utilisateur
  SELECT COUNT(*) INTO photo_count
  FROM user_album_photos
  WHERE user_id = NEW.user_id;

  -- Si l'utilisateur a déjà 5 photos, empêcher l'insertion
  IF photo_count >= 5 THEN
    RAISE EXCEPTION 'Maximum 5 photos allowed per user';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour vérifier la limite avant l'insertion
DROP TRIGGER IF EXISTS check_album_photo_limit_trigger ON user_album_photos;
CREATE TRIGGER check_album_photo_limit_trigger
  BEFORE INSERT ON user_album_photos
  FOR EACH ROW
  EXECUTE FUNCTION check_album_photo_limit();

-- Fonction pour obtenir les photos d'album d'un utilisateur
CREATE OR REPLACE FUNCTION get_user_album_photos(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  photo_url TEXT,
  display_order INTEGER,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    uap.id,
    uap.user_id,
    uap.photo_url,
    uap.display_order,
    uap.created_at,
    uap.updated_at
  FROM user_album_photos uap
  WHERE uap.user_id = p_user_id
  ORDER BY uap.display_order ASC, uap.created_at ASC;
END;
$$;

-- Donner la permission d'exécuter cette fonction aux utilisateurs authentifiés
GRANT EXECUTE ON FUNCTION get_user_album_photos(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_album_photos(UUID) TO anon;

-- Fonction pour ajouter une photo d'album
CREATE OR REPLACE FUNCTION add_album_photo(
  p_user_id UUID,
  p_photo_url TEXT,
  p_display_order INTEGER DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  photo_count INTEGER;
  new_order INTEGER;
  new_photo_id UUID;
BEGIN
  -- Vérifier que l'utilisateur est authentifié et qu'il ajoute sa propre photo
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'You can only add photos to your own album';
  END IF;

  -- Compter les photos existantes
  SELECT COUNT(*) INTO photo_count
  FROM user_album_photos
  WHERE user_id = p_user_id;

  -- Vérifier la limite de 5 photos
  IF photo_count >= 5 THEN
    RAISE EXCEPTION 'Maximum 5 photos allowed per user';
  END IF;

  -- Déterminer l'ordre d'affichage
  IF p_display_order IS NULL THEN
    SELECT COALESCE(MAX(display_order), 0) + 1 INTO new_order
    FROM user_album_photos
    WHERE user_id = p_user_id;
  ELSE
    new_order := p_display_order;
  END IF;

  -- Insérer la photo
  INSERT INTO user_album_photos (user_id, photo_url, display_order)
  VALUES (p_user_id, p_photo_url, new_order)
  RETURNING id INTO new_photo_id;

  RETURN new_photo_id;
END;
$$;

-- Donner la permission d'exécuter cette fonction aux utilisateurs authentifiés
GRANT EXECUTE ON FUNCTION add_album_photo(UUID, TEXT, INTEGER) TO authenticated;

-- Fonction pour supprimer une photo d'album
CREATE OR REPLACE FUNCTION delete_album_photo(p_photo_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  photo_user_id UUID;
BEGIN
  -- Récupérer l'utilisateur propriétaire de la photo
  SELECT user_id INTO photo_user_id
  FROM user_album_photos
  WHERE id = p_photo_id;

  -- Vérifier que la photo existe
  IF photo_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Vérifier que l'utilisateur est authentifié et qu'il supprime sa propre photo
  IF auth.uid() != photo_user_id THEN
    RAISE EXCEPTION 'You can only delete your own photos';
  END IF;

  -- Supprimer la photo
  DELETE FROM user_album_photos
  WHERE id = p_photo_id;

  RETURN TRUE;
END;
$$;

-- Donner la permission d'exécuter cette fonction aux utilisateurs authentifiés
GRANT EXECUTE ON FUNCTION delete_album_photo(UUID) TO authenticated;

-- Fonction pour réorganiser l'ordre des photos
CREATE OR REPLACE FUNCTION reorder_album_photos(
  p_user_id UUID,
  p_photo_orders JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  photo_item JSONB;
  photo_id UUID;
  new_order INTEGER;
BEGIN
  -- Vérifier que l'utilisateur est authentifié et qu'il réorganise ses propres photos
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'You can only reorder your own photos';
  END IF;

  -- Mettre à jour l'ordre de chaque photo
  FOR photo_item IN SELECT * FROM jsonb_array_elements(p_photo_orders)
  LOOP
    photo_id := (photo_item->>'id')::UUID;
    new_order := (photo_item->>'order')::INTEGER;

    UPDATE user_album_photos
    SET display_order = new_order, updated_at = NOW()
    WHERE id = photo_id AND user_id = p_user_id;
  END LOOP;

  RETURN TRUE;
END;
$$;

-- Donner la permission d'exécuter cette fonction aux utilisateurs authentifiés
GRANT EXECUTE ON FUNCTION reorder_album_photos(UUID, JSONB) TO authenticated;

