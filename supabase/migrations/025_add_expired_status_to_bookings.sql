-- Migration pour ajouter le statut 'expired' aux bookings

-- Modifier le type de statut pour inclure 'expired'
ALTER TABLE bookings 
DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE bookings
ADD CONSTRAINT bookings_status_check 
CHECK (status IN ('pending', 'accepted', 'rejected', 'completed', 'cancelled', 'expired'));

-- Fonction pour marquer les demandes expirées
CREATE OR REPLACE FUNCTION check_expired_bookings()
RETURNS void AS $$
BEGIN
  UPDATE bookings
  SET status = 'expired', updated_at = NOW()
  WHERE status = 'pending'
    AND booking_date < NOW()
    AND booking_date IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction pour relancer une demande expirée
CREATE OR REPLACE FUNCTION renew_expired_booking(
  p_booking_id UUID,
  p_new_booking_date TIMESTAMP WITH TIME ZONE
)
RETURNS TABLE (success BOOLEAN, error TEXT, booking JSONB) AS $$
DECLARE
  v_current_user_id UUID := auth.uid();
  v_booking bookings;
BEGIN
  IF v_current_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Not authenticated', NULL::JSONB;
    RETURN;
  END IF;

  -- Récupérer la demande
  SELECT * INTO v_booking
  FROM bookings
  WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Booking not found', NULL::JSONB;
    RETURN;
  END IF;

  -- Vérifier que c'est le requester
  IF v_booking.requester_id != v_current_user_id THEN
    RETURN QUERY SELECT FALSE, 'Only the requester can renew a booking', NULL::JSONB;
    RETURN;
  END IF;

  -- Vérifier que le statut est expired
  IF v_booking.status != 'expired' THEN
    RETURN QUERY SELECT FALSE, 'Only expired bookings can be renewed', NULL::JSONB;
    RETURN;
  END IF;

  -- Vérifier que la nouvelle date est dans le futur
  IF p_new_booking_date <= NOW() THEN
    RETURN QUERY SELECT FALSE, 'New booking date must be in the future', NULL::JSONB;
    RETURN;
  END IF;

  -- Mettre à jour la demande
  UPDATE bookings
  SET 
    status = 'pending',
    booking_date = p_new_booking_date,
    updated_at = NOW()
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  RETURN QUERY SELECT TRUE, NULL, to_jsonb(v_booking);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION check_expired_bookings() TO authenticated;
GRANT EXECUTE ON FUNCTION renew_expired_booking(UUID, TIMESTAMP WITH TIME ZONE) TO authenticated;

-- Créer un trigger ou une fonction planifiée pour vérifier automatiquement les demandes expirées
-- Note: Pour une vérification automatique, vous devrez configurer un cron job dans Supabase
-- ou appeler cette fonction périodiquement depuis votre application





