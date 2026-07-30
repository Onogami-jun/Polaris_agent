"use client";

import React, { useState } from "react";
import { cn } from "../../lib/utils";

/* ── Thinking (streaming indicator) ── */
interface ThinkingProps {
  /** Text to show next to the dots */
  label?: string;
  /** Additional class name */
  className?: string;
  /** Whether to show the dots animation (true during streaming) */
  active?: boolean;
}

export function Thinking({ label = "思考中...", className, active = true }: ThinkingProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-border/50 bg-card px-5 py-3.5 text-sm shadow-sm transition-all",
        active ? "opacity-100" : "opacity-0",
        className
      )}
    >
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse-dot"
            style={{ animationDelay: `${i * 200}ms` }}
          />
        ))}
      </div>
      <span className="font-mono text-muted-foreground">{label}</span>
    </div>
  );
}

/* ── Reasoning (collapsible chain of thought) ── */
interface ReasoningProps {
  children: React.ReactNode;
  /** Title of the reasoning section */
  title?: string;
  /** Whether the reasoning is in progress (shows spinner) */
  inProgress?: boolean;
  /** Default open state */
  defaultOpen?: boolean;
  className?: string;
}

export function Reasoning({
  children,
  title = "推理过程",
  inProgress = false,
  defaultOpen = false,
  className,
}: ReasoningProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn("mb-3", className)}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-mono transition-all",
          open
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground hover:text-foreground"
        )}
      >
        {inProgress ? (
          <span className="flex gap-0.5">
            <span className="h-1 w-1 rounded-full bg-current animate-pulse-dot" />
            <span className="h-1 w-1 rounded-full bg-current animate-pulse-dot" style={{ animationDelay: "0.2s" }} />
            <span className="h-1 w-1 rounded-full bg-current animate-pulse-dot" style={{ animationDelay: "0.4s" }} />
          </span>
        ) : (
          <span className={cn("text-[10px] transition-transform", open && "rotate-90")}>▶</span>
        )}
        <span>{title}</span>
      </button>

      {open && (
        <div className="mt-2 rounded-xl border border-border/50 bg-muted/50 px-4 py-3 text-xs leading-relaxed text-muted-foreground animate-fade-in">
          {children}
        </div>
      )}
    </div>
  );
}

/* ── Sources (citation cards) ── */
interface Source {
  title: string;
  url?: string;
  snippet?: string;
}

interface SourcesProps {
  sources: Source[];
  className?: string;
}

export function Sources({ sources, className }: SourcesProps) {
  if (!sources || sources.length === 0) return null;

  return (
    <div className={cn("mb-4 flex flex-wrap gap-2", className)}>
      {sources.map((src, i) => (
        <a
          key={i}
          href={src.url || "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="flex max-w-[220px] flex-col gap-1 rounded-lg border border-border/50 bg-card px-3 py-2 text-xs transition-all hover:border-primary/30 hover:shadow-sm"
        >
          <span className="font-medium text-foreground truncate">{src.title}</span>
          {src.snippet && (
            <span className="text-[10px] text-muted-foreground line-clamp-2">{src.snippet}</span>
          )}
        </a>
      ))}
    </div>
  );
}
