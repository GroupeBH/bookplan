-- Migration pour créer les profils manquants pour les utilisateurs existants
-- Ce script corrige les cas où un utilisateur existe dans auth.users mais pas dans profiles

-- Créer les profils manquants pour tous les utilisateurs existants
INSERT INTO public.profiles (id, phone, pseudo)
SELECT 
  u.id,
  COALESCE(
    u.raw_user_meta_data->> 'phone',
    u.phone,
    ''
  ) AS phone,
  COALESCE(
    u.raw_user_meta_data->>'pseudo',
    u.raw_user_meta_data->>'username',
    u.raw_user_meta_data->>'name',
    'Utilisateur'
  ) AS pseudo
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = u.id
)
ON CONFLICT (id) DO NOTHING;

-- Afficher le nombre de profils créés
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM auth.users u
  WHERE NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = u.id
  );
  
  IF v_count > 0 THEN
    RAISE NOTICE '⚠️ Il reste % utilisateur(s) sans profil. Vérifiez les logs pour plus de détails.', v_count;
  ELSE
    RAISE NOTICE '✅ Tous les utilisateurs ont maintenant un profil.';
  END IF;
END $$;

