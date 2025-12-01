# Note sur le champ `password_hash` dans la table `profiles`

## Pourquoi `password_hash` est NULL ?

Le champ `password_hash` dans la table `profiles` est **volontairement NULL** et c'est **normal**.

### Raison technique

Supabase stocke automatiquement les mots de passe dans la table `auth.users` (table système de Supabase). Les mots de passe sont :
- Hashés avec bcrypt
- Stockés de manière sécurisée
- Gérés par Supabase Auth

### Pourquoi ne pas stocker dans `profiles` ?

1. **Sécurité** : Supabase gère la sécurité des mots de passe (hashing, salting, etc.)
2. **Séparation des responsabilités** : `auth.users` pour l'authentification, `profiles` pour les données utilisateur
3. **Pas de duplication** : Évite de stocker le même hash deux fois

### Le champ `password_hash` dans `profiles`

Ce champ a été ajouté dans la migration `006_update_profiles_with_availability.sql` mais n'est **pas utilisé** dans l'application actuelle. Il peut être :
- **Supprimé** si vous ne prévoyez pas de l'utiliser
- **Conservé** pour une utilisation future (par exemple, si vous voulez migrer vers un autre système d'authentification)

### Conclusion

**C'est normal que `password_hash` soit NULL**. Les mots de passe sont stockés dans `auth.users` par Supabase, ce qui est la meilleure pratique de sécurité.



