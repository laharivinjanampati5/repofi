import { useState } from 'react';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from '@/components/Layout';
import HomePage from '@/pages/HomePage';
import ExceptionBoard from '@/pages/ExceptionBoard';
import KnowledgeGraphPage from '@/pages/KnowledgeGraphPage';
import ShipmentDecisionPage from '@/pages/ShipmentDecisionPage';
import ActionCenter from '@/pages/ActionCenter';
import KPIInsights from '@/pages/KPIInsights';
import ScenarioAnalysisPage from '@/pages/ScenarioAnalysisPage';
import RiskHeatmapPage from '@/pages/RiskHeatmapPage';
import NotFound from './pages/NotFound';

const queryClient = new QueryClient();

const App = () => {
  const [role, setRole] = useState('ctm');

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Layout role={role} onRoleChange={setRole}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/exceptions" element={<ExceptionBoard />} />
              <Route path="/knowledge-graph" element={<KnowledgeGraphPage />} />
              <Route path="/shipment-decision" element={<ShipmentDecisionPage />} />
              <Route path="/action-center" element={<ActionCenter />} />
              <Route path="/kpi-insights" element={<KPIInsights />} />
              <Route path="/scenario-analysis" element={<ScenarioAnalysisPage />} />
              <Route path="/risk-heatmap" element={<RiskHeatmapPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
