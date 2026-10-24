import { useEffect, useState, type RefObject } from 'react';

export interface Size {
  width: number;
  height: number;
}

export function useResizeObserver(elementRef: RefObject<HTMLElement | null>): Size {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  useEffect(() => {
    const el = elementRef.current;
    if (!el) return;

    // Initial size
    const rect = el.getBoundingClientRect();
    setSize({ width: Math.round(rect.width), height: Math.round(rect.height) });

    const observer = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const entry = entries[0];
      const { width, height } = entry.contentRect;
      setSize({
        width: Math.round(width),
        height: Math.round(height),
      });
    });

    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [elementRef]);

  return size;
}
