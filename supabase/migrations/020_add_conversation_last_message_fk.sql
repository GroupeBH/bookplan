-- Migration pour ajouter la contrainte de clé étrangère pour last_message_id
-- Cette migration doit être exécutée après la création de la table messages

-- Ajouter la référence au dernier message dans la table conversations
ALTER TABLE conversations 
ADD CONSTRAINT fk_conversations_last_message 
FOREIGN KEY (last_message_id) 
REFERENCES messages(id) 
ON DELETE SET NULL;










