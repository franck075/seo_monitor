"use client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { SidebarProvider } from "@/contexts/SidebarContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SidebarProvider>{children}</SidebarProvider>
    </QueryClientProvider>
  );
}
