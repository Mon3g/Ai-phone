import { useState, useEffect } from 'react';
import { Eye, EyeOff, Save, RefreshCw, ExternalLink, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

const APIKeys = () => {
  const [saving, setSaving] = useState(false);
  const [showKeys, setShowKeys] = useState({
    openai: false,
    twilio_auth: false,
    ngrok: false
  });
  const [config, setConfig] = useState({
    openai_api_key: '',
    twilio_account_sid: '',
    twilio_auth_token: '',
    twilio_phone_number: '',
    ngrok_auth_token: ''
  });
  const [webhookUrl, setWebhookUrl] = useState('https://your-ngrok-url.ngrok.app/incoming-call');

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('assistant_settings')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (data) {
      setConfig({
        openai_api_key: data.openai_api_key || '',
        twilio_account_sid: data.twilio_account_sid || '',
        twilio_auth_token: data.twilio_auth_token || '',
        twilio_phone_number: data.twilio_phone_number || '',
        ngrok_auth_token: data.ngrok_auth_token || ''
      });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    const { data: existing } = await supabase
      .from('assistant_settings')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('assistant_settings')
        .update(config)
        .eq('id', existing.id);
    } else {
      await supabase
        .from('assistant_settings')
        .insert([{ ...config, user_id: user.id, is_active: true }]);
    }

    setSaving(false);
  };

  const toggleShowKey = (key) => {
    setShowKeys({ ...showKeys, [key]: !showKeys[key] });
  };

  const maskKey = (key, visible) => {
    if (!key) return '';
    if (visible) return key;
    return '*'.repeat(Math.min(key.length, 40));
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">API Keys</h1>
          <p className="mt-1 text-sm text-gray-500">
            Configure your API keys and credentials
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
        >
          {saving ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>Save Keys</span>
            </>
          )}
        </button>
      </div>

      {/* OpenAI Section */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">OpenAI</h2>
            <p className="text-sm text-gray-500">Configure OpenAI API access</p>
          </div>
          <a
            href="https://platform.openai.com/api-keys"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center space-x-1 text-sm text-primary-600 hover:text-primary-700"
          >
            <span>Get API Key</span>
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
        <div className="p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            API Key
          </label>
          <div className="flex space-x-2">
            <input
              type={showKeys.openai ? 'text' : 'password'}
              value={config.openai_api_key}
              onChange={(e) => setConfig({ ...config, openai_api_key: e.target.value })}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="sk-..."
            />
            <button
              onClick={() => toggleShowKey('openai')}
              className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              {showKeys.openai ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Twilio Section */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Twilio</h2>
            <p className="text-sm text-gray-500">Configure Twilio phone service</p>
          </div>
          <a
            href="https://console.twilio.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center space-x-1 text-sm text-primary-600 hover:text-primary-700"
          >
            <span>Open Console</span>
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Account SID
            </label>
            <input
              type="text"
              value={config.twilio_account_sid}
              onChange={(e) => setConfig({ ...config, twilio_account_sid: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="AC..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Auth Token
            </label>
            <div className="flex space-x-2">
              <input
                type={showKeys.twilio_auth ? 'text' : 'password'}
                value={config.twilio_auth_token}
                onChange={(e) => setConfig({ ...config, twilio_auth_token: e.target.value })}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Your auth token"
              />
              <button
                onClick={() => toggleShowKey('twilio_auth')}
                className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {showKeys.twilio_auth ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Phone Number
            </label>
            <input
              type="text"
              value={config.twilio_phone_number}
              onChange={(e) => setConfig({ ...config, twilio_phone_number: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="+1234567890"
            />
          </div>
        </div>
      </div>

      {/* ngrok Section */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">ngrok</h2>
            <p className="text-sm text-gray-500">Configure ngrok tunnel (optional)</p>
          </div>
          <a
            href="https://dashboard.ngrok.com/get-started/your-authtoken"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center space-x-1 text-sm text-primary-600 hover:text-primary-700"
          >
            <span>Get Auth Token</span>
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Auth Token
            </label>
            <div className="flex space-x-2">
              <input
                type={showKeys.ngrok ? 'text' : 'password'}
                value={config.ngrok_auth_token}
                onChange={(e) => setConfig({ ...config, ngrok_auth_token: e.target.value })}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Your ngrok auth token"
              />
              <button
                onClick={() => toggleShowKey('ngrok')}
                className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {showKeys.ngrok ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Webhook URL */}
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="text-sm font-medium text-blue-900 mb-2">Twilio Webhook URL</h3>
            <p className="text-sm text-blue-700 mb-2">
              Set this URL in your Twilio phone number configuration under "A call comes in"
            </p>
            <div className="flex space-x-2">
              <input
                type="text"
                value={webhookUrl}
                readOnly
                className="flex-1 px-4 py-2 bg-white border border-blue-300 rounded-lg text-sm"
              />
              <button
                onClick={() => copyToClipboard(webhookUrl)}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default APIKeys;
