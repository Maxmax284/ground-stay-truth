import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Plus, Trash2, Pencil } from "lucide-react";
import { useUnits } from "@/hooks/useUnits";
import { usePricingRules, useDeletePricingRule } from "@/hooks/usePricingRules";
import { PricingRuleForm } from "@/components/PricingRuleForm";
import { PolicySettingsForm } from "@/components/PolicySettingsForm";
import type { PricingRule } from "@/hooks/usePricingRules";

const Pricing = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: units, isLoading: unitsLoading } = useUnits();
  const { data: rules, isLoading: rulesLoading } = usePricingRules();
  const deleteRule = useDeletePricingRule();

  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingRule, setEditingRule] = useState<PricingRule | null>(null);

  const activeUnits = useMemo(() => (units ?? []).filter((u) => u.is_active), [units]);

  const handleDelete = async (id: string) => {
    try {
      await deleteRule.mutateAsync(id);
      toast({ title: t("pricing.ruleDeleted") });
    } catch (err: any) {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("pricing.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("pricing.configureRules")}</p>
        </div>

        <Tabs defaultValue="pricing">
          <TabsList>
            <TabsTrigger value="pricing">{t("pricing.pricingTab")}</TabsTrigger>
            <TabsTrigger value="policies">{t("pricing.policiesTab")}</TabsTrigger>
          </TabsList>

          <TabsContent value="pricing" className="space-y-6 mt-4">
            <div>
              <h2 className="text-lg font-semibold mb-3">{t("pricing.unitPricingSummary")}</h2>
              {unitsLoading ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28" />)}
                </div>
              ) : activeUnits.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("pricing.noActiveUnits")}</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {activeUnits.map((u) => (
                    <Card key={u.id}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">{u.name}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t("units.basePrice")}</span>
                          <span className="font-medium">${Number(u.base_price).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t("units.weekendPrice")}</span>
                          <span className="font-medium">
                            {u.weekend_price ? `$${Number(u.weekend_price).toFixed(2)}` : "—"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t("units.cleaningFee")}</span>
                          <span className="font-medium">
                            {u.cleaning_fee ? `$${Number(u.cleaning_fee).toFixed(2)}` : "—"}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t("pricing.pricingPriority")}</CardTitle>
                <CardDescription>{t("pricing.pricingPriorityDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-2 text-sm">
                  {[
                    { label: t("pricing.manualOverride"), desc: t("pricing.manualOverrideDesc") },
                    { label: t("pricing.seasonalRule"), desc: t("pricing.seasonalRuleDesc") },
                    { label: t("pricing.weekendPriceLabel"), desc: t("pricing.weekendPriceDesc") },
                    { label: t("pricing.basePriceLabel"), desc: t("pricing.basePriceDesc") },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Badge variant="outline" className="shrink-0 w-6 h-6 flex items-center justify-center text-xs p-0">
                        {i + 1}
                      </Badge>
                      <div>
                        <span className="font-medium">{item.label}</span>
                        <span className="text-muted-foreground ml-2">— {item.desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Separator />

            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">{t("pricing.seasonalRules")}</h2>
                <Button size="sm" onClick={() => { setEditingRule(null); setShowRuleForm(true); }}>
                  <Plus className="h-4 w-4 mr-1" /> {t("pricing.addRule")}
                </Button>
              </div>

              {rulesLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12" />)}
                </div>
              ) : !rules?.length ? (
                <p className="text-sm text-muted-foreground">{t("pricing.noRules")}</p>
              ) : (
                <div className="rounded-lg border bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("pricing.ruleName")}</TableHead>
                        <TableHead>{t("bookings.unit")}</TableHead>
                        <TableHead>{t("pricing.dates")}</TableHead>
                        <TableHead>{t("pricing.pricePerNight")}</TableHead>
                        <TableHead className="w-[80px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rules.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell>{r.units?.name ?? "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(r.start_date), "MMM d")} – {format(new Date(r.end_date), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell className="font-medium">${Number(r.price).toFixed(2)}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingRule(r); setShowRuleForm(true); }}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(r.id)} disabled={deleteRule.isPending}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="policies" className="space-y-4 mt-4">
            <div>
              <h2 className="text-lg font-semibold mb-1">{t("pricing.operationalPolicies")}</h2>
              <p className="text-sm text-muted-foreground mb-4">{t("pricing.policiesDesc")}</p>
              <PolicySettingsForm />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <PricingRuleForm open={showRuleForm} onOpenChange={setShowRuleForm} rule={editingRule} />
    </DashboardLayout>
  );
};

export default Pricing;
