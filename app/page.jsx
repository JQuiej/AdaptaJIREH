'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

export default function RootPage() {
  const { token, user } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!token || !user) {
      router.replace('/login');
    } else {
      router.replace(user.role === 'docente' ? '/teacher' : '/student');
    }
  }, [token, user, router]);

  return null;
}
