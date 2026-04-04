"use client";
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";

interface Message {
  id: number;
  sender_role: "user" | "admin";
  content: string;
  created_at: string;
}

interface ConvData {
  conversation_id: number;
  is_resolved: boolean;
  unread_user: number;
  messages: Message[];
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<ConvData>({
    queryKey: ["support-conv"],
    queryFn: async () => (await api.get("/support/conversation")).data,
    enabled: open,
    refetchInterval: open ? 5000 : false,
  });

  const { data: unreadData } = useQuery({
    queryKey: ["support-unread"],
    queryFn: async () => (await api.get("/support/unread")).data,
    refetchInterval: 30000,
  });

  const sendMutation = useMutation({
    mutationFn: async (content: string) =>
      (await api.post("/support/message", { content })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["support-conv"] });
      setInput("");
    },
  });

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages, open]);

  function handleSend() {
    if (!input.trim()) return;
    sendMutation.mutate(input.trim());
  }

  const unread = unreadData?.unread || 0;

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-2xl flex items-center justify-center transition-all hover:scale-105"
      >
        {open ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
            {unread}
          </span>
        )}
      </button>

      {/* Chat window */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden" style={{ maxHeight: "480px" }}>
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
              <MessageCircle className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm drop-shadow">Support SEO Alert Scan</p>
              <p className="text-white/90 text-xs font-medium">Réponse sous 24h · Lun–Sam</p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
              </div>
            ) : !data?.messages.length ? (
              <div className="text-center py-8">
                <MessageCircle className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-700 font-semibold">Aucun message pour l'instant</p>
                <p className="text-xs text-gray-500 mt-1">Posez votre question, nous répondrons rapidement.</p>
              </div>
            ) : (
              data.messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.sender_role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                    msg.sender_role === "user"
                      ? "bg-blue-600 text-white rounded-br-sm"
                      : "bg-white border border-gray-100 text-gray-700 rounded-bl-sm shadow-sm"
                  }`}>
                    {msg.sender_role === "admin" && (
                      <p className="text-xs font-semibold text-blue-600 mb-0.5">Support</p>
                    )}
                    <p>{msg.content}</p>
                    <p className={`text-xs mt-1 ${msg.sender_role === "user" ? "text-blue-200" : "text-gray-400"}`}>
                      {formatTime(msg.created_at)}
                    </p>
                  </div>
                </div>
              ))
            )}
            {data?.is_resolved && (
              <div className="text-center">
                <span className="text-xs bg-green-100 text-green-600 px-3 py-1 rounded-full font-medium">✓ Conversation résolue</span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-gray-100 bg-white">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
                placeholder="Votre message..."
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || sendMutation.isPending}
                className="w-9 h-9 bg-blue-600 text-white rounded-xl flex items-center justify-center hover:bg-blue-700 disabled:opacity-50 transition-colors flex-shrink-0"
              >
                {sendMutation.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Send className="w-4 h-4" />
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
