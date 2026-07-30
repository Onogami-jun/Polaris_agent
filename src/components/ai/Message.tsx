"use client";

import React, { useState, useEffect } from "react";
import { cn } from "../../lib/utils";

/* ── Message ── */
interface MessageProps {
  from: "user" | "assistant";
  children: React.ReactNode;
  className?: string;
  /** Metadata shown below the message (model, latency) */
  metadata?: string;
  /** Whether to show hover actions */
  showActions?: boolean;
  /** Index for staggered animation */
  index?: number;
}

export function Message({ from, children, className, metadata, showActions = true, index = 0 }: MessageProps) {
  const [hover, setHover] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), index * 50);
    return () => clearTimeout(timer);
  }, [index]);

  if (from === "user") {
    return (
      <div
        className={cn(
          "flex justify-end transition-all duration-300",
          visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
          className
        )}
      >
        <div className="max-w-[75%] rounded-2xl rounded-br-md bg-primary px-5 py-3 text-sm leading-relaxed text-primary-foreground shadow-sm">
          {children}
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div
      className={cn(
        "group relative flex flex-col transition-all duration-300",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
        className
      )}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Message card */}
      <div className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm transition-shadow duration-200 group-hover:shadow-md">
        {/* Avatar / role indicator */}
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
            P
          </div>
          <span className="text-[11px] font-semibold text-muted-foreground">Polaris</span>
        </div>

        {/* Content */}
        <div className="text-sm leading-relaxed text-foreground [&>p]:mb-3 [&>p:last-child]:mb-0 [&>pre]:my-3 [&>pre]:rounded-lg [&>pre]:bg-muted [&>pre]:p-4 [&>pre]:text-xs [&>pre]:font-mono [&>pre]:border [&>pre]:border-border [&>pre]:overflow-x-auto [&>code]:rounded [&>code]:bg-muted [&>code]:px-1.5 [&>code]:py-0.5 [&>code]:text-xs [&>code]:font-mono [&>code]:text-primary [&>pre>code]:bg-transparent [&>pre>code]:p-0 [&>pre>code]:text-foreground [&>ul]:list-disc [&>ul]:pl-6 [&>ol]:list-decimal [&>ol]:pl-6 [&>li]:mb-1 [&>strong]:font-semibold [&>em]:text-muted-foreground [&>h1]:mb-4 [&>h1]:mt-6 [&>h1]:text-lg [&>h1]:font-bold [&>h1]:border-b [&>h1]:border-border [&>h1]:pb-2 [&>h2]:mb-3 [&>h2]:mt-5 [&>h2]:text-base [&>h2]:font-semibold [&>h3]:mb-2 [&>h3]:mt-4 [&>h3]:text-sm [&>h3]:font-semibold">
          {children}
        </div>

        {/* Metadata row */}
        {(metadata || showActions) && (
          <div
            className={cn(
              "mt-3 flex items-center justify-between border-t border-border/30 pt-2.5 transition-opacity duration-150",
              hover ? "opacity-100" : "opacity-30"
            )}
          >
            {metadata ? (
              <span className="text-[10px] font-mono text-muted-foreground">{metadata}</span>
            ) : (
              <span />
            )}
            {/* Action buttons slot — rendered by parent via children in footer */}
            {showActions && (
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                {/* Placeholder for actions; actual actions should be passed as children of the MessageActions wrapper */}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── MessageContent ── */
interface MessageContentProps {
  children: React.ReactNode;
  className?: string;
}

export function MessageContent({ children, className }: MessageContentProps) {
  return <div className={cn("text-sm leading-relaxed", className)}>{children}</div>;
}

/* ── MessageResponse (for consistent assistant message response rendering) ── */
interface MessageResponseProps {
  content: string;
  className?: string;
  /** Render markdown HTML directly */
  html?: boolean;
}

export function MessageResponse({ content, className, html }: MessageResponseProps) {
  if (html) {
    return (
      <div
        dangerouslySetInnerHTML={{ __html: content }}
        className={cn("text-sm leading-relaxed", className)}
      />
    );
  }
  return <div className={cn("text-sm leading-relaxed whitespace-pre-wrap", className)}>{content}</div>;
}
