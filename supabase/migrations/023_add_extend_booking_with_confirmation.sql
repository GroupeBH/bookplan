-- Migration pour créer une fonction qui prolonge une compagnie avec confirmation du provider
-- Le requester demande la prolongation, le provider doit confirmer

-- Ajouter une colonne pour la demande de prolongation en attente
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS extension_requested_hours INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS extension_requested_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Fonction pour demander une prolongation (requester)
CREATE OR REPLACE FUNCTION request_booking_extension(
  p_booking_id UUID,
  p_additional_hours INTEGER
)
RETURNS TABLE (success BOOLEAN, error TEXT, booking JSONB) AS $$
DECLARE
  v_booking_status TEXT;
  v_requester_id UUID;
  v_provider_id UUID;
  v_current_user_id UUID := auth.uid();
BEGIN
  -- Vérifier si l'utilisateur est authentifié
  IF v_current_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Not authenticated', NULL::JSONB;
    RETURN;
  END IF;

  -- Récupérer les détails du booking
  SELECT status, requester_id, provider_id
  INTO v_booking_status, v_requester_id, v_provider_id
  FROM bookings
  WHERE id = p_booking_id;

  -- Vérifier si le booking existe
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Booking not found', NULL::JSONB;
    RETURN;
  END IF;

  -- Vérifier que c'est le requester qui demande
  IF v_current_user_id != v_requester_id THEN
    RETURN QUERY SELECT FALSE, 'Only the requester can request an extension', NULL::JSONB;
    RETURN;
  END IF;

  -- Vérifier que le booking est accepté
  IF v_booking_status != 'accepted' THEN
    RETURN QUERY SELECT FALSE, 'Only accepted bookings can be extended', NULL::JSONB;
    RETURN;
  END IF;

  -- Enregistrer la demande de prolongation
  UPDATE bookings
  SET 
    extension_requested_hours = p_additional_hours,
    extension_requested_at = NOW(),
    updated_at = NOW()
  WHERE id = p_booking_id
  RETURNING * INTO v_booking_status;

  RETURN QUERY SELECT TRUE, NULL, to_jsonb((SELECT row_to_json(b.*) FROM bookings b WHERE b.id = p_booking_id));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction pour confirmer une prolongation (provider)
CREATE OR REPLACE FUNCTION confirm_booking_extension(
  p_booking_id UUID
)
RETURNS TABLE (success BOOLEAN, error TEXT, booking JSONB) AS $$
DECLARE
  v_booking_status TEXT;
  v_requester_id UUID;
  v_provider_id UUID;
  v_current_user_id UUID := auth.uid();
  v_extension_hours INTEGER;
  v_current_duration INTEGER;
BEGIN
  -- Vérifier si l'utilisateur est authentifié
  IF v_current_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Not authenticated', NULL::JSONB;
    RETURN;
  END IF;

  -- Récupérer les détails du booking
  SELECT status, requester_id, provider_id, extension_requested_hours, duration_hours
  INTO v_booking_status, v_requester_id, v_provider_id, v_extension_hours, v_current_duration
  FROM bookings
  WHERE id = p_booking_id;

  -- Vérifier si le booking existe
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Booking not found', NULL::JSONB;
    RETURN;
  END IF;

  -- Vérifier que c'est le provider qui confirme
  IF v_current_user_id != v_provider_id THEN
    RETURN QUERY SELECT FALSE, 'Only the provider can confirm an extension', NULL::JSONB;
    RETURN;
  END IF;

  -- Vérifier qu'il y a une demande de prolongation
  IF v_extension_hours IS NULL THEN
    RETURN QUERY SELECT FALSE, 'No extension request found', NULL::JSONB;
    RETURN;
  END IF;

  -- Appliquer la prolongation
  UPDATE bookings
  SET 
    duration_hours = v_current_duration + v_extension_hours,
    extension_requested_hours = NULL,
    extension_requested_at = NULL,
    updated_at = NOW()
  WHERE id = p_booking_id;

  RETURN QUERY SELECT TRUE, NULL, to_jsonb((SELECT row_to_json(b.*) FROM bookings b WHERE b.id = p_booking_id));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction pour refuser une prolongation (provider)
CREATE OR REPLACE FUNCTION reject_booking_extension(
  p_booking_id UUID
)
RETURNS TABLE (success BOOLEAN, error TEXT, booking JSONB) AS $$
DECLARE
  v_provider_id UUID;
  v_current_user_id UUID := auth.uid();
BEGIN
  -- Vérifier si l'utilisateur est authentifié
  IF v_current_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Not authenticated', NULL::JSONB;
    RETURN;
  END IF;

  -- Récupérer le provider_id
  SELECT provider_id INTO v_provider_id
  FROM bookings
  WHERE id = p_booking_id;

  -- Vérifier si le booking existe
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Booking not found', NULL::JSONB;
    RETURN;
  END IF;

  -- Vérifier que c'est le provider qui refuse
  IF v_current_user_id != v_provider_id THEN
    RETURN QUERY SELECT FALSE, 'Only the provider can reject an extension', NULL::JSONB;
    RETURN;
  END IF;

  -- Annuler la demande de prolongation
  UPDATE bookings
  SET 
    extension_requested_hours = NULL,
    extension_requested_at = NULL,
    updated_at = NOW()
  WHERE id = p_booking_id;

  RETURN QUERY SELECT TRUE, NULL, to_jsonb((SELECT row_to_json(b.*) FROM bookings b WHERE b.id = p_booking_id));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Donner les permissions
GRANT EXECUTE ON FUNCTION request_booking_extension(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION confirm_booking_extension(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION reject_booking_extension(UUID) TO authenticated;
























