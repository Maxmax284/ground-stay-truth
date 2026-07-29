/**
 * Guest Directory — every past and present customer, one row per person.
 * Lives as a tab under Bookings so staff have a single place to look people up.
 */
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, Download, ChevronRight, Users, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/useAuth";
import { formatPrice } from "@/lib/currency";
import { usePolicySettings } from "@/hooks/usePolicySettings";
import { downloadCSV } from "@/lib/csvExport";
import { FetchErrorState } from "@/components/FetchErrorState";
import {
  useGuestDirectory, guestStatus, findDuplicateKeys,
  type GuestDirectoryRow, type GuestStatus,
} from "@/hooks/useGuestDirectory";
import { GuestProfileSheet } from "./GuestProfileSheet";
import { MergeGuestDialog } from "./MergeGuestDialog";

const STATUS_STYLE: Record<GuestStatus, string> = {
  in_house: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  arriving_soon: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  upcoming: "bg-sky-500/15 text-sky-600 border-sky-500/30",
  past: "bg-muted text-muted-foreground border-border",
  inquiry_only: "bg-muted text-muted-foreground border-border",
  cancelled_only: "bg-destructive/10 text-destructive border-destructive/30",
  account_only: "bg-primary/10 text-primary border-primary/30",
};

type SortKey = "recent" | "name_asc" | "stays_desc" | "spend_desc" | "owed_desc";

export function GuestDirectory({ onOpenBooking }: { onOpenBooking: (id: string) => void }) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { role, user } = useAuth();
  const { data: policies } = usePolicySettings();
  const { data: rows, isLoading, isError, refetch } = useGuestDirectory();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<GuestStatus | "all">("all");
  const [onlyOwing, setOnlyOwing] = useState(false);
  const [onlyReturning, setOnlyReturning] = useState(false);
  const [sort, setSort] = useState<SortKey>("recent");
  const [selected, setSelected] = useState<GuestDirectoryRow | null>(null);
  const [mergeSource, setMergeSource] = useState<GuestDirectoryRow | null>(null);

  const duplicates = useMemo(() => findDuplicateKeys(rows ?? []), [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    let list = rows.filter((g) => {
      if (q && !`${g.full_name ?? ""} ${g.email ?? ""} ${g.phone ?? ""}`.toLowerCase().includes(q)) return false;
      if (status !== "all" && guestStatus(g) !== status) return false;
      if (onlyOwing && g.outstanding_balance <= 0) return false;
      if (onlyReturning && g.completed_stays < 2) return false;
      return true;
    });
    list = [...list];
    switch (sort) {
      case "name_asc": list.sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? "")); break;
      case "stays_desc": list.sort((a, b) => b.completed_stays - a.completed_stays); break;
      case "spend_desc": list.sort((a, b) => Number(b.lifetime_spend) - Number(a.lifetime_spend)); break;
      case "owed_desc": list.sort((a, b) => Number(b.outstanding_balance) - Number(a.outstanding_balance)); break;
      default:
        list.sort((a, b) =>
          (b.next_check_in ?? b.last_check_out ?? "").localeCompare(a.next_check_in ?? a.last_check_out ?? ""));
    }
    return list;
  }, [rows, search, status, onlyOwing, onlyReturning, sort]);

  const exportCsv = () => {
    downloadCSV(
      filtered.map((g) => ({
        name: g.full_name ?? "",
        email: g.email ?? "",
        phone: g.phone ?? "",
        status: t(`guests.status.${guestStatus(g)}`),
        bookings: g.total_bookings,
        completed_stays: g.completed_stays,
        nights: g.total_nights,
        lifetime_spend: Number(g.lifetime_spend).toFixed(2),
        outstanding: Number(g.outstanding_balance).toFixed(2),
        next_check_in: g.next_check_in ?? "",
        last_check_out: g.last_check_out ?? "",
      })),
      `guest-directory-${format(new Date(), "yyyy-MM-dd")}.csv`,
      user ? { userId: user.id, email: user.email ?? undefined, role } : undefined,
      true,
    );
  };

  if (isError) return <FetchErrorState message={t("guests.loadFailed")} onRetry={() => refetch()} />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("guests.searchPlaceholder")}
          />
        </div>

        <Select value={status} onValueChange={(v) => setStatus(v as GuestStatus | "all")}>
          <SelectTrigger className="w-full sm:w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("guests.allStatuses")}</SelectItem>
            {(["in_house", "arriving_soon", "upcoming", "past", "account_only", "inquiry_only", "cancelled_only"] as GuestStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{t(`guests.status.${s}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">{t("guests.sortRecent")}</SelectItem>
            <SelectItem value="name_asc">{t("guests.sortNameAz")}</SelectItem>
            <SelectItem value="stays_desc">{t("guests.sortStays")}</SelectItem>
            <SelectItem value="spend_desc">{t("guests.sortSpend")}</SelectItem>
            <SelectItem value="owed_desc">{t("guests.sortOwed")}</SelectItem>
          </SelectContent>
        </Select>

        <Button variant={onlyOwing ? "default" : "outline"} size="sm" className="h-10" onClick={() => setOnlyOwing((v) => !v)}>
          {t("guests.filterOwing")}
        </Button>
        <Button variant={onlyReturning ? "default" : "outline"} size="sm" className="h-10" onClick={() => setOnlyReturning((v) => !v)}>
          {t("guests.filterReturning")}
        </Button>
        <Button variant="ghost" size="sm" className="h-10" onClick={exportCsv} disabled={!filtered.length}>
          <Download className="h-4 w-4 mr-1" /> {t("guests.exportCsv")}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5" /> {t("guests.resultCount", { count: filtered.length })}
      </p>

      {isLoading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : !filtered.length ? (
        <div className="text-center py-16 text-muted-foreground"><p>{t("guests.empty")}</p></div>
      ) : isMobile ? (
        <div className="space-y-3">
          {filtered.map((g) => (
            <div key={g.guest_key} className="rounded-lg border bg-card p-4 cursor-pointer active:bg-accent/50 transition-colors" onClick={() => setSelected(g)}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{g.full_name}</p>
                  <p className="text-sm text-muted-foreground truncate">{g.email ?? g.phone ?? "—"}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge variant="outline" className={STATUS_STYLE[guestStatus(g)]}>{t(`guests.status.${guestStatus(g)}`)}</Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{t("guests.staysCount", { count: g.completed_stays })}</span>
                <span>·</span>
                <span>{formatPrice(g.lifetime_spend, policies, { decimals: 0 })}</span>
                {g.outstanding_balance > 0 && (
                  <span className="text-destructive">{t("guests.owes", { amount: formatPrice(g.outstanding_balance, policies, { decimals: 0 }) })}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("guests.colGuest")}</TableHead>
                <TableHead>{t("guests.colContact")}</TableHead>
                <TableHead>{t("guests.colStatus")}</TableHead>
                <TableHead>{t("guests.colStays")}</TableHead>
                <TableHead>{t("guests.colSpend")}</TableHead>
                <TableHead>{t("guests.colOutstanding")}</TableHead>
                <TableHead>{t("guests.colNext")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((g) => (
                <TableRow key={g.guest_key} className="cursor-pointer" onClick={() => setSelected(g)}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate max-w-[180px]">{g.full_name}</span>
                      {duplicates.has(g.guest_key) && (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" aria-label={t("guests.possibleDuplicate")} />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm truncate max-w-[200px]">{g.email ?? g.phone ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_STYLE[guestStatus(g)]}>{t(`guests.status.${guestStatus(g)}`)}</Badge>
                  </TableCell>
                  <TableCell>{g.completed_stays} <span className="text-muted-foreground text-xs">/ {g.total_bookings}</span></TableCell>
                  <TableCell>{formatPrice(g.lifetime_spend, policies, { decimals: 0 })}</TableCell>
                  <TableCell className={g.outstanding_balance > 0 ? "text-destructive" : "text-muted-foreground"}>
                    {formatPrice(g.outstanding_balance, policies, { decimals: 0 })}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {g.next_check_in ? format(new Date(g.next_check_in), "MMM d, yyyy") : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <GuestProfileSheet
        guest={selected}
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        onOpenBooking={(id) => { setSelected(null); onOpenBooking(id); }}
        onMerge={(g) => { setSelected(null); setMergeSource(g); }}
      />

      <MergeGuestDialog
        source={mergeSource}
        candidates={rows ?? []}
        open={!!mergeSource}
        onOpenChange={(o) => !o && setMergeSource(null)}
      />
    </div>
  );
}
