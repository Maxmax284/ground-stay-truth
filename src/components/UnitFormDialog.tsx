import { useState } from "react";
import { useForm } from "react-hook-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useCreateUnit, useUpdateUnit, type Unit, type UnitInsert } from "@/hooks/useUnits";

interface UnitFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unit?: Unit | null;
}

const AMENITY_OPTIONS = [
  "WiFi", "Air Conditioning", "Kitchen", "Pool", "Parking",
  "Washer/Dryer", "TV", "Hot Tub", "Balcony", "Pet Friendly",
  "Fireplace", "BBQ Grill", "Ocean View", "Garden",
];

export function UnitFormDialog({ open, onOpenChange, unit }: UnitFormDialogProps) {
  const isEditing = !!unit;
  const { toast } = useToast();
  const createUnit = useCreateUnit();
  const updateUnit = useUpdateUnit();

  const [selectedAmenities, setSelectedAmenities] = useState<string[]>(unit?.amenities ?? []);

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: {
      name: unit?.name ?? "",
      description: unit?.description ?? "",
      capacity: unit?.capacity ?? 2,
      min_nights: unit?.min_nights ?? 1,
      base_price: unit?.base_price ?? 0,
      weekend_price: unit?.weekend_price ?? undefined,
      cleaning_fee: unit?.cleaning_fee ?? 0,
      rules: unit?.rules ?? "",
      is_active: unit?.is_active ?? true,
    },
  });

  const toggleAmenity = (amenity: string) => {
    setSelectedAmenities((prev) =>
      prev.includes(amenity) ? prev.filter((a) => a !== amenity) : [...prev, amenity]
    );
  };

  const onSubmit = async (data: any) => {
    try {
      const payload = {
        ...data,
        amenities: selectedAmenities,
        base_price: Number(data.base_price),
        weekend_price: data.weekend_price ? Number(data.weekend_price) : null,
        cleaning_fee: Number(data.cleaning_fee),
        capacity: Number(data.capacity),
        min_nights: Number(data.min_nights),
      };

      if (isEditing && unit) {
        await updateUnit.mutateAsync({ id: unit.id, ...payload });
        toast({ title: "Unit updated" });
      } else {
        await createUnit.mutateAsync(payload as UnitInsert);
        toast({ title: "Unit created" });
      }
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Unit" : "Add Unit"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input id="name" {...register("name", { required: true })} placeholder="Beach House A" />
            {errors.name && <p className="text-sm text-destructive">Name is required</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" {...register("description")} placeholder="A cozy beachfront retreat…" rows={3} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="capacity">Capacity</Label>
              <Input id="capacity" type="number" min={1} {...register("capacity")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="min_nights">Min. nights</Label>
              <Input id="min_nights" type="number" min={1} {...register("min_nights")} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="base_price">Base price</Label>
              <Input id="base_price" type="number" step="0.01" min={0} {...register("base_price")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="weekend_price">Weekend price</Label>
              <Input id="weekend_price" type="number" step="0.01" min={0} {...register("weekend_price")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cleaning_fee">Cleaning fee</Label>
              <Input id="cleaning_fee" type="number" step="0.01" min={0} {...register("cleaning_fee")} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Amenities</Label>
            <div className="flex flex-wrap gap-2">
              {AMENITY_OPTIONS.map((amenity) => (
                <button
                  key={amenity}
                  type="button"
                  onClick={() => toggleAmenity(amenity)}
                  className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                    selectedAmenities.includes(amenity)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-primary/50"
                  }`}
                >
                  {amenity}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rules">House Rules</Label>
            <Textarea id="rules" {...register("rules")} placeholder="No smoking, quiet hours after 10pm…" rows={2} />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="is_active">Active</Label>
            <Switch id="is_active" defaultChecked={unit?.is_active ?? true} {...register("is_active")} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createUnit.isPending || updateUnit.isPending}>
              {isEditing ? "Save Changes" : "Add Unit"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
