'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { rutaPorRol } from '@/lib/rutas';

export function useAuthGuard(requiredRole = null) {
  const { token, user, hasHydrated } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    // Esperar a que Zustand rehidrate desde localStorage antes de decidir
    if (!hasHydrated) return;

    if (!token || !user) {
      router.replace('/login');
      return;
    }
    if (requiredRole && user.role !== requiredRole) {
      router.replace(rutaPorRol(user.role));
    }
  }, [hasHydrated, token, user, requiredRole, router]);

  return { token, user, hasHydrated };
}
