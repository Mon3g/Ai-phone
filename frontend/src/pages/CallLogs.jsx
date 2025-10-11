import { useState, useEffect, useRef } from 'react';
import { Search, Download, ListFilter as Filter } from 'lucide-react';
import { supabase } from '../lib/supabase';

const CallLogs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sort, setSort] = useState({ column: 'created_at', direction: 'desc' });
  const headingRef = useRef(null);

  useEffect(() => {
    fetchLogs();
    headingRef.current?.focus();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('call_logs')
      .select('*')
      .eq('user_id', user.id)
      .order(sort.column, { ascending: sort.direction === 'asc' });

    setLogs(data || []);
    setLoading(false);
  };

  const handleSort = (column) => {
    const direction = sort.column === column && sort.direction === 'asc' ? 'desc' : 'asc';
    setSort({ column, direction });
    // Re-fetch logs with new sorting
    fetchLogs();
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

    const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `call-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'in-progress':
        return 'bg-blue-100 text-blue-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const tableHeaders = [
    { key: 'created_at', label: 'Date & Time' },
    { key: 'from_number', label: 'From' },
    { key: 'to_number', label: 'To' },
    { key: 'duration', label: 'Duration' },
    { key: 'status', label: 'Status' },
    { key: 'call_sid', label: 'Call SID' },
  ];

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 id="page-heading" ref={headingRef} tabIndex={-1} className="text-2xl font-bold text-gray-900 focus:outline-none">Call Logs</h1>
          <p className="mt-1 text-sm text-gray-500">View and manage your call history</p>
        </div>
        <button
          onClick={exportToCSV}
          className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Download className="w-4 h-4" />
          <span>Export CSV</span>
        </button>
      </header>

      <section role="search" aria-labelledby="filter-heading" className="bg-white rounded-lg shadow p-4">
        <h2 id="filter-heading" className="sr-only">Filter call logs</h2>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <label htmlFor="search-term" className="sr-only">Search by phone number or Call SID</label>
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              id="search-term"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by phone number or Call SID..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div className="relative">
            <label htmlFor="status-filter" className="sr-only">Filter by status</label>
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent appearance-none bg-white"
            >
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="in-progress">In Progress</option>
              <option value="failed">Failed</option>
              <option value="initiated">Initiated</option>
            </select>
          </div>
        </div>
      </section>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200" aria-busy={loading}>
            <caption className="sr-only">Call history table</caption>
            <thead className="bg-gray-50">
              <tr>
                {tableHeaders.map(header => (
                  <th
                    key={header.key}
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    aria-sort={sort.column === header.key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <button onClick={() => handleSort(header.key)} className="flex items-center space-x-1">
                      <span>{header.label}</span>
                      {/* Add sort icons here if desired */}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={tableHeaders.length} className="px-6 py-8 text-center text-sm text-gray-500">
                    <div role="status">Loading...</div>
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={tableHeaders.length} className="px-6 py-8 text-center text-sm text-gray-500">
                    <div role="status">No call logs found</div>
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {log.from_number || 'Unknown'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {log.to_number || 'Unknown'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {log.duration ? `${log.duration}s` : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(log.status)}`}
                      >
                        {log.status || 'unknown'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                      {log.call_sid ? log.call_sid.substring(0, 20) + '...' : 'N/A'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {filteredLogs.length > 0 && (
        <section role="region" aria-labelledby="stats-heading" className="bg-white rounded-lg shadow p-6">
          <h3 id="stats-heading" className="text-sm font-medium text-gray-700 mb-4">Call Statistics</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-2xl font-bold text-gray-900">{filteredLogs.length}</p>
              <p className="text-sm text-gray-500">Total Calls</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {Math.round(
                  filteredLogs.reduce((sum, log) => sum + (log.duration || 0), 0) /
                    filteredLogs.length
                )}
                s
              </p>
              <p className="text-sm text-gray-500">Avg Duration</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {filteredLogs.filter((log) => log.status === 'completed').length}
              </p>
              <p className="text-sm text-gray-500">Completed</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {filteredLogs.filter((log) => log.status === 'failed').length}
              </p>
              <p className="text-sm text-gray-500">Failed</p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default CallLogs;