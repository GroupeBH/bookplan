-- Ajouter le champ de disponibilité et mot de passe à la table profiles
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS current_booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS password_hash TEXT; -- Le mot de passe sera hashé côté application

-- Index pour améliorer les performances des requêtes de disponibilité
CREATE INDEX IF NOT EXISTS idx_profiles_is_available ON profiles(is_available);
CREATE INDEX IF NOT EXISTS idx_profiles_current_booking_id ON profiles(current_booking_id);

-- Fonction pour mettre à jour la disponibilité automatiquement
CREATE OR REPLACE FUNCTION update_user_availability()
RETURNS TRIGGER AS $$
BEGIN
  -- Si un booking est accepté, mettre à jour la disponibilité
  IF NEW.status = 'accepted' AND OLD.status != 'accepted' THEN
    UPDATE profiles 
    SET is_available = false, current_booking_id = NEW.id
    WHERE id = NEW.provider_id;
  END IF;
  
  -- Si un booking est complété ou annulé, remettre la disponibilité
  IF NEW.status IN ('completed', 'cancelled', 'rejected') AND OLD.status NOT IN ('completed', 'cancelled', 'rejected') THEN
    UPDATE profiles 
    SET is_available = true, current_booking_id = NULL
    WHERE id = NEW.provider_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour mettre à jour automatiquement la disponibilité
DROP TRIGGER IF EXISTS trigger_update_availability ON bookings;
CREATE TRIGGER trigger_update_availability
  AFTER UPDATE OF status ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION update_user_availability();



