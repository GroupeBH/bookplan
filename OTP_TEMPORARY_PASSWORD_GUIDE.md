# Guide : Mot de passe temporaire généré via OTP

## 📋 Vue d'ensemble

Lors de la création d'un compte via OTP (One-Time Password), un **mot de passe temporaire aléatoire** est automatiquement généré et utilisé pour créer l'utilisateur dans Supabase Auth.

## 🔑 Format du mot de passe temporaire

Le mot de passe temporaire suit le format suivant :
```
otp_temp_{10 caractères aléatoires}A1!
```

Exemple : `otp_temp_abc123xyz4A1!`

## 📍 Où trouver le mot de passe temporaire ?

### 1. **Dans les logs de la console**
Lors de la création d'un compte via OTP, vous verrez dans les logs :
```
🔐 ========== CRÉATION COMPTE VIA OTP ==========
📱 Téléphone: +243999540232
📧 Email temporaire: jonathantshombe+99540232@gmail.com
🔑 MOT DE PASSE TEMPORAIRE: otp_temp_abc123xyz4A1!
⏰ Durée de validité: PERMANENT (jusqu'à changement)
💾 Stockage: auth.users.encrypted_password (hashé par Supabase)
⚠️ IMPORTANT: Notez ce mot de passe pour vous connecter plus tard!
===============================================
```

### 2. **Dans une alerte popup**
Une alerte s'affiche également sur l'écran avec le mot de passe temporaire.

## ⏰ Durée de validité

**IMPORTANT** : Le mot de passe temporaire est **PERMANENT** jusqu'à ce que vous le changiez.

- ❌ Il n'expire **PAS** automatiquement
- ✅ Il reste valide jusqu'à ce que vous utilisiez "Mot de passe oublié" pour le réinitialiser
- ✅ Vous pouvez vous connecter avec ce mot de passe à tout moment

## 💾 Stockage dans la base de données

### Où est stocké le mot de passe ?

Le mot de passe est stocké dans la table **`auth.users`** de Supabase (table système) :

- **Colonne** : `encrypted_password`
- **Format** : Hashé avec bcrypt par Supabase
- **Sécurité** : Le mot de passe en clair n'est jamais stocké, seulement le hash

### Comment vérifier si le mot de passe existe ?

Vous pouvez utiliser la fonction RPC `verify_user_info` pour vérifier si un utilisateur a un mot de passe :

```sql
SELECT * FROM verify_user_info('user_id_here');
```

La colonne `has_password` indiquera `true` si un mot de passe existe.

## 🔐 Comment se connecter avec le mot de passe temporaire ?

1. **Ouvrir l'application** → Mode "Se connecter"
2. **Entrer le numéro de téléphone** utilisé lors de la création du compte
3. **Aller à l'étape "Mot de passe"**
4. **Entrer le mot de passe temporaire** que vous avez noté
5. **Cliquer sur "Se connecter"**

## ⚠️ Notes importantes

1. **Notez le mot de passe** : Le mot de passe temporaire est généré une seule fois. Si vous ne le notez pas, vous devrez utiliser "Mot de passe oublié" pour le réinitialiser.

2. **Email associé** : Le mot de passe est associé à l'email temporaire généré (format : `jonathantshombe+{phone_hash}@gmail.com`). C'est cet email qui est utilisé en interne par Supabase pour l'authentification.

3. **Changement de mot de passe** : Vous pouvez changer le mot de passe à tout moment en utilisant la fonctionnalité "Mot de passe oublié" dans l'application.

4. **Sécurité** : Bien que le mot de passe soit "temporaire" dans le sens où il est généré automatiquement, il est aussi sécurisé qu'un mot de passe normal. Il est hashé et stocké de manière sécurisée par Supabase.

## 🛠️ Pour les développeurs

### Génération du mot de passe

Le mot de passe est généré dans `context/AuthContext.tsx` dans la fonction `verifyOTP` :

```typescript
const tempPassword = 'otp_temp_' + Math.random().toString(36).slice(-10) + 'A1!';
```

### Format
- Préfixe : `otp_temp_`
- 10 caractères aléatoires (base36 : 0-9, a-z)
- Suffixe : `A1!` (pour respecter les exigences de complexité)

### Logs

Les logs sont affichés dans :
- Console (via `console.log`)
- Alerte popup (via `Alert.alert`)

## 📝 Exemple complet

1. **Création du compte** :
   - Téléphone : `+243999540232`
   - OTP : `123456`
   - Mot de passe temporaire généré : `otp_temp_xyz789abc1A1!`
   - Email temporaire : `jonathantshombe+99540232@gmail.com`

2. **Connexion** :
   - Téléphone : `+243999540232`
   - Mot de passe : `otp_temp_xyz789abc1A1!`
   - ✅ Connexion réussie

## 🔄 Réinitialisation du mot de passe

Si vous avez oublié le mot de passe temporaire :

1. Cliquez sur "Mot de passe oublié ?" dans l'écran de connexion
2. Un email de réinitialisation sera envoyé à l'email temporaire associé
3. Suivez les instructions dans l'email pour définir un nouveau mot de passe

---

**Note** : En production, il est recommandé de ne pas afficher le mot de passe temporaire dans une alerte, mais seulement dans les logs pour les développeurs.


