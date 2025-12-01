// Fonction utilitaire pour détecter les erreurs réseau
export const isNetworkError = (error: any): boolean => {
  if (!error) return false;
  const message = error.message || error.toString() || '';
  return message.includes('Network request failed') || 
         message.includes('Failed to fetch') ||
         message.includes('NetworkError') ||
         message.includes('ERR_NETWORK') ||
         message.includes('fetch failed');
};

// Fonction pour logger les erreurs de manière silencieuse pour les erreurs réseau
export const logError = (error: any, context: string) => {
  if (isNetworkError(error)) {
    // Erreur réseau silencieuse - ne pas polluer la console
    console.log(`⚠️ Erreur réseau dans ${context}`);
  } else {
    console.error(`Error in ${context}:`, error);
  }
};

