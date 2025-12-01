-- Migration pour créer une fonction qui s'assure qu'un profil existe pour un utilisateur
-- Cette fonction est utile quand un utilisateur existe dans auth.users mais pas dans profiles

CREATE OR REPLACE FUNCTION public.ensure_profile_exists(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_record auth.users;
  v_user_phone TEXT;
  v_user_pseudo TEXT;
BEGIN
  -- Vérifier si le profil existe déjà
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RETURN; -- Le profil existe déjà, rien à faire
  END IF;

  -- Récupérer les informations de l'utilisateur depuis auth.users
  SELECT * INTO v_user_record
  FROM auth.users
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found in auth.users';
  END IF;

  -- Extraire le téléphone depuis les metadata ou depuis la colonne phone
  v_user_phone := COALESCE(
    v_user_record.raw_user_meta_data->>'phone',
    v_user_record.phone,
    ''
  );

  -- Extraire le pseudo depuis les metadata
  v_user_pseudo := COALESCE(
    v_user_record.raw_user_meta_data->>'pseudo',
    v_user_record.raw_user_meta_data->>'username',
    v_user_record.raw_user_meta_data->>'name',
    'Utilisateur'
  );

  -- Créer le profil
  INSERT INTO public.profiles (id, phone, pseudo)
  VALUES (p_user_id, v_user_phone, v_user_pseudo)
  ON CONFLICT (id) DO NOTHING; -- Si le profil existe déjà (cas de race condition), ne rien faire
END;
$$;

-- Donner la permission d'exécuter cette fonction
GRANT EXECUTE ON FUNCTION public.ensure_profile_exists(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_profile_exists(UUID) TO anon;

