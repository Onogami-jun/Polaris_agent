"use client";

import React, { createContext, useContext, useRef, useEffect, useState, useCallback } from "react";
import { cn } from "../../lib/utils";

/* ── Conversation Context ── */
interface ConversationContextValue {
  streaming: boolean;
  setStreaming: (v: boolean) => void;
  scrollToBottom: () => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

const ConversationCtx = createContext<ConversationContextValue>({
  streaming: false,
  setStreaming: () => {},
  scrollToBottom: () => {},
  messagesEndRef: { current: null },
});

export function useConversation() {
  return useContext(ConversationCtx);
}

/* ── Conversation ── */
interface ConversationProps {
  children: React.ReactNode;
  className?: string;
  onScrollTopReached?: () => void;
}

export function Conversation({ children, className, onScrollTopReached }: ConversationProps) {
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevScrollHeight = useRef(0);

  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  // Handle scroll-to-top for pagination
  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    if (e.currentTarget.scrollTop === 0 && onScrollTopReached) {
      onScrollTopReached();
    }
  }

  // Track scroll height for streaming auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      prevScrollHeight.current = scrollRef.current.scrollHeight;
    }
  });

  // Auto-scroll during streaming
  useEffect(() => {
    if (streaming) {
      scrollToBottom();
    }
  }, [streaming, scrollToBottom]);

  // Auto-scroll on children change during streaming
  useEffect(() => {
    if (streaming && scrollRef.current) {
      const currentHeight = scrollRef.current.scrollHeight;
      if (currentHeight > prevScrollHeight.current) {
        scrollToBottom();
        prevScrollHeight.current = currentHeight;
      }
    }
  });

  return (
    <ConversationCtx.Provider value={{ streaming, setStreaming, scrollToBottom, messagesEndRef }}>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={cn("flex flex-1 flex-col overflow-y-auto px-4 py-6 scroll-smooth", className)}
      >
        <div className="mx-auto w-full max-w-3xl flex flex-col gap-6">
          {children}
          <div ref={messagesEndRef} />
        </div>
      </div>
    </ConversationCtx.Provider>
  );
}

/* ── ConversationEmpty ── */
interface ConversationEmptyProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

export function ConversationEmpty({ icon, title, description, children, className }: ConversationEmptyProps) {
  return (
    <div className={cn("flex flex-1 flex-col items-center justify-center gap-6 py-24 text-center", className)}>
      {icon && <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-2xl">{icon}</div>}
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
        {description && <p className="text-sm text-muted-foreground max-w-md leading-relaxed">{description}</p>}
      </div>
      {children}
    </div>
  );
}

/* ── ConversationScrollButton ── */
interface ConversationScrollButtonProps {
  className?: string;
}

export function ConversationScrollButton({ className }: ConversationScrollButtonProps) {
  const { scrollToBottom, messagesEndRef } = useContext(ConversationCtx);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const container = messagesEndRef.current?.closest("[data-conversation-scroll]") ||
      messagesEndRef.current?.parentElement?.parentElement;
    if (!container) return;

    function check() {
      if (container instanceof HTMLElement) {
        const dist = container.scrollHeight - container.scrollTop - container.clientHeight;
        setVisible(dist > 200);
      }
    }
    container.addEventListener("scroll", check, { passive: true });
    return () => container.removeEventListener("scroll", check);
  }, [messagesEndRef]);

  if (!visible) return null;

  return (
    <button
      onClick={scrollToBottom}
      className={cn(
        "absolute bottom-24 right-6 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-md transition-all hover:bg-accent hover:text-accent-foreground",
        className
      )}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
