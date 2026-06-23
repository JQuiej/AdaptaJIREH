'use client';
import { useOfflineSync } from '@/hooks/useOfflineSync';

export default function OfflineBanner() {
  const { isOnline } = useOfflineSync();
  if (isOnline) return null;
  return (
    <div className="banner-offline">
      Sin conexión — las respuestas se guardarán y sincronizarán al reconectarse
    </div>
  );
}
