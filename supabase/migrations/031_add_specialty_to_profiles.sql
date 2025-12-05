-- Migration pour ajouter le champ specialty (savoir-faire particulier) dans la table profiles

-- Ajouter la colonne specialty
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS specialty TEXT;

-- Supprimer toutes les versions existantes de upsert_profile
-- On doit spécifier la signature exacte de l'ancienne fonction (sans p_specialty)
DROP FUNCTION IF EXISTS public.upsert_profile(
  UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, DECIMAL(3,2), INTEGER, BOOLEAN, TEXT, TEXT, DECIMAL(10,8), DECIMAL(11,8), BOOLEAN
);

-- Mettre à jour la fonction upsert_profile pour inclure specialty
CREATE OR REPLACE FUNCTION public.upsert_profile(
  p_id UUID,
  p_phone TEXT,
  p_pseudo TEXT,
  p_age INTEGER DEFAULT 25,
  p_photo TEXT DEFAULT NULL,
  p_description TEXT DEFAULT '',
  p_rating DECIMAL(3,2) DEFAULT 0,
  p_review_count INTEGER DEFAULT 0,
  p_is_subscribed BOOLEAN DEFAULT false,
  p_subscription_status TEXT DEFAULT 'pending',
  p_gender TEXT DEFAULT 'female',
  p_lat DECIMAL(10, 8) DEFAULT NULL,
  p_lng DECIMAL(11, 8) DEFAULT NULL,
  p_is_available BOOLEAN DEFAULT true,
  p_specialty TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    phone,
    pseudo,
    age,
    photo,
    description,
    rating,
    review_count,
    is_subscribed,
    subscription_status,
    gender,
    lat,
    lng,
    is_available,
    specialty,
    created_at,
    updated_at
  )
  VALUES (
    p_id,
    p_phone,
    p_pseudo,
    p_age,
    p_photo,
    p_description,
    p_rating,
    p_review_count,
    p_is_subscribed,
    p_subscription_status,
    p_gender,
    p_lat,
    p_lng,
    p_is_available,
    p_specialty,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    phone = EXCLUDED.phone,
    pseudo = EXCLUDED.pseudo,
    age = EXCLUDED.age,
    photo = EXCLUDED.photo,
    description = EXCLUDED.description,
    rating = EXCLUDED.rating,
    review_count = EXCLUDED.review_count,
    is_subscribed = EXCLUDED.is_subscribed,
    subscription_status = EXCLUDED.subscription_status,
    gender = EXCLUDED.gender,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    is_available = EXCLUDED.is_available,
    specialty = EXCLUDED.specialty,
    updated_at = NOW();
END;
$$;

-- Donner la permission d'exécuter cette fonction aux utilisateurs authentifiés
GRANT EXECUTE ON FUNCTION public.upsert_profile TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_profile TO anon;

