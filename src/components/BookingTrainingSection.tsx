import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useBookingTrainingLinks, useLinkBookingTraining, useTrainingPackages } from "@/hooks/useTrainingPackages";
import { Dumbbell, Plus } from "lucide-react";

export function BookingTrainingSection({ bookingId }: { bookingId: string }) {
  const { data: links } = useBookingTrainingLinks(bookingId);
  const { data: packages } = useTrainingPackages();
  const linkTraining = useLinkBookingTraining();
  const { toast } = useToast();

  const [showAdd, setShowAdd] = useState(false);
  const [selectedPkg, setSelectedPkg] = useState("");
  const [trainer, setTrainer] = useState("");
  const [startDate, setStartDate] = useState("");

  const activePackages = (packages ?? []).filter((p) => p.is_active);

  const handleAdd = async () => {
    if (!selectedPkg) return;
    try {
      await linkTraining.mutateAsync({
        booking_id: bookingId,
        package_id: selectedPkg,
        trainer_name: trainer || undefined,
        start_date: startDate || undefined,
      });
      toast({ title: "Training linked" });
      setShowAdd(false);
      setSelectedPkg("");
      setTrainer("");
      setStartDate("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-2">
      <Separator />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Dumbbell className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Training Program</span>
        </div>
        {!showAdd && activePackages.length > 0 && (
          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setShowAdd(true)}>
            <Plus className="h-3 w-3 mr-1" /> Link
          </Button>
        )}
      </div>

      {(links ?? []).length === 0 && !showAdd && (
        <p className="text-xs text-muted-foreground">No training program assigned.</p>
      )}

      {(links ?? []).map((link) => (
        <div key={link.id} className="text-xs border rounded-md p-2 space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">
              {(link as any).training_packages?.name ?? "Package"}
            </Badge>
            {link.trainer_name && <span className="text-muted-foreground">Trainer: {link.trainer_name}</span>}
          </div>
          <div className="text-muted-foreground">
            {(link as any).training_packages?.duration_days} days · ฿{Number((link as any).training_packages?.price ?? 0).toLocaleString()}
            {link.start_date && ` · Starts ${link.start_date}`}
          </div>
        </div>
      ))}

      {showAdd && (
        <div className="border rounded-md p-3 space-y-2 bg-muted/30">
          <div><Label className="text-xs">Package</Label>
            <Select value={selectedPkg} onValueChange={setSelectedPkg}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                {activePackages.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-xs">{p.name} — {p.duration_days}d ฿{Number(p.price).toLocaleString()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Trainer</Label><Input value={trainer} onChange={(e) => setTrainer(e.target.value)} className="h-8 text-xs" placeholder="Name" /></div>
            <div><Label className="text-xs">Start Date</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-8 text-xs" /></div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs" onClick={handleAdd} disabled={!selectedPkg || linkTraining.isPending}>Assign</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
