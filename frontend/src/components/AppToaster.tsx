import { useEffect, useRef } from 'react';
import { Toaster, ToastBar, toast, useToaster, useToasterStore } from 'react-hot-toast';
import type { ToasterProps } from 'react-hot-toast';

/**
 * The app's single Toaster.
 *
 * react-hot-toast pauses every toast timer on `mouseenter` of its container and
 * resumes on `mouseleave`. A tap on a phone fires an emulated `mouseenter` with no
 * reliable `mouseleave`, so the pause never ended: the tapped toast stayed up, and
 * every toast after it piled up under it for good. Hover-to-pause only makes sense
 * for a mouse, so a pause that started from touch or pen is ended straight away.
 *
 * Tapping or clicking a toast also dismisses it.
 */
export default function AppToaster(props: ToasterProps) {
  const { handlers } = useToaster(props.toastOptions);
  const { pausedAt } = useToasterStore();
  const lastPointerType = useRef<string>('mouse');

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      lastPointerType.current = event.pointerType || 'mouse';
    };
    window.addEventListener('pointerdown', onPointer, { capture: true, passive: true });
    return () => window.removeEventListener('pointerdown', onPointer, { capture: true });
  }, []);

  useEffect(() => {
    if (pausedAt !== undefined && lastPointerType.current !== 'mouse') {
      handlers.endPause();
    }
  }, [pausedAt, handlers]);

  return (
    <Toaster {...props}>
      {(t) => (
        <div role="presentation" className="cursor-pointer" onClick={() => toast.dismiss(t.id)}>
          <ToastBar toast={t} />
        </div>
      )}
    </Toaster>
  );
}
