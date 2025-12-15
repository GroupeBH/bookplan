-- Migration pour créer la table blocked_users et les fonctions associées

CREATE TABLE IF NOT EXISTS blocked_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  blocked_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (blocker_id, blocked_id),
  CHECK (blocker_id != blocked_id)
);

ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;

-- Politique RLS : Les utilisateurs peuvent voir leurs propres blocages
CREATE POLICY "Users can view own blocks" ON blocked_users
  FOR SELECT
  USING (auth.uid() = blocker_id);

-- Politique RLS : Les utilisateurs peuvent créer leurs propres blocages
CREATE POLICY "Users can create own blocks" ON blocked_users
  FOR INSERT
  WITH CHECK (auth.uid() = blocker_id);

-- Politique RLS : Les utilisateurs peuvent supprimer leurs propres blocages
CREATE POLICY "Users can delete own blocks" ON blocked_users
  FOR DELETE
  USING (auth.uid() = blocker_id);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker_id ON blocked_users(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked_id ON blocked_users(blocked_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker_blocked ON blocked_users(blocker_id, blocked_id);

-- Fonction pour bloquer un utilisateur
CREATE OR REPLACE FUNCTION block_user(p_blocked_id UUID)
RETURNS TABLE (success BOOLEAN, error TEXT, block_id UUID) AS $$
DECLARE
  v_current_user_id UUID := auth.uid();
  v_block_id UUID;
BEGIN
  IF v_current_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Not authenticated', NULL::UUID;
    RETURN;
  END IF;

  IF v_current_user_id = p_blocked_id THEN
    RETURN QUERY SELECT FALSE, 'Cannot block yourself', NULL::UUID;
    RETURN;
  END IF;

  -- Vérifier si le blocage existe déjà
  SELECT id INTO v_block_id
  FROM blocked_users
  WHERE blocker_id = v_current_user_id AND blocked_id = p_blocked_id;

  IF v_block_id IS NOT NULL THEN
    RETURN QUERY SELECT TRUE, NULL, v_block_id;
    RETURN;
  END IF;

  -- Créer le blocage
  INSERT INTO blocked_users (blocker_id, blocked_id)
  VALUES (v_current_user_id, p_blocked_id)
  RETURNING id INTO v_block_id;

  RETURN QUERY SELECT TRUE, NULL, v_block_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction pour débloquer un utilisateur
CREATE OR REPLACE FUNCTION unblock_user(p_blocked_id UUID)
RETURNS TABLE (success BOOLEAN, error TEXT) AS $$
DECLARE
  v_current_user_id UUID := auth.uid();
BEGIN
  IF v_current_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Not authenticated';
    RETURN;
  END IF;

  -- Supprimer le blocage
  DELETE FROM blocked_users
  WHERE blocker_id = v_current_user_id AND blocked_id = p_blocked_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Block not found';
    RETURN;
  END IF;

  RETURN QUERY SELECT TRUE, NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction pour vérifier si un utilisateur est bloqué
CREATE OR REPLACE FUNCTION is_user_blocked(p_user1_id UUID, p_user2_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM blocked_users
    WHERE (blocker_id = p_user1_id AND blocked_id = p_user2_id)
       OR (blocker_id = p_user2_id AND blocked_id = p_user1_id)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction pour obtenir la liste des utilisateurs bloqués
CREATE OR REPLACE FUNCTION get_blocked_users()
RETURNS TABLE (
  blocked_id UUID,
  blocked_pseudo TEXT,
  blocked_photo TEXT,
  blocked_at TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
  v_current_user_id UUID := auth.uid();
BEGIN
  IF v_current_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    bu.blocked_id,
    p.pseudo::TEXT,
    p.photo::TEXT,
    bu.created_at
  FROM blocked_users bu
  JOIN profiles p ON p.id = bu.blocked_id
  WHERE bu.blocker_id = v_current_user_id
  ORDER BY bu.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION block_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION unblock_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_user_blocked(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_blocked_users() TO authenticated;









