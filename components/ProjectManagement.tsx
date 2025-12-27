import React, { useState, useEffect } from 'react';
import { db } from '../db';
import { Project, Table, TableType, TableStatus, UserProfile, TeamMember } from '../types';
import CanvasMap from './CanvasMap';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, MapPin, ArrowLeft, CheckCircle, AlertCircle, LayoutList, Trash2, Search, Pencil, X, Check, Lock, Users, User, Briefcase } from 'lucide-react';

const generateId = () => {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
};

interface Props {
    user: UserProfile;
}

const ProjectManagement: React.FC<Props> = ({ user }) => {
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [form, setForm] = useState({ name: '', location: '', small: 0, medium: 0, large: 0 });
  
  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Table[]>([]);
  
  // Edit Mode State in Detail
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', location: '' });

  // Team Assignment State
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);

  const isAdmin = user.role === 'admin';

  const projects = useLiveQuery(() => db.projects.toArray());
  const allTeam = useLiveQuery(() => db.team.toArray());
  const activeTables = useLiveQuery(
    () => activeProject ? db.projectTables.where('projectId').equals(activeProject.id).toArray() : Promise.resolve([]),
    [activeProject]
  );

  // --- History API for Sub-views ---
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
        // If the browser goes back, we should check if we need to close a view
        if (event.state?.view) {
            setView(event.state.view);
        } else {
            // If no state, assume list
            setView('list');
        }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateToView = (newView: 'list' | 'create' | 'detail') => {
      // If going to list (back), we typically want to pop history if we pushed it
      // But for simplicity in this helper, we push state for non-list views
      if (newView !== 'list') {
        window.history.pushState({ view: newView }, '', '');
      } 
      setView(newView);
  };
  
  const goBack = () => {
      window.history.back();
  };

  // Search Logic
  useEffect(() => {
    if (!searchQuery || !activeTables) {
        setSearchResults([]);
        return;
    }
    const lower = searchQuery.toLowerCase();
    const results = activeTables.filter(t => 
        t.id.toLowerCase().includes(lower) || 
        `${t.x},${t.y}`.includes(lower)
    ).slice(0, 5); // Limit to 5
    setSearchResults(results);
  }, [searchQuery, activeTables]);

  const handleCreateProject = async () => {
    if (!form.name) return;
    const projectId = generateId();
    
    // Create Project
    await db.projects.add({
      id: projectId,
      name: form.name,
      location: form.location,
      tableCounts: { small: form.small, medium: form.medium, large: form.large },
      createdDate: Date.now(),
      lastSynced: 0,
      tablesGenerated: true, // We generate immediately
      assignedEmployees: []
    });

    // Generate Tables
    const tables: Table[] = [];
    let idx = 0;
    const spacing = 1; // logical grid spacing

    // Simple grid layout algorithm
    const generateType = (count: number, type: TableType) => {
        for(let i=0; i<count; i++) {
            tables.push({
                id: `${projectId}_${idx}`,
                projectId,
                index: idx,
                type,
                status: TableStatus.Pending,
                x: (idx % 10) * spacing, // 10 columns
                y: Math.floor(idx / 10) * spacing
            });
            idx++;
        }
    };

    generateType(form.small, TableType.Small);
    generateType(form.medium, TableType.Medium);
    generateType(form.large, TableType.Large);

    await db.projectTables.bulkAdd(tables);

    setForm({ name: '', location: '', small: 0, medium: 0, large: 0 });
    
    // Go back to list effectively
    goBack();
  };

  const handleDeleteProject = async (id: string) => {
      if(window.confirm('Opravdu smazat projekt a všechna data?')) {
          await db.projects.delete(id);
          await db.projectTables.where('projectId').equals(id).delete();
          
          // Clear assignments from team members
          const members = await db.team.where('currentProjectId').equals(id).toArray();
          for(const m of members) {
              await db.team.update(m.id, { currentProjectId: '' });
          }
      }
  };

  const handleTableClick = async (tableId: string) => {
      const table = activeTables?.find(t => t.id === tableId);
      if(!table) return;

      let nextStatus = TableStatus.Pending;
      let completedBy = undefined;
      let completedAt = undefined;

      if (table.status === TableStatus.Pending) {
          nextStatus = TableStatus.Completed;
          completedBy = user.id;
          completedAt = Date.now();
      } else if (table.status === TableStatus.Completed) {
          nextStatus = TableStatus.Issue;
      } else {
          nextStatus = TableStatus.Pending;
      }

      await db.projectTables.update(tableId, { 
          status: nextStatus,
          completedBy,
          completedAt
      });
  };

  const handleSearchResultClick = (tableId: string) => {
      handleTableClick(tableId);
      setSearchQuery(''); // Clear search after action
  };

  const handleUpdateProject = async () => {
      if (!activeProject) return;
      await db.projects.update(activeProject.id, {
          name: editForm.name,
          location: editForm.location
      });
      setIsEditing(false);
      setActiveProject({...activeProject, name: editForm.name, location: editForm.location});
  };

  // --- Team Assignment Logic ---
  const openAssignModal = () => {
      if (!activeProject) return;
      setSelectedTeamIds(activeProject.assignedEmployees || []);
      setShowAssignModal(true);
  };

  const toggleTeamMember = (memberId: string) => {
      const newSet = new Set(selectedTeamIds);
      if (newSet.has(memberId)) {
          newSet.delete(memberId);
      } else {
          newSet.add(memberId);
      }
      setSelectedTeamIds(Array.from(newSet));
  };

  const handleSaveAssignments = async () => {
      if (!activeProject) return;
      
      const oldIds = activeProject.assignedEmployees || [];
      const newIds = selectedTeamIds;

      // 1. Update Project
      await db.projects.update(activeProject.id, {
          assignedEmployees: newIds
      });

      // 2. Update Team Members
      // Find removed members -> Clear their project if it was this one
      const removed = oldIds.filter(id => !newIds.includes(id));
      for (const id of removed) {
          const member = await db.team.get(id);
          if (member && member.currentProjectId === activeProject.id) {
              await db.team.update(id, { currentProjectId: '' });
          }
      }

      // Find added members -> Set their project to this one
      const added = newIds.filter(id => !oldIds.includes(id));
      for (const id of added) {
          await db.team.update(id, { currentProjectId: activeProject.id });
      }

      // Update local state to reflect changes immediately
      setActiveProject({ ...activeProject, assignedEmployees: newIds });
      setShowAssignModal(false);
  };

  return (
    <div className="space-y-4 animate-fade-in pb-20">
      
      {/* VIEW: LIST */}
      {view === 'list' && (
        <>
            <div className="flex justify-between items-center mb-2 px-2">
                <h2 className="text-xl font-bold text-white drop-shadow-md">Projekty</h2>
                {isAdmin && (
                    <button 
                        onClick={() => navigateToView('create')}
                        className="glass-button-primary px-4 py-2 flex items-center gap-2 shadow-lg">
                        <Plus size={18} /> Nový
                    </button>
                )}
            </div>

            <div className="grid gap-4">
                {projects?.map(p => {
                    const progress = p.tableCounts.small + p.tableCounts.medium + p.tableCounts.large > 0 
                        ? Math.round((0 /* calculate real progress later */) / (p.tableCounts.small + p.tableCounts.medium + p.tableCounts.large) * 100) 
                        : 0;

                    return (
                        <div key={p.id} onClick={() => { setActiveProject(p); navigateToView('detail'); }} className="glass-panel p-5 active:scale-[0.99] transition-transform cursor-pointer group">
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-800 group-hover:text-blue-700 transition-colors">{p.name}</h3>
                                    <div className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                                        <MapPin size={12} /> {p.location}
                                    </div>
                                </div>
                                {isAdmin && (
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleDeleteProject(p.id); }}
                                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all">
                                        <Trash2 size={16} />
                                    </button>
                                )}
                            </div>
                            
                            <div className="flex gap-4 mt-4">
                                <div className="flex flex-col">
                                    <span className="text-[10px] uppercase font-bold text-slate-400">Stolů</span>
                                    <span className="font-mono font-bold text-slate-700 text-sm">
                                        {p.tableCounts.small + p.tableCounts.medium + p.tableCounts.large}
                                    </span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] uppercase font-bold text-slate-400">Tým</span>
                                    <span className="font-mono font-bold text-slate-700 text-sm">
                                        {p.assignedEmployees?.length || 0}
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })}
                {projects?.length === 0 && (
                    <div className="glass-panel p-8 text-center text-slate-500">
                        <p>Žádné projekty. Vytvořte první.</p>
                    </div>
                )}
            </div>
        </>
      )}

      {/* VIEW: CREATE */}
      {view === 'create' && (
          <div className="glass-panel p-6 animate-fade-in">
              <div className="flex items-center gap-2 mb-6 text-slate-800">
                  <button onClick={goBack} className="p-1 rounded-full hover:bg-white/40"><ArrowLeft /></button>
                  <h2 className="text-xl font-bold">Nový Projekt</h2>
              </div>
              
              <div className="space-y-4">
                  <div>
                      <label className="text-xs font-bold text-slate-500 ml-1">Název projektu</label>
                      <input className="glass-input w-full mt-1" placeholder="FVE Hrušovany..." value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
                  </div>
                  <div>
                      <label className="text-xs font-bold text-slate-500 ml-1">Lokace</label>
                      <input className="glass-input w-full mt-1" placeholder="GPS nebo adresa" value={form.location} onChange={e => setForm({...form, location: e.target.value})} />
                  </div>
                  
                  <div className="grid grid-cols-3 gap-3">
                      <div>
                          <label className="text-xs font-bold text-slate-500 ml-1">Small</label>
                          <input type="number" className="glass-input w-full mt-1" value={form.small} onChange={e => setForm({...form, small: Number(e.target.value)})} />
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-500 ml-1">Medium</label>
                          <input type="number" className="glass-input w-full mt-1" value={form.medium} onChange={e => setForm({...form, medium: Number(e.target.value)})} />
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-500 ml-1">Large</label>
                          <input type="number" className="glass-input w-full mt-1" value={form.large} onChange={e => setForm({...form, large: Number(e.target.value)})} />
                      </div>
                  </div>

                  <button 
                    onClick={handleCreateProject}
                    className="glass-button-primary w-full py-3 mt-4 flex justify-center items-center gap-2 shadow-xl">
                      <Plus size={18} /> Vytvořit
                  </button>
              </div>
          </div>
      )}

      {/* VIEW: DETAIL */}
      {view === 'detail' && activeProject && (
          <div className="animate-fade-in space-y-4">
              {/* Header Card */}
              <div className="glass-panel p-5 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-3 opacity-10">
                      <LayoutList size={120} />
                  </div>
                  
                  <div className="flex items-start gap-3 relative z-10">
                    <button onClick={goBack} className="mt-1 p-1.5 rounded-full hover:bg-white/40 text-slate-700 transition-colors">
                        <ArrowLeft size={20} />
                    </button>
                    <div className="flex-1">
                        {isEditing ? (
                             <div className="space-y-2 mb-2">
                                <input className="glass-input w-full text-lg font-bold" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} />
                                <input className="glass-input w-full text-sm" value={editForm.location} onChange={e => setEditForm({...editForm, location: e.target.value})} />
                                <div className="flex gap-2">
                                    <button onClick={handleUpdateProject} className="bg-green-500 text-white px-3 py-1 rounded-lg text-xs font-bold">Uložit</button>
                                    <button onClick={() => setIsEditing(false)} className="bg-slate-300 text-slate-700 px-3 py-1 rounded-lg text-xs font-bold">Zrušit</button>
                                </div>
                             </div>
                        ) : (
                            <>
                                <div className="flex justify-between items-start">
                                    <h2 className="text-2xl font-black text-slate-800 leading-tight">{activeProject.name}</h2>
                                    {isAdmin && (
                                        <button onClick={() => { setIsEditing(true); setEditForm({name: activeProject.name, location: activeProject.location}) }} className="text-slate-400 hover:text-blue-600">
                                            <Pencil size={16} />
                                        </button>
                                    )}
                                </div>
                                <div className="flex items-center gap-1.5 text-slate-600 font-medium text-sm mt-1">
                                    <MapPin size={14} className="text-red-500" /> 
                                    {activeProject.location}
                                </div>
                            </>
                        )}
                    </div>
                  </div>

                  {/* Progress Stats */}
                  <div className="flex gap-4 mt-6 relative z-10">
                       <div className="flex items-center gap-2">
                           <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center text-green-600 border border-green-200 shadow-sm">
                               <CheckCircle size={20} />
                           </div>
                           <div className="flex flex-col">
                               <span className="text-lg font-bold text-slate-800 leading-none">
                                   {activeTables?.filter(t => t.status === TableStatus.Completed).length || 0}
                               </span>
                               <span className="text-[10px] uppercase font-bold text-slate-500">Hotovo</span>
                           </div>
                       </div>
                       <div className="flex items-center gap-2">
                           <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-red-600 border border-red-200 shadow-sm">
                               <AlertCircle size={20} />
                           </div>
                           <div className="flex flex-col">
                               <span className="text-lg font-bold text-slate-800 leading-none">
                                   {activeTables?.filter(t => t.status === TableStatus.Issue).length || 0}
                               </span>
                               <span className="text-[10px] uppercase font-bold text-slate-500">Problémy</span>
                           </div>
                       </div>
                  </div>
              </div>

              {/* Team Assignment Section (New) */}
              <div className="glass-panel p-4 flex flex-col gap-3">
                  <div className="flex justify-between items-center border-b border-white/20 pb-2">
                      <div className="flex items-center gap-2 text-slate-700 font-bold text-sm">
                          <Users size={16} className="text-blue-600"/> Tým projektu
                      </div>
                      {isAdmin && (
                          <button 
                            onClick={openAssignModal}
                            className="text-[10px] bg-white/40 hover:bg-white/60 px-2 py-1 rounded-lg text-blue-700 font-bold transition-colors flex items-center gap-1">
                              <Pencil size={10} /> Upravit
                          </button>
                      )}
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                      {activeProject.assignedEmployees && activeProject.assignedEmployees.length > 0 ? (
                          activeProject.assignedEmployees.map(memberId => {
                              const member = allTeam?.find(m => m.id === memberId);
                              if (!member) return null;
                              return (
                                  <div key={memberId} className="flex items-center gap-2 bg-white/30 px-2 py-1.5 rounded-xl border border-white/40">
                                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-[10px] font-bold">
                                          {member.name.charAt(0)}
                                      </div>
                                      <span className="text-xs font-medium text-slate-700">{member.name}</span>
                                  </div>
                              )
                          })
                      ) : (
                          <span className="text-xs text-slate-400 italic py-1">Žádní pracovníci nepřiřazeni.</span>
                      )}
                      
                      {isAdmin && activeProject.assignedEmployees?.length === 0 && (
                          <button onClick={openAssignModal} className="flex items-center gap-1 bg-blue-500/10 hover:bg-blue-500/20 px-3 py-1.5 rounded-xl border border-blue-500/20 text-blue-700 text-xs font-bold border-dashed">
                              <Plus size={12} /> Přiřadit
                          </button>
                      )}
                  </div>
              </div>

              {/* Search Bar */}
              <div className="glass-panel px-3 py-2 flex items-center gap-2 relative z-20">
                    <Search size={16} className="text-slate-500"/>
                    <input 
                        className="bg-transparent border-none outline-none w-full text-sm text-slate-800 placeholder-slate-400"
                        placeholder="Najít stůl (ID nebo x,y)..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                    {searchResults.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-white/90 backdrop-blur-xl rounded-xl shadow-2xl border border-white/50 overflow-hidden">
                            {searchResults.map(res => (
                                <button 
                                    key={res.id} 
                                    onClick={() => handleSearchResultClick(res.id)}
                                    className="w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-blue-50 flex items-center justify-between group"
                                >
                                    <div className="flex flex-col">
                                        <span className="font-bold text-slate-700 text-sm">{res.id}</span>
                                        <span className="text-[10px] text-slate-500">Typ {res.type} • Souř [{res.x}, {res.y}]</span>
                                    </div>
                                    {res.status === TableStatus.Completed && <CheckCircle size={14} className="text-green-500"/>}
                                    {res.status === TableStatus.Issue && <AlertCircle size={14} className="text-red-500"/>}
                                </button>
                            ))}
                        </div>
                    )}
              </div>

              {/* Map Visualization */}
              <div className="glass-panel overflow-hidden p-0 relative h-96 border-0">
                  <CanvasMap 
                    tables={activeTables || []} 
                    onTableClick={handleTableClick} 
                  />
                  {/* Legend Overlay */}
                  <div className="absolute top-4 left-4 bg-white/80 backdrop-blur-sm p-2 rounded-xl text-[10px] font-bold text-slate-600 shadow-sm border border-white pointer-events-none">
                      <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-white border border-slate-400"></div> Čeká</div>
                      <div className="flex items-center gap-1.5 mt-1"><div className="w-2 h-2 rounded-full bg-green-200 border border-green-500"></div> Hotovo</div>
                      <div className="flex items-center gap-1.5 mt-1"><div className="w-2 h-2 rounded-full bg-red-200 border border-red-500"></div> Problém</div>
                  </div>
              </div>
          </div>
      )}

      {/* MODAL: ASSIGN TEAM */}
      {showAssignModal && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
             <div className="glass-panel w-full max-w-sm max-h-[80vh] flex flex-col bg-white/90 shadow-2xl relative">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-slate-800">Přiřadit tým</h3>
                    <button onClick={() => setShowAssignModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {allTeam?.map(member => {
                        const isSelected = selectedTeamIds.includes(member.id);
                        const assignedOther = member.currentProjectId && member.currentProjectId !== activeProject?.id;
                        const otherProjectName = projects?.find(p => p.id === member.currentProjectId)?.name;

                        return (
                            <div 
                                key={member.id} 
                                onClick={() => toggleTeamMember(member.id)}
                                className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                                    isSelected 
                                    ? 'bg-blue-50 border-blue-500/30' 
                                    : 'bg-white/50 border-transparent hover:bg-white'
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isSelected ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                                        {member.name.charAt(0)}
                                    </div>
                                    <div>
                                        <div className={`text-sm font-bold ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>{member.name}</div>
                                        <div className="text-[10px] text-slate-500">{member.role}</div>
                                        {assignedOther && (
                                            <div className="flex items-center gap-1 text-[9px] text-orange-600 font-bold mt-0.5">
                                                <Briefcase size={8} /> V projektu: {otherProjectName}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className={`w-5 h-5 rounded-md border flex items-center justify-center ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`}>
                                    {isSelected && <Check size={12} className="text-white"/>}
                                </div>
                            </div>
                        )
                    })}
                </div>

                <div className="p-4 border-t border-slate-100 bg-white/50">
                    <button onClick={handleSaveAssignments} className="glass-button-primary w-full py-3 flex justify-center items-center gap-2">
                        <Check size={18}/> Uložit změny
                    </button>
                </div>
             </div>
        </div>
      )}

    </div>
  );
};

export default ProjectManagement;