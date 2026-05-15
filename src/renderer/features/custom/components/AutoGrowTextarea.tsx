import { useLayoutEffect, useRef } from 'react';

interface AutoGrowTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

function AutoGrowTextarea({ value, onChange, placeholder = '' }: AutoGrowTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const element = textareaRef.current;
    if (!element) {
      return;
    }
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      className="custom-textarea custom-textarea-autogrow"
      value={value}
      placeholder={placeholder}
      rows={1}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}

export default AutoGrowTextarea;
