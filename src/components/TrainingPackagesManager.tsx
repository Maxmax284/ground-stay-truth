import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useTrainingPackages, useCreateTrainingPackage, useUpdateTrainingPackage } from "@/hooks/useTrainingPackages";
import { Dumbbell, Plus, Edit } from "lucide-react";

export function TrainingPackagesManager() {
  const { data: packages, isLoading } = useTrainingPackages();
  const createPkg = useCreateTrainingPackage();
  const updatePkg = useUpdateTrainingPackage();
  const { toast } = useToast();

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Dumbbell className="h-5 w-5 text-primary" /> Training Packages
        </h3>
        <CreatePackageDialog onCreate={async (pkg) => {
          try {
            await createPkg.mutateAsync(pkg);
            toast({ title: "Package created" });
          } catch (err: any) {
            toast({ title: "Error", description: err.message, variant: "destructive" });
          }
        }} />
      </div>
      {(packages ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No training packages yet. Create one to start linking bookings to training programs.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {packages!.map((pkg) => (
            <Card key={pkg.id} className={!pkg.is_active ? "opacity-60" : ""}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{pkg.name}</span>
                  <div className="flex items-center gap-1.5">
                    {!pkg.is_active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => {
                      updatePkg.mutateAsync({ id: pkg.id, is_active: !pkg.is_active }).then(() => toast({ title: pkg.is_active ? "Deactivated" : "Activated" }));
                    }}>
                      <Edit className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                {pkg.description && <p className="text-xs text-muted-foreground">{pkg.description}</p>}
                <div className="flex gap-3 text-xs text-muted-foreground">
                  <span>{pkg.duration_days} days</span>
                  <span>฿{Number(pkg.price).toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CreatePackageDialog({ onCreate }: { onCreate: (pkg: { name: string; description?: string; duration_days: number; price: number }) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [days, setDays] = useState("7");
  const [price, setPrice] = useState("0");

  const handleCreate = () => {
    if (!name.trim()) return;
    onCreate({ name: name.trim(), description: description.trim() || undefined, duration_days: parseInt(days) || 7, price: parseFloat(price) || 0 });
    setName(""); setDescription(""); setDays("7"); setPrice("0");
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1"><Plus className="h-3 w-3" /> Add Package</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New Training Package</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Beginner Muay Thai" /></div>
          <div><Label className="text-xs">Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's included..." /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Duration (days)</Label><Input type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} /></div>
            <div><Label className="text-xs">Price (฿)</Label><Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button onClick={handleCreate} disabled={!name.trim()}>Create</Button></DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
