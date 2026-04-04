"use client";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { LogOut, Menu } from "lucide-react";
import { TrialBanner } from "./TrialBanner";
import { useSidebar } from "@/contexts/SidebarContext";

export function TopNav({ title }: { title: string }) {
  const router = useRouter();
  const { toggle } = useSidebar();

  function logout() {
    Cookies.remove("access_token");
    Cookies.remove("refresh_token");
    router.push("/connexion");
  }

  return (
    <>
      <header className="h-14 border-b border-gray-200 bg-white flex items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={toggle}
            className="md:hidden p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100"
            aria-label="Ouvrir le menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="text-base md:text-lg font-semibold text-gray-900">{title}</h1>
        </div>
        <button onClick={logout} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900">
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Déconnexion</span>
        </button>
      </header>
      <TrialBanner />
    </>
  );
}
