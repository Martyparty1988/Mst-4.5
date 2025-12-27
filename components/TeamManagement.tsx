import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
    UserPlus, Clock, LogIn, LogOut, Search, 
    Briefcase, Calendar, Trophy, Zap, 
    MoreHorizontal, Pencil, Trash2, Phone, X, Check,
    AlertCircle, Palmtree, Mail, Banknote, Signal, SignalZero,
    BarChart3, Activity
} from 'lucide-react';
import { TeamMember, UserProfile } from '../types';
import { calcSingleTableKwp } from '../logic/powerCalc';

const generateId = () => {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
};

interface Props {
    user: UserProfile;
}

const TeamManagement: React.FC<Props> = ({ user }) => {
  const [tab, setTab] = useState<'members' | 'attendance' | 'performance'>('members');
  
  // State for Members
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditingMember, setIsEditingMember] = useState<TeamMember | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', rate: 0, role: 'Installer', phone: '', currentProjectId: '' });

  // State for Chart
  const [chartMetric, setChartMetric] = useState<'hours' | 'kwp'>('kwp');

  const isAdmin = user.role === 'admin';

  // Queries
  const allTeam = useLiveQuery(() => db.team.toArray());
  const projects = useLiveQuery(() => db.projects.toArray());
  const tables = useLiveQuery(() => db.projectTables.toArray()); 
  const attendanceAll = useLiveQuery(() => db.attendance.toArray());

  const today = new Date().toISOString().split('T')[0];
  const attendanceToday = useLiveQuery(() => db.attendance.where('date').equals(today).toArray());

  // FILTER LOGIC based on Role
  const team = isAdmin 
    ? allTeam 
    : allTeam?.filter(m => m.email === user.email || m.id === user.id);

  // --- Notification Logic ---
  const requestNotificationPermission = () => {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
  };

  const sendNotification = (title: string, body: string) => {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/favicon.ico' });
    }
  };

  useEffect(() => {
      requestNotificationPermission();
  }, []);

  // --- History API for Modal ---
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
        if (showAddModal) {
            setShowAddModal(false);
        }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [showAddModal]);

  const openModal = () => {
      window.history.pushState({ modal: 'addTeam' }, '', '');
      setShowAddModal(true);
  };

  const closeModal = () => {
      if (showAddModal) {
          window.history.back(); // This will trigger popstate which closes modal
      } else {
        setShowAddModal(false); // Fallback
      }
      setIsEditingMember(null);
      setForm({ name: '', email: '', rate: 0, role: 'Installer', phone: '', currentProjectId: '' });
  };


  // --- Member Actions ---
  const handleSaveMember = async () => {
    if (!form.name) return;
    
    if (isEditingMember) {
        await db.team.update(isEditingMember.id, {
            name: form.name,
            email: form.email,
            hourlyRate: form.rate,
            role: form.role,
            phone: form.phone,
            currentProjectId: form.currentProjectId
        });
    } else {
        await db.team.add({
            id: generateId(),
            name: form.name,
            email: form.email,
            role: form.role,
            hourlyRate: form.rate,
            phone: form.phone,
            currentProjectId: form.currentProjectId,
            isActive: true
        });
    }
    // Manually close without back() because we want to submit and stay on page usually, 
    // but consistency says we should pop the modal state.
    closeModal();
  };

  const handleDeleteMember = async (id: string) => {
      if (window.confirm('Smazat pracovníka? Historie docházky zůstane zachována.')) {
          await db.team.delete(id);
      }
  };

  const openEdit = (m: TeamMember) => {
      setIsEditingMember(m);
      setForm({
          name: m.name,
          email: m.email || '',
          rate: m.hourlyRate,
          role: m.role,
          phone: m.phone || '',
          currentProjectId: m.currentProjectId || ''
      });
      openModal();
  };


  // --- Attendance Actions ---
  const handleAttendanceAction = async (memberId: string, type: 'Work' | 'Sick' | 'Vacation') => {
    const existing = attendanceToday?.find(a => a.memberId === memberId);
    
    // Check In / Start
    if (!existing) {
        await db.attendance.add({
            id: generateId(),
            memberId,
            date: today,
            checkIn: Date.now(),
            type: type,
            synced: false
        });
        const member = team?.find(m => m.id === memberId);
        sendNotification("Docházka", `${member?.name}: ${type === 'Work' ? 'Check-in' : type}`);
    } 
    // Check Out (only for Work)
    else if (existing.type === 'Work' && !existing.checkOut) {
        await db.attendance.update(existing.id, { checkOut: Date.now(), synced: false });
        sendNotification("Docházka", `Check-out potvrzen.`);
    }
  };

  // --- Filtering ---
  const filteredTeam = team?.filter(m => 
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      m.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // --- Performance Calculation Helpers ---
  const getMemberStats = (memberId: string) => {
      if (!attendanceAll || !tables) return { hours: 0, kw: 0, tables: 0 };
      
      // Calculate Hours
      const records = attendanceAll.filter(a => a.memberId === memberId && a.type === 'Work' && a.checkOut);
      const totalMs = records.reduce((acc, r) => acc + ((r.checkOut || 0) - r.checkIn), 0);
      const hours = Math.round((totalMs / 3600000) * 10) / 10;

      // Calculate Installation
      const memberTables = tables.filter(t => t.completedBy === memberId);
      const tableCount = memberTables.length;
      
      // Calculate exact kWp based on table types
      const kwTotal = memberTables.reduce((sum, table) => sum + calcSingleTableKwp(table.type), 0);
      const kw = Math.round(kwTotal * 10) / 10;

      return { hours, kw, tables: tableCount };
  };

  // --- Chart Data Memoization ---
  const chartData = useMemo(() => {
    if (!tables || !attendanceAll) return [];

    const data = [];
    const now = new Date();
    const daysToShow = 7;

    for (let i = daysToShow - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD
        const dayLabel = d.toLocaleDateString('cs-CZ', { weekday: 'short' });

        let value = 0;

        if (chartMetric === 'hours') {
            // Filter attendance for this day
            const dailyRecords = attendanceAll.filter(a => {
                // If admin, show everyone. If employee, show only self.
                const isRelevantUser = isAdmin ? true : a.memberId === user.id;
                return isRelevantUser && a.date === dateStr && a.type === 'Work' && a.checkOut;
            });
            const totalMs = dailyRecords.reduce((acc, r) => acc + ((r.checkOut || 0) - r.checkIn), 0);
            value = Math.round((totalMs / 3600000) * 10) / 10;
        } else {
            // Metric: kWp (Tables)
            const startOfDay = new Date(dateStr).setHours(0,0,0,0);
            const endOfDay = new Date(dateStr).setHours(23,59,59,999);
            
            const dailyTables = tables.filter(t => {
                const isRelevantUser = isAdmin ? true : t.completedBy === user.id;
                return isRelevantUser && t.completedAt && t.completedAt >= startOfDay && t.completedAt <= endOfDay;
            });
            
            const dailyKwp = dailyTables.reduce((sum, t) => sum + calcSingleTableKwp(t.type), 0);
            value = Math.round(dailyKwp * 10) / 10;
        }

        data.push({ label: dayLabel, value, fullDate: dateStr });
    }
    return data;
  }, [tables, attendanceAll, chartMetric, isAdmin, user.id]);

  const maxChartValue = Math.max(...chartData.map(d => d.value), 1); // Avoid div by zero

  return (
    <div className="space-y-4">
      
      {/* Tab Navigation */}
      <div className="glass-panel p-1.5 flex justify-between items-center shadow-lg bg-white/30 backdrop-blur-2xl sticky top-20 z-30">
        <button 
            onClick={() => setTab('members')}
            className={`flex-1 flex items-center justify-center py-2 rounded-xl transition-all duration-300 gap-1.5 ${tab === 'members' ? 'bg-white shadow-sm text-blue-600 scale-[1.02]' : 'text-slate-600 hover:bg-white/20'}`}>
            <Briefcase size={16} strokeWidth={2.5} />
            <span className="text-[10px] font-bold uppercase tracking-wide">Profily</span>
        </button>
        <button 
            onClick={() => setTab('attendance')}
            className={`flex-1 flex items-center justify-center py-2 rounded-xl transition-all duration-300 gap-1.5 ${tab === 'attendance' ? 'bg-white shadow-sm text-blue-600 scale-[1.02]' : 'text-slate-600 hover:bg-white/20'}`}>
            <Calendar size={16} strokeWidth={2.5} />
            <span className="text-[10px] font-bold uppercase tracking-wide">Docházka</span>
        </button>
        <button 
            onClick={() => setTab('performance')}
            className={`flex-1 flex items-center justify-center py-2 rounded-xl transition-all duration-300 gap-1.5 ${tab === 'performance' ? 'bg-white shadow-sm text-blue-600 scale-[1.02]' : 'text-slate-600 hover:bg-white/20'}`}>
            <Trophy size={16} strokeWidth={2.5} />
            <span className="text-[10px] font-bold uppercase tracking-wide">Výkon</span>
        </button>
      </div>

      {/* --- MEMBERS TAB --- */}
      {tab === 'members' && (
        <div className="space-y-4 animate-fade-in pb-20">
          <div className="flex gap-2">
            <div className="glass-panel flex-1 px-3 py-2 flex items-center gap-2">
                <Search size={16} className="text-slate-500"/>
                <input 
                    className="bg-transparent border-none outline-none w-full text-sm text-slate-800"
                    placeholder="Hledat pracovníka..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                />
            </div>
            {isAdmin && (
                <button 
                    onClick={openModal}
                    className="glass-button-primary w-12 flex items-center justify-center rounded-xl shadow-lg">
                    <UserPlus size={20} />
                </button>
            )}
          </div>

          <div className="grid gap-3">
            {filteredTeam?.map(member => {
                const currentProject = projects?.find(p => p.id === member.currentProjectId);
                const attendanceRecord = attendanceToday?.find(a => a.memberId === member.id);
                // Simple logic: If they have a record today and NO checkout, they are "Online/Working"
                const isOnline = attendanceRecord && !attendanceRecord.checkOut && attendanceRecord.type === 'Work';

                return (
                    <div key={member.id} className="glass-panel p-0 relative group overflow-hidden transition-all hover:bg-white/30">
                        {/* Upper Card Area */}
                        <div className="p-4 flex gap-4 items-start">
                            {/* Avatar */}
                            <div className="relative">
                                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-white/80 to-blue-50/50 border border-white/60 flex items-center justify-center text-blue-600 font-black text-xl shadow-sm">
                                    {member.name.charAt(0)}
                                </div>
                                {/* Online Status Dot */}
                                <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white shadow-sm ${isOnline ? 'bg-green-500' : 'bg-slate-300'}`}></div>
                            </div>
                            
                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="font-bold text-slate-800 text-lg leading-tight truncate">{member.name}</h3>
                                        <p className="text-xs text-slate-500 font-medium">{member.role}</p>
                                    </div>
                                    <div className="flex items-center gap-1 opacity-70">
                                        {isOnline ? <Signal size={14} className="text-green-600"/> : <SignalZero size={14} className="text-slate-400"/>}
                                    </div>
                                </div>

                                {/* Tags Row */}
                                <div className="flex flex-wrap gap-2 mt-3">
                                    {currentProject ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] bg-blue-500/10 text-blue-700 px-2 py-1 rounded-lg border border-blue-500/20 font-semibold">
                                            <Briefcase size={10} /> 
                                            {currentProject.name}
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 text-[10px] bg-slate-100/50 text-slate-500 px-2 py-1 rounded-lg border border-slate-200/50 font-semibold">
                                            <Briefcase size={10} /> Volno
                                        </span>
                                    )}

                                    {member.phone && (
                                        <a href={`tel:${member.phone}`} className="inline-flex items-center gap-1 text-[10px] bg-emerald-500/10 text-emerald-700 px-2 py-1 rounded-lg border border-emerald-500/20 font-semibold hover:bg-emerald-500/20">
                                            <Phone size={10} /> {member.phone}
                                        </a>
                                    )}

                                    {isAdmin && (
                                        <span className="inline-flex items-center gap-1 text-[10px] bg-amber-500/10 text-amber-700 px-2 py-1 rounded-lg border border-amber-500/20 font-semibold">
                                            <Banknote size={10} /> {member.hourlyRate} Kč/h
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Admin Action Bar (Footer) */}
                        {isAdmin && (
                            <div className="bg-white/20 border-t border-white/20 flex divide-x divide-white/20">
                                <button 
                                    onClick={() => openEdit(member)} 
                                    className="flex-1 py-2 text-xs font-bold text-slate-600 hover:bg-white/40 flex items-center justify-center gap-2 transition-colors">
                                    <Pencil size={14} /> Upravit
                                </button>
                                <button 
                                    onClick={() => handleDeleteMember(member.id)} 
                                    className="flex-1 py-2 text-xs font-bold text-red-500 hover:bg-red-50/50 hover:text-red-600 flex items-center justify-center gap-2 transition-colors">
                                    <Trash2 size={14} /> Smazat
                                </button>
                            </div>
                        )}
                    </div>
                );
            })}
             {(!filteredTeam || filteredTeam.length === 0) && (
                <div className="glass-panel p-8 text-center text-slate-500">
                    <p>Žádní pracovníci nenalezeni.</p>
                </div>
            )}
          </div>
        </div>
      )}

      {/* --- ATTENDANCE TAB --- */}
      {tab === 'attendance' && (
        <div className="space-y-4 animate-fade-in pb-20">
            <div className="flex justify-between items-center px-2">
                <h3 className="font-bold text-white text-xl drop-shadow-md">Dnešní přehled</h3>
                <span className="text-white/80 text-xs font-mono font-medium bg-white/10 px-3 py-1 rounded-full backdrop-blur-sm">
                    {new Date().toLocaleDateString('cs-CZ')}
                </span>
            </div>

            <div className="grid gap-3">
                {team?.map(member => {
                    const record = attendanceToday?.find(a => a.memberId === member.id);
                    const isCheckedIn = !!record;
                    const isCheckedOut = record?.checkOut;

                    return (
                        <div key={member.id} className="glass-panel p-4 flex flex-col gap-3">
                            <div className="flex justify-between items-center">
                                <div className="font-bold text-slate-800">{member.name}</div>
                                {isCheckedIn && (
                                    <div className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-md border ${
                                        record.type === 'Work' ? 'bg-green-100 text-green-700 border-green-200' :
                                        record.type === 'Sick' ? 'bg-red-100 text-red-700 border-red-200' :
                                        'bg-yellow-100 text-yellow-700 border-yellow-200'
                                    }`}>
                                        {record.type === 'Work' ? (isCheckedOut ? 'Odpracováno' : 'Pracuje') : record.type}
                                    </div>
                                )}
                            </div>

                            {!isCheckedIn ? (
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => handleAttendanceAction(member.id, 'Work')}
                                        className="flex-1 bg-green-500 hover:bg-green-600 text-white py-2 rounded-xl text-xs font-bold shadow-lg active:scale-95 transition-all flex items-center justify-center gap-1">
                                        <LogIn size={14} /> Check-In
                                    </button>
                                    <button 
                                        onClick={() => handleAttendanceAction(member.id, 'Sick')}
                                        className="w-10 bg-red-400/20 hover:bg-red-400/40 text-red-700 border border-red-400/30 rounded-xl flex items-center justify-center active:scale-95 transition-all">
                                        <AlertCircle size={16} />
                                    </button>
                                    <button 
                                        onClick={() => handleAttendanceAction(member.id, 'Vacation')}
                                        className="w-10 bg-yellow-400/20 hover:bg-yellow-400/40 text-yellow-700 border border-yellow-400/30 rounded-xl flex items-center justify-center active:scale-95 transition-all">
                                        <Palmtree size={16} />
                                    </button>
                                </div>
                            ) : (
                                record.type === 'Work' && !isCheckedOut ? (
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2 text-green-800 text-xs font-mono flex items-center gap-2">
                                            <Clock size={12} />
                                            Start: {new Date(record.checkIn).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                        </div>
                                        <button 
                                            onClick={() => handleAttendanceAction(member.id, 'Work')}
                                            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg active:scale-95 transition-all flex items-center gap-1">
                                            <LogOut size={14} /> Out
                                        </button>
                                    </div>
                                ) : (
                                    <div className="text-xs text-slate-500 text-center py-1">
                                        {record.type === 'Work' 
                                            ? `Celkem: ${((record.checkOut! - record.checkIn) / 3600000).toFixed(2)}h` 
                                            : 'Nepřítomen (Celý den)'}
                                    </div>
                                )
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
      )}

      {/* --- PERFORMANCE TAB --- */}
      {tab === 'performance' && (
        <div className="space-y-4 animate-fade-in pb-20">
             {/* Chart Controls */}
             <div className="glass-panel p-2 flex gap-2">
                 <button 
                    onClick={() => setChartMetric('kwp')}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${chartMetric === 'kwp' ? 'bg-blue-500 text-white shadow-md' : 'text-slate-500 hover:bg-white/40'}`}>
                    <Zap size={14} /> Výkon (kWp)
                 </button>
                 <button 
                    onClick={() => setChartMetric('hours')}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${chartMetric === 'hours' ? 'bg-emerald-500 text-white shadow-md' : 'text-slate-500 hover:bg-white/40'}`}>
                    <Clock size={14} /> Hodiny (h)
                 </button>
             </div>

             {/* Chart Visual */}
             <div className="glass-panel p-5 relative overflow-hidden">
                <div className="flex justify-between items-end mb-4">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <Activity size={18} className="text-blue-600"/>
                            {isAdmin ? 'Výkon Týmu' : 'Můj Výkon'}
                        </h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase">Posledních 7 dní</p>
                    </div>
                    <div className="text-right">
                         <div className="text-2xl font-black text-slate-800 leading-none">
                             {chartData.reduce((acc, d) => acc + d.value, 0).toFixed(1)}
                             <span className="text-xs font-bold text-slate-400 ml-1">
                                 {chartMetric === 'hours' ? 'h' : 'kWp'}
                             </span>
                         </div>
                         <div className="text-[10px] text-slate-500 font-bold uppercase">Celkem</div>
                    </div>
                </div>

                {/* SVG Bar Chart */}
                <div className="h-40 w-full flex items-end justify-between gap-2 mt-2">
                    {chartData.map((d, i) => {
                        const heightPercent = maxChartValue > 0 ? (d.value / maxChartValue) * 100 : 0;
                        return (
                            <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative h-full justify-end">
                                {/* Tooltip */}
                                <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-[10px] py-1 px-2 rounded-lg pointer-events-none whitespace-nowrap z-10">
                                    {d.value} {chartMetric === 'hours' ? 'h' : 'kWp'}
                                </div>
                                
                                {/* Bar */}
                                <div 
                                    className={`w-full max-w-[30px] rounded-t-lg transition-all duration-500 ease-out border-t border-l border-r border-white/30 shadow-sm ${
                                        chartMetric === 'kwp' 
                                        ? 'bg-gradient-to-t from-blue-500/80 to-indigo-400/80 hover:from-blue-500 hover:to-indigo-400' 
                                        : 'bg-gradient-to-t from-emerald-500/80 to-teal-400/80 hover:from-emerald-500 hover:to-teal-400'
                                    }`}
                                    style={{ height: `${Math.max(heightPercent, 2)}%` }} // min 2% height for visuals
                                ></div>
                                
                                {/* Label */}
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">{d.label}</span>
                            </div>
                        )
                    })}
                </div>
             </div>

             {/* Leaderboard / Details List */}
             <div className="glass-panel p-4">
                 <h4 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                     <BarChart3 size={18} className="text-slate-400" />
                     {isAdmin ? 'Žebříček (Celkový)' : 'Statistiky'}
                 </h4>
                 
                 <div className="space-y-4">
                     {team?.map(m => {
                         const stats = getMemberStats(m.id);
                         const progress = chartMetric === 'kwp' 
                            ? (stats.kw / Math.max(stats.kw * 1.5, 10)) * 100 // Dynamic dummy max
                            : (stats.hours / Math.max(stats.hours * 1.5, 40)) * 100;

                         return (
                             <div key={m.id} className="space-y-1">
                                 <div className="flex justify-between text-xs font-bold text-slate-600">
                                     <span>{m.name}</span>
                                     <span>
                                         {chartMetric === 'kwp' ? `${stats.kw} kWp` : `${stats.hours} h`}
                                     </span>
                                 </div>
                                 <div className="w-full bg-slate-200/50 rounded-full h-2 overflow-hidden">
                                     <div 
                                        className={`h-2 rounded-full ${chartMetric === 'kwp' ? 'bg-gradient-to-r from-blue-400 to-indigo-500' : 'bg-gradient-to-r from-emerald-400 to-teal-500'}`} 
                                        style={{ width: `${Math.min(progress, 100)}%` }}>
                                     </div>
                                 </div>
                                 <div className="text-[10px] text-slate-400 text-right">
                                     {chartMetric === 'kwp' ? `${stats.tables} stolů` : 'Odpracováno celkem'}
                                 </div>
                             </div>
                         )
                     })}
                 </div>
             </div>
        </div>
      )}

      {/* --- MODAL FOR EDIT/ADD --- */}
      {showAddModal && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
            <div className="glass-panel w-full max-w-sm p-6 bg-white/80 shadow-2xl relative">
                <button onClick={closeModal} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={20}/></button>
                <h3 className="text-xl font-bold text-slate-800 mb-4">{isEditingMember ? 'Upravit profil' : 'Nový pracovník'}</h3>
                
                <div className="space-y-3">
                    <div>
                        <label className="text-xs font-bold text-slate-500 ml-1">Jméno</label>
                        <input className="glass-input w-full mt-1" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Jan Novák"/>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-500 ml-1">Email (Login)</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-3 text-slate-400" size={16}/>
                            <input className="glass-input w-full mt-1 pl-10" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="jan@example.com"/>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <div className="flex-1">
                            <label className="text-xs font-bold text-slate-500 ml-1">Sazba (Kč/h)</label>
                            <input type="number" className="glass-input w-full mt-1" value={form.rate} onChange={e => setForm({...form, rate: Number(e.target.value)})}/>
                        </div>
                        <div className="flex-1">
                             <label className="text-xs font-bold text-slate-500 ml-1">Role</label>
                             <select className="glass-input w-full mt-1 py-3" value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
                                 <option value="Installer">Montér</option>
                                 <option value="Electrician">Elektrikář</option>
                                 <option value="Lead">Vedoucí</option>
                             </select>
                        </div>
                    </div>
                    <div>
                         <label className="text-xs font-bold text-slate-500 ml-1">Telefon</label>
                         <div className="relative">
                            <Phone className="absolute left-3 top-3 text-slate-400" size={16}/>
                            <input className="glass-input w-full mt-1 pl-10" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="+420..."/>
                         </div>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-500 ml-1">Přiřadit k projektu</label>
                        <select className="glass-input w-full mt-1" value={form.currentProjectId} onChange={e => setForm({...form, currentProjectId: e.target.value})}>
                            <option value="">-- Nepřiřazeno --</option>
                            {projects?.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>

                    <button onClick={handleSaveMember} className="glass-button-primary w-full py-3 mt-4 flex justify-center items-center gap-2">
                        <Check size={18}/> Uložit
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default TeamManagement;