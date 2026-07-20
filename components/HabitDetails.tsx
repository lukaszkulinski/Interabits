
import React, { useMemo, useState } from 'react';
import { ChevronLeft, Calendar as CalendarIcon, Flame, Trophy, Target, BarChart2, ChevronRight, CheckSquare, Sparkles, Edit2, Loader2, X } from 'lucide-react';
import { Habit, Category } from '../types';
import { Language, translations } from '../translations';
import { getColorClasses, WEEK_DAYS } from '../constants';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { getHabitMotivation } from '../services/geminiService';

interface HabitDetailsProps {
  habit: Habit;
  category?: Category;
  language: Language;
  onBack: () => void;
  onToggle: (id: string, date: string) => void;
  onEdit: (habit: Habit) => void;
}

const HabitDetails: React.FC<HabitDetailsProps> = ({ habit, category, language, onBack, onToggle, onEdit }) => {
  const t = translations[language];
  const locale = language === 'pl' ? 'pl-PL' : 'en-US';
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // --- STATS CALCULATION ---
  
  // Best Streak Calculation
  const bestStreak = useMemo(() => {
    if (habit.completedDates.length === 0) return 0;
    const sorted = [...habit.completedDates].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    
    let maxStreak = 0;
    let currentStreak = 0;
    let prevDate: Date | null = null;

    for (const dateStr of sorted) {
        const d = new Date(dateStr);
        if (!prevDate) {
            currentStreak = 1;
        } else {
            const diff = (d.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
            if (diff === 1) {
                currentStreak++;
            } else if (diff > 1) {
                maxStreak = Math.max(maxStreak, currentStreak);
                currentStreak = 1;
            }
        }
        prevDate = d;
    }
    return Math.max(maxStreak, currentStreak);
  }, [habit.completedDates]);

  // Success Rate Calculation (Fixed)
  const successRate = useMemo(() => {
     if (habit.completedDates.length === 0) return 0;

     // 1. Determine the effective start date (Creation date OR Earliest completion date)
     let startDate = new Date(habit.createdAt);
     startDate.setHours(0, 0, 0, 0); // Normalize

     // Find earliest completion
     if (habit.completedDates.length > 0) {
        const sortedDates = [...habit.completedDates].sort();
        const firstCompletion = new Date(sortedDates[0]);
        firstCompletion.setHours(0, 0, 0, 0);
        
        // If user backfilled dates before creation, use that as start
        if (firstCompletion < startDate) {
            startDate = firstCompletion;
        }
     }

     // 2. End date is today
     const now = new Date();
     now.setHours(0, 0, 0, 0);

     // 3. Calculate total days in existence (inclusive)
     const diffTime = Math.abs(now.getTime() - startDate.getTime());
     const daysExist = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

     // 4. Calculate percentage
     if (daysExist <= 0) return 0;
     const rate = Math.round((habit.completedDates.length / daysExist) * 100);
     
     return Math.min(100, rate); // Cap at 100%
  }, [habit.completedDates, habit.createdAt]);

  // Frequency Data for Chart
  const frequencyData = useMemo(() => {
      const counts = [0, 0, 0, 0, 0, 0, 0]; // Sun to Sat
      habit.completedDates.forEach(dateStr => {
          const day = new Date(dateStr).getDay();
          counts[day]++;
      });
      
      // Map to Recharts format
      return counts.map((count, index) => ({
          day: WEEK_DAYS[index],
          count: count
      }));
  }, [habit.completedDates]);


  // --- CALENDAR LOGIC ---
  
  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
  const monthYearString = currentDate.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const displayMonthYear = monthYearString.charAt(0).toUpperCase() + monthYearString.slice(1);

  const handleDayClick = (dateStr: string) => {
    const today = new Date().toISOString().split('T')[0];
    if (dateStr > today) return;
    if (window.confirm(t.toggleConfirm)) {
        onToggle(habit.id, dateStr);
    }
  };

  const handleAskAI = async () => {
      setAiLoading(true);
      const msg = await getHabitMotivation(habit.title, habit.streak, language);
      setAiMessage(msg);
      setAiLoading(false);
  };

  // Category Styles
  const colorName = category?.color || 'slate';
  const styles = getColorClasses(colorName);
  let displayCategoryName = category ? category.name : '...';
  if (category && category.is_default) {
     const key = `cat_${category.name.toLowerCase()}` as keyof typeof t;
     if (t[key]) displayCategoryName = t[key] as string;
  }

  return (
    <div className="animate-in slide-in-from-right duration-300">
        {/* Top Bar */}
        <div className="flex items-center justify-between mb-6">
            <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors px-3 py-2 rounded-xl hover:bg-white/5">
                <ChevronLeft className="w-5 h-5" />
                <span className="font-medium">{t.back}</span>
            </button>
            <button onClick={() => onEdit(habit)} className="p-2 text-slate-400 hover:text-indigo-300 bg-white/5 rounded-xl hover:bg-white/10 transition-colors">
                <Edit2 className="w-5 h-5" />
            </button>
        </div>

        {/* Header Card */}
        <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 p-6 rounded-3xl border border-white/5 backdrop-blur-md mb-6 relative overflow-hidden">
            <div className={`absolute top-0 right-0 w-32 h-32 bg-${colorName}-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4`}></div>
            
            <div className="relative z-10">
                <span className={`inline-block text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md font-semibold border mb-3 ${styles.bg} ${styles.text} ${styles.border}`}>
                    {displayCategoryName}
                </span>
                <h1 className="text-3xl font-bold text-white mb-2">{habit.title}</h1>
                <div className="flex items-center gap-2 text-slate-400 text-sm">
                    <CalendarIcon className="w-4 h-4" />
                    <span>Started {new Date(habit.createdAt).toLocaleDateString(locale)}</span>
                </div>
            </div>
        </div>

        {/* AI Insight Box */}
        <div className="mb-8">
             {aiMessage ? (
                 <div className="bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 p-5 rounded-2xl relative animate-in fade-in zoom-in-95">
                     <button onClick={() => setAiMessage(null)} className="absolute top-3 right-3 text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
                     <div className="flex gap-3">
                        <div className="p-2 bg-indigo-500/20 rounded-full h-fit"><Sparkles className="w-5 h-5 text-indigo-300" /></div>
                        <div>
                            <h4 className="font-bold text-indigo-200 text-sm mb-1">AI Coach</h4>
                            <p className="text-indigo-100 italic text-sm leading-relaxed">"{aiMessage}"</p>
                        </div>
                     </div>
                 </div>
             ) : (
                 <button 
                    onClick={handleAskAI}
                    disabled={aiLoading}
                    className="w-full py-4 rounded-2xl border border-dashed border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 transition-all flex items-center justify-center gap-2 font-medium group"
                 >
                    {aiLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5 group-hover:scale-110 transition-transform" />}
                    {t.askAiAboutHabit}
                 </button>
             )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            <div className="bg-slate-900/50 p-4 rounded-2xl border border-white/5">
                <div className="flex items-center gap-2 text-slate-400 mb-2 text-xs font-bold uppercase tracking-wider">
                    <Flame className="w-4 h-4 text-orange-500" /> {t.currentStreak}
                </div>
                <span className="text-2xl font-bold text-white">{habit.streak}</span>
            </div>
            <div className="bg-slate-900/50 p-4 rounded-2xl border border-white/5">
                <div className="flex items-center gap-2 text-slate-400 mb-2 text-xs font-bold uppercase tracking-wider">
                    <Trophy className="w-4 h-4 text-yellow-500" /> {t.bestStreak}
                </div>
                <span className="text-2xl font-bold text-white">{bestStreak}</span>
            </div>
            <div className="bg-slate-900/50 p-4 rounded-2xl border border-white/5">
                <div className="flex items-center gap-2 text-slate-400 mb-2 text-xs font-bold uppercase tracking-wider">
                    <CheckSquare className="w-4 h-4 text-emerald-500" /> {t.totalCompletions}
                </div>
                <span className="text-2xl font-bold text-white">{habit.completedDates.length}</span>
            </div>
            <div className="bg-slate-900/50 p-4 rounded-2xl border border-white/5">
                <div className="flex items-center gap-2 text-slate-400 mb-2 text-xs font-bold uppercase tracking-wider">
                    <Target className="w-4 h-4 text-blue-500" /> {t.successRate}
                </div>
                <span className="text-2xl font-bold text-white">{successRate}%</span>
            </div>
        </div>

        {/* Frequency Chart */}
        <div className="bg-slate-900/50 p-6 rounded-3xl border border-white/5 mb-8">
            <h3 className="text-sm font-bold text-slate-300 mb-6 flex items-center gap-2">
                <BarChart2 className="w-4 h-4" /> {t.frequencyByDay}
            </h3>
            <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={frequencyData}>
                        <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} dy={10} />
                        <Tooltip 
                            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#fff' }}
                        />
                        <Bar dataKey="count" radius={[4, 4, 4, 4]}>
                            {frequencyData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.count > 0 ? '#818cf8' : '#1e293b'} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>

        {/* Calendar */}
        <div className="bg-slate-900/50 p-6 rounded-3xl border border-white/5">
             <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <CalendarIcon className="w-5 h-5 text-indigo-400" />
                    <h3 className="text-lg font-bold text-white">{t.calendar}</h3>
                </div>
                <div className="flex items-center gap-2 bg-slate-800 rounded-lg p-1">
                    <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))} className="p-1 hover:bg-white/10 rounded-md text-slate-400 hover:text-white"><ChevronLeft className="w-4 h-4" /></button>
                    <span className="text-xs font-bold text-slate-300 w-24 text-center">{displayMonthYear}</span>
                    <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))} className="p-1 hover:bg-white/10 rounded-md text-slate-400 hover:text-white"><ChevronRight className="w-4 h-4" /></button>
                </div>
            </div>

            <div className="grid grid-cols-7 mb-2">
                {WEEK_DAYS.map(day => (
                    <div key={day} className="text-center text-[10px] font-bold text-slate-600 uppercase">{day.charAt(0)}</div>
                ))}
            </div>
            <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: firstDayOfMonth }).map((_, i) => <div key={`empty-${i}`} />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                    const d = i + 1;
                    const dateObj = new Date(currentDate.getFullYear(), currentDate.getMonth(), d);
                    const dateStr = dateObj.toISOString().split('T')[0];
                    const isCompleted = habit.completedDates.includes(dateStr);
                    const isToday = new Date().toISOString().split('T')[0] === dateStr;
                    const isFuture = dateStr > new Date().toISOString().split('T')[0];

                    return (
                        <button
                            key={d}
                            disabled={isFuture}
                            onClick={() => handleDayClick(dateStr)}
                            className={`aspect-square rounded-lg flex items-center justify-center text-xs font-medium transition-all
                                ${isCompleted 
                                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' 
                                    : isToday 
                                        ? 'bg-slate-800 border border-indigo-500/50 text-indigo-400' 
                                        : 'bg-slate-800/50 text-slate-500 hover:bg-slate-700'}
                                ${isFuture ? 'opacity-20 cursor-not-allowed' : ''}
                            `}
                        >
                            {d}
                        </button>
                    );
                })}
            </div>
        </div>
        
        <div className="h-20"></div>
    </div>
  );
};

export default HabitDetails;
