-- Migration pour améliorer le trigger handle_new_user
-- pour mieux gérer le pseudo depuis les metadata

-- Modifier la fonction pour mieux extraire le pseudo des metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_pseudo TEXT;
BEGIN
  -- Extraire le pseudo depuis les metadata
  -- Essayer plusieurs clés possibles
  user_pseudo := COALESCE(
    NEW.raw_user_meta_data->>'pseudo',
    NEW.raw_user_meta_data->>'username',
    NEW.raw_user_meta_data->>'name',
    'Utilisateur'
  );

  -- Créer le profil avec le pseudo depuis les metadata
  -- Si le pseudo n'est pas dans les metadata, utiliser 'Utilisateur' par défaut
  INSERT INTO public.profiles (id, phone, pseudo)
  VALUES (
    NEW.id,
    COALESCE(NEW.phone, ''),
    user_pseudo
  )
  ON CONFLICT (id) DO UPDATE SET
    -- Si le profil existe déjà, mettre à jour le pseudo seulement s'il est "Utilisateur"
    pseudo = CASE 
      WHEN profiles.pseudo = 'Utilisateur' AND user_pseudo != 'Utilisateur' 
      THEN user_pseudo 
      ELSE profiles.pseudo 
    END,
    phone = COALESCE(EXCLUDED.phone, profiles.phone);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: Le trigger reste actif et met maintenant à jour le pseudo
-- si le profil existe déjà avec "Utilisateur" et qu'un meilleur pseudo est disponible

