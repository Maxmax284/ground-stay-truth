import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  Sparkles, Loader2, Send, Bot, User, RotateCcw, ArrowRight,
} from "lucide-react";
import type { WelcomeTemplate } from "./ArrivalWelcomeEditor";
import ReactMarkdown from "react-markdown";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  hasUpdate?: boolean;
}

interface Props {
  airport: string;
  airportLabel: string;
  template: WelcomeTemplate;
  tone: string;
  context: string;
  onTemplateUpdate: (template: Partial<WelcomeTemplate>) => void;
}

export function AIRefinementChat({ airport, airportLabel, template, tone, context, onTemplateUpdate }: Props) {
  const { session } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text.trim() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/draft-arrival-welcome`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            airport,
            mode: "refine_chat",
            tone,
            context,
            current_template: {
              welcome_message: template.welcome_message,
              sections: template.sections,
            },
            chat_history: updatedMessages.slice(0, -1).map(m => ({ role: m.role, content: m.content })),
            user_message: text.trim(),
          }),
        }
      );

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || "Chat failed");
      }

      const { reply, updated_template } = await resp.json();
      
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: reply,
        hasUpdate: !!updated_template,
      };
      setMessages(prev => [...prev, assistantMsg]);

      if (updated_template) {
        onTemplateUpdate(updated_template);
        toast({ title: "Content updated", description: "The guide has been updated based on your request." });
      }
    } catch (err: any) {
      toast({ title: "Chat Error", description: err.message, variant: "destructive" });
      // Remove the user message on error
      setMessages(messages);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setInput("");
  };

  return (
    <Card className="border-primary/20 bg-gradient-to-b from-primary/5 to-transparent overflow-hidden">
      <CardContent className="p-0">
        {/* Header */}
        <div className="px-4 py-3 border-b border-primary/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-primary/10">
              <Bot className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="text-sm font-medium">Refinement Chat</span>
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-primary/30 text-primary">
              {airportLabel}
            </Badge>
          </div>
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearChat} className="h-7 gap-1 text-xs text-muted-foreground">
              <RotateCcw className="h-3 w-3" /> Clear
            </Button>
          )}
        </div>

        {/* Messages */}
        <ScrollArea className={messages.length > 0 ? "h-[280px]" : "h-auto"}>
          <div className="p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-6 space-y-2">
                <div className="inline-flex p-2.5 rounded-full bg-primary/10 mb-1">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <p className="text-sm font-medium text-foreground">Chat with AI to refine your guide</p>
                <p className="text-xs text-muted-foreground max-w-[280px] mx-auto">
                  Tell me what to change — "make section 2 shorter", "add a note about the gym", "rewrite the welcome in Thai style"
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="p-1 rounded-full bg-primary/10 h-6 w-6 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="h-3 w-3 text-primary" />
                  </div>
                )}
                <div className={`rounded-lg px-3 py-2 max-w-[85%] text-sm ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/60 text-foreground"
                }`}>
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:mb-1 [&>p:last-child]:mb-0">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p>{msg.content}</p>
                  )}
                  {msg.hasUpdate && (
                    <div className="flex items-center gap-1 mt-1.5 pt-1.5 border-t border-primary/20">
                      <ArrowRight className="h-3 w-3 text-primary" />
                      <span className="text-[10px] font-medium text-primary">Guide updated</span>
                    </div>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="p-1 rounded-full bg-muted h-6 w-6 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="h-3 w-3 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-2 items-center">
                <div className="p-1 rounded-full bg-primary/10 h-6 w-6 flex items-center justify-center shrink-0">
                  <Bot className="h-3 w-3 text-primary" />
                </div>
                <div className="bg-muted/60 rounded-lg px-3 py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <Separator />

        {/* Input */}
        <div className="p-3 flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tell the AI what to change..."
            className="h-9 text-sm"
            disabled={loading}
          />
          <Button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            size="sm"
            className="h-9 w-9 p-0 shrink-0"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
