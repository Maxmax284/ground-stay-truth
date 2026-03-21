import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { permissions } from "@/lib/permissions";
import { useAirportPickup, useUpsertAirportPickup, logPickupAction, type AirportPickup } from "@/hooks/useAirportPickups";
import { useDrivers } from "@/hooks/useDrivers";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { formatPrice } from "@/lib/currency";
import { Plane, Car, MessageSquare, User, Clock, AlertTriangle } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  requested: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  assigned: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  confirmed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
};

interface Props {
  bookingId: string;
  guestName?: string;
}

export function AirportPickupSection({ bookingId, guestName }: Props) {
  const { role } = useAuth();
  const { data: pickup, isLoading } = useAirportPickup(bookingId);
  const { data: drivers } = useDrivers(true);
  const { data: policies } = usePolicySettings();
  const upsert = useUpsertAirportPickup();
  const { toast } = useToast();
  const [editingFee, setEditingFee] = useState(false);
  const [feeValue, setFeeValue] = useState("");
  const [feeReason, setFeeReason] = useState("");

  const canManage = permissions.canTransitionState(role); // front_desk+

  const baseFee = useMemo(() => {
    const setting = policies?.find((p) => p.key === "transport_base_fee");
    return setting ? Number(setting.value) : 500;
  }, [policies]);

  const transportEnabled = policies?.find((p) => p.key === "transport_enabled");
  const isEnabled = transportEnabled ? String(transportEnabled.value) === "true" : false;

  if (isLoading) return null;

  // Show create button for staff when no pickup exists
  if (!pickup) {
    if (!canManage || !isEnabled) return null;
    return (
      <Card className="border-dashed border-primary/20">
        <CardContent className="p-4">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2"
            onClick={async () => {
              try {
                await upsert.mutateAsync({
                  booking_id: bookingId,
                  fee: baseFee,
                  status: "requested",
                });
                toast({ title: "Airport pickup created" });
              } catch (err: any) {
                toast({ title: "Error", description: err.message, variant: "destructive" });
              }
            }}
            disabled={upsert.isPending}
          >
            <Plane className="h-4 w-4" />
            Add Airport Pickup
          </Button>
        </CardContent>
      </Card>
    );
  }

  const driver = pickup.drivers;

  const handleAssignDriver = async (driverId: string) => {
    try {
      const prevStatus = pickup.status;
      const newStatus = prevStatus === "requested" ? "assigned" : prevStatus;
      const result = await upsert.mutateAsync({
        booking_id: bookingId,
        driver_id: driverId,
        status: newStatus,
        assigned_at: new Date().toISOString(),
      });
      const assignedDriver = drivers?.find(d => d.id === driverId);
      await logPickupAction({
        bookingId,
        pickupId: pickup.id,
        action: "driver_assigned",
        fromStatus: prevStatus,
        toStatus: newStatus,
        note: assignedDriver ? `Driver assigned: ${assignedDriver.name}` : "Driver assigned",
      });
      toast({ title: "Driver assigned" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    const updates: Partial<AirportPickup> & { booking_id: string } = {
      booking_id: bookingId,
      status: newStatus,
    };
    if (newStatus === "confirmed") updates.confirmed_at = new Date().toISOString();
    if (newStatus === "completed") {
      updates.completed_at = new Date().toISOString();
    }
    try {
      await upsert.mutateAsync(updates);
      toast({ title: `Pickup ${newStatus}` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleFeeOverride = async () => {
    if (!feeValue || !feeReason.trim()) return;
    try {
      await upsert.mutateAsync({
        booking_id: bookingId,
        fee: Number(feeValue),
        fee_override: true,
        fee_override_reason: feeReason.trim(),
      });
      toast({ title: "Fee updated" });
      setEditingFee(false);
      setFeeReason("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const whatsappLink = driver?.whatsapp
    ? `https://wa.me/${driver.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(
        `Hi, pickup for ${guestName ?? "guest"} arriving at Lamai Muay Thai.${pickup.flight_number ? ` Flight ${pickup.flight_number}.` : ""}`
      )}`
    : null;

  const nextStatuses: string[] = [];
  if (pickup.status === "assigned") nextStatuses.push("confirmed");
  if (pickup.status === "confirmed") nextStatuses.push("completed");
  if (pickup.status !== "cancelled" && pickup.status !== "completed") nextStatuses.push("cancelled");

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Plane className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Airport Pickup</span>
          </div>
          <Badge className={STATUS_COLORS[pickup.status] ?? ""}>{pickup.status}</Badge>
        </div>

        {/* Flight details */}
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          {pickup.flight_number && (
            <div className="flex items-center gap-1"><Plane className="h-3 w-3" /> {pickup.flight_number}</div>
          )}
          {pickup.arrival_datetime && (
            <div className="flex items-center gap-1"><Clock className="h-3 w-3" /> {new Date(pickup.arrival_datetime).toLocaleString()}</div>
          )}
          {pickup.passenger_count > 1 && (
            <div className="flex items-center gap-1"><User className="h-3 w-3" /> {pickup.passenger_count} pax</div>
          )}
          {pickup.luggage_notes && <div>🧳 {pickup.luggage_notes}</div>}
        </div>
        {pickup.special_instructions && (
          <p className="text-xs italic text-muted-foreground">{pickup.special_instructions}</p>
        )}

        <Separator />

        {/* Fee */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Fee</span>
          <div className="flex items-center gap-2">
            <span className="font-medium">{formatPrice(pickup.fee, policies)}</span>
            {pickup.fee_override && (
              <Badge variant="outline" className="text-[10px]">Override</Badge>
            )}
            {canManage && !editingFee && (
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { setEditingFee(true); setFeeValue(String(pickup.fee)); }}>
                Edit
              </Button>
            )}
          </div>
        </div>
        {editingFee && (
          <div className="space-y-2 bg-muted/30 rounded-md p-2">
            <div className="flex gap-2">
              <Input type="number" value={feeValue} onChange={(e) => setFeeValue(e.target.value)} className="h-7 text-sm w-24" />
              <Input value={feeReason} onChange={(e) => setFeeReason(e.target.value)} placeholder="Reason for change" className="h-7 text-sm flex-1" />
            </div>
            <div className="flex gap-1">
              <Button size="sm" className="h-7 text-xs" onClick={handleFeeOverride} disabled={upsert.isPending}>Save</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingFee(false)}>Cancel</Button>
            </div>
          </div>
        )}

        <Separator />

        {/* Driver */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">Driver</Label>
          {canManage ? (
            <Select value={pickup.driver_id ?? ""} onValueChange={handleAssignDriver}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Assign a driver" />
              </SelectTrigger>
              <SelectContent>
                {drivers?.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    <span className="flex items-center gap-1.5">
                      <Car className="h-3 w-3" /> {d.name}
                      {d.vehicle_type && <span className="text-muted-foreground">· {d.vehicle_type}</span>}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : driver ? (
            <p className="text-sm">{driver.name}</p>
          ) : (
            <p className="text-xs text-muted-foreground">No driver assigned</p>
          )}

          {driver && (
            <div className="text-xs text-muted-foreground space-y-0.5 bg-muted/30 rounded-md p-2">
              <p className="font-medium text-foreground">{driver.name}</p>
              {driver.vehicle_type && <p>{driver.vehicle_type}{driver.license_plate ? ` · ${driver.license_plate}` : ""}</p>}
              {whatsappLink && (
                <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline mt-1">
                  <MessageSquare className="h-3 w-3" /> Message Driver on WhatsApp
                </a>
              )}
            </div>
          )}
        </div>

        {/* Status actions */}
        {canManage && nextStatuses.length > 0 && (
          <>
            <Separator />
            <div className="flex flex-wrap gap-1.5">
              {nextStatuses.map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={s === "cancelled" ? "destructive" : "default"}
                  className="h-7 text-xs"
                  onClick={() => handleStatusChange(s)}
                  disabled={upsert.isPending}
                >
                  {s === "confirmed" ? "Confirm Pickup" : s === "completed" ? "Mark Complete" : "Cancel Pickup"}
                </Button>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
