-- Fonction RPC pour annuler une demande de compagnie
-- Permet aux requesters d'annuler leurs propres demandes (en statut 'pending' ou 'accepted')
-- et aux providers d'annuler les demandes en statut 'pending' seulement
CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_booking bookings%ROWTYPE;
  v_user_id UUID;
BEGIN
  -- Récupérer l'ID de l'utilisateur actuel
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Non authentifié'
    );
  END IF;

  -- Récupérer le booking
  SELECT * INTO v_booking
  FROM bookings
  WHERE id = p_booking_id;

  -- Vérifier que le booking existe
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Demande introuvable'
    );
  END IF;

  -- Vérifier que le booking n'est pas déjà annulé ou complété
  IF v_booking.status IN ('cancelled', 'completed', 'rejected') THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Cette demande ne peut plus être annulée'
    );
  END IF;

  -- Vérifier les permissions :
  -- - Le requester peut annuler ses demandes en statut 'pending' ou 'accepted'
  -- - Le provider peut annuler les demandes en statut 'pending' seulement
  IF v_user_id = v_booking.requester_id THEN
    -- Le requester peut annuler
    IF v_booking.status NOT IN ('pending', 'accepted') THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Vous ne pouvez annuler que les demandes en attente ou acceptées'
      );
    END IF;
  ELSIF v_user_id = v_booking.provider_id THEN
    -- Le provider peut annuler seulement si la demande est en attente
    IF v_booking.status != 'pending' THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Vous ne pouvez annuler que les demandes en attente'
      );
    END IF;
  ELSE
    -- L'utilisateur n'est ni le requester ni le provider
    RETURN json_build_object(
      'success', false,
      'error', 'Vous n''avez pas la permission d''annuler cette demande'
    );
  END IF;

  -- Annuler le booking
  UPDATE bookings
  SET 
    status = 'cancelled',
    updated_at = NOW()
  WHERE id = p_booking_id;

  -- Retourner le booking mis à jour
  SELECT * INTO v_booking
  FROM bookings
  WHERE id = p_booking_id;

  RETURN json_build_object(
    'success', true,
    'booking', json_build_object(
      'id', v_booking.id,
      'requester_id', v_booking.requester_id,
      'provider_id', v_booking.provider_id,
      'status', v_booking.status,
      'booking_date', v_booking.booking_date,
      'duration_hours', v_booking.duration_hours,
      'location', v_booking.location,
      'notes', v_booking.notes,
      'created_at', v_booking.created_at,
      'updated_at', v_booking.updated_at
    )
  );
END;
$$;

-- Donner la permission d'exécuter cette fonction aux utilisateurs authentifiés
GRANT EXECUTE ON FUNCTION public.cancel_booking(UUID) TO authenticated;

