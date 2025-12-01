-- Migration pour créer une fonction qui marque automatiquement l'email comme vérifié
-- Cette fonction est nécessaire car nous utilisons des emails temporaires qui ne peuvent pas être vérifiés via email

-- Fonction pour marquer l'email comme vérifié pour un utilisateur
CREATE OR REPLACE FUNCTION public.verify_user_email(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Marquer l'email comme vérifié
  -- Note: confirmed_at est une colonne générée, on ne peut pas la mettre à jour directement
  -- Elle sera automatiquement mise à jour quand email_confirmed_at est défini
  UPDATE auth.users
  SET 
    email_confirmed_at = COALESCE(email_confirmed_at, NOW())
  WHERE id = p_user_id;
  
  -- confirmed_at sera automatiquement mis à jour par Supabase car c'est une colonne générée
END;
$$;

-- Donner la permission d'exécuter cette fonction aux utilisateurs authentifiés et anonymes
GRANT EXECUTE ON FUNCTION public.verify_user_email TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_user_email TO anon;

