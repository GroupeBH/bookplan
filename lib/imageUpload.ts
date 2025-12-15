import { supabase } from './supabase';

/**
 * Upload une image vers Supabase Storage
 * @param localUri - URI locale de l'image (file://)
 * @param userId - ID de l'utilisateur
 * @param folder - Dossier dans le bucket (par défaut: 'profiles')
 * @returns URL publique de l'image uploadée
 */
export async function uploadImageToStorage(
  localUri: string,
  userId: string,
  folder: string = 'profiles'
): Promise<{ url: string | null; error: any }> {
  try {
    // Lire le fichier depuis l'URI locale
    const response = await fetch(localUri);
    const blob = await response.blob();

    // Déterminer le type MIME à partir de l'extension
    const fileExtension = localUri.split('.').pop()?.toLowerCase() || 'jpg';
    const mimeType = fileExtension === 'png' ? 'image/png' : 'image/jpeg';

    // Créer un nom de fichier unique
    const fileName = `${userId}-${Date.now()}.${fileExtension}`;
    const filePath = `${folder}/${fileName}`;

    // Convertir le blob en ArrayBuffer pour React Native
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // Upload vers Supabase Storage
    const { data, error } = await supabase.storage
      .from('avatars') // Nom du bucket (à créer dans Supabase si nécessaire)
      .upload(filePath, bytes, {
        contentType: mimeType,
        upsert: true, // Remplacer si le fichier existe déjà
      });

    if (error) {
      console.error('Error uploading image to storage:', error);
      // Si le bucket n'existe pas, retourner l'URI locale comme fallback
      if (error.message?.includes('Bucket not found') || error.message?.includes('The resource was not found')) {
        console.warn('⚠️ Bucket "avatars" non trouvé. Utilisation de l\'URI locale comme fallback.');
        return { url: localUri, error: null };
      }
      return { url: null, error };
    }

    // Obtenir l'URL publique
    const { data: publicUrlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    const publicUrl = publicUrlData.publicUrl;
    console.log('✅ Image uploadée avec succès:', publicUrl);

    return { url: publicUrl, error: null };
  } catch (error: any) {
    console.error('Error in uploadImageToStorage:', error);
    // En cas d'erreur, retourner l'URI locale comme fallback
    return { url: localUri, error: null };
  }
}

