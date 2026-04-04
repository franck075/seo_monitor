import { cn } from "@/lib/utils";
import { ratingBg } from "@/lib/utils";

export function VitalsBadge({ rating }: { rating: string }) {
  const label = rating === "good" ? "Bon" : rating === "needs-improvement" ? "A ameliorer" : "Mauvais";
  return <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", ratingBg(rating))}>{label}</span>;
}
