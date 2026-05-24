import { useState, useEffect, useRef } from 'react';
import { Save, RefreshCw, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import FAB from '../components/FAB';
import Modal from '../components/Modal';
import AudioPlayer from '../components/AudioPlayer';

const voices = [
  { id: 'alloy', name: 'Alloy', description: 'Neutral, balanced' },
  { id: 'echo', name: 'Echo', description: 'Warm, friendly' },
  { id: 'fable', name: 'Fable', description: 'Expressive' },
  { id: 'onyx', name: 'Onyx', description: 'Deep, authoritative' },
  { id: 'nova', name: 'Nova', description: 'Bright, energetic' },
  { id: 'shimmer', name: 'Shimmer', description: 'Soft, soothing' },
];

const BLANK_PERSONA = {
  name: 'New Persona',
  system_message:
    'You are the phone assistant for Kitchener Thai Massage. Speak in a friendly, bright, and professional tone with a subtle Canadian-English cadence. Use English only. Keep sentences short and clear, and pause briefly after questions. When booking, collect service, date/time, name, and phone number, then repeat to confirm. If asked, offer to transfer to a human. Do not use Thai.',
  voice: 'shimmer',
  temperature: 0.25,
  initial_greeting: 'Hello, Kitchener Thai Massage. How can I help you today?',
  enable_greeting: true,
  is_active: false,
};

function ToggleSwitch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
        checked ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-600'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

const AIConfig = () => {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [config, setConfig] = useState({ ...BLANK_PERSONA });
  const [initialConfig, setInitialConfig] = useState(null);
  const [personas, setPersonas] = useState([]);
  const [selectedPersonaId, setSelectedPersonaId] = useState(null);
  const [previewAudioUrl, setPreviewAudioUrl] = useState(null);
  const [previewPersona, setPreviewPersona] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [promptExpanded, setPromptExpanded] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchConfig();
    fetchPersonas();
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
    if (!user) { setSaving(false); return; }

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

  const handleSelectPersona = (persona) => {
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
    await supabase.from('personas').insert([{ ...config, user_id: user.id }]).select().single();
    await fetchPersonas();
    setSaving(false);
    setMessage('Persona created');
    setTimeout(() => setMessage(''), 3000);
  };

  const handleActivatePersona = async (id) => {
    if (!window.confirm('Set this persona as active?')) return;
    setSaving(true);
    await supabase.from('personas').update({ is_active: false }).eq('is_active', true);
    await supabase.from('personas').update({ is_active: true }).eq('id', id).select().single();
    await fetchPersonas();
    setSaving(false);
    setMessage('Persona activated');
    setTimeout(() => setMessage(''), 3000);
  };

  const isDirty = () => {
    if (!initialConfig) return true;
    try { return JSON.stringify(initialConfig) !== JSON.stringify(config); } catch { return true; }
  };

  const handleActiveToggle = (checked) => {
    if (checked && !window.confirm('Set this configuration as active? This will be used for incoming calls.')) return;
    setConfig({ ...config, is_active: checked });
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (previewAudioUrl) URL.revokeObjectURL(previewAudioUrl);
    setPreviewAudioUrl(URL.createObjectURL(file));
    setPreviewPersona({ name: file.name });
    setPreviewOpen(true);
    e.target.value = '';
  };

  const initials = (name) =>
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('');

  const gradients = [
    'from-purple-500 to-indigo-500',
    'from-pink-500 to-rose-500',
    'from-teal-500 to-cyan-500',
    'from-orange-500 to-amber-500',
    'from-green-500 to-emerald-500',
  ];

  const personaGradient = (id) => gradients[id.charCodeAt(0) % gradients.length];

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      {/* ── Persona chip carousel ───────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Personas</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 rounded-lg"
            >
              Open Preview
            </button>
            <button
              onClick={handleCreatePersona}
              disabled={saving}
              className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg disabled:opacity-50"
            >
              Create
            </button>
          </div>
        </div>

        <input ref={fileInputRef} onChange={handleFileInputChange} type="file" accept="audio/*" className="hidden" />

        {/* Chip carousel */}
        <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 pb-2 scrollbar-none">
          {/* "New" chip */}
          <button
            onClick={() => {
              setSelectedPersonaId(null);
              setConfig({ ...BLANK_PERSONA });
              setInitialConfig(null);
            }}
            className="snap-start flex-shrink-0 flex flex-col items-center gap-1"
          >
            <div className="w-12 h-12 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center">
              <Plus className="w-5 h-5 text-gray-400" />
            </div>
            <span className="text-[10px] text-gray-500 w-12 text-center truncate">New</span>
          </button>

          {personas.map((p) => (
            <button
              key={p.id}
              onClick={() => handleSelectPersona(p)}
              className="snap-start flex-shrink-0 flex flex-col items-center gap-1"
            >
              <div
                className={`w-12 h-12 rounded-full bg-gradient-to-br ${personaGradient(p.id)} flex items-center justify-center text-white text-sm font-bold shadow ${
                  selectedPersonaId === p.id ? 'ring-2 ring-primary-500 ring-offset-2' : ''
                }`}
              >
                {initials(p.name)}
              </div>
              <span className="text-[10px] text-gray-600 dark:text-gray-300 w-12 text-center truncate">
                {p.name.split(/\s+/)[0]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">AI Configuration</h1>
          <p className="mt-0.5 text-sm text-gray-500">Customize behavior and personality</p>
        </div>
        <div className="flex items-center gap-3">
          {message && <span className="text-sm text-green-600 hidden sm:block">{message}</span>}
          <button
            onClick={handleSave}
            disabled={saving || !isDirty()}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">{saving ? 'Saving…' : 'Save'}</span>
          </button>
        </div>
      </div>

      {message && <p className="text-sm text-green-600 sm:hidden">{message}</p>}

      {/* ── Config form card ────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow">
        <div className="p-4 lg:p-6 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Configuration Name
            </label>
            <input
              type="text"
              value={config.name}
              onChange={(e) => setConfig({ ...config, name: e.target.value })}
              className="w-full px-4 py-3 text-base border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="My Configuration"
            />
          </div>

          {/* System Prompt with progressive disclosure */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              System Prompt
              <span className="ml-2 text-xs text-gray-500 font-normal">
                Define your AI's personality
              </span>
            </label>
            <div className="relative">
              <textarea
                value={config.system_message}
                onChange={(e) => setConfig({ ...config, system_message: e.target.value })}
                rows={promptExpanded ? 7 : 2}
                onClick={() => setPromptExpanded(true)}
                className="w-full px-4 py-3 text-base border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none transition-all"
                placeholder="You are a helpful assistant…"
              />
              {!promptExpanded && (
                <div className="absolute bottom-0 inset-x-0 h-8 bg-gradient-to-t from-white dark:from-gray-700 to-transparent pointer-events-none rounded-b-xl" />
              )}
            </div>
            <button
              type="button"
              className="mt-1 text-xs text-primary-600 dark:text-primary-400"
              onClick={() => setPromptExpanded(!promptExpanded)}
            >
              {promptExpanded ? 'Show less' : 'Show more'}
            </button>
          </div>

          {/* Voice — always 3 cols */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Voice</label>
            <div className="grid grid-cols-3 gap-2">
              {voices.map((voice) => (
                <button
                  key={voice.id}
                  type="button"
                  onClick={() => setConfig({ ...config, voice: voice.id })}
                  className={`p-3 min-h-[64px] border-2 rounded-xl text-left transition-all ${
                    config.voice === voice.id
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30'
                      : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'
                  }`}
                >
                  <div className="text-sm font-medium text-gray-900 dark:text-white">{voice.name}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5 leading-tight">{voice.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Temperature */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Temperature: {config.temperature}
              <span className="ml-2 text-xs text-gray-500 font-normal">0 = focused · 1 = creative</span>
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={config.temperature}
              onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>More Focused</span>
              <span>More Creative</span>
            </div>
          </div>

          {/* Initial Greeting with toggle switch */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Initial Greeting
              </label>
              <ToggleSwitch
                checked={config.enable_greeting}
                onChange={(v) => setConfig({ ...config, enable_greeting: v })}
                label="Enable greeting"
              />
            </div>
            {config.enable_greeting && (
              <input
                type="text"
                value={config.initial_greeting}
                onChange={(e) => setConfig({ ...config, initial_greeting: e.target.value })}
                className="w-full px-4 py-3 text-base border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Hello! How can I help you today?"
              />
            )}
          </div>

          {/* Active Status — full-row tap zone with toggle */}
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => handleActiveToggle(!config.is_active)}
              className="w-full flex items-center justify-between p-4 rounded-xl border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <div className="text-left">
                <p className="text-sm font-medium text-gray-900 dark:text-white">Set as Active Configuration</p>
                <p className="text-xs text-gray-500 mt-0.5">This configuration will be used for incoming calls</p>
              </div>
              <ToggleSwitch checked={config.is_active} onChange={handleActiveToggle} label="Set active" />
            </button>
          </div>
        </div>
      </div>

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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Name</label>
            <input
              type="text"
              value={config.name}
              onChange={(e) => setConfig({ ...config, name: e.target.value })}
              className="w-full px-4 py-3 text-base border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">System Prompt</label>
            <textarea
              rows={5}
              value={config.system_message}
              onChange={(e) => setConfig({ ...config, system_message: e.target.value })}
              className="w-full px-4 py-3 text-base border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                if (selectedPersonaId) {
                  await supabase.from('personas').update(config).eq('id', selectedPersonaId);
                  setMessage('Persona updated');
                } else {
                  const { data: { user } } = await supabase.auth.getUser();
                  if (!user) return alert('Sign in to create personas');
                  await supabase.from('personas').insert([{ ...config, user_id: user.id }]);
                  setMessage('Persona created');
                }
                setTimeout(() => setMessage(''), 2500);
                fetchPersonas();
                setSelectedPersonaId(null);
              }}
              className="flex-1 py-3 bg-primary-600 text-white rounded-xl font-medium"
            >
              Save Persona
            </button>
            <button
              onClick={() => { setSelectedPersonaId(null); fetchConfig(); }}
              className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Preview Modal */}
      <Modal
        open={previewOpen}
        onClose={() => {
          setPreviewOpen(false);
          if (previewAudioUrl) { URL.revokeObjectURL(previewAudioUrl); setPreviewAudioUrl(null); }
          setPreviewPersona(null);
        }}
        title={previewPersona ? `Preview: ${previewPersona.name}` : 'Preview'}
      >
        <div className="space-y-4">
          {previewAudioUrl ? (
            <AudioPlayer audioUrl={previewAudioUrl} />
          ) : (
            <p className="text-sm text-gray-500">Loading preview…</p>
          )}
        </div>
      </Modal>

      <FAB
        onClick={() => {
          setSelectedPersonaId(null);
          setInitialConfig(null);
          setConfig({ ...BLANK_PERSONA });
        }}
      />
    </div>
  );
};

export default AIConfig;
