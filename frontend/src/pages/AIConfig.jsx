import { useState, useEffect } from 'react';
import { Save, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';

const AIConfig = () => {
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState({
    name: 'Default Configuration',
    system_message: 'You are a helpful and bubbly AI assistant who loves to chat about anything the user is interested about and is prepared to offer them facts.',
    voice: 'alloy',
    temperature: 0.8,
    initial_greeting: 'Hello! How can I help you today?',
    enable_greeting: true,
    is_active: false
  });

  const voices = [
    { id: 'alloy', name: 'Alloy', description: 'Neutral and balanced' },
    { id: 'echo', name: 'Echo', description: 'Warm and friendly' },
    { id: 'fable', name: 'Fable', description: 'Expressive and dynamic' },
    { id: 'onyx', name: 'Onyx', description: 'Deep and authoritative' },
    { id: 'nova', name: 'Nova', description: 'Bright and energetic' },
    { id: 'shimmer', name: 'Shimmer', description: 'Soft and soothing' }
  ];

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
      setConfig(data);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    if (config.id) {
      await supabase
        .from('assistant_settings')
        .update(config)
        .eq('id', config.id);
    } else {
      await supabase
        .from('assistant_settings')
        .insert([{ ...config, user_id: user.id }]);
    }

    setSaving(false);
    fetchConfig();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Configuration</h1>
          <p className="mt-1 text-sm text-gray-500">
            Customize your AI assistant's behavior and personality
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
              <span>Save Changes</span>
            </>
          )}
        </button>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 space-y-6">
          {/* Configuration Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Configuration Name
            </label>
            <input
              type="text"
              value={config.name}
              onChange={(e) => setConfig({ ...config, name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="My Configuration"
            />
          </div>

          {/* System Message */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              System Prompt
              <span className="ml-2 text-xs text-gray-500">
                Define your AI's personality and behavior
              </span>
            </label>
            <textarea
              value={config.system_message}
              onChange={(e) => setConfig({ ...config, system_message: e.target.value })}
              rows={6}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="You are a helpful assistant..."
            />
          </div>

          {/* Voice Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Voice
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {voices.map((voice) => (
                <button
                  key={voice.id}
                  onClick={() => setConfig({ ...config, voice: voice.id })}
                  className={`p-4 border-2 rounded-lg text-left transition-all ${
                    config.voice === voice.id
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium text-gray-900">{voice.name}</div>
                  <div className="text-sm text-gray-500 mt-1">{voice.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Temperature */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Temperature: {config.temperature}
              <span className="ml-2 text-xs text-gray-500">
                Controls randomness (0 = focused, 1 = creative)
              </span>
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={config.temperature}
              onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>More Focused</span>
              <span>More Creative</span>
            </div>
          </div>

          {/* Initial Greeting */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Initial Greeting
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={config.enable_greeting}
                  onChange={(e) => setConfig({ ...config, enable_greeting: e.target.checked })}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <span className="text-sm text-gray-600">Enable</span>
              </label>
            </div>
            <input
              type="text"
              value={config.initial_greeting}
              onChange={(e) => setConfig({ ...config, initial_greeting: e.target.value })}
              disabled={!config.enable_greeting}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
              placeholder="Hello! How can I help you today?"
            />
          </div>

          {/* Active Status */}
          <div className="pt-4 border-t border-gray-200">
            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={config.is_active}
                onChange={(e) => setConfig({ ...config, is_active: e.target.checked })}
                className="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-900">
                  Set as Active Configuration
                </span>
                <p className="text-xs text-gray-500">
                  This configuration will be used for incoming calls
                </p>
              </div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIConfig;
