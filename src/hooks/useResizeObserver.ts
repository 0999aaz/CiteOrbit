import { useEffect, useRef, useState, type RefObject } from 'react';

export interface Size {
  width: number;
  height: number;
}

export function useResizeObserver(
  elementRef: RefObject<HTMLElement | null>,
  onResize?: (size: Size) => void
): Size {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;

  useEffect(() => {
    const el = elementRef.current;
    if (!el) return;

    const notify = (rawWidth: number, rawHeight: number) => {
      const next: Size = {
        width: Math.round(rawWidth),
        height: Math.round(rawHeight),
      };
      if (onResizeRef.current) {
        onResizeRef.current(next);
      } else {
        setSize(next);
      }
    };

    const rect = el.getBoundingClientRect();
    notify(rect.width, rect.height);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        notify(entry.contentRect.width, entry.contentRect.height);
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [elementRef]);

  return size;
}
