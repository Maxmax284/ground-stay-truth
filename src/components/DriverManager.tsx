import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useDrivers, useCreateDriver, useUpdateDriver, type Driver } from "@/hooks/useDrivers";
import { Skeleton } from "@/components/ui/skeleton";
import { Car, Phone, MessageSquare, Plus, Pencil } from "lucide-react";

export function DriverManager() {
  const { data: drivers, isLoading } = useDrivers();
  const createDriver = useCreateDriver();
  const updateDriver = useUpdateDriver();
  const { toast } = useToast();
  const [editDriver, setEditDriver] = useState<Driver | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    name: "", phone: "", whatsapp: "", vehicle_type: "", license_plate: "", notes: "", is_active: true,
  });

  const openEdit = (d: Driver) => {
    setForm({
      name: d.name, phone: d.phone ?? "", whatsapp: d.whatsapp ?? "",
      vehicle_type: d.vehicle_type ?? "", license_plate: d.license_plate ?? "",
      notes: d.notes ?? "", is_active: d.is_active,
    });
    setEditDriver(d);
    setShowForm(true);
  };

  const openNew = () => {
    setForm({ name: "", phone: "", whatsapp: "", vehicle_type: "", license_plate: "", notes: "", is_active: true });
    setEditDriver(null);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone || null,
        whatsapp: form.whatsapp || null,
        vehicle_type: form.vehicle_type || null,
        license_plate: form.license_plate || null,
        notes: form.notes || null,
        is_active: form.is_active,
      };
      if (editDriver) {
        await updateDriver.mutateAsync({ id: editDriver.id, ...payload });
        toast({ title: "Driver updated" });
      } else {
        await createDriver.mutateAsync(payload as any);
        toast({ title: "Driver added" });
      }
      setShowForm(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  if (isLoading) return <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Driver Pool</h3>
        <Button size="sm" onClick={openNew} className="gap-1.5"><Plus className="h-3.5 w-3.5" /> Add Driver</Button>
      </div>

      {(!drivers || drivers.length === 0) ? (
        <p className="text-sm text-muted-foreground">No drivers configured yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {drivers.map((d) => (
            <Card key={d.id} className={`${!d.is_active ? "opacity-60" : ""}`}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Car className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm">{d.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {!d.is_active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                    <Button variant="ghost" size="sm" onClick={() => openEdit(d)} className="h-7 w-7 p-0">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  {d.vehicle_type && <p>{d.vehicle_type}{d.license_plate ? ` · ${d.license_plate}` : ""}</p>}
                  {d.phone && <p className="flex items-center gap-1"><Phone className="h-3 w-3" /> {d.phone}</p>}
                  {d.whatsapp && (
                    <a href={`https://wa.me/${d.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                      <MessageSquare className="h-3 w-3" /> WhatsApp
                    </a>
                  )}
                  {d.notes && <p className="italic">{d.notes}</p>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editDriver ? "Edit Driver" : "Add Driver"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+66..." />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">WhatsApp</Label>
                <Input value={form.whatsapp} onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))} placeholder="+66..." />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Vehicle Type</Label>
                <Input value={form.vehicle_type} onChange={(e) => setForm((f) => ({ ...f, vehicle_type: e.target.value }))} placeholder="Sedan, Van..." />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">License Plate</Label>
                <Input value={form.license_plate} onChange={(e) => setForm((f) => ({ ...f, license_plate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Languages, reliability, etc." />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
              <Label className="text-xs">{form.is_active ? "Active" : "Inactive"}</Label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={createDriver.isPending || updateDriver.isPending}>
                {editDriver ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
