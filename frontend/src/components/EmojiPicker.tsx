import React, { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { useDropdownPosition } from "../hooks/useDropdownPosition";

const EmojiPickerReact = React.lazy(() => import("emoji-picker-react"));

interface EmojiPickerProps {
  value: string;
  onChange: (emoji: string) => void;
  className?: string;
}

export default function EmojiPicker({ value, onChange, className = "" }: EmojiPickerProps) {
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Use dropdown position hook to determine optimal placement
  const { triggerRef, position } = useDropdownPosition<HTMLButtonElement>({
    isOpen: showPicker,
    dropdownHeight: 400,
    dropdownWidth: 300,
    viewportPadding: 16,
  });

  // Merge refs for the container
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    // Update pickerRef for click outside detection
    (pickerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setShowPicker(false);
      }
    }

    if (showPicker) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [showPicker]);

  const handleEmojiClick = (emojiData: { emoji: string }) => {
    onChange(emojiData.emoji);
    setShowPicker(false);
  };

  // Build position classes based on calculated position
  const verticalClass = position.openUpward ? "sm:bottom-full sm:mb-2" : "sm:top-full sm:mt-2";
  const horizontalClass = position.alignRight ? "sm:right-0" : "sm:left-0";
  // Phones get a centred sheet over a backdrop so the picker always fits the screen.
  const isPhone =
    showPicker && typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setShowPicker(!showPicker)}
        className={`text-2xl hover:scale-110 transition-transform ${className}`}
      >
        {value || "😀"}
      </button>
      {showPicker && (
        <div
          className={`fixed inset-0 z-[95] flex items-center justify-center bg-black/40 sm:absolute sm:inset-auto sm:block sm:bg-transparent ${verticalClass} ${horizontalClass}`}
          style={!isPhone && position.maxHeight ? { maxHeight: position.maxHeight } : undefined}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowPicker(false);
          }}
        >
          <Suspense
            fallback={
              <div className="w-[min(300px,calc(100vw-2rem))] h-[400px] bg-gray-100 dark:bg-dusk-800 rounded-lg animate-pulse" />
            }
          >
            <EmojiPickerReact
              onEmojiClick={handleEmojiClick}
              searchDisabled={false}
              skinTonesDisabled
              width={isPhone ? "min(300px, calc(100vw - 2rem))" : 300}
              height={
                isPhone
                  ? "min(400px, 70vh)"
                  : position.maxHeight
                    ? Math.min(400, position.maxHeight)
                    : 400
              }
            />
          </Suspense>
        </div>
      )}
    </div>
  );
}
