import { useState, useMemo } from "react";
import { AmenityList } from "@/components/AmenityBadge";
import { useTranslation } from "react-i18next";
import { Plus, Building2, Users, Moon, ChevronDown, ChevronRight, Image, Search, Calendar, Copy, Check } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useUnits, useUpdateUnit, useDeleteUnit, type Unit } from "@/hooks/useUnits";
import { useUnitGroups } from "@/hooks/useUnitGroups";
import { UnitFormDialog } from "@/components/UnitFormDialog";
import { UnitGroupManager } from "@/components/UnitGroupManager";
import { useToast } from "@/hooks/use-toast";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { formatPrice } from "@/lib/currency";
import { useAuth } from "@/hooks/useAuth";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const Units = () => {
  const { t } = useTranslation();
  const { data: units, isLoading } = useUnits();
  const { data: policies } = usePolicySettings();
  const { role } = useAuth();
  const { data: groups } = useUnitGroups();
  const updateUnit = useUpdateUnit();
  const deleteUnit = useDeleteUnit();
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const icalUrl = (unitId: string) =>
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ical-export?unit_id=${unitId}`;

  const copyIcalUrl = async (unitId: string) => {
    await navigator.clipboard.writeText(icalUrl(unitId));
    setCopiedId(unitId);
    toast({ title: "iCal feed URL copied" });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredUnits = useMemo(() => {
    if (!units) return [];
    return units.filter((u) => {
      if (statusFilter === "active" && !u.is_active) return false;
      if (statusFilter === "inactive" && u.is_active) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!u.name.toLowerCase().includes(q) && !(u.description ?? "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [units, searchQuery, statusFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; units: Unit[] }>();
    const ungrouped: Unit[] = [];
    for (const u of filteredUnits) {
      if (u.group_id && u.unit_groups?.name) {
        if (!map.has(u.group_id)) map.set(u.group_id, { name: u.unit_groups.name, units: [] });
        map.get(u.group_id)!.units.push(u);
      } else {
        ungrouped.push(u);
      }
    }
    return { grouped: map, ungrouped };
  }, [filteredUnits]);

  const handleEdit = (unit: Unit) => {
    setEditingUnit(unit);
    setFormOpen(true);
  };

  const handleToggleActive = async (unit: Unit) => {
    try {
      await updateUnit.mutateAsync({ id: unit.id, is_active: !unit.is_active });
      toast({ title: unit.is_active ? t("units.unitDeactivated") : t("units.unitActivated") });
    } catch (err: any) {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async (unit: Unit) => {
    if (!confirm(t("units.deactivateConfirm", { defaultValue: `Deactivate "${unit.name}"? It will remain on the calendar but won't be available for new bookings.` }).replace("{name}", unit.name))) return;
    try {
      await updateUnit.mutateAsync({ id: unit.id, is_active: false });
      toast({ title: t("units.unitDeactivated", { defaultValue: "Unit deactivated" }) });
    } catch (err: any) {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    }
  };

  const handleRestore = async (unit: Unit) => {
    try {
      await updateUnit.mutateAsync({ id: unit.id, is_active: true });
      toast({ title: t("units.unitActivated", { defaultValue: "Unit restored" }) });
    } catch (err: any) {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    }
  };

  const renderUnitCard = (unit: Unit) => (
    <Card key={unit.id} className={`transition-opacity ${!unit.is_active ? "opacity-60" : ""}`}>
      {unit.photos && unit.photos.length > 0 ? (
        <div className="relative aspect-[16/9] overflow-hidden rounded-t-lg">
          <img src={unit.photos[0]} alt={unit.name} className="w-full h-full object-cover" />
          {unit.photos.length > 1 && (
            <Badge variant="secondary" className="absolute bottom-2 right-2 text-xs gap-1">
              <Image className="h-3 w-3" /> {unit.photos.length}
            </Badge>
          )}
        </div>
      ) : null}
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between">
          <h3 className="font-semibold text-foreground text-lg leading-tight">{unit.name}</h3>
          <Badge variant={unit.is_active ? "default" : "secondary"}>
            {unit.is_active ? t("common.active") : t("common.inactive")}
          </Badge>
        </div>
        {!unit.is_active && (
          <p className="text-xs text-muted-foreground">{t("units.inactiveNote")}</p>
        )}
        {unit.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{unit.description}</p>
        )}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {unit.capacity}</span>
          <span className="flex items-center gap-1"><Moon className="h-3.5 w-3.5" /> {t("units.nightsPlus", { count: unit.min_nights })}</span>
          <span>{formatPrice(unit.base_price, policies, { decimals: 0 })}</span>
        </div>
        {unit.amenities && unit.amenities.length > 0 && (
          <AmenityList amenities={unit.amenities} max={4} size="sm" />
        )}
        <div className="flex gap-2 pt-1 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => handleEdit(unit)}>{t("common.edit")}</Button>
          <Button size="sm" variant="ghost" onClick={() => handleToggleActive(unit)}>
            {unit.is_active ? t("units.deactivate") : t("units.activate")}
          </Button>
          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(unit)}>
            {t("common.remove")}
          </Button>
          {(role === "admin" || role === "manager") && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="ghost" onClick={() => copyIcalUrl(unit.id)}>
                    {copiedId === unit.id ? <Check className="h-3.5 w-3.5 mr-1" /> : <Calendar className="h-3.5 w-3.5 mr-1" />}
                    iCal
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy iCal feed URL for external calendar sync</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </CardContent>
    </Card>
  );

  const hasGroups = grouped.grouped.size > 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t("units.title")}</h1>
            <p className="text-muted-foreground mt-1">{t("units.manageUnits")}</p>
          </div>
          <Button onClick={() => { setEditingUnit(null); setFormOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> {t("units.addUnit")}
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("units.searchPlaceholder", { defaultValue: "Search units…" })}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-1">
            {(["all", "active", "inactive"] as const).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={statusFilter === s ? "default" : "outline"}
                onClick={() => setStatusFilter(s)}
              >
                {t(`units.filter_${s}`, { defaultValue: s.charAt(0).toUpperCase() + s.slice(1) })}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-muted-foreground mb-2">{t("units.groups")}</p>
          <UnitGroupManager />
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">{t("units.loadingUnits")}</p>
        ) : !units?.length ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Building2 className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-1">{t("units.noUnits")}</h3>
              <p className="text-sm text-muted-foreground mb-4">{t("units.noUnitsDesc")}</p>
              <Button onClick={() => { setEditingUnit(null); setFormOpen(true); }}>
                <Plus className="mr-2 h-4 w-4" /> {t("units.addUnit")}
              </Button>
            </CardContent>
          </Card>
        ) : filteredUnits.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">{t("units.noResults", { defaultValue: "No units match your filters." })}</p>
        ) : hasGroups ? (
          <div className="space-y-4">
            {Array.from(grouped.grouped.entries()).map(([groupId, { name, units: groupUnits }]) => (
              <Collapsible key={groupId} defaultOpen>
                <CollapsibleTrigger className="flex items-center gap-2 w-full text-left group">
                  <ChevronDown className="h-4 w-4 text-muted-foreground group-data-[state=closed]:hidden" />
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-data-[state=open]:hidden" />
                  <span className="font-semibold text-foreground">{name}</span>
                  <Badge variant="secondary" className="text-xs">{groupUnits.length}</Badge>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
                    {groupUnits.map(renderUnitCard)}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}
            {grouped.ungrouped.length > 0 && (
              <Collapsible defaultOpen>
                <CollapsibleTrigger className="flex items-center gap-2 w-full text-left group">
                  <ChevronDown className="h-4 w-4 text-muted-foreground group-data-[state=closed]:hidden" />
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-data-[state=open]:hidden" />
                  <span className="font-semibold text-foreground">{t("units.otherUnits")}</span>
                  <Badge variant="secondary" className="text-xs">{grouped.ungrouped.length}</Badge>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
                    {grouped.ungrouped.map(renderUnitCard)}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredUnits.map(renderUnitCard)}
          </div>
        )}
      </div>

      <UnitFormDialog open={formOpen} onOpenChange={setFormOpen} unit={editingUnit} />
    </DashboardLayout>
  );
};

export default Units;
