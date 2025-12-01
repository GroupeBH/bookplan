-- Table pour gérer les notes/avis
CREATE TABLE IF NOT EXISTS ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rater_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  rated_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  rating DECIMAL(2, 1) NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CHECK (rater_id != rated_id),
  UNIQUE(rater_id, rated_id, booking_id)
);

-- Activer RLS
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;

-- Politique : Les utilisateurs peuvent voir toutes les notes (pour afficher les moyennes)
CREATE POLICY "Ratings are viewable by everyone"
  ON ratings FOR SELECT
  USING (true);

-- Politique : Les utilisateurs peuvent créer des notes
CREATE POLICY "Users can create ratings"
  ON ratings FOR INSERT
  WITH CHECK (auth.uid() = rater_id);

-- Politique : Les utilisateurs peuvent mettre à jour leurs propres notes
CREATE POLICY "Users can update own ratings"
  ON ratings FOR UPDATE
  USING (auth.uid() = rater_id);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_ratings_rated_id ON ratings(rated_id);
CREATE INDEX IF NOT EXISTS idx_ratings_rater_id ON ratings(rater_id);
CREATE INDEX IF NOT EXISTS idx_ratings_booking_id ON ratings(booking_id);

-- Fonction pour calculer la moyenne des notes d'un utilisateur
CREATE OR REPLACE FUNCTION calculate_user_rating(user_id_param UUID)
RETURNS TABLE (
  average_rating DECIMAL(3, 2),
  total_ratings INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(ROUND(AVG(rating)::numeric, 2), 0)::DECIMAL(3, 2) as average_rating,
    COUNT(*)::INTEGER as total_ratings
  FROM ratings
  WHERE rated_id = user_id_param;
END;
$$ LANGUAGE plpgsql;



