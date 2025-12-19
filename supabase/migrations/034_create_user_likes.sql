-- Migration pour créer la table user_likes
-- Permet aux utilisateurs de "liker" d'autres profils

-- Créer la table user_likes
CREATE TABLE IF NOT EXISTS user_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  liker_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  liked_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(liker_id, liked_id),
  CHECK (liker_id != liked_id)
);

-- Créer des index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_user_likes_liker_id ON user_likes(liker_id);
CREATE INDEX IF NOT EXISTS idx_user_likes_liked_id ON user_likes(liked_id);

-- Activer Row Level Security (RLS)
ALTER TABLE user_likes ENABLE ROW LEVEL SECURITY;

-- Politique : Les utilisateurs peuvent voir leurs propres likes
CREATE POLICY "Users can view own likes"
  ON user_likes FOR SELECT
  USING (auth.uid() = liker_id);

-- Politique : Les utilisateurs peuvent voir qui les a likés
CREATE POLICY "Users can view who liked them"
  ON user_likes FOR SELECT
  USING (auth.uid() = liked_id);

-- Politique : Les utilisateurs peuvent créer leurs propres likes
CREATE POLICY "Users can create own likes"
  ON user_likes FOR INSERT
  WITH CHECK (auth.uid() = liker_id);

-- Politique : Les utilisateurs peuvent supprimer leurs propres likes
CREATE POLICY "Users can delete own likes"
  ON user_likes FOR DELETE
  USING (auth.uid() = liker_id);

