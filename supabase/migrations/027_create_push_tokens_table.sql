-- Migration pour créer la table push_tokens pour stocker les tokens de push notifications

CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  device_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, token)
);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

-- Politique RLS : Les utilisateurs peuvent voir leurs propres tokens
CREATE POLICY "Users can view own push tokens" ON push_tokens
  FOR SELECT
  USING (auth.uid() = user_id);

-- Politique RLS : Les utilisateurs peuvent créer leurs propres tokens
CREATE POLICY "Users can create own push tokens" ON push_tokens
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Politique RLS : Les utilisateurs peuvent mettre à jour leurs propres tokens
CREATE POLICY "Users can update own push tokens" ON push_tokens
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Politique RLS : Les utilisateurs peuvent supprimer leurs propres tokens
CREATE POLICY "Users can delete own push tokens" ON push_tokens
  FOR DELETE
  USING (auth.uid() = user_id);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON push_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_token ON push_tokens(token);

-- Fonction pour enregistrer ou mettre à jour un token push
CREATE OR REPLACE FUNCTION upsert_push_token(
  p_token TEXT,
  p_platform TEXT,
  p_device_id TEXT DEFAULT NULL
)
RETURNS TABLE (success BOOLEAN, error TEXT, token_id UUID) AS $$
DECLARE
  v_current_user_id UUID := auth.uid();
  v_token_id UUID;
BEGIN
  IF v_current_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Not authenticated', NULL::UUID;
    RETURN;
  END IF;

  IF p_token IS NULL OR p_token = '' THEN
    RETURN QUERY SELECT FALSE, 'Token cannot be empty', NULL::UUID;
    RETURN;
  END IF;

  IF p_platform NOT IN ('ios', 'android', 'web') THEN
    RETURN QUERY SELECT FALSE, 'Invalid platform', NULL::UUID;
    RETURN;
  END IF;

  -- Vérifier si le token existe déjà pour cet utilisateur
  SELECT id INTO v_token_id
  FROM push_tokens
  WHERE user_id = v_current_user_id AND token = p_token;

  IF v_token_id IS NOT NULL THEN
    -- Mettre à jour le token existant
    UPDATE push_tokens
    SET 
      platform = p_platform,
      device_id = COALESCE(p_device_id, device_id),
      updated_at = NOW()
    WHERE id = v_token_id;
    
    RETURN QUERY SELECT TRUE, NULL, v_token_id;
  ELSE
    -- Créer un nouveau token
    INSERT INTO push_tokens (user_id, token, platform, device_id)
    VALUES (v_current_user_id, p_token, p_platform, p_device_id)
    RETURNING id INTO v_token_id;
    
    RETURN QUERY SELECT TRUE, NULL, v_token_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction pour supprimer un token push
CREATE OR REPLACE FUNCTION delete_push_token(p_token TEXT)
RETURNS TABLE (success BOOLEAN, error TEXT) AS $$
DECLARE
  v_current_user_id UUID := auth.uid();
BEGIN
  IF v_current_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Not authenticated';
    RETURN;
  END IF;

  DELETE FROM push_tokens
  WHERE user_id = v_current_user_id AND token = p_token;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Token not found';
    RETURN;
  END IF;

  RETURN QUERY SELECT TRUE, NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction pour obtenir tous les tokens d'un utilisateur
CREATE OR REPLACE FUNCTION get_user_push_tokens(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  token TEXT,
  platform TEXT,
  device_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  -- Vérifier que l'utilisateur demande ses propres tokens ou qu'il est admin
  IF auth.uid() != p_user_id THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    pt.id,
    pt.token,
    pt.platform,
    pt.device_id,
    pt.created_at
  FROM push_tokens pt
  WHERE pt.user_id = p_user_id
  ORDER BY pt.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION upsert_push_token(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_push_token(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_push_tokens(UUID) TO authenticated;



