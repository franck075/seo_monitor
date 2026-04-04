"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { BarChart2, Globe, Bell, Settings, Home, Shield, CreditCard, Users, Building2, X } from "lucide-react";
import { ChatWidget } from "@/components/support/ChatWidget";
import { useSidebar } from "@/contexts/SidebarContext";

const navItems = [
  { href: "/tableau-de-bord", label: "Dashboard", icon: Home },
  { href: "/sites", label: "Sites Web", icon: Globe },
  { href: "/alertes", label: "Alertes", icon: Bell },
  { href: "/abonnement", label: "Abonnement", icon: CreditCard },
  { href: "/parametres", label: "Paramètres", icon: Settings },
];

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: async () => (await api.get("/auth/me")).data,
    staleTime: 60_000,
    retry: false,
  });

  return (
    <aside className="w-60 h-full bg-gray-900 text-white flex flex-col">
      <div className="p-6 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-violet-500 rounded-lg flex items-center justify-center">
            <BarChart2 className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-lg">SEO Alert Scan</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="md:hidden text-gray-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} onClick={onClose}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              pathname.startsWith(href)
                ? "bg-blue-600 text-white"
                : "text-gray-300 hover:bg-gray-800 hover:text-white"
            )}>
            <Icon className="w-4 h-4" />
            {label}
          </Link>
        ))}

        {me?.plan === "agency" && (
          <div className="pt-3 mt-3 border-t border-gray-700 space-y-1">
            <Link href="/equipe" onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                pathname.startsWith("/equipe")
                  ? "bg-violet-600 text-white"
                  : "text-violet-300 hover:bg-gray-800 hover:text-violet-200"
              )}>
              <Users className="w-4 h-4" />
              Mon équipe
            </Link>
            <Link href="/agence" onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                pathname.startsWith("/agence")
                  ? "bg-violet-600 text-white"
                  : "text-violet-300 hover:bg-gray-800 hover:text-violet-200"
              )}>
              <Building2 className="w-4 h-4" />
              Vue Agence
            </Link>
          </div>
        )}

        {me?.role === "admin" && (
          <div className="pt-3 mt-3 border-t border-gray-700">
            <Link href="/admin" onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                pathname.startsWith("/admin")
                  ? "bg-violet-600 text-white"
                  : "text-violet-300 hover:bg-gray-800 hover:text-violet-200"
              )}>
              <Shield className="w-4 h-4" />
              Administration
            </Link>
          </div>
        )}
      </nav>

      {me?.role !== "admin" && <ChatWidget />}

      <div className="p-4 border-t border-gray-700">
        {me && (
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-violet-500 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
              {(me.full_name || me.email).charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-200 truncate">{me.full_name || me.email}</p>
              <p className={`text-xs font-medium ${me.plan === "agency" ? "text-violet-400" : me.plan === "pro" ? "text-blue-400" : "text-gray-500"}`}>
                {me.plan === "agency" ? "Agence" : me.plan === "pro" ? "Pro" : "Starter"}
              </p>
            </div>
          </div>
        )}
        <p className="text-xs text-gray-600">SEO Alert Scan v1.0</p>
      </div>
    </aside>
  );
}

export function Sidebar() {
  const { isOpen, close } = useSidebar();

  return (
    <>
      {/* Desktop sidebar — always visible */}
      <div className="hidden md:block w-60 min-h-screen flex-shrink-0">
        <div className="fixed top-0 left-0 w-60 h-screen">
          <SidebarContent />
        </div>
      </div>

      {/* Mobile overlay */}
      {isOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={close}
          />
          {/* Drawer */}
          <div className="relative z-50 h-full">
            <SidebarContent onClose={close} />
          </div>
        </div>
      )}
    </>
  );
}
