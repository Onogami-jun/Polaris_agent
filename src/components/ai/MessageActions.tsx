"use client";

import React from "react";
import { cn } from "../../lib/utils";

/* ── MessageActions ── */
interface MessageActionsProps {
  children: React.ReactNode;
  className?: string;
}

export function MessageActions({ children, className }: MessageActionsProps) {
  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {children}
    </div>
  );
}

/* ── CopyButton ── */
interface CopyButtonProps {
  onClick: () => void;
  copied?: boolean;
  className?: string;
}

export function CopyButton({ onClick, copied = false, className }: CopyButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-all hover:bg-muted hover:text-foreground",
        copied && "text-emerald-500",
        className
      )}
      title={copied ? "已复制" : "复制"}
    >
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <polyline points="3,8 6,11 13,4" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="5" y="5" width="9" height="9" rx="1.5" />
          <path d="M11 5V3a1 1 0 00-1-1H3a1 1 0 00-1 1v8a1 1 0 001 1h2" />
        </svg>
      )}
    </button>
  );
}

/* ── RetryButton ── */
interface RetryButtonProps {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

export function RetryButton({ onClick, disabled, className }: RetryButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-all hover:bg-muted hover:text-foreground disabled:opacity-40",
        className
      )}
      title="重新生成"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 8a6 6 0 0111.29-2.71" />
        <path d="M13.79 5.5v-2h-2" />
        <path d="M14 8a6 6 0 01-11.29 2.71" />
        <path d="M2.21 10.5v2h2" />
      </svg>
    </button>
  );
}

/* ── EditButton ── */
interface EditButtonProps {
  onClick: () => void;
  className?: string;
}

export function EditButton({ onClick, className }: EditButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-all hover:bg-muted hover:text-foreground",
        className
      )}
      title="编辑"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 2l3 3-7 7H4v-3l7-7z" />
      </svg>
    </button>
  );
}

/* ── BranchButton ── */
interface BranchButtonProps {
  onClick: () => void;
  className?: string;
}

export function BranchButton({ onClick, className }: BranchButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-all hover:bg-muted hover:text-foreground",
        className
      )}
      title="分支对话"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 2v6" />
        <path d="M4 8a3 3 0 003 3h6" />
        <path d="M13 8l-3 3" />
        <path d="M13 8l-3-3" />
      </svg>
    </button>
  );
}

/* ── DownloadButton ── */
interface DownloadButtonProps {
  onClick: () => void;
  className?: string;
}

export function DownloadButton({ onClick, className }: DownloadButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md text-emerald-500 transition-all hover:bg-emerald-50 dark:hover:bg-emerald-950",
        className
      )}
      title="下载代码"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 10v3a1 1 0 01-1 1H3a1 1 0 01-1-1v-3" />
        <path d="M8 2v9" />
        <path d="M5 7l3 3 3-3" />
      </svg>
    </button>
  );
}
