"use client";

import React from "react";
import { cn } from "../../lib/utils";

/* ── Suggestion (clickable suggestion chips) ── */
interface SuggestionProps {
  suggestions: string[];
  onSelect: (suggestion: string) => void;
  className?: string;
  disabled?: boolean;
}

export function Suggestion({ suggestions, onSelect, className, disabled = false }: SuggestionProps) {
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {suggestions.map((s, i) => (
        <button
          key={i}
          onClick={() => onSelect(s)}
          disabled={disabled}
          className={cn(
            "rounded-full border border-border bg-card px-4 py-1.5 text-xs text-muted-foreground transition-all hover:border-primary/30 hover:text-foreground hover:bg-primary/5 hover:shadow-sm",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

/* ── SuggestionsList (centered suggestions for empty state) ── */
interface SuggestionsListProps {
  suggestions: string[];
  onSelect: (suggestion: string) => void;
  className?: string;
  title?: string;
  showIcons?: boolean;
}

const SUGGESTION_ICONS = ["📦", "📅", "📋", "🚚", "📊", "🔍", "💡", "⚡"];

export function SuggestionsList({
  suggestions,
  onSelect,
  className,
  title,
  showIcons = false,
}: SuggestionsListProps) {
  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      {title && (
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
      )}
      <div className="flex flex-wrap gap-2 justify-center max-w-lg">
        {suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => onSelect(s)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs text-muted-foreground transition-all hover:border-primary/30 hover:text-foreground hover:bg-primary/5 hover:shadow-sm hover:-translate-y-0.5",
              "active:translate-y-0"
            )}
          >
            {showIcons && <span className="text-sm">{SUGGESTION_ICONS[i % SUGGESTION_ICONS.length]}</span>}
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
