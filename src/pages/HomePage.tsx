import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Ship, DollarSign, TrendingDown, Activity, Clock, MapPinned } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { useKPISummary, useExceptions } from '@/api/queries';
import { transformApiKPISummary, transformApiExceptions } from '@/utils/transformers';

export default function HomePage() {
  const navigate = useNavigate();
  
  // Fetch data from API
  const { data: apiKpi, isLoading: kpiLoading, error: kpiError } = useKPISummary();
  const { data: apiExceptions, isLoading: exLoading, error: exError } = useExceptions(0, 5);

  const kpiDataDisplay = useMemo(() => (apiKpi ? transformApiKPISummary(apiKpi) : null), [apiKpi]);
  const exceptionsDisplay = useMemo(
    () => (apiExceptions ? transformApiExceptions(apiExceptions) : []),
    [apiExceptions]
  );

  if (kpiLoading || exLoading) {
    return <div className="text-sm text-muted-foreground">Loading control tower data...</div>;
  }

  if (kpiError || exError || !kpiDataDisplay) {
    return <div className="text-sm text-destructive">Failed to load live data from backend.</div>;
  }

  const topExceptions = exceptionsDisplay.filter(e => e.priority === 'critical').slice(0, 3);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold">Control Tower Overview</h2>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="animate-pulse-live border-success text-success text-xs">● Live Updates</Badge>
          <Button variant="outline" size="sm" onClick={() => navigate('/risk-heatmap')} className="gap-2">
            <MapPinned className="w-4 h-4" />
            Live Heatmap
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-destructive">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-destructive" /> Critical Exceptions</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-destructive">{kpiDataDisplay.criticalExceptions}</p><p className="text-xs text-muted-foreground mt-1">Requiring immediate action</p></CardContent>
        </Card>
        <Card className="border-l-4 border-l-warning">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Ship className="w-4 h-4 text-warning" /> At-Risk Shipments</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-warning">{kpiDataDisplay.atRiskShipments.reduce((a, b) => a + b.count, 0)}</p><p className="text-xs text-muted-foreground mt-1">Across {kpiDataDisplay.atRiskShipments.length} regions</p></CardContent>
        </Card>
        <Card className="border-l-4 border-l-caution">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><DollarSign className="w-4 h-4 text-caution" /> Demurrage at Risk</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-caution">${(kpiDataDisplay.demurrageRisk / 1000).toFixed(1)}K</p><p className="text-xs text-muted-foreground mt-1">Potential charges accumulating</p></CardContent>
        </Card>
        <Card className="border-l-4 border-l-secondary">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><TrendingDown className="w-4 h-4 text-secondary" /> Avg Resolution</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-secondary">5.2h</p><p className="text-xs text-muted-foreground mt-1">↓ 18% vs last week</p></CardContent>
        </Card>
      </div>

      {/* Top Actions + SLA Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Top Critical Exceptions</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {topExceptions.map((exc, i) => (
              <button key={exc.id} onClick={() => navigate('/exceptions')} className="w-full flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-left">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-xs font-bold">{i + 1}</span>
                  <div>
                    <p className="text-sm font-medium">{exc.shipmentId} — {exc.issueType}</p>
                    <p className="text-xs text-muted-foreground">{exc.terminal} • {exc.containerId}</p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge className="priority-critical text-xs">{exc.timeToSLA}</Badge>
                  <p className="text-xs text-muted-foreground mt-1">{exc.owner}</p>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">SLA Breach Trend (7-day)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={kpiDataDisplay.slaBreachTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 20% 88%)" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="breaches" fill="hsl(0 72% 51%)" radius={[4, 4, 0, 0]} name="Breaches" />
                <Bar dataKey="resolved" fill="hsl(174 60% 40%)" radius={[4, 4, 0, 0]} name="Resolved" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* System Health + Regional */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Activity className="w-4 h-4" /> System Health</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {kpiDataDisplay.systemHealth.map(sys => (
                <div key={sys.name} className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                  <div className={`w-2 h-2 rounded-full ${sys.status === 'healthy' ? 'bg-success' : sys.status === 'degraded' ? 'bg-caution' : 'bg-destructive'}`} />
                  <div>
                    <p className="text-xs font-medium">{sys.name}</p>
                    <p className="text-[10px] text-muted-foreground">{sys.latency}ms</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Clock className="w-4 h-4" /> At-Risk by Region</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {kpiDataDisplay.atRiskShipments.map(r => (
                <div key={r.region} className="flex items-center justify-between">
                  <span className="text-sm">{r.region}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-warning rounded-full" style={{ width: `${(r.count / 20) * 100}%` }} />
                    </div>
                    <span className="text-sm font-medium w-6 text-right">{r.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
