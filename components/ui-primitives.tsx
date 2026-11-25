"use client";

import React from "react";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { STAGE_META, WorkStage } from "@/lib/types";

// ============================================================================
// HỆ THỐNG COMPONENT ĐỒNG BỘ MÀU SẮC, BUTTON, BACKBUTTON, TIÊU ĐỀ, DROPDOWN
// Mọi màn hình trong dự án bắt buộc tái sử dụng chung bộ component này
// ============================================================================

export interface AppButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
}

const VARIANT_CLASSES: Record<NonNullable<AppButtonProps["variant"]>, string> = {
  primary:
    "bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500/60 shadow-sm shadow-indigo-950/50",
  secondary:
    "bg-slate-800/90 hover:bg-slate-700/90 text-slate-100 border border-slate-700",
  ghost:
    "bg-transparent hover:bg-slate-800/70 text-slate-300 hover:text-white border border-transparent",
  danger:
    "bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30",
  success:
    "bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500/60",
};

const SIZE_CLASSES: Record<NonNullable<AppButtonProps["size"]>, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-11 px-5 text-sm gap-2.5 rounded-xl",
};

export function AppButton({
  variant = "primary",
  size = "md",
  icon,
  children,
  className = "",
  disabled,
  ...rest
}: AppButtonProps) {
  return (
    <button
      disabled={disabled}
      className={`inline-flex items-center justify-center font-medium transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </button>
  );
}

export function BackButton({
  label = "Quay lại",
  onClick,
}: {
  label?: string;
  onClick: () => void;
}) {
  return (
    <AppButton
      type="button"
      variant="secondary"
      size="sm"
      icon={<ArrowLeft className="w-4 h-4" />}
      onClick={onClick}
    >
      {label}
    </AppButton>
  );
}

export function SectionHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-800/80">
      <div>
        <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-white">
          {title}
        </h2>
        {subtitle && (
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

export function StageBadge({ stage }: { stage: WorkStage }) {
  const meta = STAGE_META[stage] ?? STAGE_META.raw;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${meta.badgeClass}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dotClass}`} />
      {meta.label}
    </span>
  );
}

export interface AppSelectOption {
  value: string;
  label: string;
}

export function AppSelect({
  value,
  onChange,
  options,
  label,
  className = "",
}: {
  value: string;
  onChange: (val: string) => void;
  options: AppSelectOption[];
  label?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label className="text-xs font-medium text-slate-300">{label}</label>
      )}
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-10 pl-3 pr-9 rounded-xl bg-slate-900 border border-slate-700/90 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 appearance-none cursor-pointer"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-slate-900 text-slate-100">
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="w-4 h-4 text-slate-400 pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" />
      </div>
    </div>
  );
}

export function AppInput({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-xs font-medium text-slate-300">{label}</label>
      )}
      <input
        {...props}
        className={`h-10 px-3.5 rounded-xl bg-slate-900 border border-slate-700/90 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 ${props.className || ""}`}
      />
    </div>
  );
}
