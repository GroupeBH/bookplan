-- Table pour gérer les demandes de compagnie
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  provider_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'completed', 'cancelled')),
  booking_date TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_hours INTEGER DEFAULT 1,
  location TEXT,
  lat DECIMAL(10, 8),
  lng DECIMAL(11, 8),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CHECK (requester_id != provider_id)
);

-- Activer RLS
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Politique : Les utilisateurs peuvent voir leurs propres demandes (en tant que requester ou provider)
CREATE POLICY "Users can view own bookings"
  ON bookings FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = provider_id);

-- Politique : Les utilisateurs peuvent créer des demandes
CREATE POLICY "Users can create bookings"
  ON bookings FOR INSERT
  WITH CHECK (auth.uid() = requester_id);

-- Politique : Les providers peuvent mettre à jour le statut de leurs demandes
CREATE POLICY "Providers can update booking status"
  ON bookings FOR UPDATE
  USING (auth.uid() = provider_id);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_bookings_requester_id ON bookings(requester_id);
CREATE INDEX IF NOT EXISTS idx_bookings_provider_id ON bookings(provider_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_booking_date ON bookings(booking_date);

-- Fonction pour vérifier la disponibilité
CREATE OR REPLACE FUNCTION is_user_available(user_id_param UUID, check_date TIMESTAMP WITH TIME ZONE)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM bookings
    WHERE provider_id = user_id_param
      AND status IN ('pending', 'accepted')
      AND booking_date <= check_date
      AND booking_date + (duration_hours || ' hours')::INTERVAL >= check_date
  );
END;
$$ LANGUAGE plpgsql;



