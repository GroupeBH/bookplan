-- Migration pour corriger le trigger handle_new_user
-- pour mieux extraire le téléphone depuis les metadata

-- Modifier la fonction pour mieux extraire le téléphone des metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_pseudo TEXT;
  user_phone TEXT;
BEGIN
  -- Extraire le pseudo depuis les metadata
  user_pseudo := COALESCE(
    NEW.raw_user_meta_data->>'pseudo',
    NEW.raw_user_meta_data->>'username',
    NEW.raw_user_meta_data->>'name',
    'Utilisateur'
  );

  -- Extraire le téléphone depuis les metadata (plus fiable que NEW.phone)
  user_phone := COALESCE(
    NEW.raw_user_meta_data->>'phone',
    NEW.phone,
    ''
  );

  -- Créer le profil avec le pseudo et le téléphone depuis les metadata
  INSERT INTO public.profiles (id, phone, pseudo)
  VALUES (
    NEW.id,
    user_phone,
    user_pseudo
  )
  ON CONFLICT (id) DO UPDATE SET
    -- Si le profil existe déjà, mettre à jour le pseudo et le téléphone
    pseudo = CASE 
      WHEN profiles.pseudo = 'Utilisateur' AND user_pseudo != 'Utilisateur' 
      THEN user_pseudo 
      ELSE profiles.pseudo 
    END,
    phone = CASE 
      WHEN profiles.phone IS NULL OR profiles.phone = '' 
      THEN user_phone 
      ELSE profiles.phone 
    END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: Le trigger reste actif et met maintenant à jour le pseudo et le téléphone
-- si le profil existe déjà





