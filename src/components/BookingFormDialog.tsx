import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useCreateBooking } from "@/hooks/useBookings";
import { useUnits } from "@/hooks/useUnits";
import { supabase } from "@/integrations/supabase/client";

interface BookingFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultUnitId?: string;
  defaultCheckIn?: string;
  defaultCheckOut?: string;
}

interface FormValues {
  unit_id: string;
  check_in: string;
  check_out: string;
  num_guests: number;
  notes: string;
  guest_id: string;
}

export function BookingFormDialog({
  open,
  onOpenChange,
  defaultUnitId,
  defaultCheckIn,
  defaultCheckOut,
}: BookingFormDialogProps) {
  const { toast } = useToast();
  const createBooking = useCreateBooking();
  const { data: units } = useUnits();
  const [guestSearch, setGuestSearch] = useState("");

  const guestProfiles = useQuery({
    queryKey: ["guest-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .order("full_name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const filteredGuests = (guestProfiles.data ?? []).filter((p) => {
    if (!guestSearch) return true;
    const q = guestSearch.toLowerCase();
    return (p.full_name?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q));
  });

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      unit_id: defaultUnitId ?? "",
      check_in: defaultCheckIn ?? "",
      check_out: defaultCheckOut ?? "",
      num_guests: 1,
      notes: "",
      guest_id: "",
    },
  });

  const selectedUnitId = watch("unit_id");
  const selectedGuestId = watch("guest_id");

  const onSubmit = async (data: FormValues) => {
    try {
      await createBooking.mutateAsync({
        unit_id: data.unit_id,
        check_in: data.check_in,
        check_out: data.check_out,
        num_guests: Number(data.num_guests),
        notes: data.notes || null,
        guest_id: data.guest_id || null,
        state: "inquiry",
      });
      toast({ title: "Booking created", description: "New inquiry has been logged." });
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: "Error creating booking",
        description: err.message?.includes("overlap")
          ? "These dates overlap with an existing booking for this unit."
          : err.message,
        variant: "destructive",
      });
    }
  };

  const activeUnits = units?.filter((u) => u.is_active) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Booking</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Unit *</Label>
            <Select value={selectedUnitId} onValueChange={(v) => setValue("unit_id", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a unit" />
              </SelectTrigger>
              <SelectContent>
                {activeUnits.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" {...register("unit_id", { required: true })} />
            {errors.unit_id && <p className="text-sm text-destructive">Unit is required</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="check_in">Check-in *</Label>
              <Input id="check_in" type="date" {...register("check_in", { required: true })} />
              {errors.check_in && <p className="text-sm text-destructive">Required</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="check_out">Check-out *</Label>
              <Input id="check_out" type="date" {...register("check_out", { required: true })} />
              {errors.check_out && <p className="text-sm text-destructive">Required</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="num_guests">Number of Guests</Label>
            <Input id="num_guests" type="number" min={1} {...register("num_guests")} />
          </div>

          <div className="space-y-2">
            <Label>Guest (optional)</Label>
            <Input
              placeholder="Search by name or email…"
              value={guestSearch}
              onChange={(e) => setGuestSearch(e.target.value)}
              className="mb-1"
            />
            <Select value={selectedGuestId} onValueChange={(v) => setValue("guest_id", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a guest" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No guest</SelectItem>
                {filteredGuests.map((p) => (
                  <SelectItem key={p.user_id} value={p.user_id}>
                    {p.full_name ?? p.email ?? p.user_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" {...register("guest_id")} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" {...register("notes")} placeholder="Special requests, arrival time…" rows={3} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={createBooking.isPending}>
              {createBooking.isPending ? "Creating…" : "Create Inquiry"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
