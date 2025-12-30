-- Table pour stocker les notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'access_request_received',      -- Demande d'accès reçue
    'access_request_accepted',     -- Ma demande d'accès acceptée
    'access_request_rejected',      -- Ma demande d'accès rejetée
    'booking_request_received',     -- Demande de compagnie reçue
    'booking_request_accepted',     -- Ma demande de compagnie acceptée
    'booking_request_rejected',     -- Ma demande de compagnie rejetée
    'offer_application_received',    -- Candidature à mon offre
    'offer_application_accepted',   -- Ma candidature acceptée
    'offer_application_rejected',   -- Ma candidature rejetée
    'booking_reminder'              -- Rappel pour rendez-vous
  )),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB, -- Données supplémentaires (booking_id, offer_id, user_id, etc.)
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  read_at TIMESTAMP WITH TIME ZONE
);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);

-- Activer RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Politiques RLS
-- Les utilisateurs peuvent voir uniquement leurs propres notifications
CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

-- Les utilisateurs peuvent mettre à jour leurs propres notifications (marquer comme lue)
CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- Les utilisateurs peuvent supprimer leurs propres notifications
CREATE POLICY "Users can delete their own notifications"
  ON notifications FOR DELETE
  USING (auth.uid() = user_id);

-- Fonction pour créer une notification (peut être appelée par n'importe quel utilisateur authentifié)
CREATE OR REPLACE FUNCTION create_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_message TEXT,
  p_data JSONB DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (p_user_id, p_type, p_title, p_message, p_data)
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction pour marquer une notification comme lue
CREATE OR REPLACE FUNCTION mark_notification_as_read(p_notification_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE notifications
  SET is_read = TRUE, read_at = NOW()
  WHERE id = p_notification_id AND user_id = auth.uid();
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction pour marquer toutes les notifications comme lues
CREATE OR REPLACE FUNCTION mark_all_notifications_as_read()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE notifications
  SET is_read = TRUE, read_at = NOW()
  WHERE user_id = auth.uid() AND is_read = FALSE;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


