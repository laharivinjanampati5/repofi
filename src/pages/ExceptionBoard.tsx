import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Exception, Priority } from '@/types/domain';
import { Search, ArrowUpDown, Eye } from 'lucide-react';
import ShipmentDecisionModal from '@/components/ShipmentDecisionModal';
import { useExceptions } from '@/api/queries';
import { transformApiExceptions } from '@/utils/transformers';

const priorityClass: Record<Priority, string> = {
  critical: 'priority-critical',
  high: 'priority-high',
  medium: 'priority-medium',
  low: 'priority-low',
};

export default function ExceptionBoard() {
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortField, setSortField] = useState<keyof Exception>('priorityScore');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedExc, setSelectedExc] = useState<Exception | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Fetch exceptions from API
  const { data: apiExceptions, isLoading } = useExceptions(0, 50);
  const exceptionsData = apiExceptions ? transformApiExceptions(apiExceptions) : [];

  if (isLoading && !apiExceptions) {
    return <div className="text-sm text-muted-foreground">Loading exceptions...</div>;
  }

  const regions = [...new Set(exceptionsData.map(e => e.region))];
  const types = [...new Set(exceptionsData.map(e => e.issueType))];

  const filtered = useMemo(() => {
    let data = [...exceptionsData];
    if (search) data = data.filter(e => `${e.shipmentId} ${e.containerId} ${e.issueType}`.toLowerCase().includes(search.toLowerCase()));
    if (regionFilter !== 'all') data = data.filter(e => e.region === regionFilter);
    if (typeFilter !== 'all') data = data.filter(e => e.issueType === typeFilter);
    data.sort((a, b) => {
      const av = a[sortField], bv = b[sortField];
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return data;
  }, [search, regionFilter, typeFilter, sortField, sortDir]);

  const toggleSort = (field: keyof Exception) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const toggleSelect = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold">Exception Board</h2>
        {selected.size > 0 && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>Clear ({selected.size})</Button>
            <Button size="sm">Bulk Assign</Button>
            <Button size="sm" variant="secondary">Acknowledge</Button>
          </div>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search shipment, container, issue..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={regionFilter} onValueChange={setRegionFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Region" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Regions</SelectItem>
                {regions.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Issue Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {types.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="p-3 w-8"><input type="checkbox" className="rounded" onChange={e => setSelected(e.target.checked ? new Set(filtered.map(f => f.id)) : new Set())} /></th>
                {[
                  { key: 'priorityScore', label: 'Score' },
                  { key: 'shipmentId', label: 'Shipment' },
                  { key: 'containerId', label: 'Container' },
                  { key: 'issueType', label: 'Issue' },
                  { key: 'timeToSLA', label: 'Time to SLA' },
                  { key: 'recommendedAction', label: 'Recommendation' },
                  { key: 'owner', label: 'Owner' },
                  { key: 'status', label: 'Status' },
                ].map(col => (
                  <th key={col.key} className="p-3 text-left cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => toggleSort(col.key as keyof Exception)}>
                    <span className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3 text-muted-foreground" /></span>
                  </th>
                ))}
                <th className="p-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(exc => (
                <tr key={exc.id} className="border-b hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => setSelectedExc(exc)}>
                  <td className="p-3" onClick={e => { e.stopPropagation(); toggleSelect(exc.id); }}>
                    <input type="checkbox" checked={selected.has(exc.id)} readOnly className="rounded" />
                  </td>
                  <td className="p-3"><Badge className={`${priorityClass[exc.priority]} text-xs`}>{exc.priorityScore}</Badge></td>
                  <td className="p-3 font-medium">{exc.shipmentId}</td>
                  <td className="p-3 text-muted-foreground text-xs">{exc.containerId}</td>
                  <td className="p-3">{exc.issueType}</td>
                  <td className="p-3 font-medium">{exc.timeToSLA}</td>
                  <td className="p-3 text-xs max-w-[200px] truncate">{exc.recommendedAction}</td>
                  <td className="p-3">{exc.owner}</td>
                  <td className="p-3"><Badge variant="outline" className="text-xs capitalize">{exc.status}</Badge></td>
                  <td className="p-3"><Eye className="w-4 h-4 text-muted-foreground" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {selectedExc && <ShipmentDecisionModal exception={selectedExc} onClose={() => setSelectedExc(null)} />}
    </div>
  );
}
