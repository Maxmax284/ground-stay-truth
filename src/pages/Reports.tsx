import { useState } from "react";
import { ChevronLeft, ChevronRight, TrendingUp, BarChart3, PieChart, Layers } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, PieChart as RPieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import DashboardLayout from "@/components/DashboardLayout";
import { useReports } from "@/hooks/useReports";
import { STATE_LABELS, type BookingState } from "@/lib/bookingStateMachine";

const STATE_COLORS: Record<string, string> = {
  inquiry: "hsl(30, 15%, 60%)",
  soft_hold: "hsl(38, 55%, 65%)",
  pending_approval: "hsl(38, 90%, 50%)",
  pending_deposit: "hsl(38, 70%, 55%)",
  confirmed: "hsl(150, 45%, 40%)",
  checked_in: "hsl(210, 50%, 50%)",
  completed: "hsl(150, 15%, 60%)",
  cancelled: "hsl(0, 65%, 50%)",
  no_show: "hsl(0, 45%, 40%)",
};

const Reports = () => {
  const [monthOffset, setMonthOffset] = useState(0);
  const { isLoading, occupancyByDay, occupancyRate, revenueByUnit, stateDistribution, blockedVsBookable, rangeLabel } = useReports(monthOffset);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Reports</h1>
            <p className="text-muted-foreground mt-1">Occupancy, revenue, and booking insights</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setMonthOffset((o) => o + 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[120px] text-center">{rangeLabel}</span>
            <Button variant="outline" size="icon" disabled={monthOffset === 0} onClick={() => setMonthOffset((o) => o - 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Occupancy headline */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" /> Occupancy Rate
            </CardTitle>
            {!isLoading && (
              <span className="text-2xl font-bold text-primary">{occupancyRate}%</span>
            )}
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={occupancyByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(30, 15%, 88%)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: "0.5rem", fontSize: "0.8rem" }}
                    formatter={(value: number, name: string) =>
                      name === "occupied" ? [`${value} unit(s)`, "Occupied"] : [value, name]
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="occupied"
                    stroke="hsl(16, 60%, 42%)"
                    fill="hsl(16, 60%, 42%)"
                    fillOpacity={0.15}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Revenue per unit */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" /> Revenue by Unit
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[220px] w-full" />
              ) : revenueByUnit.length === 0 ? (
                <p className="text-sm text-muted-foreground">No units configured yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={revenueByUnit} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(30, 15%, 88%)" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                    <Tooltip
                      contentStyle={{ borderRadius: "0.5rem", fontSize: "0.8rem" }}
                      formatter={(value: number) => [`$${value.toLocaleString()}`, "Revenue"]}
                    />
                    <Bar dataKey="revenue" fill="hsl(150, 45%, 40%)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* State distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <PieChart className="h-5 w-5 text-primary" /> Booking States
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[220px] w-full" />
              ) : stateDistribution.length === 0 ? (
                <p className="text-sm text-muted-foreground">No bookings in this period.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <RPieChart>
                    <Pie
                      data={stateDistribution}
                      dataKey="count"
                      nameKey="state"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ state, count }) =>
                        `${STATE_LABELS[state as BookingState] ?? state}: ${count}`
                      }
                      labelLine={false}
                    >
                      {stateDistribution.map((entry) => (
                        <Cell key={entry.state} fill={STATE_COLORS[entry.state] ?? "hsl(30, 15%, 60%)"} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ borderRadius: "0.5rem", fontSize: "0.8rem" }}
                      formatter={(value: number, name: string) => [
                        value,
                        STATE_LABELS[name as BookingState] ?? name,
                      ]}
                    />
                  </RPieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Blocked vs Bookable */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" /> Blocked vs Bookable Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[220px] w-full" />
            ) : blockedVsBookable.length === 0 ? (
              <p className="text-sm text-muted-foreground">No units configured yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={blockedVsBookable}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(30, 15%, 88%)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} label={{ value: "Days", angle: -90, position: "insideLeft", fontSize: 11 }} />
                  <Tooltip contentStyle={{ borderRadius: "0.5rem", fontSize: "0.8rem" }} />
                  <Legend />
                  <Bar dataKey="booked" stackId="a" fill="hsl(150, 45%, 40%)" name="Booked" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="blocked" stackId="a" fill="hsl(38, 55%, 65%)" name="Blocked" />
                  <Bar dataKey="maintenance" stackId="a" fill="hsl(0, 65%, 50%)" name="Maintenance" />
                  <Bar dataKey="available" stackId="a" fill="hsl(30, 15%, 88%)" name="Available" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Reports;
