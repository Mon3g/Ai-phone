import React from 'react';
import { Play, Edit2, Check } from 'lucide-react';

const PersonaCard = ({ persona, onEdit, onActivate, onPreview }) => {
  const initials = (persona.name || 'P').slice(0, 2).toUpperCase();

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm hover:shadow-lg transform hover:-translate-y-1 transition-all w-full`}
    >
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-lg flex-shrink-0 bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white font-semibold text-lg">
          {initials}
        </div>

        <div className="flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{persona.name}</h3>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{persona.system_message || 'No description'}</p>
              <div className="mt-2 text-xs text-gray-500">{persona.voice}   v{persona.version}</div>
            </div>

            {persona.is_active ? (
              <div className="flex items-center space-x-2">
                <span className="text-xs font-medium text-green-700 dark:text-green-300">Active</span>
                <Check className="w-5 h-5 text-green-500" />
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={() => onPreview && onPreview(persona)}
              className="flex items-center gap-2 px-3 py-2 rounded-md bg-gray-100 dark:bg-gray-700 text-sm text-gray-800 dark:text-gray-100 hover:bg-gray-200 transition"
            >
              <Play className="w-4 h-4" />
              <span>Preview</span>
            </button>

            <button
              onClick={() => onEdit(persona)}
              className="flex items-center gap-2 px-3 py-2 rounded-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm hover:bg-gray-50 transition"
            >
              <Edit2 className="w-4 h-4" />
              <span>Edit</span>
            </button>

            <button
              onClick={() => onActivate(persona.id)}
              className="ml-auto px-3 py-2 rounded-md bg-primary-600 text-white text-sm hover:bg-primary-700 transition"
            >
              Activate
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PersonaCard;
