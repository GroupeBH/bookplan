-- Allow both participants to request an extension.
-- The other participant must confirm or reject.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS extension_requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION request_booking_extension(
  p_booking_id UUID,
  p_additional_hours INTEGER
)
RETURNS TABLE (success BOOLEAN, error TEXT, booking JSONB) AS $$
DECLARE
  v_booking bookings%ROWTYPE;
  v_current_user_id UUID := auth.uid();
BEGIN
  IF v_current_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Not authenticated', NULL::JSONB;
    RETURN;
  END IF;

  SELECT * INTO v_booking
  FROM bookings
  WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Booking not found', NULL::JSONB;
    RETURN;
  END IF;

  IF v_current_user_id != v_booking.requester_id AND v_current_user_id != v_booking.provider_id THEN
    RETURN QUERY SELECT FALSE, 'Only booking participants can request an extension', NULL::JSONB;
    RETURN;
  END IF;

  IF v_booking.status != 'accepted' THEN
    RETURN QUERY SELECT FALSE, 'Only accepted bookings can be extended', NULL::JSONB;
    RETURN;
  END IF;

  IF p_additional_hours IS NULL OR p_additional_hours <= 0 OR p_additional_hours > 24 THEN
    RETURN QUERY SELECT FALSE, 'Additional hours must be between 1 and 24', NULL::JSONB;
    RETURN;
  END IF;

  IF v_booking.extension_requested_hours IS NOT NULL THEN
    RETURN QUERY SELECT FALSE, 'An extension request is already pending', NULL::JSONB;
    RETURN;
  END IF;

  UPDATE bookings
  SET
    extension_requested_hours = p_additional_hours,
    extension_requested_at = NOW(),
    extension_requested_by = v_current_user_id,
    updated_at = NOW()
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  RETURN QUERY SELECT TRUE, NULL, to_jsonb(v_booking);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION confirm_booking_extension(
  p_booking_id UUID
)
RETURNS TABLE (success BOOLEAN, error TEXT, booking JSONB) AS $$
DECLARE
  v_booking bookings%ROWTYPE;
  v_current_user_id UUID := auth.uid();
BEGIN
  IF v_current_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Not authenticated', NULL::JSONB;
    RETURN;
  END IF;

  SELECT * INTO v_booking
  FROM bookings
  WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Booking not found', NULL::JSONB;
    RETURN;
  END IF;

  IF v_current_user_id != v_booking.requester_id AND v_current_user_id != v_booking.provider_id THEN
    RETURN QUERY SELECT FALSE, 'Only booking participants can confirm an extension', NULL::JSONB;
    RETURN;
  END IF;

  IF v_booking.extension_requested_hours IS NULL OR v_booking.extension_requested_by IS NULL THEN
    RETURN QUERY SELECT FALSE, 'No extension request found', NULL::JSONB;
    RETURN;
  END IF;

  IF v_current_user_id = v_booking.extension_requested_by THEN
    RETURN QUERY SELECT FALSE, 'You cannot confirm your own extension request', NULL::JSONB;
    RETURN;
  END IF;

  UPDATE bookings
  SET
    duration_hours = COALESCE(v_booking.duration_hours, 1) + v_booking.extension_requested_hours,
    extension_requested_hours = NULL,
    extension_requested_at = NULL,
    extension_requested_by = NULL,
    updated_at = NOW()
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  RETURN QUERY SELECT TRUE, NULL, to_jsonb(v_booking);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION reject_booking_extension(
  p_booking_id UUID
)
RETURNS TABLE (success BOOLEAN, error TEXT, booking JSONB) AS $$
DECLARE
  v_booking bookings%ROWTYPE;
  v_current_user_id UUID := auth.uid();
BEGIN
  IF v_current_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Not authenticated', NULL::JSONB;
    RETURN;
  END IF;

  SELECT * INTO v_booking
  FROM bookings
  WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Booking not found', NULL::JSONB;
    RETURN;
  END IF;

  IF v_current_user_id != v_booking.requester_id AND v_current_user_id != v_booking.provider_id THEN
    RETURN QUERY SELECT FALSE, 'Only booking participants can reject an extension', NULL::JSONB;
    RETURN;
  END IF;

  IF v_booking.extension_requested_hours IS NULL OR v_booking.extension_requested_by IS NULL THEN
    RETURN QUERY SELECT FALSE, 'No extension request found', NULL::JSONB;
    RETURN;
  END IF;

  IF v_current_user_id = v_booking.extension_requested_by THEN
    RETURN QUERY SELECT FALSE, 'You cannot reject your own extension request', NULL::JSONB;
    RETURN;
  END IF;

  UPDATE bookings
  SET
    extension_requested_hours = NULL,
    extension_requested_at = NULL,
    extension_requested_by = NULL,
    updated_at = NOW()
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  RETURN QUERY SELECT TRUE, NULL, to_jsonb(v_booking);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION request_booking_extension(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION confirm_booking_extension(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION reject_booking_extension(UUID) TO authenticated;
