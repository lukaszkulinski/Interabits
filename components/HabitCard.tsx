
import React, { useMemo, useState } from 'react';
import { Check, Flame, Trash2, Calendar, Sparkles, Loader2, X, Edit2 } from 'lucide-react';
import { Habit, Category } from '../types';
import { getColorClasses } from '../constants';
import { Language, translations } from '../translations';
import { getHabitMotivation } from '../services/geminiService';

interface HabitCardProps {
  habit: Habit;
  category?: Category; // Optional in case deleted or loading
  selectedDate: string; // YYYY-MM-DD
  onToggle: (id: string, date: string) => void;
  onDelete: (id: string) => void;
  onEdit: (habit: Habit) => void;
  onViewHistory: (habit: Habit) => void;
  language: Language;
  onViewDetails: (habit: Habit) => void;
}

const HabitCard: React.FC<HabitCardProps> = ({ habit, category, selectedDate, onToggle, onDelete, onEdit, onViewHistory, language, onViewDetails }) => {
  const t = translations[language];
  const [motivation, setMotivation] = useState<string | null>(null);
  const [loadingMotivation, setLoadingMotivation] = useState(false);

  const isCompleted = useMemo(() => 
    habit.completedDates.includes(selectedDate), 
  [habit.completedDates, selectedDate]);

  // Determine Category Styling & Name
  const colorName = category?.color || 'slate';
  const styles = getColorClasses(colorName);
  
  // Resolve name (translation or raw)
  let displayCategoryName = category ? category.name : 'Unknown';
  if (category && category.is_default) {
     const key = `cat_${category.name.toLowerCase()}` as keyof typeof t;
     if (t[key]) displayCategoryName = t[key] as string;
  }

  const handleGetMotivation = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (motivation) {
        setMotivation(null); // Toggle off if already showing
        return;
    }
    
    setLoadingMotivation(true);
    const msg = await getHabitMotivation(habit.title, habit.streak, language);
    setMotivation(msg);
    setLoadingMotivation(false);
  };

  return (
    <div 
      onClick={() => onViewDetails(habit)}
      className={`group relative backdrop-blur-md rounded-2xl p-5 transition-all duration-500 border cursor-pointer ${
      isCompleted 
        ? 'bg-white/10 border-emerald-500/30 shadow-[0_0_30px_-10px_rgba(16,185,129,0.2)]' 
        : 'bg-slate-900/40 border-white/5 hover:bg-slate-800/40 hover:border-white/10 hover:shadow-lg'
    }`}>
      
      <div className="flex items-center justify-between gap-4">
        
        {/* Left Side: Button & Info */}
        <div className="flex items-center gap-5 flex-1 min-w-0">
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(habit.id, selectedDate); }}
            className={`flex-shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 border ${
              isCompleted 
                ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white border-transparent shadow-lg shadow-emerald-500/30 scale-105' 
                : 'bg-slate-800/50 text-slate-600 border-slate-700 hover:border-slate-500 hover:text-slate-400'
            }`}
            aria-label={`Mark ${habit.title} as ${isCompleted ? 'incomplete' : 'complete'}`}
          >
            <Check className={`w-7 h-7 stroke-[3px] transition-all duration-500 ${isCompleted ? 'scale-100' : 'scale-50 opacity-0'}`} />
          </button>

          <div className="flex flex-col min-w-0 gap-1.5">
            <h3 className={`text-lg font-semibold truncate transition-colors duration-300 ${isCompleted ? 'text-slate-400 line-through decoration-slate-500/50' : 'text-slate-100'}`}>
              {habit.title}
            </h3>
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md font-semibold border ${styles.bg} ${styles.text} ${styles.border}`}>
                {displayCategoryName}
              </span>
              {habit.streak > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-orange-300 font-bold bg-orange-500/10 px-2 py-0.5 rounded-md border border-orange-500/20">
                  <Flame className="w-3 h-3 fill-orange-500 text-orange-500" />
                  {habit.streak}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Actions */}
        <div className="flex items-center gap-1">
           {/* AI Motivation Button */}
           <button
            onClick={handleGetMotivation}
            className={`p-2 rounded-xl transition-all ${
                loadingMotivation || motivation 
                ? 'text-indigo-300 bg-indigo-500/20' 
                : 'text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/20 opacity-100 md:opacity-0 md:group-hover:opacity-100'
            }`}
            title={t.inspireMe}
           >
             {loadingMotivation ? (
                <Loader2 className="w-5 h-5 animate-spin" />
             ) : (
                <Sparkles className="w-5 h-5" />
             )}
           </button>

          {/* Calendar button kept for fallback but mainly we use click-to-detail now */}
          <button 
            onClick={(e) => { e.stopPropagation(); onViewDetails(habit); }}
            className="p-2 text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/20 rounded-xl transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100"
            title={t.history}
          >
            <Calendar className="w-5 h-5" />
          </button>

          <button 
            onClick={(e) => { e.stopPropagation(); onEdit(habit); }}
            className="p-2 text-slate-400 hover:text-sky-300 hover:bg-sky-500/20 rounded-xl transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100"
            title="Edit habit"
          >
            <Edit2 className="w-5 h-5" />
          </button>

          <button 
            onClick={(e) => { e.stopPropagation(); onDelete(habit.id); }}
            className="p-2 text-slate-400 hover:text-red-300 hover:bg-red-500/20 rounded-xl transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100"
            title="Delete habit"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* AI Message Bubble */}
      {motivation && (
        <div className="mt-4 p-3 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-xl flex items-start gap-3 animate-in slide-in-from-top-2 fade-in duration-300">
           <div className="p-1.5 bg-indigo-500/20 rounded-full shrink-0">
              <Sparkles className="w-4 h-4 text-indigo-300" />
           </div>
           <div className="flex-1">
              <p className="text-sm text-indigo-100 italic leading-relaxed">
                "{motivation}"
              </p>
           </div>
           <button onClick={(e) => { e.stopPropagation(); setMotivation(null); }} className="text-slate-500 hover:text-slate-300">
              <X className="w-4 h-4" />
           </button>
        </div>
      )}
    </div>
  );
};

export default HabitCard;
