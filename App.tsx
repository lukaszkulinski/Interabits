
import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Plus, BarChart2, CheckSquare, ChevronLeft, ChevronRight, Globe, LogOut, User, Loader2, ArrowRight } from 'lucide-react';
import { Habit, Category } from './types';
import HabitCard from './components/HabitCard';
import AddHabitModal from './components/AddHabitModal';
import ManageCategoriesModal from './components/ManageCategoriesModal';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import AuthModal from './components/AuthModal';
import ProfileModal from './components/ProfileModal';
import DailyInsight from './components/DailyInsight';
import HabitDetails from './components/HabitDetails'; // New Component
import { Language, translations } from './translations';
import { supabase } from './services/supabaseClient';
import { getMotivationalInsight } from './services/geminiService';

const App: React.FC = () => {
  // State
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('iterabits_language');
    return (saved === 'en' ? 'en' : 'pl');
  });

  const [user, setUser] = useState<any>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  
  const [loadingHabits, setLoadingHabits] = useState(false);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState<'habits' | 'analytics'>('habits');
  
  // Insight State
  const [insight, setInsight] = useState<string | null>(null);
  const [loadingInsight, setLoadingInsight] = useState(false);

  // Navigation State
  const [viewingHabit, setViewingHabit] = useState<Habit | null>(null);

  // Modals State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isManageCategoriesOpen, setIsManageCategoriesOpen] = useState(false);
  
  // Editing Habit State
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);

  const t = translations[language];

  // --- HELPER: Calculate Streak Locally ---
  const calculateStreak = (completedDates: string[]): number => {
    if (completedDates.length === 0) return 0;
    
    // Sort dates descending
    const sortedDates = [...completedDates].sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    const todayStr = new Date().toISOString().split('T')[0];
    
    // Helper to check if dates are consecutive
    const isYesterday = (dateStr: string, prevDateStr: string) => {
       const d1 = new Date(dateStr);
       const d2 = new Date(prevDateStr);
       const diffTime = Math.abs(d2.getTime() - d1.getTime());
       const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
       return diffDays === 1;
    };

    let streak = 0;
    let currentCheck = todayStr;

    // Check if today is completed
    const todayCompleted = sortedDates.includes(todayStr);
    
    // If today is not completed, we check if yesterday was completed to keep streak alive
    if (!todayCompleted) {
       const yesterday = new Date();
       yesterday.setDate(yesterday.getDate() - 1);
       currentCheck = yesterday.toISOString().split('T')[0];
       if (!sortedDates.includes(currentCheck)) return 0;
    }

    // Count streak
    let checkDate = new Date(currentCheck);
    
    // Safe loop limit
    for(let i=0; i<365 * 5; i++) {
       const checkStr = checkDate.toISOString().split('T')[0];
       if (sortedDates.includes(checkStr)) {
         streak++;
         checkDate.setDate(checkDate.getDate() - 1);
       } else {
         break;
       }
    }
    
    return streak;
  };

  // --- AUTH & DATA LOAD ---

  const verifyUser = async () => {
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
      if (user) await supabase.auth.signOut();
      setUser(null);
      setHabits([]);
      setCategories([]);
      setInsight(null);
      setViewingHabit(null);
    } else {
      setUser(user);
    }
    setSessionLoading(false);
  };

  useEffect(() => {
    verifyUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setHabits([]);
        setCategories([]);
        setInsight(null);
        setViewingHabit(null);
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setUser(session?.user ?? null);
      }
    });

    const handleFocus = () => { verifyUser(); };
    window.addEventListener('focus', handleFocus);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const loadCategories = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('is_default', { ascending: false })
      .order('name', { ascending: true });
      
    if (!error && data) {
      setCategories(data);
    } else {
      console.error("Error loading categories:", error);
    }
  };

  // Load Data when User changes
  useEffect(() => {
    const loadData = async () => {
      if (!user) return;
      
      setLoadingHabits(true);
      await loadCategories();

      // Fetch habits AND their completions via Foreign Key
      const { data, error } = await supabase
        .from('habits')
        .select(`
          *,
          habit_completions (
            completed_at
          )
        `)
        .order('created_at', { ascending: true });
      
      if (error) {
        console.error("Error loading habits:", error);
        if (error.code === 'PGRST301' || error.message.includes('JWT')) {
          verifyUser();
        }
      } else if (data) {
        const mappedHabits: Habit[] = data.map((h: any) => {
          // Flatten the completions array from relation
          const dates = h.habit_completions 
            ? h.habit_completions.map((c: any) => c.completed_at)
            : [];
            
          return {
            id: h.id,
            title: h.title,
            category_id: h.category, 
            completedDates: dates,
            streak: calculateStreak(dates),
            createdAt: h.created_at
          };
        });
        setHabits(mappedHabits);
        
        // Only fetch insight if we have habits and no insight yet
        if (mappedHabits.length > 0 && !insight) {
            fetchInsight(mappedHabits, categories);
        }
        
        // If we are viewing a specific habit, update its reference to keep stats live
        if (viewingHabit) {
            const updated = mappedHabits.find(h => h.id === viewingHabit.id);
            if (updated) setViewingHabit(updated);
        }
      }
      setLoadingHabits(false);
    };

    loadData();
  }, [user]);

  const fetchInsight = async (currentHabits: Habit[], currentCategories: Category[]) => {
     if (currentHabits.length === 0) return;
     setLoadingInsight(true);
     const msg = await getMotivationalInsight(currentHabits, currentCategories, language);
     setInsight(msg);
     setLoadingInsight(false);
  };

  useEffect(() => {
    localStorage.setItem('iterabits_language', language);
  }, [language]);

  // --- HANDLERS ---

  const selectedDateStr = useMemo(() => selectedDate.toISOString().split('T')[0], [selectedDate]);

  const handleDateChange = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate);
    newDate.setDate(selectedDate.getDate() + (direction === 'next' ? 1 : -1));
    setSelectedDate(newDate);
  };

  const toggleLanguage = () => {
    setLanguage(prev => prev === 'en' ? 'pl' : 'en');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setHabits([]);
  };

  const handleToggleHabit = async (id: string, date: string) => {
    if (!user) return;

    // 1. Optimistic UI update
    const previousHabits = [...habits];
    const habitIndex = habits.findIndex(h => h.id === id);
    if (habitIndex === -1) return;

    const habit = habits[habitIndex];
    const isCompleted = habit.completedDates.includes(date);
    
    let newDates;
    if (isCompleted) {
      newDates = habit.completedDates.filter(d => d !== date);
    } else {
      newDates = [...habit.completedDates, date];
    }

    const updatedHabit = {
      ...habit,
      completedDates: newDates,
      streak: calculateStreak(newDates)
    };

    const newHabits = [...habits];
    newHabits[habitIndex] = updatedHabit;
    setHabits(newHabits);
    
    // Update detail view if active
    if (viewingHabit && viewingHabit.id === id) {
        setViewingHabit(updatedHabit);
    }

    // 2. Supabase Interaction (Relational Table)
    let error;
    
    if (isCompleted) {
      // DELETE completion
      const { error: delError } = await supabase
        .from('habit_completions')
        .delete()
        .eq('habit_id', id)
        .eq('completed_at', date);
      error = delError;
    } else {
      // INSERT completion
      const { error: insError } = await supabase
        .from('habit_completions')
        .insert({
          user_id: user.id,
          habit_id: id,
          completed_at: date
        });
      error = insError;
    }
      
    if (error) {
      console.error("Error toggling habit:", error);
      // Revert on error
      setHabits(previousHabits);
      if (viewingHabit && viewingHabit.id === id) setViewingHabit(habit);
      verifyUser();
    }
  };

  const handleAddHabit = async (title: string, categoryId: string) => {
    if (!user) return;

    const { data, error } = await supabase
      .from('habits')
      .insert({
        user_id: user.id,
        title,
        category: categoryId
      })
      .select()
      .single();

    if (error) {
      console.error("Error adding habit:", error);
      return;
    }

    if (data) {
      const newHabit: Habit = {
        id: data.id,
        title: data.title,
        category_id: data.category,
        completedDates: [],
        streak: 0,
        createdAt: data.created_at
      };
      const updatedHabits = [...habits, newHabit];
      setHabits(updatedHabits);
      
      // Refresh insight if it's the first habit
      if (habits.length === 0) fetchInsight(updatedHabits, categories);
    }
  };

  const handleUpdateHabit = async (id: string, title: string, categoryId: string) => {
    if (!user) return;

    const { error } = await supabase
      .from('habits')
      .update({ title, category: categoryId })
      .eq('id', id);

    if (error) {
      console.error("Error updating habit:", error);
      return;
    }

    setHabits(prev => prev.map(h => 
        h.id === id ? { ...h, title, category_id: categoryId } : h
    ));
    
    // If editing while viewing details, update detail view
    if (viewingHabit && viewingHabit.id === id) {
        setViewingHabit(prev => prev ? { ...prev, title, category_id: categoryId } : null);
    }
  };

  const handleDeleteHabit = async (id: string) => {
    if (!user) return;
    if(window.confirm(t.deleteConfirm)) {
      const previousHabits = [...habits];
      setHabits(prev => prev.filter(h => h.id !== id));
      
      // If we are in details view, go back
      if (viewingHabit && viewingHabit.id === id) {
          setViewingHabit(null);
      }

      const { error } = await supabase.from('habits').delete().eq('id', id);
      
      if (error) {
        console.error("Error deleting habit", error);
        setHabits(previousHabits);
        verifyUser();
      }
    }
  };

  const handleEditHabit = (habit: Habit) => {
    setEditingHabit(habit);
    setIsAddModalOpen(true);
  };
  
  const handleViewDetails = (habit: Habit) => {
      setViewingHabit(habit);
      window.scrollTo(0, 0);
  };

  const handleUpdateCategory = async (id: string, name: string, color: string) => {
    if (!user) return;
    const { error } = await supabase
       .from('categories')
       .update({ name, color })
       .eq('id', id);

    if (!error) {
       loadCategories();
    } else {
       console.error("Error updating category:", error);
    }
  };

  const handleDeleteCategory = async (id: string) => {
     if (!user) return;
     const { error } = await supabase.from('categories').delete().eq('id', id);
     if (!error) {
        loadCategories();
     } else {
        console.error("Error deleting category:", error);
     }
  };

  const handleProfileUpdated = () => {
     verifyUser(); // Reload user to get new metadata
  };

  const getCategoryForHabit = (habit: Habit) => {
    let cat = categories.find(c => c.id === habit.category_id);
    if (!cat) {
       cat = categories.find(c => c.name === habit.category_id);
    }
    return cat;
  };

  // --- COMPONENTS ---

  const DateHeader = () => {
    const locale = language === 'pl' ? 'pl-PL' : 'en-US';
    const isToday = selectedDate.toDateString() === new Date().toDateString();
    const dateDisplay = selectedDate.toLocaleDateString(locale, { weekday: 'long', month: 'short', day: 'numeric' });
    const formattedDateDisplay = dateDisplay.charAt(0).toUpperCase() + dateDisplay.slice(1);

    return (
      <div className="flex items-center justify-between mb-8 bg-white/5 p-3 rounded-2xl backdrop-blur-sm border border-white/5">
        <button onClick={() => handleDateChange('prev')} className="p-2 hover:bg-white/10 rounded-xl transition-colors text-slate-300 hover:text-white">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="text-center">
          <h2 className="text-lg font-semibold text-slate-100">
            {isToday ? t.today : formattedDateDisplay}
          </h2>
        </div>
        <button 
          onClick={() => handleDateChange('next')} 
          disabled={selectedDateStr >= new Date().toISOString().split('T')[0]}
          className={`p-2 rounded-xl transition-colors ${selectedDateStr >= new Date().toISOString().split('T')[0] ? 'text-slate-700 cursor-not-allowed' : 'hover:bg-white/10 text-slate-300 hover:text-white'}`}
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    );
  };

  if (sessionLoading) {
    return (
      <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900 via-slate-900 to-black flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
      </div>
    );
  }

  // --- LANDING PAGE (Access Blocked) ---
  if (!user) {
    return (
      <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900 via-slate-900 to-black flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">
        
        <div className="absolute top-6 right-6">
           <button 
              onClick={toggleLanguage}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-300 bg-white/5 hover:bg-white/10 border border-white/5 px-3 py-2 rounded-lg transition-all"
            >
              <Globe className="w-3.5 h-3.5" />
              {language === 'en' ? 'PL' : 'EN'}
            </button>
        </div>

        <div className="mb-8 flex flex-col items-center">
           <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-indigo-500/30 mb-6 rotate-3">
              <CheckSquare className="w-10 h-10 text-white" />
           </div>
           <h2 className="text-3xl font-bold text-white tracking-tight">Iterabits</h2>
        </div>
        
        <h1 className="text-4xl md:text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-200 via-purple-200 to-slate-200 mb-6 max-w-2xl">
          {t.landingTitle}
        </h1>
        
        <p className="text-lg text-slate-400 max-w-xl mb-10 leading-relaxed">
          {t.landingSubtitle}
        </p>

        <button 
          onClick={() => setIsAuthModalOpen(true)}
          className="group relative px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl font-bold text-white shadow-xl shadow-indigo-500/20 hover:shadow-indigo-500/40 transition-all hover:scale-105 flex items-center gap-3"
        >
          {t.getStarted}
          <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </button>

        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          language={language}
        />
      </div>
    );
  }

  // --- MAIN APP (Logged In) ---
  const displayName = user.user_metadata?.full_name || user.email.split('@')[0];

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900 via-slate-900 to-black text-slate-100 font-sans selection:bg-indigo-500/30">
      
      {/* Top Bar */}
      <div className="sticky top-0 z-30 px-4 py-4 backdrop-blur-xl bg-black/20 border-b border-white/5">
        <div className="max-w-2xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2.5">
             <div className="bg-indigo-600 p-1.5 rounded-lg shadow-lg shadow-indigo-500/20">
                <CheckSquare className="w-5 h-5 text-white" />
             </div>
             <span className="font-bold text-xl tracking-tight text-slate-100 hidden sm:block">Iterabits</span>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={toggleLanguage}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-300 bg-white/5 hover:bg-white/10 border border-white/5 px-3 py-2 rounded-lg transition-all"
            >
              <Globe className="w-3.5 h-3.5" />
              {language === 'en' ? 'PL' : 'EN'}
            </button>

            <div className="relative group">
                <button 
                  className="bg-white/5 hover:bg-white/10 text-slate-300 px-3 py-2 rounded-lg transition-all flex items-center gap-2"
                >
                  <div className="w-4 h-4 flex items-center justify-center">
                     <User className="w-4 h-4" />
                  </div>
                </button>
                {/* Dropdown Menu with bridge for hover gap */}
                <div className="absolute right-0 top-full pt-2 w-48 hidden group-hover:block animate-in fade-in duration-200 z-50">
                    <div className="h-3 w-full absolute top-0 left-0" /> {/* Invisible bridge */}
                   <div className="bg-slate-900 border border-white/10 rounded-xl shadow-xl overflow-hidden mt-2">
                       <div className="px-4 py-3 border-b border-white/5">
                          <p className="text-sm text-white font-bold truncate">{displayName}</p>
                          <p className="text-xs text-slate-500 truncate">{user.email}</p>
                       </div>
                       <button 
                          onClick={() => setIsProfileModalOpen(true)}
                          className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
                       >
                          {t.profile}
                       </button>
                       <button 
                          onClick={handleLogout}
                          className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2"
                       >
                          <LogOut className="w-3.5 h-3.5" /> {t.logout}
                       </button>
                   </div>
                </div>
            </div>
            
            {!viewingHabit && (
                <button 
                  onClick={() => { setEditingHabit(null); setIsAddModalOpen(true); }}
                  className="bg-white text-slate-900 hover:bg-indigo-50 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-indigo-500/20"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">{t.newHabit}</span>
                  <span className="sm:hidden">Nowy</span>
                </button>
            )}
          </div>
        </div>
      </div>

      <main className="max-w-2xl mx-auto p-4 pt-8 pb-32 md:pb-10">
        
        {/* --- DETAIL VIEW --- */}
        {viewingHabit ? (
            <HabitDetails 
                habit={viewingHabit}
                category={getCategoryForHabit(viewingHabit)}
                language={language}
                onBack={() => setViewingHabit(null)}
                onToggle={handleToggleHabit}
                onEdit={handleEditHabit}
            />
        ) : (
            /* --- DASHBOARD VIEW --- */
            <>
                <div className="mb-6">
                   <h1 className="text-2xl font-bold text-white">
                     {t.hello}, <span className="text-indigo-400">{displayName}</span>! 👋
                   </h1>
                </div>

                {/* Daily Insight Box */}
                {activeTab === 'habits' && habits.length > 0 && (
                   <DailyInsight 
                     insight={insight} 
                     loading={loadingInsight} 
                     onRefresh={() => fetchInsight(habits, categories)} 
                     language={language}
                   />
                )}

                {activeTab === 'habits' ? (
                  <>
                    <DateHeader />
                    <div className="space-y-4">
                      {loadingHabits ? (
                         <div className="flex justify-center py-20">
                            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                         </div>
                      ) : habits.length === 0 ? (
                         <div className="text-center py-20 bg-white/5 rounded-3xl border border-white/5 border-dashed">
                            <div className="w-20 h-20 bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-600">
                                <CheckSquare className="w-10 h-10" />
                            </div>
                            <h3 className="text-slate-300 font-medium text-lg">{t.noHabits}</h3>
                            <p className="text-slate-500 text-sm mt-2">{t.noHabitsSub}</p>
                         </div>
                      ) : (
                        habits.map(habit => (
                          <HabitCard
                            key={habit.id}
                            habit={habit}
                            category={getCategoryForHabit(habit)}
                            selectedDate={selectedDateStr}
                            onToggle={handleToggleHabit}
                            onDelete={handleDeleteHabit}
                            onEdit={handleEditHabit}
                            onViewHistory={() => {}} // Deprecated
                            language={language}
                            onViewDetails={handleViewDetails}
                          />
                        ))
                      )}
                    </div>
                  </>
                ) : (
                  <AnalyticsDashboard habits={habits} language={language} />
                )}
            </>
        )}
      </main>

      {/* Bottom Nav (Mobile) */}
      {!viewingHabit && (
          <div className="fixed bottom-6 left-0 right-0 flex justify-center md:hidden z-40 pointer-events-none">
            <div className="bg-black/40 backdrop-blur-2xl border border-white/10 px-6 py-3 rounded-full shadow-2xl flex items-center gap-8 pointer-events-auto">
              <button 
                onClick={() => setActiveTab('habits')}
                className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'habits' ? 'text-indigo-400 scale-110' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <Calendar className="w-6 h-6" />
                <div className={`w-1 h-1 rounded-full mt-1 ${activeTab === 'habits' ? 'bg-indigo-400' : 'bg-transparent'}`} />
              </button>
              <div className="w-px h-8 bg-white/10"></div>
              <button 
                onClick={() => setActiveTab('analytics')}
                className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'analytics' ? 'text-indigo-400 scale-110' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <BarChart2 className="w-6 h-6" />
                <div className={`w-1 h-1 rounded-full mt-1 ${activeTab === 'analytics' ? 'bg-indigo-400' : 'bg-transparent'}`} />
              </button>
            </div>
          </div>
      )}

      {/* Desktop Tabs */}
      {!viewingHabit && (
          <div className="hidden md:block fixed left-8 top-28 w-56">
             <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/5 shadow-xl p-3 space-y-2">
                <button 
                  onClick={() => setActiveTab('habits')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                    activeTab === 'habits' 
                    ? 'bg-gradient-to-r from-indigo-600/80 to-purple-600/80 text-white shadow-lg shadow-indigo-900/50' 
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  }`}
                >
                  <Calendar className="w-4 h-4" />
                  {t.habits}
                </button>
                <button 
                  onClick={() => setActiveTab('analytics')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                    activeTab === 'analytics' 
                    ? 'bg-gradient-to-r from-indigo-600/80 to-purple-600/80 text-white shadow-lg shadow-indigo-900/50' 
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  }`}
                >
                  <BarChart2 className="w-4 h-4" />
                  {t.analytics}
                </button>
             </div>
          </div>
      )}

      {/* Modals */}
      <AddHabitModal 
        isOpen={isAddModalOpen} 
        onClose={() => { setIsAddModalOpen(false); setEditingHabit(null); }} 
        onAdd={handleAddHabit} 
        onUpdate={handleUpdateHabit}
        language={language}
        categories={categories}
        onCategoryCreated={loadCategories}
        onManageCategories={() => { setIsAddModalOpen(false); setIsManageCategoriesOpen(true); }}
        initialHabit={editingHabit}
      />

      <ManageCategoriesModal
        isOpen={isManageCategoriesOpen}
        onClose={() => { setIsManageCategoriesOpen(false); setIsAddModalOpen(true); }}
        categories={categories}
        language={language}
        onUpdate={handleUpdateCategory}
        onDelete={handleDeleteCategory}
      />

      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        language={language}
        user={user}
        onProfileUpdated={handleProfileUpdated}
      />
    </div>
  );
};

export default App;
