-- Modifier la fonction select_offer_application pour ne pas fermer l'offre
-- L'offre reste active pour permettre à l'auteur d'annuler la candidature acceptée si nécessaire

CREATE OR REPLACE FUNCTION select_offer_application(
  p_offer_id UUID,
  p_application_id UUID,
  p_author_id UUID
)
RETURNS void AS $$
BEGIN
  -- Vérifier que l'utilisateur est bien l'auteur de l'offre
  IF NOT EXISTS (
    SELECT 1 FROM offers 
    WHERE id = p_offer_id AND author_id = p_author_id
  ) THEN
    RAISE EXCEPTION 'Vous n''êtes pas l''auteur de cette offre';
  END IF;
  
  -- Vérifier que la candidature existe et appartient à cette offre
  IF NOT EXISTS (
    SELECT 1 FROM offer_applications 
    WHERE id = p_application_id AND offer_id = p_offer_id
  ) THEN
    RAISE EXCEPTION 'Candidature invalide';
  END IF;
  
  -- Sélectionner la candidature
  UPDATE offer_applications
  SET status = 'selected', updated_at = NOW()
  WHERE id = p_application_id;
  
  -- Rejeter toutes les autres candidatures en attente
  UPDATE offer_applications
  SET status = 'rejected', updated_at = NOW()
  WHERE offer_id = p_offer_id 
    AND id != p_application_id 
    AND status = 'pending';
  
  -- Mettre à jour l'offre (garder le statut 'active' pour permettre l'annulation)
  UPDATE offers
  SET selected_application_id = p_application_id,
      updated_at = NOW()
  WHERE id = p_offer_id;
  -- Note: On ne change pas le statut à 'closed' pour permettre à l'auteur d'annuler la candidature acceptée
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

