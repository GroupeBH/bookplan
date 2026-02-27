-- Ciblage d'audience des offres + notifications temps réel supplémentaires.

ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS target_gender TEXT NOT NULL DEFAULT 'all'
  CHECK (target_gender IN ('all', 'male', 'female'));

UPDATE offers
SET target_gender = 'all'
WHERE target_gender IS NULL;

CREATE INDEX IF NOT EXISTS idx_offers_target_gender ON offers(target_gender);

-- Recréer les politiques RLS pour tenir compte de target_gender.
DROP POLICY IF EXISTS "Authenticated users can view active offers" ON offers;
DROP POLICY IF EXISTS "Available users can view active offers" ON offers;

CREATE POLICY "Authenticated users can view active offers"
  ON offers FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND status = 'active'
    AND expires_at > NOW()
    AND (
      COALESCE(target_gender, 'all') = 'all'
      OR EXISTS (
        SELECT 1
        FROM profiles
        WHERE profiles.id = auth.uid()
          AND profiles.gender = offers.target_gender
      )
    )
  );

DROP POLICY IF EXISTS "Authenticated users can create applications" ON offer_applications;
DROP POLICY IF EXISTS "Available users can create applications" ON offer_applications;

CREATE POLICY "Authenticated users can create applications"
  ON offer_applications FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = applicant_id
    AND EXISTS (
      SELECT 1
      FROM offers
      JOIN profiles ON profiles.id = auth.uid()
      WHERE offers.id = offer_applications.offer_id
        AND offers.status = 'active'
        AND offers.expires_at > NOW()
        AND offers.author_id != auth.uid()
        AND (
          COALESCE(offers.target_gender, 'all') = 'all'
          OR offers.target_gender = profiles.gender
        )
    )
  );

-- Ajouter le type de notification pour les nouvelles offres.
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'access_request_received',
    'access_request_accepted',
    'access_request_rejected',
    'booking_request_received',
    'booking_request_accepted',
    'booking_request_rejected',
    'offer_application_received',
    'offer_application_accepted',
    'offer_application_rejected',
    'new_offer_published',
    'booking_reminder'
  ));
