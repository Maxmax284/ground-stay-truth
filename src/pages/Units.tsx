import { useState } from "react";
import { Plus, Building2, Users, Moon, DollarSign } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useUnits, useUpdateUnit, useDeleteUnit, type Unit } from "@/hooks/useUnits";
import { UnitFormDialog } from "@/components/UnitFormDialog";
import { useToast } from "@/hooks/use-toast";

const Units = () => {
  const { data: units, isLoading } = useUnits();
  const updateUnit = useUpdateUnit();
  const deleteUnit = useDeleteUnit();
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);

  const handleEdit = (unit: Unit) => {
    setEditingUnit(unit);
    setFormOpen(true);
  };

  const handleToggleActive = async (unit: Unit) => {
    try {
      await updateUnit.mutateAsync({ id: unit.id, is_active: !unit.is_active });
      toast({ title: unit.is_active ? "Unit deactivated" : "Unit activated" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async (unit: Unit) => {
    if (!confirm(`Remove "${unit.name}"? This cannot be undone.`)) return;
    try {
      await deleteUnit.mutateAsync(unit.id);
      toast({ title: "Unit removed" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Units</h1>
            <p className="text-muted-foreground mt-1">Manage your accommodation units</p>
          </div>
          <Button onClick={() => { setEditingUnit(null); setFormOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Add Unit
          </Button>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">Loading units…</p>
        ) : !units?.length ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Building2 className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-1">No units yet</h3>
              <p className="text-sm text-muted-foreground mb-4">Add your first accommodation unit to get started.</p>
              <Button onClick={() => { setEditingUnit(null); setFormOpen(true); }}>
                <Plus className="mr-2 h-4 w-4" /> Add Unit
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {units.map((unit) => (
              <Card key={unit.id} className={`transition-opacity ${!unit.is_active ? "opacity-60" : ""}`}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <h3 className="font-semibold text-foreground text-lg leading-tight">{unit.name}</h3>
                    <Badge variant={unit.is_active ? "default" : "secondary"}>
                      {unit.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>

                  {unit.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{unit.description}</p>
                  )}

                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" /> {unit.capacity}
                    </span>
                    <span className="flex items-center gap-1">
                      <Moon className="h-3.5 w-3.5" /> {unit.min_nights}+ nights
                    </span>
                    <span className="flex items-center gap-1">
                      <DollarSign className="h-3.5 w-3.5" /> {unit.base_price}
                    </span>
                  </div>

                  {unit.amenities && unit.amenities.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {unit.amenities.slice(0, 4).map((a) => (
                        <Badge key={a} variant="outline" className="text-xs">{a}</Badge>
                      ))}
                      {unit.amenities.length > 4 && (
                        <Badge variant="outline" className="text-xs">+{unit.amenities.length - 4}</Badge>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" onClick={() => handleEdit(unit)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleToggleActive(unit)}>
                      {unit.is_active ? "Deactivate" : "Activate"}
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(unit)}>
                      Remove
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <UnitFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        unit={editingUnit}
      />
    </DashboardLayout>
  );
};

export default Units;
