import { useState, useEffect } from 'react';
import { Phone, Clock, DollarSign, Activity, Zap, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';

const StatCard = ({ icon: Icon, name, value, change, color }) => (
  <div className="bg-card text-card-foreground rounded-lg shadow-deep-sm p-6 flex flex-col justify-between">
    <div className="flex items-center justify-between">
      <p className="text-sm font-medium text-muted-foreground">{name}</p>
      <Icon className={`w-6 h-6 ${color}`} />
    </div>
    <div>
      <p className="mt-2 text-3xl font-bold text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{change}</p>
    </div>
  </div>
);

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalCalls: 0,
    avgDuration: 0,
    activeConfig: null,
    recentCalls: [],
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: calls } = await supabase
      .from('call_logs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5);

    const { data: activeConfig } = await supabase
      .from('assistant_settings')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (calls) {
      const totalDuration = calls.reduce((sum, call) => sum + (call.duration || 0), 0);
      setStats({
        totalCalls: calls.length,
        avgDuration: calls.length > 0 ? Math.round(totalDuration / calls.length) : 0,
        activeConfig,
        recentCalls: calls,
      });
    }
  };

  const statCardsData = [
    { name: 'Total Calls', value: stats.totalCalls, icon: Phone, color: 'text-primary', change: '+12%' },
    { name: 'Avg Duration', value: `${stats.avgDuration}s`, icon: Clock, color: 'text-green-500', change: '+4.5%' },
    { name: 'Status', value: stats.activeConfig ? 'Active' : 'Inactive', icon: Zap, color: stats.activeConfig ? 'text-green-500' : 'text-red-500', change: stats.activeConfig ? 'Running' : 'Stopped' },
    { name: 'This Month', value: '$0.00', icon: DollarSign, color: 'text-purple-500', change: 'Est. cost' },
  ];

  return (
    <div className="bg-background text-foreground min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-4xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-2 text-lg text-muted-foreground">Welcome back! Here's an overview of your AI voice assistant.</p>
        </header>

        <main className="space-y-8">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {statCardsData.map((stat) => (
              <StatCard key={stat.name} {...stat} />
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Active Configuration */}
            <div className="lg:col-span-1">
              <div className="bg-card text-card-foreground rounded-lg shadow-deep-sm p-6 h-full">
                <h2 className="text-xl font-semibold mb-4">Active Configuration</h2>
                {stats.activeConfig ? (
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Name</p>
                      <p className="font-medium text-lg">{stats.activeConfig.name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Voice</p>
                      <p className="font-medium capitalize">{stats.activeConfig.voice}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Greeting</p>
                      <p className="font-medium">{stats.activeConfig.enable_greeting ? 'Enabled' : 'Disabled'}</p>
                    </div>
                    <button className="w-full mt-4 bg-primary text-primary-foreground py-2 px-4 rounded-md hover:bg-primary/90 transition-colors flex items-center justify-center">
                      <span>View Details</span>
                      <ChevronRight className="w-4 h-4 ml-2" />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <Zap className="w-12 h-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No active configuration found.</p>
                    <button className="mt-4 bg-accent text-accent-foreground py-2 px-4 rounded-md hover:bg-accent/90 transition-colors">
                      Activate One
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Recent Calls */}
            <div className="lg:col-span-2">
              <div className="bg-card text-card-foreground rounded-lg shadow-deep-sm">
                <div className="px-6 py-4 border-b border-border">
                  <h2 className="text-xl font-semibold">Recent Calls</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead >
                      <tr className="border-b border-border">
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">From</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Duration</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {stats.recentCalls.length === 0 ? (
                        <tr>
                          <td colSpan="4" className="px-6 py-12 text-center text-muted-foreground">
                            No calls yet.
                          </td>
                        </tr>
                      ) : (
                        stats.recentCalls.map((call) => (
                          <tr key={call.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground">{call.from_number || 'Unknown'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">{call.duration}s</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${call.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                {call.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">{new Date(call.created_at).toLocaleString()}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;