import { useState, useEffect, useCallback, useRef } from 'react';

export function useWakeLock() {
  const [isSupported, setIsSupported] = useState<boolean>(false);
  const [isActive, setIsActive] = useState<boolean>(false);
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    setIsSupported('wakeLock' in navigator);
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (sentinelRef.current) {
      try {
        await sentinelRef.current.release();
      } catch (err) {
        console.error('Error al liberar WakeLock:', err);
      } finally {
        sentinelRef.current = null;
        setIsActive(false);
      }
    }
  }, []);

  const requestWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) return;

    try {
      const sentinel = await navigator.wakeLock.request('screen');
      sentinelRef.current = sentinel;
      setIsActive(true);

      sentinel.addEventListener('release', () => {
        sentinelRef.current = null;
        setIsActive(false);
      });
    } catch (err) {
      console.warn('No se pudo adquirir WakeLock:', err);
      setIsActive(false);
    }
  }, []);

  const toggleWakeLock = useCallback(() => {
    if (isActive) {
      releaseWakeLock();
    } else {
      requestWakeLock();
    }
  }, [isActive, requestWakeLock, releaseWakeLock]);

  // Re-solicitar si la página vuelve a estar visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isActive && !sentinelRef.current) {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
    };
  }, [isActive, requestWakeLock, releaseWakeLock]);

  return {
    isSupported,
    isActive,
    requestWakeLock,
    releaseWakeLock,
    toggleWakeLock
  };
}
