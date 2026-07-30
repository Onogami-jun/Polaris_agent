"use client";

import React from "react";
import { cn } from "../../lib/utils";

interface MessageListProps {
  children: React.ReactNode;
  className?: string;
  /** Animate incoming messages */
  animated?: boolean;
}

export function MessageList({ children, className, animated = true }: MessageListProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4",
        animated && "[&>*]:animate-fade-in",
        className
      )}
    >
      {children}
    </div>
  );
}

/* ── MessageListLoading ── */
export function MessageListLoading({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "flex",
            i % 2 === 0 ? "justify-start" : "justify-end"
          )}
        >
          <div
            className={cn(
              "animate-pulse rounded-2xl bg-muted",
              i % 2 === 0
                ? "h-16 w-3/5 rounded-bl-md"
                : "h-10 w-2/5 rounded-br-md"
            )}
          />
        </div>
      ))}
    </div>
  );
}
