-- Table pour stocker les sujets de compagnie disponibles
CREATE TABLE IF NOT EXISTS companionship_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT, -- Nom de l'icône (ex: "flask", "book", "musical-notes", etc.)
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Activer RLS
ALTER TABLE companionship_topics ENABLE ROW LEVEL SECURITY;

-- Politique : Tous les utilisateurs authentifiés peuvent voir les sujets actifs
CREATE POLICY "Users can view active topics"
  ON companionship_topics FOR SELECT
  USING (is_active = true);

-- Insérer des sujets par défaut
INSERT INTO companionship_topics (name, description, icon, display_order) VALUES
  ('Scientifique', 'Discussions sur les sciences, recherche, découvertes', 'flask', 1),
  ('Littérature', 'Échanges sur les livres, la poésie, l''écriture', 'book', 2),
  ('Musique', 'Partage musical, concerts, composition', 'musical-notes', 3),
  ('Art & Culture', 'Visites de musées, expositions, art visuel', 'color-palette', 4),
  ('Sport & Fitness', 'Activités sportives, entraînement, bien-être', 'fitness', 5),
  ('Cuisine', 'Cours de cuisine, découverte culinaire, recettes', 'restaurant', 6),
  ('Voyage & Découverte', 'Exploration de nouveaux endroits, tourisme', 'airplane', 7),
  ('Technologie', 'Discussions tech, innovation, développement', 'laptop', 8),
  ('Philosophie', 'Réflexions profondes, éthique, métaphysique', 'bulb', 9),
  ('Cinéma & Théâtre', 'Films, pièces de théâtre, critique', 'film', 10),
  ('Nature & Environnement', 'Randonnées, écologie, observation de la nature', 'leaf', 11),
  ('Autre', 'Autre sujet de compagnie', 'ellipsis-horizontal', 12)
ON CONFLICT (name) DO NOTHING;

-- Ajouter la colonne topic_id à la table bookings
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS topic_id UUID REFERENCES companionship_topics(id) ON DELETE SET NULL;

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_bookings_topic_id ON bookings(topic_id);
CREATE INDEX IF NOT EXISTS idx_companionship_topics_is_active ON companionship_topics(is_active);
CREATE INDEX IF NOT EXISTS idx_companionship_topics_display_order ON companionship_topics(display_order);

