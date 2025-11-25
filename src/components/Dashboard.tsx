import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import InputPanel from './InputPanel';
import ResultsPanel from './ResultsPanel';
import Header from './Header';
import AIChatBot from './AIChatBot';
import { FinancialData, SimulationInputs } from '../types/financial';
import { FinancialContext } from '../services/aiAdvisor';
import { useUser } from '@clerk/clerk-react';
import { useSupabaseConnection, useUserData } from '../hooks/useSupabase';
import { simulationService } from '../services/databaseService';

const Dashboard: React.FC = () => {
  const { user } = useUser();
  const organizationData = user?.unsafeMetadata?.organizationData as any;
  
  // Supabase hooks - silent background verification
  useSupabaseConnection(); // Just verify connection silently
  const { userProfile, financialData, saveFinancialData } = useUserData();

  const [inputs, setInputs] = useState<SimulationInputs>({
    employees: organizationData?.teamSize || 5,
    marketingSpend: 200000,
    productPrice: 2999,
    miscExpenses: 150000,
    currentFunds: 5000000,
    customParameters: []
  });

  const [results, setResults] = useState<FinancialData | null>(null);
  const [usageStats, setUsageStats] = useState({
    simulations: 12,
    exports: 5
  });

  const [isChatOpen, setIsChatOpen] = useState(false);

  // Load financial data from Supabase when available
  useEffect(() => {
    if (financialData) {
      setInputs(prev => ({
        ...prev,
        currentFunds: financialData.current_funds || prev.currentFunds,
        employees: financialData.employees || prev.employees,
        marketingSpend: financialData.marketing_spend || prev.marketingSpend,
        productPrice: financialData.product_price || prev.productPrice,
        miscExpenses: financialData.misc_expenses || prev.miscExpenses,
        customParameters: prev.customParameters // Keep existing custom parameters
      }));
    }
  }, [financialData]);

  const [mockData, setMockData] = useState([
    { month: 'Jan', revenue: 1250000, expenses: 875000 },
    { month: 'Feb', revenue: 1300000, expenses: 900000 },
    { month: 'Mar', revenue: 1200000, expenses: 850000 },
    { month: 'Apr', revenue: 1375000, expenses: 950000 },
    { month: 'May', revenue: 1450000, expenses: 1000000 },
    { month: 'Jun', revenue: 1550000, expenses: 1050000 },
    { month: 'Jul', revenue: 1600000, expenses: 1100000 },
    { month: 'Aug', revenue: 1750000, expenses: 1200000 }
  ]);

  // Live data simulation - update every 45 seconds for more realistic intervals
  useEffect(() => {
    const interval = setInterval(() => {
      setMockData(prevData =>
        prevData.map(item => ({
          ...item,
          revenue: Math.max(0, item.revenue + (Math.random() - 0.5) * 125000),
          expenses: Math.max(0, item.expenses + (Math.random() - 0.5) * 75000)
        }))
      );
    }, 45000);

    return () => clearInterval(interval);
  }, []);

  const runSimulation = () => {
    // Enhanced simulation logic based on organization type
    const baseMultiplier = organizationData?.organizationType === 'startup' ? 1.2 :
      organizationData?.organizationType === 'event' ? 0.8 : 1.0;

    // assumedQuantity represents the expected number of units (or transactions)
    // for the period. We scale the quantity by `baseMultiplier` once.
    const assumedQuantity = Math.floor(100 * baseMultiplier);
    const baseSalary = organizationData?.organizationType === 'startup' ? 70000 : 60000;
    const baseFixedCost = organizationData?.organizationType === 'event' ? 200000 : 300000;

    // Revenue = productPrice * assumedQuantity
    // Note: baseMultiplier was already applied to assumedQuantity, so we avoid
    // applying it again here (previous implementation multiplied by it twice).
    const revenue = inputs.productPrice * assumedQuantity;
    const expenses = baseFixedCost + (baseSalary * inputs.employees) + inputs.marketingSpend + inputs.miscExpenses;
    const netProfit = revenue - expenses;
    const runway = expenses > 0 ? Math.floor(inputs.currentFunds / expenses) : Infinity;

    const newResults: FinancialData = {
      revenue,
      expenses,
      netProfit,
      runway,
      profitMargin: revenue > 0 ? (netProfit / revenue) * 100 : 0
    };

    setResults(newResults);
    setUsageStats(prev => ({ ...prev, simulations: prev.simulations + 1 }));
    
    // Scroll to top to show results prominently
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 300);
    
    // Save simulation to Supabase (silent background operation)
    if (userProfile) {
      simulationService.saveSimulation(userProfile.id, {
        name: `Simulation ${new Date().toLocaleDateString()}`,
        description: `${organizationData?.organizationType || 'General'} simulation`,
        inputs: inputs,
        results: newResults
      }).then(() => {
        console.log('💾 Simulation saved successfully');
      }).catch(error => {
        console.error('💾 Simulation save failed (continuing without save):', error.message);
      });
    }

    // Save current financial data to Supabase (silent background operation)
    if (saveFinancialData) {
      saveFinancialData({
        current_funds: inputs.currentFunds,
        monthly_revenue: revenue / 12,
        monthly_expenses: expenses / 12,
        employees: inputs.employees,
        marketing_spend: inputs.marketingSpend,
        product_price: inputs.productPrice,
        misc_expenses: inputs.miscExpenses
      }).then(() => {
        console.log('💾 Financial data saved successfully');
      }).catch(error => {
        console.error('💾 Financial data save failed (continuing without save):', error.message);
      });
    }
  };

  const handleExport = () => {
    setUsageStats(prev => ({ ...prev, exports: prev.exports + 1 }));
  };

  // Generate financial context for AI
  const getFinancialContext = (): FinancialContext => {
    const baseMultiplier = organizationData?.organizationType === 'startup' ? 1.2 :
      organizationData?.organizationType === 'event' ? 0.8 : 1.0;
    const assumedQuantity = Math.floor(100 * baseMultiplier);
    const baseSalary = organizationData?.organizationType === 'startup' ? 70000 : 60000;
    const baseFixedCost = organizationData?.organizationType === 'event' ? 200000 : 300000;
    // Use the same revenue rule as in runSimulation (do NOT double-scale)
    const revenue = inputs.productPrice * assumedQuantity;
    const expenses = baseFixedCost + (baseSalary * inputs.employees) + inputs.marketingSpend + inputs.miscExpenses;
    const netProfit = revenue - expenses;
    const currentMonthData = mockData[mockData.length - 1];
    
    return {
      currentRevenue: currentMonthData.revenue,
      projectedRevenue: revenue,
      expenses: expenses,
      growthRate: 15, // Example growth rate
      timeHorizon: 12,
      cashFlow: currentMonthData.revenue - currentMonthData.expenses,
      profitMargin: revenue > 0 ? (netProfit / revenue) * 100 : 0
    };
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50">
        <Header 
          onChatOpen={() => setIsChatOpen(true)}
          isChatOpen={isChatOpen}
        />

      <main className="container mx-auto px-4 py-8">


        {/* Top Row - Results Panel (Graphs at top) */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <ResultsPanel
            results={results}
            mockData={mockData}
            onExport={handleExport}
          />
        </motion.div>

        {/* Bottom Row - Input Panel */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <InputPanel
            inputs={inputs}
            onInputChange={setInputs}
            onSimulate={runSimulation}
            usageStats={usageStats}
          />
        </motion.div>

        {/* Prominent Call-to-Action when no results */}
        {!results && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.6 }}
            className="fixed bottom-20 left-1/2 transform -translate-x-1/2 z-30"
          >
            <motion.button
              onClick={runSimulation}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
              className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white px-8 py-4 rounded-2xl font-bold text-lg shadow-2xl border-4 border-white transition-all duration-200"
            >
              🚀 Run Simulation Now!
            </motion.button>
          </motion.div>
        )}

        {/* Organization Info Banner */}
        {organizationData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.5 }}
            className="mt-8 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 backdrop-blur-sm rounded-2xl p-6 border border-emerald-300/30"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-emerald-900">
                  Financial Planning for {organizationData.companyName}
                </h3>
                <p className="text-sm text-emerald-700">
                  {organizationData.industry} • {organizationData.teamSize} team members • {organizationData.organizationType}
                </p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-emerald-600">{usageStats.simulations + usageStats.exports}</div>
                <div className="text-xs text-emerald-500">Total Actions</div>
              </div>
            </div>
          </motion.div>
        )}
      </main>



      {/* AI Chat Bot */}
      <AIChatBot
        financialContext={getFinancialContext()}
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
      />
    </div>
  );
};

export default Dashboard;