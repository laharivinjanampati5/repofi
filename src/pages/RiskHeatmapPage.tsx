import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useExceptions, useKPISummary } from '@/api/queries';
import { transformApiExceptions } from '@/utils/transformers';

const bandForScore = (score: number): 'critical' | 'high' | 'medium' | 'low' => {
  if (score >= 85) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
};

const bandClass: Record<'critical' | 'high' | 'medium' | 'low', string> = {
  critical: 'bg-destructive/15 text-destructive border-destructive/30',
  high: 'bg-warning/15 text-warning border-warning/30',
  medium: 'bg-sky-500/15 text-sky-600 border-sky-500/30',
  low: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
};

export default function RiskHeatmapPage() {
  const { data: apiExceptions, isLoading: exceptionsLoading, error: exceptionsError } = useExceptions(0, 200);
  const { data: apiKpi, isLoading: kpiLoading, error: kpiError } = useKPISummary();
  const exceptions = apiExceptions ? transformApiExceptions(apiExceptions) : [];

  const regionMap = new Map<string, { total: number; critical: number; avgScore: number; demurrage: number }>();
  for (const item of exceptions) {
    const current = regionMap.get(item.region) || { total: 0, critical: 0, avgScore: 0, demurrage: 0 };
    current.total += 1;
    current.critical += item.priority === 'critical' ? 1 : 0;
    current.avgScore += item.priorityScore;
    current.demurrage += item.cost;
    regionMap.set(item.region, current);
  }

  const regionRows = Array.from(regionMap.entries())
    .map(([region, stats]) => ({
      region,
      total: stats.total,
      critical: stats.critical,
      avgScore: Number((stats.avgScore / stats.total).toFixed(1)),
      demurrage: stats.demurrage,
      band: bandForScore(stats.avgScore / stats.total),
    }))
    .sort((a, b) => b.avgScore - a.avgScore);

  if (exceptionsLoading || kpiLoading) {
    return <div className="text-sm text-muted-foreground">Loading heatmap data...</div>;
  }

  if (exceptionsError || kpiError || !apiKpi) {
    return <div className="text-sm text-destructive">Failed to load heatmap data from backend.</div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Risk Heatmap</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Total At-Risk Shipments</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{apiKpi.atRiskShipments.reduce((a, b) => a + b.count, 0)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Critical Exceptions</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-destructive">{apiKpi.criticalExceptions}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Demurrage Exposure</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">${Math.round(apiKpi.demurrageRisk).toLocaleString()}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Regional Risk Matrix (Live)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {regionRows.map((row) => (
            <div key={row.region} className="border rounded-md p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="font-medium">{row.region}</p>
                <Badge variant="outline" className={bandClass[row.band]}>{row.band.toUpperCase()}</Badge>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Shipments</p>
                  <p className="font-semibold">{row.total}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Critical</p>
                  <p className="font-semibold">{row.critical}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Avg Score</p>
                  <p className="font-semibold">{row.avgScore}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Demurrage</p>
                  <p className="font-semibold">${Math.round(row.demurrage).toLocaleString()}</p>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
