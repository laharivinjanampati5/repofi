import { useMemo, useState } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useExceptions, useRecommendations } from '@/api/queries';
import { transformApiExceptions, transformApiRecommendations } from '@/utils/transformers';

const nodeColors: Record<string, string> = {
  shipment: '#0e7490',
  exception: '#dc2626',
  recommendation: '#f59e0b',
  owner: '#6366f1',
};

export default function KnowledgeGraphPage() {
  const { data: apiExceptions, isLoading: exceptionsLoading, error: exceptionsError } = useExceptions(0, 60);
  const exceptions = useMemo(
    () => (apiExceptions ? transformApiExceptions(apiExceptions) : []),
    [apiExceptions]
  );

  const [selectedShipment, setSelectedShipment] = useState<string>('');
  const shipmentId = selectedShipment || exceptions[0]?.shipmentId || '';

  const { data: apiRecommendations, isLoading: recsLoading, error: recsError } = useRecommendations(shipmentId || null);
  const recommendations = useMemo(
    () => (apiRecommendations ? transformApiRecommendations(apiRecommendations) : []),
    [apiRecommendations]
  );

  const selectedException = useMemo(
    () => exceptions.find((item) => item.shipmentId === shipmentId) || null,
    [exceptions, shipmentId]
  );

  const graph = useMemo(() => {
    if (!selectedException) {
      return { nodes: [] as Node[], edges: [] as Edge[] };
    }

    const shipmentNode: Node = {
      id: `shipment-${selectedException.shipmentId}`,
      position: { x: 300, y: 40 },
      data: { label: selectedException.shipmentId },
      style: { border: `2px solid ${nodeColors.shipment}`, borderRadius: 10, padding: 8 },
    };

    const exceptionNode: Node = {
      id: `exception-${selectedException.id}`,
      position: { x: 300, y: 170 },
      data: { label: `${selectedException.issueType} (${selectedException.priority})` },
      style: { border: `2px solid ${nodeColors.exception}`, borderRadius: 10, padding: 8 },
    };

    const ownerNode: Node = {
      id: `owner-${selectedException.owner}`,
      position: { x: 560, y: 170 },
      data: { label: selectedException.owner },
      style: { border: `2px solid ${nodeColors.owner}`, borderRadius: 10, padding: 8 },
    };

    const recommendationNodes: Node[] = recommendations.map((rec, idx) => ({
      id: `rec-${rec.id}`,
      position: { x: 80 + idx * 220, y: 320 },
      data: { label: rec.label },
      style: { border: `2px solid ${nodeColors.recommendation}`, borderRadius: 10, padding: 8, width: 200 },
    }));

    const baseEdges: Edge[] = [
      {
        id: `e1-${selectedException.id}`,
        source: shipmentNode.id,
        target: exceptionNode.id,
        label: 'has_exception',
      },
      {
        id: `e2-${selectedException.id}`,
        source: exceptionNode.id,
        target: ownerNode.id,
        label: 'owned_by',
      },
    ];

    const recommendationEdges: Edge[] = recommendationNodes.map((node, idx) => ({
      id: `er-${idx}`,
      source: exceptionNode.id,
      target: node.id,
      label: 'recommends',
      animated: true,
    }));

    return {
      nodes: [shipmentNode, exceptionNode, ownerNode, ...recommendationNodes],
      edges: [...baseEdges, ...recommendationEdges],
    };
  }, [selectedException, recommendations]);

  if (exceptionsLoading) {
    return <div className="text-sm text-muted-foreground">Loading knowledge graph...</div>;
  }

  if (exceptionsError || recsError) {
    return <div className="text-sm text-destructive">Failed to load knowledge graph data from backend.</div>;
  }

  return (
    <div className="space-y-4 h-full">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold">Knowledge Graph</h2>
        <Select value={shipmentId} onValueChange={setSelectedShipment}>
          <SelectTrigger className="w-[260px]"><SelectValue placeholder="Select shipment" /></SelectTrigger>
          <SelectContent>
            {exceptions.map((item) => (
              <SelectItem key={item.shipmentId} value={item.shipmentId}>{item.shipmentId}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Live Shipment Graph</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[560px] rounded-lg border overflow-hidden">
            <ReactFlow nodes={graph.nodes} edges={graph.edges} fitView minZoom={0.4} maxZoom={1.8}>
              <Controls />
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
            </ReactFlow>
          </div>
          {recsLoading && <p className="text-xs text-muted-foreground mt-2">Loading recommendations...</p>}
        </CardContent>
      </Card>
    </div>
  );
}
