import React from 'react';
import { Plus } from 'lucide-react';

const FAB = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      className="fixed right-6 bottom-6 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-primary-600 to-primary-500 text-white shadow-xl flex items-center justify-center hover:scale-105 transform transition-all"
      aria-label="Create Persona"
    >
      <Plus className="w-6 h-6" />
    </button>
  );
};

export default FAB;
