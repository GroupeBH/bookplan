-- Table pour gérer les offres (à boire, à manger, remboursement transport, présent)
CREATE TABLE IF NOT EXISTS offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  offer_type TEXT NOT NULL CHECK (offer_type IN ('drink', 'food', 'transport', 'gift')),
  title TEXT NOT NULL,
  description TEXT,
  notes TEXT, -- Champ libre pour une note
  offer_date TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_hours DECIMAL(4, 2) NOT NULL DEFAULT 1.0,
  location TEXT,
  lat DECIMAL(10, 8),
  lng DECIMAL(11, 8),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'cancelled', 'expired')),
  selected_application_id UUID, -- L'application sélectionnée par l'auteur
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL -- Calculé automatiquement : offer_date + duration_hours
);

-- Table pour gérer les candidatures aux offres
CREATE TABLE IF NOT EXISTS offer_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID REFERENCES offers(id) ON DELETE CASCADE NOT NULL,
  applicant_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  message TEXT NOT NULL, -- Message obligatoire lors de la candidature
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'selected', 'rejected', 'expired')),
  rejection_message TEXT, -- Message de refus si l'auteur annule
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(offer_id, applicant_id) -- Un utilisateur ne peut candidater qu'une fois par offre
);

-- Activer RLS
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_applications ENABLE ROW LEVEL SECURITY;

-- Politiques pour offers
-- Tous les utilisateurs disponibles peuvent voir les offres actives
CREATE POLICY "Available users can view active offers"
  ON offers FOR SELECT
  USING (
    status = 'active' AND 
    expires_at > NOW() AND
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.is_available = true
    )
  );

-- Les auteurs peuvent voir toutes leurs offres
CREATE POLICY "Authors can view own offers"
  ON offers FOR SELECT
  USING (auth.uid() = author_id);

-- Les utilisateurs peuvent créer des offres
CREATE POLICY "Users can create offers"
  ON offers FOR INSERT
  WITH CHECK (auth.uid() = author_id);

-- Les auteurs peuvent mettre à jour leurs offres
CREATE POLICY "Authors can update own offers"
  ON offers FOR UPDATE
  USING (auth.uid() = author_id);

-- Les auteurs peuvent supprimer leurs offres
CREATE POLICY "Authors can delete own offers"
  ON offers FOR DELETE
  USING (auth.uid() = author_id);

-- Politiques pour offer_applications
-- Les candidats peuvent voir leurs propres candidatures
CREATE POLICY "Applicants can view own applications"
  ON offer_applications FOR SELECT
  USING (auth.uid() = applicant_id);

-- Les auteurs d'offres peuvent voir toutes les candidatures à leurs offres
CREATE POLICY "Authors can view applications to own offers"
  ON offer_applications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM offers 
      WHERE offers.id = offer_applications.offer_id 
      AND offers.author_id = auth.uid()
    )
  );

-- Les utilisateurs disponibles peuvent créer des candidatures
CREATE POLICY "Available users can create applications"
  ON offer_applications FOR INSERT
  WITH CHECK (
    auth.uid() = applicant_id AND
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.is_available = true
    ) AND
    EXISTS (
      SELECT 1 FROM offers 
      WHERE offers.id = offer_applications.offer_id 
      AND offers.status = 'active'
      AND offers.expires_at > NOW()
      AND offers.author_id != auth.uid()
    )
  );

-- Les auteurs peuvent mettre à jour le statut des candidatures
CREATE POLICY "Authors can update application status"
  ON offer_applications FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM offers 
      WHERE offers.id = offer_applications.offer_id 
      AND offers.author_id = auth.uid()
    )
  );

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_offers_author_id ON offers(author_id);
CREATE INDEX IF NOT EXISTS idx_offers_status ON offers(status);
CREATE INDEX IF NOT EXISTS idx_offers_expires_at ON offers(expires_at);
CREATE INDEX IF NOT EXISTS idx_offers_offer_date ON offers(offer_date);
CREATE INDEX IF NOT EXISTS idx_offers_offer_type ON offers(offer_type);
CREATE INDEX IF NOT EXISTS idx_offer_applications_offer_id ON offer_applications(offer_id);
CREATE INDEX IF NOT EXISTS idx_offer_applications_applicant_id ON offer_applications(applicant_id);
CREATE INDEX IF NOT EXISTS idx_offer_applications_status ON offer_applications(status);

-- Fonction pour calculer expires_at automatiquement
CREATE OR REPLACE FUNCTION calculate_offer_expires_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.expires_at = NEW.offer_date + (NEW.duration_hours || ' hours')::INTERVAL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour calculer expires_at
DROP TRIGGER IF EXISTS trigger_calculate_offer_expires_at ON offers;
CREATE TRIGGER trigger_calculate_offer_expires_at
  BEFORE INSERT OR UPDATE OF offer_date, duration_hours ON offers
  FOR EACH ROW
  EXECUTE FUNCTION calculate_offer_expires_at();

-- Fonction pour expirer automatiquement les offres
CREATE OR REPLACE FUNCTION expire_offers()
RETURNS void AS $$
BEGIN
  -- Marquer les offres expirées
  UPDATE offers
  SET status = 'expired', updated_at = NOW()
  WHERE status = 'active' 
    AND expires_at <= NOW();
  
  -- Marquer les candidatures en attente comme expirées
  UPDATE offer_applications
  SET status = 'expired', updated_at = NOW()
  WHERE status = 'pending'
    AND EXISTS (
      SELECT 1 FROM offers 
      WHERE offers.id = offer_applications.offer_id 
      AND offers.status = 'expired'
    );
END;
$$ LANGUAGE plpgsql;

-- Fonction pour sélectionner un candidat
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
  
  -- Mettre à jour l'offre
  UPDATE offers
  SET selected_application_id = p_application_id,
      status = 'closed',
      updated_at = NOW()
  WHERE id = p_offer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction pour rejeter une candidature avec un message
CREATE OR REPLACE FUNCTION reject_offer_application(
  p_application_id UUID,
  p_author_id UUID,
  p_rejection_message TEXT
)
RETURNS void AS $$
DECLARE
  v_offer_id UUID;
BEGIN
  -- Récupérer l'offre associée
  SELECT offer_id INTO v_offer_id
  FROM offer_applications
  WHERE id = p_application_id;
  
  -- Vérifier que l'utilisateur est bien l'auteur de l'offre
  IF NOT EXISTS (
    SELECT 1 FROM offers 
    WHERE id = v_offer_id AND author_id = p_author_id
  ) THEN
    RAISE EXCEPTION 'Vous n''êtes pas l''auteur de cette offre';
  END IF;
  
  -- Rejeter la candidature
  UPDATE offer_applications
  SET status = 'rejected',
      rejection_message = p_rejection_message,
      updated_at = NOW()
  WHERE id = p_application_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction pour annuler une offre (rejette toutes les candidatures avec un message)
CREATE OR REPLACE FUNCTION cancel_offer(
  p_offer_id UUID,
  p_author_id UUID,
  p_cancellation_message TEXT DEFAULT 'L''offre a été annulée par l''auteur.'
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
  
  -- Rejeter toutes les candidatures en attente
  UPDATE offer_applications
  SET status = 'rejected',
      rejection_message = p_cancellation_message,
      updated_at = NOW()
  WHERE offer_id = p_offer_id 
    AND status = 'pending';
  
  -- Annuler l'offre
  UPDATE offers
  SET status = 'cancelled',
      updated_at = NOW()
  WHERE id = p_offer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

