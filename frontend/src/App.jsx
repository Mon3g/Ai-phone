import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import AIConfig from './pages/AIConfig';
import APIKeys from './pages/APIKeys';
import CallLogs from './pages/CallLogs';
import Login from './pages/Login';
import PrivateRoute from './components/PrivateRoute';
import { ThemeProvider } from './context/ThemeContext';

function App() {
  return (
    <ThemeProvider>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/login" element={<Login />} />
            <Route path="/ai-config" element={<PrivateRoute><AIConfig /></PrivateRoute>} />
            <Route path="/api-keys" element={<PrivateRoute><APIKeys /></PrivateRoute>} />
            <Route path="/logs" element={<PrivateRoute><CallLogs /></PrivateRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </Router>
    </ThemeProvider>
  );
}

export default App;
