-- Migration pour créer la table des conversations
-- Une conversation représente un échange entre deux utilisateurs

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  user2_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  last_message_id UUID, -- Référence au dernier message (ajouté après création de la table messages)
  last_message_at TIMESTAMP WITH TIME ZONE,
  user1_unread_count INTEGER DEFAULT 0,
  user2_unread_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- Contrainte pour s'assurer que user1_id < user2_id pour éviter les doublons
  CHECK (user1_id < user2_id),
  -- Contrainte pour s'assurer qu'un utilisateur ne peut pas avoir une conversation avec lui-même
  CHECK (user1_id != user2_id),
  -- Contrainte unique pour éviter les conversations en double
  UNIQUE (user1_id, user2_id)
);

-- Activer RLS
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Politique : Les utilisateurs peuvent voir leurs propres conversations
CREATE POLICY "Users can view own conversations"
  ON conversations FOR SELECT
  USING (auth.uid() = user1_id OR auth.uid() = user2_id);

-- Politique : Les utilisateurs peuvent créer des conversations
CREATE POLICY "Users can create conversations"
  ON conversations FOR INSERT
  WITH CHECK (auth.uid() = user1_id OR auth.uid() = user2_id);

-- Politique : Les utilisateurs peuvent mettre à jour leurs conversations
CREATE POLICY "Users can update own conversations"
  ON conversations FOR UPDATE
  USING (auth.uid() = user1_id OR auth.uid() = user2_id);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_conversations_user1_id ON conversations(user1_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user2_id ON conversations(user2_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_user1_user2 ON conversations(user1_id, user2_id);

-- Fonction pour obtenir ou créer une conversation entre deux utilisateurs
CREATE OR REPLACE FUNCTION get_or_create_conversation(
  p_user1_id UUID,
  p_user2_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation_id UUID;
  v_smaller_id UUID;
  v_larger_id UUID;
BEGIN
  -- S'assurer que user1_id < user2_id pour la cohérence
  IF p_user1_id < p_user2_id THEN
    v_smaller_id := p_user1_id;
    v_larger_id := p_user2_id;
  ELSE
    v_smaller_id := p_user2_id;
    v_larger_id := p_user1_id;
  END IF;

  -- Vérifier si une conversation existe déjà
  SELECT id INTO v_conversation_id
  FROM conversations
  WHERE user1_id = v_smaller_id AND user2_id = v_larger_id;

  -- Si elle n'existe pas, la créer
  IF v_conversation_id IS NULL THEN
    INSERT INTO conversations (user1_id, user2_id)
    VALUES (v_smaller_id, v_larger_id)
    RETURNING id INTO v_conversation_id;
  END IF;

  RETURN v_conversation_id;
END;
$$;

-- Donner la permission d'exécuter cette fonction
GRANT EXECUTE ON FUNCTION get_or_create_conversation(UUID, UUID) TO authenticated;























