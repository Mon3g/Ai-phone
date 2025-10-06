import { useState, useEffect } from 'react';
import { Phone, Clock, DollarSign, Activity } from 'lucide-react';
import { supabase } from '../lib/supabase';

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalCalls: 0,
    avgDuration: 0,
    activeConfig: null,
    recentCalls: []
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
        recentCalls: calls
      });
    }
  };

  const statCards = [
    {
      name: 'Total Calls',
      value: stats.totalCalls,
      icon: Phone,
      color: 'bg-blue-500',
      change: '+12%'
    },
    {
      name: 'Avg Duration',
      value: `${stats.avgDuration}s`,
      icon: Clock,
      color: 'bg-green-500',
      change: '+4.5%'
    },
    {
      name: 'Status',
      value: stats.activeConfig ? 'Active' : 'Inactive',
      icon: Activity,
      color: 'bg-yellow-500',
      change: stats.activeConfig ? 'Running' : 'Stopped'
    },
    {
      name: 'This Month',
      value: '$0.00',
      icon: DollarSign,
      color: 'bg-purple-500',
      change: 'Est. cost'
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Overview of your AI voice assistant
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.name} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                  <p className="mt-2 text-3xl font-semibold text-gray-900">
                    {stat.value}
                  </p>
                  <p className="mt-2 text-xs text-gray-500">{stat.change}</p>
                </div>
                <div className={`${stat.color} p-3 rounded-lg`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Active Configuration */}
      {stats.activeConfig && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Active Configuration
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600">Name</p>
              <p className="font-medium">{stats.activeConfig.name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Voice</p>
              <p className="font-medium capitalize">{stats.activeConfig.voice}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Temperature</p>
              <p className="font-medium">{stats.activeConfig.temperature}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Greeting</p>
              <p className="font-medium">
                {stats.activeConfig.enable_greeting ? 'Enabled' : 'Disabled'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Recent Calls */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Recent Calls</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  From
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Duration
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Time
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {stats.recentCalls.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-4 text-center text-sm text-gray-500">
                    No calls yet
                  </td>
                </tr>
              ) : (
                stats.recentCalls.map((call) => (
                  <tr key={call.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {call.from_number || 'Unknown'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {call.duration}s
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                        {call.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(call.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
