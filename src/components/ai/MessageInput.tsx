"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";

/* ── MessageInput ── */
interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Callback when '/' is typed on empty input */
  onCommand?: () => void;
  /** Allow Shift+Enter for newline, Enter to send */
  enterToSend?: boolean;
  /** Minimum height */
  minHeight?: number;
  /** Maximum height before scrolling */
  maxHeight?: number;
  /** Left toolbar (e.g., attach button) */
  toolbarLeft?: React.ReactNode;
  /** Right toolbar (e.g., web search toggle, voice) */
  toolbarRight?: React.ReactNode;
  /** Status text shown below */
  statusText?: string;
  /** Whether to show a stop button instead of send */
  isStreaming?: boolean;
  /** Stop callback */
  onStop?: () => void;
  /** Suggestion chips shown above the input */
  suggestions?: string[];
  /** Called when a suggestion chip is clicked */
  onSuggestionClick?: (suggestion: string) => void;
  /** Whether to auto-focus */
  autoFocus?: boolean;
}

export function MessageInput({
  value,
  onChange,
  onSubmit,
  placeholder = "输入消息...",
  disabled = false,
  className,
  onCommand,
  enterToSend = true,
  minHeight = 28,
  maxHeight = 160,
  toolbarLeft,
  toolbarRight,
  statusText,
  isStreaming = false,
  onStop,
  suggestions,
  onSuggestionClick,
  autoFocus = false,
}: MessageInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);

  // Auto-resize
  const adjustHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const newHeight = Math.min(Math.max(ta.scrollHeight, minHeight), maxHeight);
    ta.style.height = `${newHeight}px`;
  }, [minHeight, maxHeight]);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  // Auto-focus
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (enterToSend && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled) onSubmit();
    }
    if (onCommand && e.key === "/" && !value) {
      e.preventDefault();
      onCommand();
    }
  }

  return (
    <div className={cn("w-full max-w-3xl mx-auto", className)}>
      {/* Suggestions */}
      {suggestions && suggestions.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2 justify-center">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => onSuggestionClick?.(s)}
              disabled={disabled || isStreaming}
              className="rounded-full border border-border bg-card px-4 py-1.5 text-xs text-muted-foreground transition-all hover:border-primary/30 hover:text-foreground hover:bg-primary/5 disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input card */}
      <div
        className={cn(
          "rounded-2xl border bg-card shadow-sm transition-all duration-200",
          focused
            ? "border-primary/40 ring-1 ring-primary/20 shadow-md"
            : "border-border",
          disabled && "opacity-70"
        )}
      >
        <div className="flex items-end gap-0 px-2 py-1.5">
          {/* Left toolbar */}
          {toolbarLeft && (
            <div className="flex items-center gap-1 pb-1 pl-1 shrink-0">{toolbarLeft}</div>
          )}

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className={cn(
              "flex-1 resize-none bg-transparent border-0 px-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/50",
              "focus:ring-0 focus:outline-none"
            )}
            style={{ minHeight: `${minHeight}px`, maxHeight: `${maxHeight}px` }}
          />

          {/* Right toolbar */}
          <div className="flex items-center gap-0.5 pb-1 pr-1 shrink-0">
            {toolbarRight}

            {isStreaming ? (
              <Button
                size="icon"
                variant="destructive"
                className="h-9 w-9 rounded-full"
                onClick={onStop}
                title="停止生成"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <rect x="1" y="1" width="10" height="10" rx="1" />
                </svg>
              </Button>
            ) : (
              <Button
                size="icon"
                className="h-9 w-9 rounded-full shadow-sm transition-all hover:shadow-md"
                onClick={onSubmit}
                disabled={!value.trim() || disabled}
                title="发送 (Enter)"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M2 8l12-6-6 12-2-6-4-0z" fill="currentColor" />
                </svg>
              </Button>
            )}
          </div>
        </div>

        {/* Status bar */}
        {statusText && (
          <div className="flex items-center justify-between border-t border-border/50 px-4 py-1.5">
            <span className="text-[10px] font-mono text-muted-foreground">{statusText}</span>
            <span className="text-[10px] font-mono text-muted-foreground/50">
              Enter 发送 · Shift+Enter 换行
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── WebSearchButton ── */
interface WebSearchButtonProps {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}

export function WebSearchButton({ active, onClick, disabled }: WebSearchButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-full border transition-all",
        active
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted",
        disabled && "opacity-50 cursor-not-allowed"
      )}
      title="联网搜索"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
      </svg>
    </button>
  );
}
