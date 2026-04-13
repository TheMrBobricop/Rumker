import { useState, useEffect, useRef } from 'react';

const reducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface UseAnimatedMountOptions {
  enterClass: string;
  exitClass: string;
  duration: number;
}

interface UseAnimatedMountResult {
  mounted: boolean;
  className: string;
}

export function useAnimatedMount(
  open: boolean,
  opts: UseAnimatedMountOptions,
): UseAnimatedMountResult {
  const [mounted, setMounted] = useState(open);
  const [phase, setPhase] = useState<'enter' | 'exit' | 'idle'>(
    open ? 'enter' : 'idle',
  );
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (open) {
      clearTimeout(timerRef.current);
      setMounted(true);
      setPhase('enter');
    } else if (mounted) {
      if (reducedMotion) {
        setMounted(false);
        setPhase('idle');
        return;
      }
      setPhase('exit');
      timerRef.current = setTimeout(() => {
        setMounted(false);
        setPhase('idle');
      }, opts.duration);
    }
    return () => clearTimeout(timerRef.current);
  }, [open]);

  const className = phase === 'enter' ? opts.enterClass : phase === 'exit' ? opts.exitClass : '';

  return { mounted, className };
}

// Presets for common patterns
export const ANIM_MODAL = {
  enterClass: 'animate-fade-scale-in',
  exitClass: 'animate-fade-scale-out',
  duration: 120,
};

export const ANIM_BACKDROP = {
  enterClass: 'animate-backdrop-in',
  exitClass: 'animate-backdrop-out',
  duration: 200,
};

export const ANIM_PICKER = {
  enterClass: 'animate-picker-slide-up',
  exitClass: 'animate-picker-slide-down',
  duration: 120,
};

export const ANIM_ATTACHMENT = {
  enterClass: 'animate-attachment-menu-in',
  exitClass: 'animate-attachment-menu-out',
  duration: 150,
};

export const ANIM_PIN_PANEL = {
  enterClass: 'animate-pin-panel-in',
  exitClass: 'animate-pin-panel-out',
  duration: 180,
};

export const ANIM_FADE_SLIDE = {
  enterClass: 'animate-fade-slide-in',
  exitClass: 'animate-fade-slide-out',
  duration: 150,
};

export const ANIM_OVERLAY = {
  enterClass: 'animate-fade-slide-in',
  exitClass: 'animate-overlay-out',
  duration: 250,
};

export const ANIM_CTX_MENU = {
  enterClass: 'animate-ctx-menu-in',
  exitClass: 'animate-ctx-menu-out',
  duration: 120,
};
