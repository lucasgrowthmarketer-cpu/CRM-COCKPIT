import React from 'react';
import { Construction } from 'lucide-react';

export default function PlaceholderPage({ title }) {
  return (
    <div data-testid={`placeholder-${title?.toLowerCase()}`} className="flex flex-col items-center justify-center py-20">
      <div className="w-16 h-16 rounded-full bg-brand-bg flex items-center justify-center mb-4">
        <Construction className="w-8 h-8 text-brand-text-secondary" />
      </div>
      <h1 className="font-manrope font-bold text-2xl text-brand-text-primary mb-2">{title}</h1>
      <p className="text-brand-text-secondary font-inter text-sm">
        Cette section sera disponible prochainement.
      </p>
    </div>
  );
}
