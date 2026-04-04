import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  className?: string;
}

export function MetricCard({ title, value, subtitle, icon: Icon, trend, trendValue, className }: MetricCardProps) {
  return (
    <div className={cn("bg-white rounded-xl border border-gray-200 p-5", className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
          {trendValue && (
            <p className={cn("text-xs mt-1 font-medium",
              trend === "up" ? "text-green-600" : trend === "down" ? "text-red-600" : "text-gray-500"
            )}>
              {trendValue}
            </p>
          )}
        </div>
        {Icon && (
          <div className="p-2 bg-blue-50 rounded-lg">
            <Icon className="w-5 h-5 text-blue-600" />
          </div>
        )}
      </div>
    </div>
  );
}
