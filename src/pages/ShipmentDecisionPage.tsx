import { useState } from 'react';
import ShipmentDecisionModal from '@/components/ShipmentDecisionModal';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileSearch } from 'lucide-react';
import { useExceptions } from '@/api/queries';
import { transformApiExceptions } from '@/utils/transformers';

export default function ShipmentDecisionPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  // Fetch exceptions from API
  const { data: apiExceptions } = useExceptions(0, 50);
  const exceptionsData = apiExceptions ? transformApiExceptions(apiExceptions) : [];
  
  const selected = exceptionsData.find(e => e.id === selectedId);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Shipment Decision View</h2>
      <p className="text-sm text-muted-foreground">Select a shipment to review AI recommendations and take action.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {exceptionsData.map(exc => (
          <Card key={exc.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedId(exc.id)}>
            <CardContent className="pt-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{exc.shipmentId}</span>
                <Badge className={`text-xs priority-${exc.priority}`}>{exc.priority}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{exc.issueType} • {exc.terminal}</p>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{exc.containerId}</span>
                <span className="font-medium">{exc.timeToSLA} to SLA</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {selected && <ShipmentDecisionModal exception={selected} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
