import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useUpsertAirportPickup, logPickupAction } from "@/hooks/useAirportPickups";
import { useToggleChecklistItem } from "@/hooks/usePreArrivalChecklist";
import { supabase } from "@/integrations/supabase/client";
import { Shield, Plane, Clock, FileCheck, Wifi, MapPin, Loader2 } from "lucide-react";

type OverrideAction =
  | "international_flight"
  | "samui_flight"
  | "arrival_time"
  | "mark_tdac"
  | "assume_connectivity"
  | "override_airport";

const ACTIONS: { key: OverrideAction; label: string; icon: typeof Plane; needsInput: boolean; inputLabel?: string; inputPlaceholder?: string }[] = [
  { key: "international_flight", label: "Use as International Flight", icon: Plane, needsInput: true, inputLabel: "Flight number", inputPlaceholder: "e.g. QR838" },
  { key: "samui_flight", label: "Use as Samui Flight", icon: Plane, needsInput: true, inputLabel: "Flight number", inputPlaceholder: "e.g. PG123" },
  { key: "arrival_time", label: "Set Arrival Time", icon: Clock, needsInput: true, inputLabel: "Arrival datetime", inputPlaceholder: "e.g. 2026-04-05T14:30" },
  { key: "mark_tdac", label: "Mark TDAC Complete", icon: FileCheck, needsInput: false },
  { key: "assume_connectivity", label: "Assume Connectivity", icon: Wifi, needsInput: false },
  { key: "override_airport", label: "Override Arrival Airport", icon: MapPin, needsInput: true, inputLabel: "Airport IATA code", inputPlaceholder: "e.g. USM or BKK" },
];

interface Props {
  bookingId: string;
  pickupId: string | null;
}

export function AdminOverrideMenu({ bookingId, pickupId }: Props) {
  const { role, user } = useAuth();
  const { toast } = useToast();
  const upsertPickup = useUpsertAirportPickup();
  const toggleChecklist = useToggleChecklistItem();
  const [activeAction, setActiveAction] = useState<OverrideAction | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);

  if (role !== "admin") return null;

  const action = activeAction ? ACTIONS.find((a) => a.key === activeAction) : null;

  const handleExecute = async () => {
    if (!activeAction) return;
    setIsExecuting(true);

    try {
      switch (activeAction) {
        case "international_flight": {
          if (!pickupId) throw new Error("No pickup record exists");
          const cleanFlight = inputValue.replace(/\s+/g, "").toUpperCase();
          await supabase
            .from("airport_pickups")
            .update({ international_flight_number: cleanFlight } as any)
            .eq("id", pickupId);
          await logPickupAction({
            bookingId,
            pickupId,
            action: "[ADMIN] international_flight_override",
            note: `Set international flight to ${cleanFlight}`,
          });
          break;
        }
        case "samui_flight": {
          if (!pickupId) throw new Error("No pickup record exists");
          const cleanFlight = inputValue.replace(/\s+/g, "").toUpperCase();
          await supabase
            .from("airport_pickups")
            .update({
              flight_number: cleanFlight,
              final_flight_confirmed: true,
            } as any)
            .eq("id", pickupId);
          // Auto-complete checklist item
          await toggleChecklist.mutateAsync({
            bookingId,
            itemKey: "confirm_domestic_flight",
            completed: true,
            data: { applied_by_admin: true, flight_number: cleanFlight },
          });
          await logPickupAction({
            bookingId,
            pickupId,
            action: "[ADMIN] flight_number_override",
            note: `Set Samui flight to ${cleanFlight} + auto-completed checklist`,
          });
          break;
        }
        case "arrival_time": {
          if (!pickupId) throw new Error("No pickup record exists");
          await supabase
            .from("airport_pickups")
            .update({ arrival_datetime: inputValue } as any)
            .eq("id", pickupId);
          await toggleChecklist.mutateAsync({
            bookingId,
            itemKey: "confirm_arrival_time",
            completed: true,
            data: { applied_by_admin: true },
          });
          await logPickupAction({
            bookingId,
            pickupId,
            action: "[ADMIN] arrival_time_override",
            note: `Set arrival time to ${inputValue}`,
          });
          break;
        }
        case "mark_tdac": {
          await toggleChecklist.mutateAsync({
            bookingId,
            itemKey: "tdac_completed",
            completed: true,
            data: { applied_by_admin: true, confirmed_by: user?.id },
          });
          if (pickupId) {
            await logPickupAction({
              bookingId,
              pickupId,
              action: "[ADMIN] tdac_confirmed",
              note: "Marked TDAC as complete via admin override",
            });
          }
          break;
        }
        case "assume_connectivity": {
          await toggleChecklist.mutateAsync({
            bookingId,
            itemKey: "connectivity_readiness",
            completed: true,
            data: { assumed_by_admin: true, confirmed_by: user?.id },
          });
          if (pickupId) {
            await logPickupAction({
              bookingId,
              pickupId,
              action: "[ADMIN] connectivity_assumed",
              note: "Assumed guest connectivity via admin override",
            });
          }
          break;
        }
        case "override_airport": {
          if (!pickupId) throw new Error("No pickup record exists");
          const airport = inputValue.trim().toUpperCase();
          await supabase
            .from("airport_pickups")
            .update({ confirmed_airport: airport } as any)
            .eq("id", pickupId);
          await logPickupAction({
            bookingId,
            pickupId,
            action: "[ADMIN] airport_override",
            note: `Set confirmed airport to ${airport}`,
          });
          break;
        }
      }

      toast({ title: "Override applied", description: `${action?.label} completed successfully.` });
      setActiveAction(null);
      setInputValue("");
    } catch (err: any) {
      toast({ title: "Override failed", description: err.message, variant: "destructive" });
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/5">
            <Shield className="h-3 w-3" />
            Admin Override
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Apply data to system fields</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {ACTIONS.map((a) => {
            const Icon = a.icon;
            return (
              <DropdownMenuItem
                key={a.key}
                onClick={() => {
                  if (a.needsInput) {
                    setActiveAction(a.key);
                    setInputValue("");
                  } else {
                    setActiveAction(a.key);
                    // For no-input actions, open confirmation dialog
                  }
                }}
                className="gap-2 text-xs"
              >
                <Icon className="h-3.5 w-3.5" />
                {a.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Confirmation / Input Dialog */}
      <Dialog open={!!activeAction} onOpenChange={(open) => { if (!open) { setActiveAction(null); setInputValue(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Shield className="h-4 w-4 text-destructive" />
              {action?.label}
            </DialogTitle>
            <DialogDescription className="text-xs">
              This action will be logged as an admin override in the audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {action?.needsInput && (
              <div className="space-y-1.5">
                <Label className="text-xs">{action.inputLabel}</Label>
                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={action.inputPlaceholder}
                  className="text-sm"
                  autoFocus
                />
              </div>
            )}
            {!action?.needsInput && (
              <p className="text-sm text-muted-foreground">
                Are you sure you want to {action?.label.toLowerCase()}? This will update the system records.
              </p>
            )}
            <Badge variant="outline" className="text-[10px] border-destructive/30 text-destructive">
              Logged as [ADMIN] override
            </Badge>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => { setActiveAction(null); setInputValue(""); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleExecute}
              disabled={isExecuting || (action?.needsInput && !inputValue.trim())}
            >
              {isExecuting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Apply Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
