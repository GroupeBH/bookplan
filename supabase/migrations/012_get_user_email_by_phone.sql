-- Migration pour créer une fonction qui récupère l'email d'un utilisateur basé sur son téléphone
-- Cette fonction est nécessaire pour la connexion car on utilise des emails temporaires

-- Fonction pour obtenir l'email d'un utilisateur basé sur son téléphone
CREATE OR REPLACE FUNCTION public.get_user_email_by_phone(p_phone TEXT)
RETURNS TABLE(email TEXT, user_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  found_user_id UUID;
  found_email TEXT;
BEGIN
  -- D'abord, chercher dans la table profiles (plus fiable car c'est là qu'on stocke le téléphone)
  SELECT p.id INTO found_user_id
  FROM public.profiles p
  WHERE 
    p.phone = p_phone 
    OR p.phone = REPLACE(p_phone, '+', '')
    OR p.phone = CASE WHEN p_phone LIKE '+%' THEN p_phone ELSE '+' || p_phone END
  LIMIT 1;

  -- Si trouvé dans profiles, récupérer l'email depuis auth.users
  IF found_user_id IS NOT NULL THEN
    SELECT u.email::TEXT INTO found_email
    FROM auth.users u
    WHERE u.id = found_user_id
    LIMIT 1;

    IF found_email IS NOT NULL THEN
      RETURN QUERY SELECT found_email, found_user_id;
      RETURN;
    END IF;
  END IF;

  -- Sinon, chercher directement dans auth.users
  RETURN QUERY
  SELECT 
    u.email::TEXT,
    u.id
  FROM auth.users u
  WHERE 
    -- Format exact avec +
    u.phone = p_phone 
    OR (u.raw_user_meta_data->>'phone')::TEXT = p_phone
    -- Format sans +
    OR u.phone = REPLACE(p_phone, '+', '')
    OR (u.raw_user_meta_data->>'phone')::TEXT = REPLACE(p_phone, '+', '')
    -- Format avec + si pas déjà présent
    OR u.phone = CASE WHEN p_phone LIKE '+%' THEN p_phone ELSE '+' || p_phone END
    OR (u.raw_user_meta_data->>'phone')::TEXT = CASE WHEN p_phone LIKE '+%' THEN p_phone ELSE '+' || p_phone END
  LIMIT 1;
END;
$$;

-- Donner la permission d'exécuter cette fonction aux utilisateurs authentifiés et anonymes
GRANT EXECUTE ON FUNCTION public.get_user_email_by_phone TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_email_by_phone TO anon;

