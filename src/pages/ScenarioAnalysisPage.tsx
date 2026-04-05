import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useExceptions, useScenarioAnalysis } from '@/api/queries';
import { transformApiExceptions } from '@/utils/transformers';

export default function ScenarioAnalysisPage() {
  const { data: apiExceptions, isLoading, error } = useExceptions(0, 100);
  const exceptions = useMemo(() => (apiExceptions ? transformApiExceptions(apiExceptions) : []), [apiExceptions]);

  const [shipmentId, setShipmentId] = useState('');
  const [scenarioText, setScenarioText] = useState('Port congestion worsens by 20% and customs processing slows by 4 hours.');

  const mutation = useScenarioAnalysis();

  const activeShipment = shipmentId || exceptions[0]?.shipmentId || '';

  const runScenario = () => {
    if (!activeShipment || !scenarioText.trim()) return;
    mutation.mutate({ shipmentId: activeShipment, scenarioText });
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading scenarios...</div>;
  }

  if (error) {
    return <div className="text-sm text-destructive">Failed to load shipments for scenario analysis.</div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Scenario Analysis</h2>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Run What-If Scenario</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Shipment</Label>
            <Select value={activeShipment} onValueChange={setShipmentId}>
              <SelectTrigger><SelectValue placeholder="Select shipment" /></SelectTrigger>
              <SelectContent>
                {exceptions.map((item) => (
                  <SelectItem key={item.shipmentId} value={item.shipmentId}>{item.shipmentId}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Scenario</Label>
            <Textarea value={scenarioText} onChange={(e) => setScenarioText(e.target.value)} rows={4} />
          </div>

          <Button onClick={runScenario} disabled={mutation.isPending || !activeShipment || !scenarioText.trim()}>
            {mutation.isPending ? 'Running AI analysis...' : 'Run Scenario'}
          </Button>
        </CardContent>
      </Card>

      {mutation.isError && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <p className="text-sm text-destructive">Scenario execution failed.</p>
            <p className="text-xs text-muted-foreground break-words">{mutation.error instanceof Error ? mutation.error.message : 'Unknown error'}</p>
            <Button variant="outline" size="sm" onClick={runScenario} disabled={mutation.isPending || !activeShipment || !scenarioText.trim()}>
              Retry Scenario
            </Button>
          </CardContent>
        </Card>
      )}

      {mutation.data && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Scenario Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border rounded-md p-3">
                <p className="text-xs text-muted-foreground">SLA Delta</p>
                <p className="text-2xl font-bold">{mutation.data.slaDeltaPct.toFixed(2)}%</p>
              </div>
              <div className="border rounded-md p-3">
                <p className="text-xs text-muted-foreground">Demurrage Delta</p>
                <p className="text-2xl font-bold">${Math.round(mutation.data.demurrageDeltaUsd).toLocaleString()}</p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold">Recommended Actions</p>
              {mutation.data.recommendation.map((rec) => (
                <div key={rec.id} className="border rounded-md p-3">
                  <p className="font-medium text-sm">{rec.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">Confidence: {rec.confidence}% | Cost Impact: ${Math.round(rec.costImpact).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
