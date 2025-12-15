/**
 * Retourne une URL d'image par défaut selon le genre de l'utilisateur
 * @param gender - 'male' ou 'female'
 * @returns URL de l'image par défaut
 */
export function getDefaultProfileImage(gender?: 'male' | 'female'): string {
  if (gender === 'male') {
    // Image par défaut pour homme
    return 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop';
  } else {
    // Image par défaut pour femme (par défaut)
    return 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop';
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



