import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { Exception, Recommendation } from '@/types/domain';
import { useRecommendations } from '@/api/queries';
import { transformApiRecommendations } from '@/utils/transformers';
import { X, CheckCircle, Edit3, XCircle, Brain, Clock, DollarSign, Target, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  exception: Exception;
  onClose: () => void;
}

export default function ShipmentDecisionModal({ exception, onClose }: Props) {
  const {
    data: apiRecommendations,
    isPending: recommendationsLoading,
    isError: recommendationsError,
    error: recommendationsErrorDetail,
    refetch: refetchRecommendations,
  } = useRecommendations(exception.shipmentId);
  const recommendations = apiRecommendations ? transformApiRecommendations(apiRecommendations) : [];
  const [selectedRec, setSelectedRec] = useState<Recommendation | null>(null);
  const [approved, setApproved] = useState(false);
  const [notes, setNotes] = useState('');

  const issueTypeLower = exception.issueType.toLowerCase();
  const rootCauseNarrative = (() => {
    if (issueTypeLower.includes('custom') || issueTypeLower.includes('document') || issueTypeLower.includes('compliance')) {
      return `Customs/compliance checks are constraining dispatch at ${exception.terminal}. The shipment should prioritize document and clearance resolution before dispatch-changing moves.`;
    }
    if (issueTypeLower.includes('congestion') || issueTypeLower.includes('yard') || issueTypeLower.includes('queue') || issueTypeLower.includes('terminal')) {
      return `Terminal congestion conditions at ${exception.terminal} are creating local flow friction. Priority actions should focus on slot/gate handling and queue relief before long-route changes.`;
    }
    if (issueTypeLower.includes('delay') || issueTypeLower.includes('sla') || issueTypeLower.includes('deadline')) {
      return `Schedule reliability risk is rising for ${exception.shipmentId}. Immediate actions should target time-to-SLA recovery with the fastest feasible operational step.`;
    }
    if (issueTypeLower.includes('vehicle') || issueTypeLower.includes('breakdown') || issueTypeLower.includes('carrier')) {
      return `Transport execution disruption is driving this exception. The control objective is restoring movement continuity through feasible capacity and carrier actions.`;
    }
    if (issueTypeLower.includes('temperature') || issueTypeLower.includes('cold') || issueTypeLower.includes('iot')) {
      return `Telemetry indicates handling-condition risk for this shipment. Recommended actions should protect cargo integrity first, then optimize transit.`;
    }
    if (issueTypeLower.includes('transshipment') || issueTypeLower.includes('connection') || issueTypeLower.includes('missed')) {
      return `A handoff/connection risk is affecting route continuity. Actions should stabilize the transfer path and reduce compounding downstream delays.`;
    }
    return `The exception is driven by ${exception.issueType.toLowerCase()} signals at ${exception.terminal}. The recommendation engine is prioritizing actions using current operational constraints, SLA risk, and feasibility.`;
  })();

  const timeline = [
    { time: '06:00', event: 'Container loaded at origin', status: 'done' },
    { time: '08:30', event: 'Vessel departed', status: 'done' },
    { time: '14:00', event: `Arrived at ${exception.terminal}`, status: 'done' },
    { time: '14:30', event: exception.issueType + ' detected', status: 'active' },
    { time: '???', event: 'Resolution pending', status: 'pending' },
    { time: '???', event: 'Delivery to consignee', status: 'pending' },
  ];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
        <div className="absolute inset-0 bg-foreground/30" />
        <motion.div
          initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="relative w-full max-w-2xl bg-card shadow-xl overflow-y-auto"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-card border-b p-4 flex items-center justify-between z-10">
            <div>
              <h3 className="font-bold text-lg">{exception.shipmentId}</h3>
              <p className="text-sm text-muted-foreground">{exception.containerId} • {exception.terminal}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}><X className="w-5 h-5" /></Button>
          </div>

          <div className="p-4 space-y-6">
            {approved ? (
              <Card className="border-success bg-success/5">
                <CardContent className="pt-6 text-center space-y-2">
                  <CheckCircle className="w-12 h-12 text-success mx-auto" />
                  <h3 className="font-bold text-lg text-success">Action Approved</h3>
                  <p className="text-sm text-muted-foreground">Task has been created and assigned. Dashboard will update projected outcomes.</p>
                  <div className="flex gap-2 justify-center pt-2">
                    <Badge variant="outline">Projected SLA: Met ✓</Badge>
                    <Badge variant="outline">Cost Saved: $12,000</Badge>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Timeline */}
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Shipment Timeline</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {timeline.map((t, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${t.status === 'done' ? 'bg-success' : t.status === 'active' ? 'bg-destructive animate-pulse-live' : 'bg-muted-foreground/30'}`} />
                          <div className="flex-1 flex justify-between">
                            <span className={`text-sm ${t.status === 'active' ? 'font-medium text-destructive' : t.status === 'pending' ? 'text-muted-foreground' : ''}`}>{t.event}</span>
                            <span className="text-xs text-muted-foreground">{t.time}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Root Cause */}
                <Card className="border-destructive/30 bg-destructive/5">
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-2">
                      <Brain className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-sm">Root Cause Analysis</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {rootCauseNarrative}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Recommendations */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-sm flex items-center gap-2"><Target className="w-4 h-4" /> AI Recommendations</h4>
                  {recommendationsLoading && (
                    <Card>
                      <CardContent className="pt-4 text-sm text-muted-foreground">Loading AI recommendations for this shipment...</CardContent>
                    </Card>
                  )}

                  {recommendationsError && (
                    <Card>
                      <CardContent className="pt-4 space-y-3">
                        <p className="text-sm text-destructive">Failed to load AI recommendations.</p>
                        <p className="text-xs text-muted-foreground break-words">{recommendationsErrorDetail instanceof Error ? recommendationsErrorDetail.message : 'Unknown error'}</p>
                        <Button variant="outline" size="sm" onClick={() => refetchRecommendations()}>
                          Retry
                        </Button>
                      </CardContent>
                    </Card>
                  )}

                  {!recommendationsLoading && !recommendationsError && recommendations.length === 0 && (
                    <Card>
                      <CardContent className="pt-4 text-sm text-muted-foreground">No AI recommendations available for this shipment yet.</CardContent>
                    </Card>
                  )}

                  {recommendations.map(rec => (
                    <Card
                      key={rec.id}
                      className={`cursor-pointer transition-all ${selectedRec?.id === rec.id ? 'ring-2 ring-primary' : 'hover:shadow-md'}`}
                      onClick={() => setSelectedRec(rec)}
                    >
                      <CardContent className="pt-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <h5 className="font-medium text-sm">{rec.label}</h5>
                          <Badge className={rec.confidence >= 90 ? 'bg-success text-success-foreground' : rec.confidence >= 70 ? 'bg-caution text-caution-foreground' : 'bg-muted text-muted-foreground'}>
                            {rec.confidence}% confidence
                          </Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="flex items-center gap-1"><DollarSign className="w-3 h-3" />{rec.costImpact < 0 ? `Save $${Math.abs(rec.costImpact / 1000)}K` : 'No savings'}</div>
                          <div className="flex items-center gap-1"><Clock className="w-3 h-3" />{rec.timeImpact}</div>
                          <div className="flex items-center gap-1"><Target className="w-3 h-3" />{rec.slaImpact}</div>
                        </div>
                        {selectedRec?.id === rec.id && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="space-y-2 border-t pt-3">
                            <div className="bg-accent/50 p-3 rounded-md">
                              <p className="text-xs font-medium mb-1 flex items-center gap-1"><Brain className="w-3 h-3" /> Why this action?</p>
                              <p className="text-xs text-muted-foreground">{rec.explanation}</p>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {rec.dataSources.map(ds => <Badge key={ds} variant="outline" className="text-[10px]">{ds}</Badge>)}
                            </div>
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>Owner: {rec.requiredOwner}</span>
                              <span>Due: {rec.dueBy}</span>
                            </div>
                          </motion.div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Notes */}
                <div>
                  <label className="text-sm font-medium">Notes & Collaboration</label>
                  <Textarea placeholder="Add notes for the team..." value={notes} onChange={e => setNotes(e.target.value)} className="mt-1" />
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button className="flex-1 bg-success hover:bg-success/90 text-success-foreground" disabled={!selectedRec} onClick={() => setApproved(true)}>
                    <CheckCircle className="w-4 h-4 mr-1" /> Approve
                  </Button>
                  <Button variant="outline" className="flex-1"><Edit3 className="w-4 h-4 mr-1" /> Modify</Button>
                  <Button variant="outline" className="flex-1 text-destructive"><XCircle className="w-4 h-4 mr-1" /> Reject</Button>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
