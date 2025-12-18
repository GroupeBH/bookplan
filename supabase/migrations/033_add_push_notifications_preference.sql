-- Migration pour ajouter le champ push_notifications_enabled dans la table profiles

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS push_notifications_enabled BOOLEAN DEFAULT true;

-- Commentaire pour documenter le champ
COMMENT ON COLUMN profiles.push_notifications_enabled IS 'Indique si les notifications push sont activées pour cet utilisateur. Activé par défaut.';


