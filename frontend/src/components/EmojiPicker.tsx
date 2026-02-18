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
  const verticalClass = position.openUpward ? "bottom-full mb-2" : "top-full mt-2";
  const horizontalClass = position.alignRight ? "right-0" : "left-0";

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
          className={`absolute z-[95] ${verticalClass} ${horizontalClass}`}
          style={position.maxHeight ? { maxHeight: position.maxHeight } : undefined}
        >
          <Suspense
            fallback={
              <div className="w-[300px] h-[400px] bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
            }
          >
            <EmojiPickerReact
              onEmojiClick={handleEmojiClick}
              searchDisabled={false}
              skinTonesDisabled
              width={300}
              height={position.maxHeight ? Math.min(400, position.maxHeight) : 400}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
}
