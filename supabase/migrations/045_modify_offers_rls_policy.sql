-- Migration pour modifier la politique RLS des offres
-- Permettre à tous les utilisateurs authentifiés de voir les offres actives
-- (pas seulement ceux qui sont disponibles)

-- Supprimer l'ancienne politique
DROP POLICY IF EXISTS "Available users can view active offers" ON offers;

-- Créer une nouvelle politique qui permet à tous les utilisateurs authentifiés de voir les offres actives
CREATE POLICY "Authenticated users can view active offers"
  ON offers FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND
    status = 'active' AND 
    expires_at > NOW()
  );
