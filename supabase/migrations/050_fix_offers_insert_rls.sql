-- Reinforce offers RLS policies to avoid insert failures ("new row violates row-level security policy").
-- This migration is idempotent and recreates the expected offers policies explicitly.

ALTER TABLE offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view active offers" ON offers;
DROP POLICY IF EXISTS "Available users can view active offers" ON offers;
DROP POLICY IF EXISTS "Authors can view own offers" ON offers;
DROP POLICY IF EXISTS "Users can create offers" ON offers;
DROP POLICY IF EXISTS "Authors can create own offers" ON offers;
DROP POLICY IF EXISTS "Authors can update own offers" ON offers;
DROP POLICY IF EXISTS "Authors can delete own offers" ON offers;

-- Authors can always view their own offers.
CREATE POLICY "Authors can view own offers"
  ON offers FOR SELECT
  TO authenticated
  USING (auth.uid() = author_id);

-- Authenticated users can view active, non-expired offers that match audience targeting.
CREATE POLICY "Authenticated users can view active offers"
  ON offers FOR SELECT
  TO authenticated
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

-- Only the authenticated author can create an offer row for themself.
CREATE POLICY "Authors can create own offers"
  ON offers FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = author_id
  );

-- Only the authenticated author can update/delete their own offers.
CREATE POLICY "Authors can update own offers"
  ON offers FOR UPDATE
  TO authenticated
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Authors can delete own offers"
  ON offers FOR DELETE
  TO authenticated
  USING (auth.uid() = author_id);
