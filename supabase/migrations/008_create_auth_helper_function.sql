-- Fonction helper pour créer un utilisateur dans auth.users depuis l'application
-- Cette fonction permet de contourner les restrictions d'inscription par téléphone

-- Fonction pour créer un utilisateur avec téléphone uniquement
CREATE OR REPLACE FUNCTION public.create_user_with_phone(
  user_phone TEXT,
  user_pseudo TEXT DEFAULT 'Utilisateur',
  user_password TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_user_id UUID;
  temp_email TEXT;
  temp_password TEXT;
BEGIN
  -- Générer un email temporaire basé sur le téléphone
  temp_email := 'user' || regexp_replace(user_phone, '[^0-9]', '', 'g') || '@bookplan.app';
  
  -- Si pas de mot de passe fourni, en générer un
  IF user_password IS NULL THEN
    temp_password := 'temp_' || encode(gen_random_bytes(12), 'base64');
  ELSE
    temp_password := user_password;
  END IF;

  -- Créer l'utilisateur dans auth.users
  -- Note: Cette fonction nécessite les permissions appropriées
  -- On va utiliser une approche différente : insérer directement dans auth.users
  -- Mais cela nécessite des permissions spéciales
  
  -- Pour l'instant, on retourne un UUID généré
  -- L'application devra créer l'utilisateur via l'API Supabase Auth
  new_user_id := gen_random_uuid();
  
  RETURN new_user_id;
END;
$$;

-- Note: Cette fonction est un placeholder
-- En réalité, la création d'utilisateurs dans auth.users doit se faire via l'API Supabase Auth
-- ou via l'API Admin de Supabase avec la service_role key



