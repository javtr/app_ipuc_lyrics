import React from 'react';
import { BookOpen, ListMusic, Church } from 'lucide-react';

interface MobileBottomNavProps {
  activeTab: 'catalog' | 'setlists';
  onSelectTab: (tab: 'catalog' | 'setlists') => void;
  onOpenSedeSelector: () => void;
  activeSedeName: string;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onSelectTab,
  onOpenSedeSelector,
  activeSedeName
}) => {
  return (
    <nav className="lg:hidden relative z-30 mt-auto bg-slate-950/95 backdrop-blur-lg border-t border-slate-800 safe-bottom">
      <div className="grid grid-cols-3 h-16 max-w-lg mx-auto">
        <button
          onClick={() => onSelectTab('catalog')}
          className={`flex flex-col items-center justify-center gap-1 transition-colors ${
            activeTab === 'catalog'
              ? 'text-emerald-400 font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <BookOpen className="w-5 h-5" />
          <span className="text-[11px]">Canciones</span>
        </button>

        <button
          onClick={() => onSelectTab('setlists')}
          className={`flex flex-col items-center justify-center gap-1 transition-colors ${
            activeTab === 'setlists'
              ? 'text-emerald-400 font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ListMusic className="w-5 h-5" />
          <span className="text-[11px]">Repertorios</span>
        </button>

        <button
          onClick={onOpenSedeSelector}
          className="flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <Church className="w-5 h-5 text-amber-400" />
          <span className="text-[11px] truncate max-w-[90px]">{activeSedeName}</span>
        </button>
      </div>
    </nav>
  );
};
