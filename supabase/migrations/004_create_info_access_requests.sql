-- Table pour gérer les demandes d'accès aux informations
CREATE TABLE IF NOT EXISTS info_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  target_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  -- Quand le requester demande l'accès, le target voit automatiquement les infos du requester
  requester_info_revealed BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CHECK (requester_id != target_id),
  UNIQUE(requester_id, target_id)
);

-- Activer RLS
ALTER TABLE info_access_requests ENABLE ROW LEVEL SECURITY;

-- Politique : Les utilisateurs peuvent voir les demandes où ils sont requester ou target
CREATE POLICY "Users can view own access requests"
  ON info_access_requests FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = target_id);

-- Politique : Les utilisateurs peuvent créer des demandes
CREATE POLICY "Users can create access requests"
  ON info_access_requests FOR INSERT
  WITH CHECK (auth.uid() = requester_id);

-- Politique : Les targets peuvent mettre à jour le statut (accepter/refuser)
CREATE POLICY "Targets can update access request status"
  ON info_access_requests FOR UPDATE
  USING (auth.uid() = target_id);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_info_access_requests_requester_id ON info_access_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_info_access_requests_target_id ON info_access_requests(target_id);
CREATE INDEX IF NOT EXISTS idx_info_access_requests_status ON info_access_requests(status);



