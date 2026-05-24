import { useState, useEffect } from 'react';
import {
  Eye,
  EyeOff,
  Save,
  RefreshCw,
  ExternalLink,
  Clipboard,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const APIKeys = () => {
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showKeys, setShowKeys] = useState({ openai: false, twilio_auth: false, ngrok: false });
  const [config, setConfig] = useState({
    openai_api_key: '',
    twilio_account_sid: '',
    twilio_auth_token: '',
    twilio_phone_number: '',
    ngrok_auth_token: '',
  });
  const [webhookUrl, setWebhookUrl] = useState('https://your-ngrok-url.ngrok.app/incoming-call');

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
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
        ngrok_auth_token: data.ngrok_auth_token || '',
      });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const { data: existing } = await supabase
      .from('assistant_settings')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (existing) {
      await supabase.from('assistant_settings').update(config).eq('id', existing.id);
    } else {
      await supabase.from('assistant_settings').insert([{ ...config, user_id: user.id, is_active: true }]);
    }

    setSaving(false);
  };

  const toggleShowKey = (key) => setShowKeys({ ...showKeys, [key]: !showKeys[key] });

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const inputClass =
    'w-full px-4 py-3 text-base border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent';

  const sectionHeader = (title, desc, href, linkLabel) => (
    <div className="px-4 lg:px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
      <div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
        <p className="text-sm text-gray-500">{desc}</p>
      </div>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 flex-shrink-0 ml-4"
      >
        <span className="hidden sm:inline">{linkLabel}</span>
        <ExternalLink className="w-4 h-4" />
      </a>
    </div>
  );

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">API Keys</h1>
          <p className="mt-0.5 text-sm text-gray-500">Configure your API keys and credentials</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 transition-colors"
        >
          {saving ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          <span className="hidden sm:inline">{saving ? 'Saving…' : 'Save Keys'}</span>
        </button>
      </div>

      {/* OpenAI */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
        {sectionHeader('OpenAI', 'Configure OpenAI API access', 'https://platform.openai.com/api-keys', 'Get API Key')}
        <div className="p-4 lg:p-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">API Key</label>
          <input
            type={showKeys.openai ? 'text' : 'password'}
            value={config.openai_api_key}
            onChange={(e) => setConfig({ ...config, openai_api_key: e.target.value })}
            className={inputClass}
            placeholder="sk-…"
            autoComplete="off"
          />
          <button
            onClick={() => toggleShowKey('openai')}
            className="flex items-center gap-1.5 text-xs text-primary-600 dark:text-primary-400 mt-2 py-1.5 px-3 ml-auto rounded-lg"
          >
            {showKeys.openai ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {showKeys.openai ? 'Hide' : 'Show'} key
          </button>
        </div>
      </div>

      {/* Twilio */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
        {sectionHeader('Twilio', 'Configure Twilio phone service', 'https://console.twilio.com', 'Open Console')}
        <div className="p-4 lg:p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Account SID</label>
            <input
              type="text"
              value={config.twilio_account_sid}
              onChange={(e) => setConfig({ ...config, twilio_account_sid: e.target.value })}
              className={inputClass}
              placeholder="AC…"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Auth Token</label>
            <input
              type={showKeys.twilio_auth ? 'text' : 'password'}
              value={config.twilio_auth_token}
              onChange={(e) => setConfig({ ...config, twilio_auth_token: e.target.value })}
              className={inputClass}
              placeholder="Your auth token"
              autoComplete="off"
            />
            <button
              onClick={() => toggleShowKey('twilio_auth')}
              className="flex items-center gap-1.5 text-xs text-primary-600 dark:text-primary-400 mt-2 py-1.5 px-3 ml-auto rounded-lg"
            >
              {showKeys.twilio_auth ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showKeys.twilio_auth ? 'Hide' : 'Show'} token
            </button>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Phone Number</label>
            <input
              type="text"
              value={config.twilio_phone_number}
              onChange={(e) => setConfig({ ...config, twilio_phone_number: e.target.value })}
              className={inputClass}
              placeholder="+1234567890"
            />
          </div>
        </div>
      </div>

      {/* ngrok */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
        {sectionHeader('ngrok', 'Configure ngrok tunnel (optional)', 'https://dashboard.ngrok.com/get-started/your-authtoken', 'Get Token')}
        <div className="p-4 lg:p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Auth Token</label>
            <input
              type={showKeys.ngrok ? 'text' : 'password'}
              value={config.ngrok_auth_token}
              onChange={(e) => setConfig({ ...config, ngrok_auth_token: e.target.value })}
              className={inputClass}
              placeholder="Your ngrok auth token"
              autoComplete="off"
            />
            <button
              onClick={() => toggleShowKey('ngrok')}
              className="flex items-center gap-1.5 text-xs text-primary-600 dark:text-primary-400 mt-2 py-1.5 px-3 ml-auto rounded-lg"
            >
              {showKeys.ngrok ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showKeys.ngrok ? 'Hide' : 'Show'} token
            </button>
          </div>

          {/* Webhook URL — stacked */}
          <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Twilio Webhook URL</h3>
            <p className="text-xs text-gray-500 mb-3">
              Set this in your Twilio phone number under "A call comes in"
            </p>
            <input
              type="text"
              value={webhookUrl}
              readOnly
              className="w-full text-sm font-mono px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 truncate focus:outline-none"
            />
            <button
              onClick={copyWebhook}
              className="w-full mt-2 py-3 flex items-center justify-center gap-2 rounded-xl border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <Clipboard className="w-4 h-4" />
              {copied ? 'Copied!' : 'Copy Webhook URL'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default APIKeys;
