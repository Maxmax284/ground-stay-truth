import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useMaintenanceRequests, useCreateMaintenanceRequest } from "@/hooks/useMaintenanceRequests";
import { useLaundryRequests, useCreateLaundryRequest } from "@/hooks/useLaundryRequests";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Wrench, Shirt, Plus, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface GuestStaySupportProps {
  bookings: Array<{
    id: string;
    unit_id: string;
    units?: { name: string } | null;
  }>;
}

const CATEGORIES = ["plumbing", "electrical", "appliance", "cleanliness", "other"];

const STATUS_STYLES: Record<string, { className: string; icon: any }> = {
  open: { className: "bg-amber-100 text-amber-800 border-amber-200", icon: AlertCircle },
  in_progress: { className: "bg-blue-100 text-blue-800 border-blue-200", icon: Clock },
  resolved: { className: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle2 },
  received: { className: "bg-muted text-muted-foreground", icon: Clock },
  ready_for_pickup: { className: "bg-blue-100 text-blue-800 border-blue-200", icon: CheckCircle2 },
  collected: { className: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle2 },
};

export function GuestStaySupport({ bookings }: GuestStaySupportProps) {
  const { t } = useTranslation();
  const [selectedBookingId, setSelectedBookingId] = useState(bookings[0]?.id);
  const selectedBooking = bookings.find((b) => b.id === selectedBookingId) ?? bookings[0];

  if (!selectedBooking) return null;

  return (
    <div className="space-y-6">
      {bookings.length > 1 && (
        <Select value={selectedBookingId} onValueChange={setSelectedBookingId}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {bookings.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.units?.name ?? "—"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <MaintenanceSection bookingId={selectedBooking.id} unitId={selectedBooking.unit_id} t={t} />
      <Separator />
      <LaundrySection bookingId={selectedBooking.id} unitId={selectedBooking.unit_id} t={t} />
    </div>
  );
}

function MaintenanceSection({ bookingId, unitId, t }: { bookingId: string; unitId: string; t: any }) {
  const { data: requests } = useMaintenanceRequests(bookingId);
  const createRequest = useCreateMaintenanceRequest();
  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");

  const handleSubmit = async () => {
    if (!category || !description.trim()) {
      toast.error(t("staySupport.fillRequired"));
      return;
    }
    try {
      await createRequest.mutateAsync({
        booking_id: bookingId,
        unit_id: unitId,
        category,
        description: description.trim(),
      });
      toast.success(t("staySupport.issueReported"));
      setShowForm(false);
      setCategory("");
      setDescription("");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <Wrench className="h-4 w-4 text-muted-foreground" />
          {t("staySupport.roomIssues")}
        </h3>
        {!showForm && (
          <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-1" />
            {t("staySupport.reportIssue")}
          </Button>
        )}
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">{t("staySupport.category")} *</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder={t("staySupport.selectCategory")} /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{t(`staySupport.categories.${c}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("staySupport.description")} *</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 500))}
                placeholder={t("staySupport.descriptionPlaceholder")}
                rows={3}
              />
              <p className="text-xs text-muted-foreground text-right">{description.length}/500</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSubmit} disabled={createRequest.isPending}>
                {createRequest.isPending ? t("common.sending") : t("staySupport.submit")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>
                {t("common.cancel")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {(requests ?? []).length > 0 ? (
        <div className="space-y-2">
          {requests!.map((req) => {
            const style = STATUS_STYLES[req.status] ?? STATUS_STYLES.open;
            return (
              <Card key={req.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{t(`staySupport.categories.${req.category}`)}</Badge>
                      <Badge className={`text-xs ${style.className}`}>{t(`staySupport.statuses.${req.status}`)}</Badge>
                    </div>
                    <p className="text-sm text-foreground">{req.description}</p>
                    {req.status === "resolved" && req.resolution_note && (
                      <p className="text-xs text-muted-foreground italic">
                        {t("staySupport.resolution")}: {req.resolution_note}
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        !showForm && <p className="text-sm text-muted-foreground">{t("staySupport.noIssues")}</p>
      )}
    </div>
  );
}

function LaundrySection({ bookingId, unitId, t }: { bookingId: string; unitId: string; t: any }) {
  const { data: requests } = useLaundryRequests(bookingId);
  const createRequest = useCreateLaundryRequest();
  const [showForm, setShowForm] = useState(false);
  const [bagCount, setBagCount] = useState("");
  const [note, setNote] = useState("");

  const handleSubmit = async () => {
    try {
      await createRequest.mutateAsync({
        booking_id: bookingId,
        unit_id: unitId,
        bag_count: bagCount ? parseInt(bagCount) : undefined,
        note: note.trim() || undefined,
      });
      toast.success(t("staySupport.laundryConfirmed"));
      setShowForm(false);
      setBagCount("");
      setNote("");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <Shirt className="h-4 w-4 text-muted-foreground" />
          {t("staySupport.laundry")}
        </h3>
        {!showForm && (
          <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-1" />
            {t("staySupport.laundryDropOff")}
          </Button>
        )}
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">{t("staySupport.bagCount")}</Label>
              <Input
                type="number"
                min="1"
                value={bagCount}
                onChange={(e) => setBagCount(e.target.value)}
                placeholder={t("staySupport.bagCountPlaceholder")}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("staySupport.note")}</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("staySupport.notePlaceholder")}
                rows={2}
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSubmit} disabled={createRequest.isPending}>
                {createRequest.isPending ? t("common.sending") : t("staySupport.confirmDropOff")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>
                {t("common.cancel")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {(requests ?? []).length > 0 ? (
        <div className="space-y-2">
          {requests!.map((req) => {
            const style = STATUS_STYLES[req.status] ?? STATUS_STYLES.received;
            return (
              <Card key={req.id} className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="space-y-1">
                    <Badge className={`text-xs ${style.className}`}>{t(`staySupport.statuses.${req.status}`)}</Badge>
                    {req.bag_count && <span className="text-xs text-muted-foreground ml-2">{req.bag_count} {t("staySupport.bags")}</span>}
                  </div>
                </div>
                {req.note && <p className="text-xs text-muted-foreground mt-1">{req.note}</p>}
              </Card>
            );
          })}
        </div>
      ) : (
        !showForm && <p className="text-sm text-muted-foreground">{t("staySupport.noLaundry")}</p>
      )}
    </div>
  );
}
