-- Migration pour ajouter les fonctions de suppression de conversations et messages

-- Fonction pour supprimer un message
CREATE OR REPLACE FUNCTION delete_message(p_message_id UUID)
RETURNS TABLE (success BOOLEAN, error TEXT) AS $$
DECLARE
  v_current_user_id UUID := auth.uid();
  v_message messages;
BEGIN
  IF v_current_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Not authenticated';
    RETURN;
  END IF;

  -- Récupérer le message
  SELECT * INTO v_message
  FROM messages
  WHERE id = p_message_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Message not found';
    RETURN;
  END IF;

  -- Vérifier que c'est l'expéditeur
  IF v_message.sender_id != v_current_user_id THEN
    RETURN QUERY SELECT FALSE, 'Only the sender can delete a message';
    RETURN;
  END IF;

  -- Supprimer le message
  DELETE FROM messages
  WHERE id = p_message_id;

  RETURN QUERY SELECT TRUE, NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction pour supprimer une conversation (et tous ses messages)
CREATE OR REPLACE FUNCTION delete_conversation(p_conversation_id UUID)
RETURNS TABLE (success BOOLEAN, error TEXT) AS $$
DECLARE
  v_current_user_id UUID := auth.uid();
  v_conversation conversations;
BEGIN
  IF v_current_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Not authenticated';
    RETURN;
  END IF;

  -- Récupérer la conversation
  SELECT * INTO v_conversation
  FROM conversations
  WHERE id = p_conversation_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Conversation not found';
    RETURN;
  END IF;

  -- Vérifier que l'utilisateur fait partie de la conversation
  IF v_conversation.user1_id != v_current_user_id 
     AND v_conversation.user2_id != v_current_user_id THEN
    RETURN QUERY SELECT FALSE, 'You are not part of this conversation';
    RETURN;
  END IF;

  -- Supprimer tous les messages de la conversation
  DELETE FROM messages
  WHERE conversation_id = p_conversation_id;

  -- Supprimer la conversation
  DELETE FROM conversations
  WHERE id = p_conversation_id;

  RETURN QUERY SELECT TRUE, NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION delete_message(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_conversation(UUID) TO authenticated;










