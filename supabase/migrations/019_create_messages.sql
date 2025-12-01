-- Migration pour créer la table des messages
-- Stocke tous les messages échangés entre utilisateurs

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  recipient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- Contrainte pour s'assurer que le sender et le recipient sont différents
  CHECK (sender_id != recipient_id)
);

-- Activer RLS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Politique : Les utilisateurs peuvent voir les messages de leurs conversations
CREATE POLICY "Users can view messages in own conversations"
  ON messages FOR SELECT
  USING (
    auth.uid() = sender_id OR 
    auth.uid() = recipient_id OR
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
      AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
    )
  );

-- Politique : Les utilisateurs peuvent créer des messages dans leurs conversations
CREATE POLICY "Users can create messages in own conversations"
  ON messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
      AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
    )
  );

-- Politique : Les utilisateurs peuvent mettre à jour leurs messages (pour marquer comme lu)
CREATE POLICY "Users can update own received messages"
  ON messages FOR UPDATE
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_recipient_id ON messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_is_read ON messages(is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at DESC);

-- Fonction pour créer un message et mettre à jour la conversation
CREATE OR REPLACE FUNCTION create_message(
  p_conversation_id UUID,
  p_sender_id UUID,
  p_recipient_id UUID,
  p_content TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message_id UUID;
  v_conversation_user1_id UUID;
  v_conversation_user2_id UUID;
BEGIN
  -- Vérifier que l'utilisateur fait partie de la conversation
  SELECT user1_id, user2_id INTO v_conversation_user1_id, v_conversation_user2_id
  FROM conversations
  WHERE id = p_conversation_id
  AND (user1_id = p_sender_id OR user2_id = p_sender_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User is not part of this conversation';
  END IF;

  -- Créer le message
  INSERT INTO messages (conversation_id, sender_id, recipient_id, content)
  VALUES (p_conversation_id, p_sender_id, p_recipient_id, p_content)
  RETURNING id INTO v_message_id;

  -- Mettre à jour la conversation
  UPDATE conversations
  SET 
    last_message_id = v_message_id,
    last_message_at = NOW(),
    updated_at = NOW(),
    -- Incrémenter le compteur de messages non lus pour le destinataire
    user1_unread_count = CASE 
      WHEN user1_id = p_recipient_id THEN user1_unread_count + 1
      ELSE user1_unread_count
    END,
    user2_unread_count = CASE 
      WHEN user2_id = p_recipient_id THEN user2_unread_count + 1
      ELSE user2_unread_count
    END
  WHERE id = p_conversation_id;

  RETURN v_message_id;
END;
$$;

-- Donner la permission d'exécuter cette fonction
GRANT EXECUTE ON FUNCTION create_message(UUID, UUID, UUID, TEXT) TO authenticated;

-- Fonction pour marquer les messages comme lus
CREATE OR REPLACE FUNCTION mark_messages_as_read(
  p_conversation_id UUID,
  p_user_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  -- Vérifier que l'utilisateur fait partie de la conversation
  IF NOT EXISTS (
    SELECT 1 FROM conversations
    WHERE id = p_conversation_id
    AND (user1_id = p_user_id OR user2_id = p_user_id)
  ) THEN
    RAISE EXCEPTION 'User is not part of this conversation';
  END IF;

  -- Marquer les messages comme lus
  UPDATE messages
  SET 
    is_read = TRUE,
    read_at = NOW(),
    updated_at = NOW()
  WHERE conversation_id = p_conversation_id
  AND recipient_id = p_user_id
  AND is_read = FALSE;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  -- Réinitialiser le compteur de messages non lus dans la conversation
  UPDATE conversations
  SET 
    user1_unread_count = CASE 
      WHEN user1_id = p_user_id THEN 0
      ELSE user1_unread_count
    END,
    user2_unread_count = CASE 
      WHEN user2_id = p_user_id THEN 0
      ELSE user2_unread_count
    END,
    updated_at = NOW()
  WHERE id = p_conversation_id;

  RETURN v_updated_count;
END;
$$;

-- Donner la permission d'exécuter cette fonction
GRANT EXECUTE ON FUNCTION mark_messages_as_read(UUID, UUID) TO authenticated;

