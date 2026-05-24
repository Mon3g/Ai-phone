import { useState, useEffect } from 'react';
import { Phone, Clock, DollarSign, Activity } from 'lucide-react';
import { supabase } from '../lib/supabase';

const statusColors = {
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  'in-progress': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const statusDot = {
  completed: 'bg-green-500',
  'in-progress': 'bg-blue-500',
  failed: 'bg-red-500',
};

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
    const {
      data: { user },
    } = await supabase.auth.getUser();
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

  const statCards = [
    { name: 'Total Calls', value: stats.totalCalls, icon: Phone, color: 'bg-blue-500', change: '+12%' },
    { name: 'Avg Duration', value: `${stats.avgDuration}s`, icon: Clock, color: 'bg-green-500', change: '+4.5%' },
    {
      name: 'Status',
      value: stats.activeConfig ? 'Active' : 'Inactive',
      icon: Activity,
      color: 'bg-yellow-500',
      change: stats.activeConfig ? 'Running' : 'Stopped',
    },
    { name: 'This Month', value: '$0.00', icon: DollarSign, color: 'bg-purple-500', change: 'Est. cost' },
  ];

  return (
    <div className="space-y-5">
      <header role="region" aria-labelledby="dashboard-heading">
        <h1 id="dashboard-heading" className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">Overview of your AI voice assistant</p>
      </header>

      {/* Stats Grid — 2 cols on mobile, 4 on desktop */}
      <section role="region" aria-label="Statistics Overview" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.name} className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">{stat.name}</p>
                  <p className="mt-1.5 text-2xl font-semibold text-gray-900 dark:text-white">{stat.value}</p>
                  <p className="mt-1 text-xs text-gray-500">{stat.change}</p>
                </div>
                <div className={`${stat.color} p-2.5 rounded-lg flex-shrink-0 ml-2`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* Active Configuration */}
      {stats.activeConfig && (
        <section
          role="region"
          aria-labelledby="active-config-heading"
          className="bg-white dark:bg-gray-800 rounded-xl shadow p-4"
        >
          <h2 id="active-config-heading" className="text-base font-semibold text-gray-900 dark:text-white mb-3">
            Active Configuration
          </h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5">
            {[
              ['Name', stats.activeConfig.name],
              ['Voice', stats.activeConfig.voice],
              ['Temperature', stats.activeConfig.temperature],
              ['Greeting', stats.activeConfig.enable_greeting ? 'Enabled' : 'Disabled'],
            ].map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-sm text-gray-500 dark:text-gray-400 self-center">{label}</dt>
                <dd className="text-sm font-medium text-gray-900 dark:text-white capitalize truncate self-center">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* Recent Calls */}
      <section role="region" aria-labelledby="recent-calls-heading" className="bg-white dark:bg-gray-800 rounded-xl shadow">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 id="recent-calls-heading" className="text-base font-semibold text-gray-900 dark:text-white">
            Recent Calls
          </h2>
        </div>

        {/* Desktop table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700" role="table" aria-label="Recent Calls Table">
            <caption className="sr-only">Recent calls list showing from, duration, status and time</caption>
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                {['From', 'Duration', 'Status', 'Time'].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {stats.recentCalls.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-4 text-center text-sm text-gray-500">
                    No calls yet
                  </td>
                </tr>
              ) : (
                stats.recentCalls.map((call) => (
                  <tr key={call.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {call.from_number || 'Unknown'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {call.duration}s
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColors[call.status] ?? 'bg-gray-100 text-gray-800'}`}>
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

        {/* Mobile card list */}
        <ul className="lg:hidden divide-y divide-gray-100 dark:divide-gray-700">
          {stats.recentCalls.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-gray-500">No calls yet</li>
          ) : (
            stats.recentCalls.map((call) => (
              <li key={call.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot[call.status] ?? 'bg-gray-400'}`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {call.from_number || 'Unknown'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {call.duration}s &middot; {new Date(call.created_at).toLocaleString()}
                  </p>
                </div>
                <span
                  className={`flex-shrink-0 px-2 py-0.5 text-xs font-semibold rounded-full ${statusColors[call.status] ?? 'bg-gray-100 text-gray-800'}`}
                >
                  {call.status}
                </span>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
};

export default Dashboard;
