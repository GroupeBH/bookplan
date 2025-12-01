-- Table pour stocker le mapping téléphone -> email temporaire
-- Cela permet de retrouver l'email utilisé pour l'authentification Supabase
-- même après redémarrage de l'application

CREATE TABLE IF NOT EXISTS phone_email_mapping (
  phone TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour les recherches rapides
CREATE INDEX IF NOT EXISTS idx_phone_email_mapping_phone ON phone_email_mapping(phone);
CREATE INDEX IF NOT EXISTS idx_phone_email_mapping_email ON phone_email_mapping(email);

-- Fonction pour obtenir ou créer un email pour un téléphone
CREATE OR REPLACE FUNCTION get_or_create_email_for_phone(user_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  existing_email TEXT;
  new_email TEXT;
  phone_hash TEXT;
BEGIN
  -- Vérifier si un email existe déjà pour ce téléphone
  SELECT email INTO existing_email
  FROM phone_email_mapping
  WHERE phone = user_phone;

  IF existing_email IS NOT NULL THEN
    RETURN existing_email;
  END IF;

  -- Créer un nouvel email basé sur le téléphone
  -- Format: user-{hash}@example.com
  phone_hash := regexp_replace(user_phone, '[^0-9]', '', 'g');
  phone_hash := right(phone_hash, 8); -- Prendre les 8 derniers chiffres
  new_email := 'user-' || phone_hash || '@example.com';

  -- Vérifier si cet email existe déjà
  WHILE EXISTS (SELECT 1 FROM phone_email_mapping WHERE email = new_email) LOOP
    -- Si l'email existe, ajouter un suffixe
    new_email := 'user-' || phone_hash || '-' || floor(random() * 10000)::TEXT || '@example.com';
  END LOOP;

  -- Insérer le mapping
  INSERT INTO phone_email_mapping (phone, email)
  VALUES (user_phone, new_email)
  ON CONFLICT (phone) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = NOW();

  RETURN new_email;
END;
$$;



