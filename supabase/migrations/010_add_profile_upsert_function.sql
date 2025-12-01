-- Migration pour ajouter une fonction SECURITY DEFINER qui permet
-- de créer/mettre à jour un profil sans être bloqué par RLS
-- Cette fonction est nécessaire car juste après signUp, la session
-- peut ne pas être complètement établie pour que auth.uid() fonctionne

-- Fonction pour créer ou mettre à jour un profil (bypass RLS)
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
  p_is_available BOOLEAN DEFAULT true
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
    updated_at = NOW();
END;
$$;

-- Donner la permission d'exécuter cette fonction aux utilisateurs authentifiés
GRANT EXECUTE ON FUNCTION public.upsert_profile TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_profile TO anon;

