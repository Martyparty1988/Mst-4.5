import React, { useState, useEffect } from 'react';
import { db } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
    UserPlus, Clock, LogIn, LogOut, Search, 
    Briefcase, Calendar, Trophy, Zap, 
    MoreHorizontal, Pencil, Trash2, Phone, X, Check,
    AlertCircle, Palmtree, Mail, Banknote, Signal, SignalZero
} from 'lucide-react';
import { TeamMember, UserProfile } from '../types';

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
      setShowAddModal(true);
  };

  const closeModal = () => {
      setShowAddModal(false);
      setIsEditingMember(null);
      setForm({ name: '', email: '', rate: 0, role: 'Installer', phone: '', currentProjectId: '' });
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

  // --- Performance Stats ---
  const getMemberStats = (memberId: string) => {
      if (!attendanceAll || !tables) return { hours: 0, kw: 0, tables: 0 };
      
      // Calculate Hours
      const records = attendanceAll.filter(a => a.memberId === memberId && a.type === 'Work' && a.checkOut);
      const totalMs = records.reduce((acc, r) => acc + ((r.checkOut || 0) - r.checkIn), 0);
      const hours = Math.round((totalMs / 3600000) * 10) / 10;

      // Calculate Installation
      // Count tables where completedBy matches memberId
      const memberTables = tables.filter(t => t.completedBy === memberId);
      const tableCount = memberTables.length;
      const kw = Math.round(tableCount * 0.5 * 10) / 10; 

      return { hours, kw, tables: tableCount };
  };

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
                    onClick={() => setShowAddModal(true)}
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
             <div className="grid grid-cols-2 gap-3">
                 {isAdmin ? (
                    <>
                     <div className="glass-panel p-4 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border-indigo-200/30">
                         <div className="text-indigo-800 font-bold text-2xl">{team?.length || 0}</div>
                         <div className="text-xs text-indigo-600 font-bold uppercase tracking-wider">Aktivní tým</div>
                     </div>
                     <div className="glass-panel p-4 bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border-emerald-200/30">
                         <div className="text-emerald-800 font-bold text-2xl">
                             {team?.reduce((acc, m) => acc + getMemberStats(m.id).hours, 0).toFixed(0)}h
                         </div>
                         <div className="text-xs text-emerald-600 font-bold uppercase tracking-wider">Celkem hodin</div>
                     </div>
                    </>
                 ) : (
                    <>
                     <div className="glass-panel p-4 bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border-emerald-200/30">
                         <div className="text-emerald-800 font-bold text-2xl">
                             {team && team[0] ? getMemberStats(team[0].id).hours : 0}h
                         </div>
                         <div className="text-xs text-emerald-600 font-bold uppercase tracking-wider">Odpracováno</div>
                     </div>
                     <div className="glass-panel p-4 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border-blue-200/30">
                         <div className="text-blue-800 font-bold text-2xl">
                             {team && team[0] ? getMemberStats(team[0].id).tables : 0}
                         </div>
                         <div className="text-xs text-blue-600 font-bold uppercase tracking-wider">Instalováno</div>
                     </div>
                    </>
                 )}
             </div>

             <div className="glass-panel p-4">
                 <h4 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                     <Zap size={18} className="text-yellow-500" />
                     {isAdmin ? 'Top Výkon' : 'Detailní Statistiky'}
                 </h4>
                 
                 <div className="space-y-4">
                     {team?.map(m => {
                         const stats = getMemberStats(m.id);
                         return (
                             <div key={m.id} className="space-y-1">
                                 <div className="flex justify-between text-xs font-bold text-slate-600">
                                     <span>{m.name}</span>
                                     <span>{stats.tables} stolů ({stats.kw} kWp)</span>
                                 </div>
                                 <div className="w-full bg-slate-200/50 rounded-full h-2 overflow-hidden">
                                     {/* Max dummy value 100 for bar width */}
                                     <div className="bg-gradient-to-r from-blue-400 to-indigo-500 h-2 rounded-full" style={{ width: `${Math.min(stats.tables * 2, 100)}%` }}></div>
                                 </div>
                                 <div className="text-[10px] text-slate-400 text-right">
                                     {stats.hours} odpracovaných hodin
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