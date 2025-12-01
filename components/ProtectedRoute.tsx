import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'expo-router';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

// Pages publiques (accessibles sans authentification)
const PUBLIC_ROUTES = ['/(screens)/splash', '/(screens)/auth', '/'];

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Ne rien faire pendant le chargement initial
    if (isLoading) return;
    
    // Si pas de pathname, ne rien faire
    if (!pathname) return;

    const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

    // Si non authentifié et pas sur une route publique, rediriger vers auth
    if (!isAuthenticated && !isPublicRoute) {
      router.replace('/(screens)/auth');
      return;
    }

    // Si authentifié et sur auth ou index, rediriger vers dashboard
    if (isAuthenticated && (pathname === '/(screens)/auth' || pathname === '/')) {
      router.replace('/(screens)/dashboard');
      return;
    }
  }, [isAuthenticated, isLoading, pathname, router]);

  // Toujours rendre les enfants - ne jamais bloquer le rendu
  return <>{children}</>;
}

