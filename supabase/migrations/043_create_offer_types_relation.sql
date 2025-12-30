-- Table de relation pour gérer plusieurs types par offre
CREATE TABLE IF NOT EXISTS offer_offer_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID REFERENCES offers(id) ON DELETE CASCADE NOT NULL,
  offer_type TEXT NOT NULL CHECK (offer_type IN ('drink', 'food', 'transport', 'gift')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(offer_id, offer_type) -- Un type ne peut être associé qu'une fois à une offre
);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_offer_offer_types_offer_id ON offer_offer_types(offer_id);
CREATE INDEX IF NOT EXISTS idx_offer_offer_types_offer_type ON offer_offer_types(offer_type);

-- Activer RLS
ALTER TABLE offer_offer_types ENABLE ROW LEVEL SECURITY;

-- Politiques RLS pour offer_offer_types
-- Tous les utilisateurs peuvent voir les types d'offres
CREATE POLICY "Anyone can view offer types"
  ON offer_offer_types FOR SELECT
  USING (true);

-- Les auteurs peuvent gérer les types de leurs offres
CREATE POLICY "Authors can manage types of own offers"
  ON offer_offer_types FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM offers 
      WHERE offers.id = offer_offer_types.offer_id 
      AND offers.author_id = auth.uid()
    )
  );

-- Migrer les données existantes : créer des entrées dans offer_offer_types pour chaque offre existante
INSERT INTO offer_offer_types (offer_id, offer_type)
SELECT id, offer_type
FROM offers
WHERE offer_type IS NOT NULL
ON CONFLICT (offer_id, offer_type) DO NOTHING;

-- Rendre le champ offer_type optionnel dans la table offers (pour rétrocompatibilité)
-- On garde le champ mais on ne l'utilisera plus comme source de vérité
-- Les types seront maintenant gérés via la table offer_offer_types

