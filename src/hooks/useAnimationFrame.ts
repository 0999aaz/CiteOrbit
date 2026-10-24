import { useEffect, useRef } from 'react';

export function useAnimationFrame(callback: (timeSec: number, deltaTimeMs: number) => void) {
  const requestRef = useRef<number | null>(null);
  const previousTimeRef = useRef<number | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const animate = (time: number) => {
      const deltaTimeMs = previousTimeRef.current !== null ? time - previousTimeRef.current : 16.67;
      callbackRef.current(time / 1000, deltaTimeMs);
      previousTimeRef.current = time;
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      if (requestRef.current !== null) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, []);
}
