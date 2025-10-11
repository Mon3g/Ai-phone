import { useState, useEffect, useRef } from 'react';
import { Save, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import PersonaCard from '../components/PersonaCard';
import FAB from '../components/FAB';
import Modal from '../components/Modal';
import AudioPlayer from '../components/AudioPlayer';

const AIConfig = () => {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [config, setConfig] = useState({
    name: 'Default Configuration',
    system_message:
      'You are the phone assistant for Kitchener Thai Massage. Speak in a friendly, bright, and professional tone with a subtle Canadian-English cadence. Use English only. Keep sentences short and clear, and pause briefly after questions to allow the caller to respond. When handling bookings, collect service, preferred date, preferred time, full name, and phone number. Repeat booking details to confirm before ending the call. If the caller requests a human, offer to transfer. If calls are recorded, say: "This call may be recorded for quality and booking confirmation purposes." Always respond in English and do not use Thai.',
    voice: 'shimmer',
    temperature: 0.25,
    initial_greeting: 'Hello, Kitchener Thai Massage. How can I help you today?',
    enable_greeting: true,
    is_active: false,
  });
  const [initialConfig, setInitialConfig] = useState(null);
  const [personas, setPersonas] = useState([]);
  const [selectedPersonaId, setSelectedPersonaId] = useState(null);
  const [previewAudioUrl, setPreviewAudioUrl] = useState(null);
  const [previewPersona, setPreviewPersona] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const fileInputRef = useRef(null);
  const headingRef = useRef(null);

  const voices = [
    { id: 'alloy', name: 'Alloy', description: 'Neutral and balanced' },
    { id: 'echo', name: 'Echo', description: 'Warm and friendly' },
    { id: 'fable', name: 'Fable', description: 'Expressive and dynamic' },
    { id: 'onyx', name: 'Onyx', description: 'Deep and authoritative' },
    { id: 'nova', name: 'Nova', description: 'Bright and energetic' },
    { id: 'shimmer', name: 'Shimmer', description: 'Soft and soothing' },
  ];

  useEffect(() => {
    fetchConfig();
    fetchPersonas();
    headingRef.current?.focus();
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
      setConfig(data);
      setInitialConfig(data);
    }
  };

  const fetchPersonas = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('personas')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setPersonas(data);
  };

  const handleSave = async () => {
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    // Save as a persona if persona selected, otherwise save assistant_settings
    if (selectedPersonaId) {
      await supabase.from('personas').update(config).eq('id', selectedPersonaId);
    } else if (config.id) {
      await supabase.from('assistant_settings').update(config).eq('id', config.id);
    } else {
      await supabase.from('assistant_settings').insert([{ ...config, user_id: user.id }]);
    }

    setSaving(false);
    await fetchConfig();
    setMessage('Saved successfully');
    setTimeout(() => setMessage(''), 3000);
  };

  const handleSelectPersona = async (persona) => {
    setSelectedPersonaId(persona.id);
    setConfig(persona);
    setInitialConfig(persona);
  };

  const handleCreatePersona = async () => {
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const payload = { ...config, user_id: user.id };
    const { data } = await supabase.from('personas').insert([payload]).select().single();
    await fetchPersonas();
    setSaving(false);
    setMessage('Persona created');
    setTimeout(() => setMessage(''), 3000);
  };

  const handleActivatePersona = async (id) => {
    if (!window.confirm('Set this persona as active?')) return;
    setSaving(true);
    await supabase.from('personas').update({ is_active: false }).eq('is_active', true);
    const { data } = await supabase
      .from('personas')
      .update({ is_active: true })
      .eq('id', id)
      .select()
      .single();
    await fetchPersonas();
    setSaving(false);
    setMessage('Persona activated');
    setTimeout(() => setMessage(''), 3000);
  };

  const isDirty = () => {
    if (!initialConfig) return true;
    try {
      return JSON.stringify(initialConfig) !== JSON.stringify(config);
    } catch (e) {
      return true;
    }
  };

  const handleActiveToggle = (checked) => {
    if (checked) {
      const confirmMsg = 'Set this configuration as active? This will be used for incoming calls.';
      if (!window.confirm(confirmMsg)) return;
    }
    setConfig({ ...config, is_active: checked });
  };

  const handleImportPreviewFile = (file) => {
    try {
      if (!file) return;
      // cleanup previous preview if any
      if (previewAudioUrl) URL.revokeObjectURL(previewAudioUrl);
      const url = URL.createObjectURL(file);
      setPreviewAudioUrl(url);
      setPreviewPersona({ name: file.name });
      setPreviewOpen(true);
    } catch (err) {
      console.error('import preview error', err);
      alert('Failed to open local preview');
    }
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleImportPreviewFile(file);
    // reset input so the same file can be re-selected later
    e.target.value = '';
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <header className="flex items-center justify-between">
        <div>
          <h1 id="page-heading" ref={headingRef} tabIndex={-1} className="text-2xl font-bold text-gray-900 focus:outline-none">
            AI Configuration
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Customize your AI assistant's behavior and personality
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <div role="status" aria-live="polite">
            {message && <div className="text-sm text-green-600">{message}</div>}
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !isDirty()}
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
      </header>

      <section role="region" aria-labelledby="personas-heading">
        <div className="flex items-center justify-between">
          <h2 id="personas-heading" className="text-lg font-medium">Personas</h2>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                setSelectedPersonaId(null);
                setConfig({
                  name: 'New Persona',
                  system_message:
                    'You are the phone assistant for Kitchener Thai Massage. Speak in a friendly, bright, and professional tone with a subtle Canadian-English cadence. Use English only. Keep sentences short and clear, and pause briefly after questions. When booking, collect service, date/time, name, and phone number, then repeat to confirm. If asked, offer to transfer to a human. Do not use Thai.',
                  voice: 'shimmer',
                  temperature: 0.25,
                  initial_greeting: 'Hello, Kitchener Thai Massage. How can I help you today?',
                  enable_greeting: true,
                  is_active: false,
                });
                setInitialConfig(null);
              }}
              className="px-3 py-1 text-sm bg-gray-100 rounded"
            >
              New Persona
            </button>
            <button
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
              className="px-3 py-1 text-sm bg-gray-50 rounded border border-gray-200"
            >
              Open Local Preview
            </button>
            <button
              onClick={handleCreatePersona}
              disabled={saving}
              className="px-3 py-1 text-sm bg-primary-600 text-white rounded disabled:opacity-50"
            >
              Create from Form
            </button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          onChange={handleFileInputChange}
          type="file"
          accept="audio/*"
          style={{ display: 'none' }}
          aria-hidden="true"
        />

        <div className="mt-4">
          <div className="overflow-x-auto -mx-4 px-4">
            <div className="inline-flex gap-4 py-2 min-w-[640px]">
              {personas.map((p) => (
                <div key={p.id} className="w-64">
                  <PersonaCard
                    persona={p}
                    onEdit={(persona) => handleSelectPersona(persona)}
                    onActivate={(id) => handleActivatePersona(id)}
                    onPreview={async (persona) => {
                      try {
                        const res = await fetch(`/api/personas/${persona.id}/preview`, { method: 'POST' });
                        if (!res.ok) throw new Error('preview failed');
                        const json = await res.json();
                        const bytes = Uint8Array.from(atob(json.audio_base64), (c) => c.charCodeAt(0));
                        const blob = new Blob([bytes], { type: json.content_type || 'audio/wav' });
                        const url = URL.createObjectURL(blob);
                        if (previewAudioUrl) URL.revokeObjectURL(previewAudioUrl);
                        setPreviewAudioUrl(url);
                        setPreviewPersona(persona);
                        setPreviewOpen(true);
                      } catch (err) {
                        console.error('preview error', err);
                        alert('Preview failed');
                      }
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="bg-white rounded-lg shadow" aria-labelledby="config-form-heading">
        <div className="p-6 space-y-6">
          <h2 id="config-form-heading" className="sr-only">Configuration Settings</h2>

          <div>
            <label htmlFor="config-name" className="block text-sm font-medium text-gray-700 mb-2">
              Configuration Name
            </label>
            <input
              id="config-name"
              type="text"
              value={config.name}
              onChange={(e) => setConfig({ ...config, name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="My Configuration"
            />
          </div>

          <div>
            <label htmlFor="system-prompt" className="block text-sm font-medium text-gray-700 mb-2">
              System Prompt
            </label>
            <p id="system-prompt-desc" className="text-xs text-gray-500 mb-2">Define your AI's personality and behavior</p>
            <textarea
              id="system-prompt"
              value={config.system_message}
              onChange={(e) => setConfig({ ...config, system_message: e.target.value })}
              rows={6}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="You are a helpful assistant..."
              aria-describedby="system-prompt-desc"
            />
          </div>

          <fieldset>
            <legend className="block text-sm font-medium text-gray-700 mb-2">Voice</legend>
            <div role="radiogroup" className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {voices.map((voice) => (
                <button
                  key={voice.id}
                  type="button"
                  role="radio"
                  aria-checked={config.voice === voice.id}
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
          </fieldset>

          <div>
            <label htmlFor="temperature" className="block text-sm font-medium text-gray-700 mb-2">
              Temperature: {config.temperature}
            </label>
            <p id="temperature-desc" className="text-xs text-gray-500 mb-2">Controls randomness (0 = focused, 1 = creative)</p>
            <input
              id="temperature"
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={config.temperature}
              onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              aria-describedby="temperature-desc"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1" aria-hidden="true">
              <span>More Focused</span>
              <span>More Creative</span>
            </div>
          </div>

          <fieldset>
            <legend className="sr-only">Initial Greeting Settings</legend>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="initial-greeting" className="block text-sm font-medium text-gray-700">Initial Greeting</label>
              <div className="flex items-center space-x-2">
                <input
                  id="enable-greeting"
                  type="checkbox"
                  checked={config.enable_greeting}
                  onChange={(e) => setConfig({ ...config, enable_greeting: e.target.checked })}
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <label htmlFor="enable-greeting" className="text-sm text-gray-600">Enable</label>
              </div>
            </div>
            <input
              id="initial-greeting"
              type="text"
              value={config.initial_greeting}
              onChange={(e) => setConfig({ ...config, initial_greeting: e.target.value })}
              disabled={!config.enable_greeting}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
              placeholder="Hello! How can I help you today?"
            />
          </fieldset>

          <div className="pt-4 border-t border-gray-200">
            <div className="flex items-center space-x-3">
              <input
                id="set-active"
                type="checkbox"
                checked={config.is_active}
                onChange={(e) => handleActiveToggle(e.target.checked)}
                className="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <label htmlFor="set-active" className="flex flex-col">
                <span className="text-sm font-medium text-gray-900">
                  Set as Active Configuration
                </span>
                <p className="text-xs text-gray-500">
                  This configuration will be used for incoming calls
                </p>
              </label>
            </div>
          </div>
        </div>
      </form>

      {/* Persona Edit / Create Modal */}
      <Modal
        open={!!selectedPersonaId || initialConfig === null}
        onClose={() => {
          setSelectedPersonaId(null);
          fetchConfig();
        }}
        title={selectedPersonaId ? 'Edit Persona' : 'New Persona'}
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="persona-name" className="block text-sm font-medium text-gray-700 mb-2">Name</label>
            <input
              id="persona-name"
              type="text"
              value={config.name}
              onChange={(e) => setConfig({ ...config, name: e.target.value })}
              className="w-full px-3 py-2 border rounded"
            />
          </div>

          <div>
            <label htmlFor="persona-prompt" className="block text-sm font-medium text-gray-700 mb-2">System Prompt</label>
            <textarea
              id="persona-prompt"
              rows={4}
              value={config.system_message}
              onChange={(e) => setConfig({ ...config, system_message: e.target.value })}
              className="w-full px-3 py-2 border rounded"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                if (selectedPersonaId) {
                  await supabase.from('personas').update(config).eq('id', selectedPersonaId);
                  setMessage('Persona updated');
                } else {
                  const {
                    data: { user },
                  } = await supabase.auth.getUser();
                  if (!user) return alert('Sign in to create personas');
                  await supabase.from('personas').insert([{ ...config, user_id: user.id }]);
                  setMessage('Persona created');
                }
                setTimeout(() => setMessage(''), 2500);
                fetchPersonas();
                setSelectedPersonaId(null);
              }}
              className="px-4 py-2 bg-primary-600 text-white rounded"
            >
              Save Persona
            </button>
            <button
              onClick={() => {
                setSelectedPersonaId(null);
                fetchConfig();
              }}
              className="px-4 py-2 bg-gray-100 rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Preview Modal with inline audio player */}
      <Modal
        open={previewOpen}
        onClose={() => {
          setPreviewOpen(false);
          if (previewAudioUrl) {
            URL.revokeObjectURL(previewAudioUrl);
            setPreviewAudioUrl(null);
          }
          setPreviewPersona(null);
        }}
        title={previewPersona ? `Preview: ${previewPersona.name}` : 'Preview'}
      >
        <div className="space-y-4">
          {previewAudioUrl ? (
            <AudioPlayer audioUrl={previewAudioUrl} />
          ) : (
            <div className="text-sm text-gray-500">Loading preview...</div>
          )}
        </div>
      </Modal>

      <FAB onClick={() => {
        setSelectedPersonaId(null);
        setInitialConfig(null);
        setConfig({
          name: 'New Persona',
          system_message:
            'You are the phone assistant for Kitchener Thai Massage. Speak in a friendly, bright, and professional tone with a subtle Canadian-English cadence. Use English only. Keep sentences short and clear, and pause briefly after questions. When booking, collect service, date/time, name, and phone number, then repeat to confirm. If asked, offer to transfer to a human. Do not use Thai.',
          voice: 'shimmer',
          temperature: 0.25,
          initial_greeting: 'Hello, Kitchener Thai Massage. How can I help you today?',
          enable_greeting: true,
          is_active: false,
        });
      }} />
    </div>
  );
};

export default AIConfig;