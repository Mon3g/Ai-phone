import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import AIConfig from './pages/AIConfig';
import APIKeys from './pages/APIKeys';
import CallLogs from './pages/CallLogs';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/ai-config" element={<AIConfig />} />
          <Route path="/api-keys" element={<APIKeys />} />
          <Route path="/logs" element={<CallLogs />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
