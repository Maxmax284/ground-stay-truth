import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDistanceToNow } from "date-fns";
import { Bell, CheckCheck, Check, Search } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  type Notification,
} from "@/hooks/useNotifications";
import { getNotificationPresentation, NOTIFICATION_AUDIENCE_LABELS, NOTIFICATION_LEVEL_LABELS } from "@/lib/notificationPresentation";

type ReadFilter = "all" | "unread" | "read";

export default function NotificationCenter() {
  const { t } = useTranslation();
  const { data: notifications, unreadCount, isLoading } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [search, setSearch] = useState("");

  const types = useMemo(() => {
    const set = new Set<string>();
    (notifications ?? []).forEach((n) => set.add(n.type));
    return Array.from(set).sort();
  }, [notifications]);

  const filtered: Notification[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (notifications ?? []).filter((n) => {
      if (typeFilter !== "all" && n.type !== typeFilter) return false;
      if (readFilter === "unread" && n.read) return false;
      if (readFilter === "read" && !n.read) return false;
      if (q && !n.message.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [notifications, typeFilter, readFilter, search]);

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="station-header flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Bell className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-semibold">{t("notifications.centerTitle", "Notification Center")}</h1>
              <p className="text-sm text-muted-foreground">
                {t("notifications.centerSubtitle", "Review, filter, and manage in-app alerts.")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={unreadCount > 0 ? "default" : "secondary"}>
              {unreadCount} {t("notifications.unread", "unread")}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllRead.mutate()}
              disabled={unreadCount === 0 || markAllRead.isPending}
            >
              <CheckCheck className="h-4 w-4 mr-1" />
              {t("notifications.markAllRead")}
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("common.filters", "Filters")}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("common.search", "Search")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder={t("notifications.type", "Type")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.all", "All types")}</SelectItem>
                {types.map((tp) => (
                  <SelectItem key={tp} value={tp}>
                    {getNotificationPresentation(tp).icon + " " + getNotificationPresentation(tp).label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={readFilter} onValueChange={(v) => setReadFilter(v as ReadFilter)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.all", "All")}</SelectItem>
                <SelectItem value="unread">{t("notifications.unread", "Unread")}</SelectItem>
                <SelectItem value="read">{t("notifications.read", "Read")}</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card className="board-panel">
          <CardContent className="p-0">
            <ScrollArea className="h-[60vh]">
              {isLoading ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  {t("common.loading", "Loading…")}
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  {t("notifications.empty")}
                </div>
              ) : (
                <ul className="divide-y">
                  {filtered.map((n) => (
                    <li
                      key={n.id}
                      className={`flex items-start gap-3 px-4 py-3 ${!n.read ? "bg-primary/5" : ""}`}
                    >
                      <span className="text-lg shrink-0 mt-0.5">{getNotificationPresentation(n.type).icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            {getNotificationPresentation(n.type).label}
                          </Badge>
                          <span className="attention-stamp text-muted-foreground">{NOTIFICATION_AUDIENCE_LABELS[getNotificationPresentation(n.type).audience]}</span>
                          <span className="text-[10px] uppercase text-muted-foreground">{NOTIFICATION_LEVEL_LABELS[getNotificationPresentation(n.type).level]}</span>
                          {!n.read && (
                            <span className="inline-block h-2 w-2 rounded-full bg-primary" />
                          )}
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        <p className={`text-sm mt-1 leading-snug break-words ${!n.read ? "font-medium" : "text-muted-foreground"}`}>
                          {n.message}
                        </p>
                      </div>
                      {!n.read && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => markRead.mutate(n.id)}
                          disabled={markRead.isPending}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          {t("notifications.markRead", "Mark read")}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
