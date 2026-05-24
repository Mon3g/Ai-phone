import { useState, useEffect } from 'react';
import { Search, Download, Copy } from 'lucide-react';
import { supabase } from '../lib/supabase';

const STATUS_FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Done', value: 'completed' },
  { label: 'Live', value: 'in-progress' },
  { label: 'Failed', value: 'failed' },
  { label: 'Init', value: 'initiated' },
];

const statusColors = {
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  'in-progress': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  initiated: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
};

const statusDot = {
  completed: 'bg-green-500',
  'in-progress': 'bg-blue-500',
  failed: 'bg-red-500',
  initiated: 'bg-gray-400',
};

const CallLogs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const [copiedSid, setCopiedSid] = useState(null);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data } = await supabase
      .from('call_logs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    setLogs(data || []);
    setLoading(false);
  };

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.from_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.to_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.call_sid?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || log.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const exportToCSV = () => {
    const headers = ['Date', 'From', 'To', 'Duration', 'Status', 'Call SID'];
    const rows = filteredLogs.map((log) => [
      new Date(log.created_at).toLocaleString(),
      log.from_number || 'N/A',
      log.to_number || 'N/A',
      log.duration + 's',
      log.status,
      log.call_sid || 'N/A',
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const url = window.URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `call-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const copySid = (sid) => {
    navigator.clipboard.writeText(sid);
    setCopiedSid(sid);
    setTimeout(() => setCopiedSid(null), 2000);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Call Logs</h1>
          <p className="mt-0.5 text-sm text-gray-500">View and manage your call history</p>
        </div>
        <button
          onClick={exportToCSV}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors"
        >
          <Download className="w-4 h-4" />
          <span className="hidden sm:inline">Export CSV</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search numbers or Call SID…"
          className="w-full pl-11 pr-4 py-3 text-base border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`flex-shrink-0 px-4 py-2 text-sm font-medium rounded-full border transition-colors ${
              statusFilter === f.value
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <p className="text-sm text-gray-500">{filteredLogs.length} call{filteredLogs.length !== 1 ? 's' : ''} found</p>

      {/* Desktop table */}
      <div className="hidden lg:block bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                {['Date & Time', 'From', 'To', 'Duration', 'Status', 'Call SID'].map((h) => (
                  <th
                    key={h}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {loading ? (
                <tr>
                  <td colSpan="6" className="px-6 py-8 text-center text-sm text-gray-500">Loading…</td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-8 text-center text-sm text-gray-500">No call logs found</td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {log.from_number || 'Unknown'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {log.to_number || 'Unknown'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {log.duration ? `${log.duration}s` : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${statusColors[log.status] ?? 'bg-gray-100 text-gray-800'}`}>
                        {log.status || 'unknown'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                      <button
                        onClick={() => copySid(log.call_sid)}
                        className="flex items-center gap-1 hover:text-primary-600 transition-colors"
                        title="Copy SID"
                      >
                        <span>{log.call_sid ? log.call_sid.substring(0, 20) + '…' : 'N/A'}</span>
                        {log.call_sid && <Copy className="w-3.5 h-3.5 flex-shrink-0" />}
                      </button>
                      {copiedSid === log.call_sid && (
                        <span className="text-xs text-green-600">Copied!</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile card list */}
      <ul className="lg:hidden space-y-3">
        {loading ? (
          <li className="text-center py-8 text-sm text-gray-500">Loading…</li>
        ) : filteredLogs.length === 0 ? (
          <li className="text-center py-8 text-sm text-gray-500">No call logs found</li>
        ) : (
          filteredLogs.map((log) => (
            <li
              key={log.id}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 space-y-2"
            >
              {/* Row 1: status dot + from + badge */}
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot[log.status] ?? 'bg-gray-400'}`} />
                <span className="flex-1 text-sm font-medium text-gray-900 dark:text-white truncate">
                  {log.from_number || 'Unknown'}
                </span>
                <span className={`flex-shrink-0 px-2 py-0.5 text-xs font-semibold rounded-full ${statusColors[log.status] ?? 'bg-gray-100 text-gray-800'}`}>
                  {log.status || 'unknown'}
                </span>
              </div>

              {/* Row 2: to number */}
              {log.to_number && (
                <p className="text-xs text-gray-500 pl-4">→ {log.to_number}</p>
              )}

              {/* Row 3: duration · time */}
              <p className="text-xs text-gray-500 pl-4">
                {log.duration ? `${log.duration}s` : 'N/A'} &middot; {new Date(log.created_at).toLocaleString()}
              </p>

              {/* Row 4: SID + copy */}
              {log.call_sid && (
                <button
                  onClick={() =>
                    expandedId === log.id
                      ? setExpandedId(null)
                      : setExpandedId(log.id)
                  }
                  className="pl-4 text-xs text-gray-400 dark:text-gray-500 hover:text-primary-600 transition-colors text-left"
                >
                  {expandedId === log.id ? log.call_sid : log.call_sid.substring(0, 20) + '…'}
                </button>
              )}
              {expandedId === log.id && log.call_sid && (
                <button
                  onClick={() => copySid(log.call_sid)}
                  className="flex items-center gap-1.5 text-xs text-primary-600 pl-4"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copiedSid === log.call_sid ? 'Copied!' : 'Copy SID'}
                </button>
              )}
            </li>
          ))
        )}
      </ul>

      {/* Statistics */}
      {filteredLogs.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Statistics</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{filteredLogs.length}</p>
              <p className="text-sm text-gray-500">Total Calls</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {Math.round(filteredLogs.reduce((s, l) => s + (l.duration || 0), 0) / filteredLogs.length)}s
              </p>
              <p className="text-sm text-gray-500">Avg Duration</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {filteredLogs.filter((l) => l.status === 'completed').length}
              </p>
              <p className="text-sm text-gray-500">Completed</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {filteredLogs.filter((l) => l.status === 'failed').length}
              </p>
              <p className="text-sm text-gray-500">Failed</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CallLogs;
