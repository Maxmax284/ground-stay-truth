import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { usePickupConversation, useSendPickupMessage, type PickupMessageSender } from "@/hooks/usePickupConversation";
import { toast } from "sonner";

const LABEL: Record<PickupMessageSender, string> = {
  driver: "Driver",
  guest: "Guest",
  staff: "Front desk",
};

interface Props {
  pickupId: string;
  viewer: "guest" | "staff";
  placeholder?: string;
}

export function PickupConversation({ pickupId, viewer, placeholder = "Write a pickup message…" }: Props) {
  const { data: messages, isLoading } = usePickupConversation(pickupId);
  const send = useSendPickupMessage();
  const [content, setContent] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => endRef.current?.scrollIntoView({ block: "nearest" }), [messages?.length]);

  const submit = async () => {
    const body = content.trim();
    if (!body) return;
    try {
      await send.mutateAsync({ pickupId, content: body });
      setContent("");
    } catch (error: any) {
      toast.error(error?.message ?? "Could not send message.");
    }
  };

  return (
    <div className="space-y-3">
      <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border bg-muted/20 p-3" aria-live="polite">
        {isLoading ? (
          <><Skeleton className="h-12 w-4/5" /><Skeleton className="ml-auto h-12 w-4/5" /></>
        ) : !messages?.length ? (
          <p className="py-5 text-center text-sm text-muted-foreground">No pickup messages yet.</p>
        ) : messages.map((message) => {
          const mine = message.sender_type === viewer;
          return (
            <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[88%] rounded-md px-3 py-2 ${mine ? "bg-primary text-primary-foreground" : "border bg-background"}`}>
                <p className="mb-1 text-[11px] font-semibold opacity-75">{LABEL[message.sender_type]}</p>
                <p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>
                <p className="mt-1 text-[10px] opacity-65">{format(new Date(message.created_at), "d MMM, HH:mm")}</p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="flex items-end gap-2">
        <Textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder={placeholder}
          maxLength={1000}
          rows={2}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <Button size="icon" className="h-10 w-10 shrink-0" disabled={!content.trim() || send.isPending} onClick={() => void submit()} aria-label="Send pickup message">
          {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Pickup coordination only. Front desk can see this conversation.</p>
    </div>
  );
}
