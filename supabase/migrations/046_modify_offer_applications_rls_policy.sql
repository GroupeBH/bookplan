-- Migration pour modifier la politique RLS des candidatures aux offres
-- Permettre à tous les utilisateurs authentifiés de candidater aux offres actives
-- (pas seulement ceux qui sont disponibles)

-- Supprimer l'ancienne politique
DROP POLICY IF EXISTS "Available users can create applications" ON offer_applications;

-- Créer une nouvelle politique qui permet à tous les utilisateurs authentifiés de candidater
CREATE POLICY "Authenticated users can create applications"
  ON offer_applications FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    auth.uid() = applicant_id AND
    EXISTS (
      SELECT 1 FROM offers 
      WHERE offers.id = offer_applications.offer_id 
      AND offers.status = 'active'
      AND offers.expires_at > NOW()
      AND offers.author_id != auth.uid()
    )
  );
