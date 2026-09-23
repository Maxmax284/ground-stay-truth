import { MessagesSquare } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PickupConversation } from "@/components/PickupConversation";

interface Props {
  pickupId: string | null;
  guestName?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PickupConversationDialog({ pickupId, guestName, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <DialogHeader className="border-b px-4 py-3 pr-12">
          <DialogTitle className="flex items-center gap-2 text-base">
            <MessagesSquare className="h-4 w-4 text-primary" />
            Driver chat{guestName ? ` — ${guestName}` : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="p-4">
          {pickupId && <PickupConversation pickupId={pickupId} viewer="staff" placeholder="Message the driver and guest…" />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
