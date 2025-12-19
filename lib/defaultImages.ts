import { Image } from 'react-native';

/**
 * Retourne l'URI de l'image par défaut selon le genre de l'utilisateur
 * @param gender - 'male' ou 'female'
 * @returns URI de l'image par défaut (image locale)
 */
export function getDefaultProfileImage(gender?: 'male' | 'female'): string {
  if (gender === 'male') {
    // Image par défaut pour homme
    const avatarMen = require('../assets/images/avatar_men.png');
    return Image.resolveAssetSource(avatarMen).uri;
  } else {
    // Image par défaut pour femme (par défaut)
    const avatarWoman = require('../assets/images/avatar_woman.png');
    return Image.resolveAssetSource(avatarWoman).uri;
  }
}

/**
 * Retourne l'URL de la photo de profil, ou une image par défaut si aucune photo n'est définie
 * @param photoUrl - URL de la photo de profil (peut être null/undefined)
 * @param gender - Genre de l'utilisateur pour déterminer l'image par défaut
 * @returns URL de la photo ou image par défaut
 */
export function getProfileImage(photoUrl?: string | null, gender?: 'male' | 'female'): string {
  if (photoUrl && photoUrl.trim() !== '') {
    return photoUrl;
  }
  return getDefaultProfileImage(gender);
}






