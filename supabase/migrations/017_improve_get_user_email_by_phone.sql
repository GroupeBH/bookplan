-- Migration pour améliorer la fonction get_user_email_by_phone
-- pour mieux chercher dans auth.users même si le profil n'existe pas

-- Fonction améliorée pour obtenir l'email d'un utilisateur basé sur son téléphone
CREATE OR REPLACE FUNCTION public.get_user_email_by_phone(p_phone TEXT)
RETURNS TABLE(email TEXT, user_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  found_user_id UUID;
  found_email TEXT;
  normalized_phone TEXT;
  normalized_phone_no_plus TEXT;
  phone_digits TEXT;
  phone_hash TEXT;
  generated_email TEXT;
BEGIN
  -- Normaliser le téléphone
  normalized_phone := CASE 
    WHEN p_phone LIKE '+%' THEN p_phone 
    ELSE '+' || p_phone 
  END;
  normalized_phone_no_plus := REPLACE(normalized_phone, '+', '');

  -- D'abord, chercher dans la table profiles (plus fiable car c'est là qu'on stocke le téléphone)
  -- Chercher avec tous les formats possibles
  SELECT p.id INTO found_user_id
  FROM public.profiles p
  WHERE 
    -- Format exact
    p.phone = normalized_phone 
    OR p.phone = normalized_phone_no_plus
    OR p.phone = p_phone
    OR p.phone = REPLACE(p_phone, '+', '')
    -- Format avec + si pas déjà présent
    OR p.phone = CASE WHEN p_phone LIKE '+%' THEN p_phone ELSE '+' || p_phone END
    -- Format sans + si présent
    OR p.phone = CASE WHEN p_phone LIKE '+%' THEN REPLACE(p_phone, '+', '') ELSE p_phone END
    -- Comparaison insensible à la casse et aux espaces
    OR TRIM(p.phone) = TRIM(normalized_phone)
    OR TRIM(p.phone) = TRIM(normalized_phone_no_plus)
    OR TRIM(p.phone) = TRIM(p_phone)
    OR TRIM(p.phone) = TRIM(REPLACE(p_phone, '+', ''))
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
    ELSE
      -- Si l'email n'est pas trouvé dans auth.users, générer l'email basé sur le téléphone
      -- Format: jonathantshombe+{8 derniers chiffres}@gmail.com
      phone_digits := REPLACE(normalized_phone, '+', '');
      phone_hash := RIGHT(phone_digits, 8); -- 8 derniers chiffres
      generated_email := 'jonathantshombe+' || phone_hash || '@gmail.com';
      RETURN QUERY SELECT generated_email, found_user_id;
      RETURN;
    END IF;
  END IF;

  -- Sinon, chercher directement dans auth.users en utilisant les metadata
  -- C'est important car le profil peut ne pas exister encore ou le téléphone peut être mal stocké
  FOR found_user_id, found_email IN
    SELECT 
      u.id,
      u.email::TEXT
    FROM auth.users u
    WHERE 
      -- Format exact avec +
      (u.raw_user_meta_data->>'phone')::TEXT = normalized_phone
      -- Format sans +
      OR (u.raw_user_meta_data->>'phone')::TEXT = normalized_phone_no_plus
      -- Format original (avec ou sans +)
      OR (u.raw_user_meta_data->>'phone')::TEXT = p_phone
      OR (u.raw_user_meta_data->>'phone')::TEXT = REPLACE(p_phone, '+', '')
      -- Format avec + si pas déjà présent
      OR (u.raw_user_meta_data->>'phone')::TEXT = CASE 
        WHEN p_phone LIKE '+%' THEN p_phone 
        ELSE '+' || p_phone 
      END
      -- Aussi chercher dans u.phone (peut être défini)
      OR u.phone = normalized_phone
      OR u.phone = normalized_phone_no_plus
      OR u.phone = p_phone
      OR u.phone = REPLACE(p_phone, '+', '')
    LIMIT 1
  LOOP
    RETURN QUERY SELECT found_email, found_user_id;
    RETURN;
  END LOOP;

  -- Si rien trouvé, retourner vide
  RETURN;
END;
$$;

-- Donner la permission d'exécuter cette fonction aux utilisateurs authentifiés et anonymes
GRANT EXECUTE ON FUNCTION public.get_user_email_by_phone TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_email_by_phone TO anon;

