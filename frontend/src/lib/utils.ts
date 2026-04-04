import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

export function formatPercent(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

export function ratingColor(rating: string): string {
  if (rating === "good") return "text-green-600";
  if (rating === "needs-improvement") return "text-yellow-600";
  return "text-red-600";
}

export function ratingBg(rating: string): string {
  if (rating === "good") return "bg-green-100 text-green-800";
  if (rating === "needs-improvement") return "bg-yellow-100 text-yellow-800";
  return "bg-red-100 text-red-800";
}
