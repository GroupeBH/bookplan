-- Migration pour créer une fonction de test qui vérifie si un utilisateur existe
-- et retourne des informations de débogage (sans exposer le mot de passe)
-- Cette fonction est utile pour déboguer les problèmes de connexion

-- Fonction pour vérifier les informations d'un utilisateur (pour débogage)
CREATE OR REPLACE FUNCTION public.verify_user_info(p_user_id UUID)
RETURNS TABLE(
  user_id UUID,
  email TEXT,
  phone TEXT,
  phone_in_metadata TEXT,
  created_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  has_password BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id,
    u.email::TEXT,
    u.phone::TEXT,
    (u.raw_user_meta_data->>'phone')::TEXT,
    u.created_at,
    u.confirmed_at,
    (u.encrypted_password IS NOT NULL) as has_password
  FROM auth.users u
  WHERE u.id = p_user_id
  LIMIT 1;
END;
$$;

-- Donner la permission d'exécuter cette fonction aux utilisateurs authentifiés et anonymes
GRANT EXECUTE ON FUNCTION public.verify_user_info TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_user_info TO anon;

