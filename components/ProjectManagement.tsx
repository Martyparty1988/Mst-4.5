import React, { useState } from 'react';
import { db } from '../db';
import { Project, Table, TableType, TableStatus, UserProfile } from '../types';
import CanvasMap from './CanvasMap';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, MapPin, ArrowLeft, CheckCircle, AlertCircle, LayoutList, Trash2, Search, Pencil, X, Check, Lock } from 'lucide-react';

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
  const [filterStatus, setFilterStatus] = useState<'all' | 'completed' | 'active'>('all');
  
  // Edit Mode State in Detail
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', location: '' });

  const projects = useLiveQuery(() => db.projects.toArray());
  const activeTables = useLiveQuery(
    () => activeProject ? db.projectTables.where('projectId').equals(activeProject.id).toArray() : Promise.resolve([]),
    [activeProject]
  );
  
  const allTables = useLiveQuery(() => db.projectTables.toArray()) || [];

  const isAdmin = user.role === 'admin';

  const handleCreateProject = async () => {
    if (!form.name) return;

    const projectId = generateId();
    const newProject: Project = {
      id: projectId,
      name: form.name,
      location: form.location,
      tableCounts: { small: form.small, medium: form.medium, large: form.large },
      createdDate: Date.now(),
      lastSynced: 0,
      tablesGenerated: true,
      assignedEmployees: []
    };

    // Auto-generate grid layout
    const tables: Table[] = [];
    let currentX = 0;
    let currentY = 0;
    const MAX_WIDTH_ITEMS = 20; 

    const addTables = (count: number, type: TableType) => {
      for (let i = 0; i < count; i++) {
        tables.push({
          id: `${projectId}_${type}_${i}`,
          projectId,
          index: i,
          type,
          status: TableStatus.Pending,
          x: currentX,
          y: currentY
        });
        currentX++;
        if (currentX >= MAX_WIDTH_ITEMS) {
          currentX = 0;
          currentY++;
        }
      }
    };

    addTables(form.small, TableType.Small);
    addTables(form.medium, TableType.Medium);
    addTables(form.large, TableType.Large);

    await db.transaction('rw', db.projects, db.projectTables, async () => {
      await db.projects.add(newProject);
      await db.projectTables.bulkAdd(tables);
    });

    setForm({ name: '', location: '', small: 0, medium: 0, large: 0 });
    setView('list');
  };

  const handleDeleteProject = async (e: React.MouseEvent, projectId: string) => {
      e.stopPropagation();
      if(window.confirm("Opravdu chcete smazat tento projekt a všechna jeho data?")) {
          await db.transaction('rw', db.projects, db.projectTables, async () => {
              await db.projectTables.where('projectId').equals(projectId).delete();
              await db.projects.delete(projectId);
          });
          if (activeProject?.id === projectId) {
              setView('list');
              setActiveProject(null);
          }
      }
  }

  const handleSaveEdit = async () => {
      if (activeProject && editForm.name) {
          await db.projects.update(activeProject.id, {
              name: editForm.name,
              location: editForm.location
          });
          setActiveProject({...activeProject, name: editForm.name, location: editForm.location});
          setIsEditing(false);
      }
  }

  const toggleTableStatus = async (tableId: string) => {
    // Both admins and employees can toggle status to mark work
    const table = activeTables?.find(t => t.id === tableId);
    if (table) {
      let newStatus = TableStatus.Pending;
      if (table.status === TableStatus.Pending) newStatus = TableStatus.Completed;
      else if (table.status === TableStatus.Completed) newStatus = TableStatus.Issue;
      else newStatus = TableStatus.Pending;

      await db.projectTables.update(tableId, { 
          status: newStatus,
          completedBy: newStatus === TableStatus.Completed ? user.id : undefined,
          completedAt: newStatus === TableStatus.Completed ? Date.now() : undefined
      });
    }
  };

  const getStats = (tables: Table[]) => {
      const total = tables.length;
      const completed = tables.filter(t => t.status === TableStatus.Completed).length;
      const issues = tables.filter(t => t.status === TableStatus.Issue).length;
      const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
      return { total, completed, issues, percent };
  }

  // Filter projects logic
  const filteredProjects = projects?.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            p.location.toLowerCase().includes(searchQuery.toLowerCase());
      
      if (!matchesSearch) return false;

      // Calculate simple status for filter
      if (filterStatus === 'all') return true;
      
      const pTables = allTables.filter(t => t.projectId === p.id);
      const stats = getStats(pTables);
      
      if (filterStatus === 'completed') return stats.percent === 100;
      if (filterStatus === 'active') return stats.percent < 100;
      
      return true;
  });

  if (view === 'create') {
    if (!isAdmin) {
        setView('list');
        return null;
    }
    return (
      <div className="glass-panel p-6 animate-fade-in">
        <h2 className="text-2xl font-bold mb-6 text-slate-800">Nový Projekt</h2>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold ml-1 text-slate-600">Název</label>
            <input className="glass-input w-full mt-1" placeholder="Zadejte název..." value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
          </div>
          <div>
            <label className="text-xs font-semibold ml-1 text-slate-600">Lokace</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 text-slate-500" size={16} />
              <input className="glass-input w-full pl-10 mt-1" placeholder="GPS nebo adresa" value={form.location} onChange={e => setForm({...form, location: e.target.value})} />
            </div>
          </div>
          
          <div className="glass-panel-darker p-4 mt-4">
            <h3 className="text-sm font-bold mb-3 text-slate-700">Počty stolů</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">Malé (S)</label>
                  <input type="number" className="glass-input w-full text-center font-mono" value={form.small} onChange={e => setForm({...form, small: parseInt(e.target.value) || 0})} />
              </div>
              <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">Střední (M)</label>
                  <input type="number" className="glass-input w-full text-center font-mono" value={form.medium} onChange={e => setForm({...form, medium: parseInt(e.target.value) || 0})} />
              </div>
              <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">Velké (L)</label>
                  <input type="number" className="glass-input w-full text-center font-mono" value={form.large} onChange={e => setForm({...form, large: parseInt(e.target.value) || 0})} />
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button className="glass-button px-6 py-3 text-slate-700" onClick={() => setView('list')}>Zrušit</button>
            <button className="glass-button-primary flex-1 py-3" onClick={handleCreateProject}>Vytvořit</button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'detail' && activeProject) {
      const stats = activeTables ? getStats(activeTables) : {total:0, completed:0, issues:0, percent:0};
      
      // Calculate remaining for Employee
      const remaining = stats.total - stats.completed;

      return (
          <div className="flex flex-col h-full space-y-4 animate-fade-in">
              <div className="glass-panel p-2 flex justify-between items-center sticky top-0 z-40 bg-white/60 backdrop-blur-xl shadow-sm">
                  <div className="flex items-center gap-2">
                    <button 
                        onClick={() => { setView('list'); setIsEditing(false); }} 
                        className="glass-button px-4 py-2 flex items-center gap-2 text-slate-700 bg-white/50 hover:bg-white/80 active:scale-95 transition-all shadow-sm"
                    >
                        <ArrowLeft size={18} strokeWidth={2.5} />
                        <span className="text-xs font-bold uppercase">Zpět</span>
                    </button>
                    {isEditing ? (
                        <input 
                            className="glass-input py-1 px-2 text-sm font-bold w-full max-w-[150px]" 
                            value={editForm.name} 
                            onChange={e => setEditForm({...editForm, name: e.target.value})}
                        />
                    ) : (
                        <h2 className="font-bold text-sm text-slate-800 truncate max-w-[150px] ml-1">{activeProject.name}</h2>
                    )}
                  </div>

                  <div className="flex gap-2">
                      {isAdmin && (
                          isEditing ? (
                              <>
                                <button onClick={handleSaveEdit} className="p-2 bg-green-500 text-white rounded-full shadow-lg"><Check size={16}/></button>
                                <button onClick={() => setIsEditing(false)} className="p-2 bg-slate-400 text-white rounded-full shadow-lg"><X size={16}/></button>
                              </>
                          ) : (
                              <button onClick={() => { setIsEditing(true); setEditForm({name: activeProject.name, location: activeProject.location}) }} className="glass-button p-2 text-slate-500 hover:text-blue-600 bg-white/30">
                                 <Pencil size={18} />
                              </button>
                          )
                      )}
                  </div>
              </div>
              
              {isEditing && isAdmin && (
                  <div className="glass-panel p-3">
                      <label className="text-xs font-bold text-slate-500">Lokace</label>
                      <input 
                        className="glass-input w-full mt-1" 
                        value={editForm.location} 
                        onChange={e => setEditForm({...editForm, location: e.target.value})} 
                      />
                  </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                  <div className="glass-panel p-3 flex flex-col items-center bg-green-500/10 border-green-200/30">
                    <CheckCircle className="text-green-600 mb-1" size={20} />
                    <span className="text-xl font-bold text-green-700">{stats.completed}</span>
                    <span className="text-[10px] uppercase font-bold text-green-600/70">Hotovo</span>
                  </div>
                  {/* For employees, show Remaining instead of Issues if needed, or keep same */}
                  <div className="glass-panel p-3 flex flex-col items-center bg-red-500/10 border-red-200/30">
                    <AlertCircle className="text-red-600 mb-1" size={20} />
                    <span className="text-xl font-bold text-red-700">{stats.issues}</span>
                    <span className="text-[10px] uppercase font-bold text-red-600/70">Problémy</span>
                  </div>
                  <div className="glass-panel p-3 flex flex-col items-center bg-white/30">
                    <LayoutList className="text-slate-600 mb-1" size={20} />
                    <span className="text-xl font-bold text-slate-700">{stats.total}</span>
                    <span className="text-[10px] uppercase font-bold text-slate-500">Celkem</span>
                  </div>
              </div>

              {!isAdmin && (
                  <div className="glass-panel px-4 py-2 bg-blue-500/10 border-blue-200/50">
                      <p className="text-xs font-bold text-blue-800 text-center">
                          Zbývá dokončit: {remaining} stolů
                      </p>
                  </div>
              )}

              {/* Canvas Container */}
              <div className="flex-1 overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/20">
                {activeTables && <CanvasMap tables={activeTables} onTableClick={toggleTableStatus} />}
              </div>
              
              <div className="glass-panel px-4 py-2 text-center">
                 <p className="text-xs text-slate-600 font-medium">Stav projektu: {stats.percent}%</p>
                 <div className="w-full bg-slate-200/50 rounded-full h-2 mt-1 overflow-hidden">
                    <div className="bg-gradient-to-r from-green-400 to-emerald-500 h-2 rounded-full transition-all duration-500" style={{ width: `${stats.percent}%` }}></div>
                 </div>
              </div>
          </div>
      )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-end px-2">
        <div>
          <h2 className="text-3xl font-bold text-white drop-shadow-md">Projekty</h2>
          <p className="text-white/80 text-sm font-medium">
             {isAdmin ? 'Správa výstavby (Admin)' : 'Moje Úkoly'}
          </p>
        </div>
        {isAdmin && (
            <button 
              className="glass-button bg-white/20 hover:bg-white/40 text-white w-10 h-10 flex items-center justify-center rounded-full" 
              onClick={() => setView('create')}>
              <Plus size={24} />
            </button>
        )}
      </div>

      {/* Filters & Search */}
      <div className="glass-panel p-2 flex gap-2">
         <div className="relative flex-1">
             <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
             <input 
                className="bg-transparent pl-9 pr-2 py-2 w-full text-sm outline-none text-slate-800 placeholder-slate-500"
                placeholder="Hledat projekt..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
             />
         </div>
         <select 
            className="bg-white/30 rounded-lg text-xs font-bold text-slate-700 px-2 outline-none border-l border-white/20"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
         >
             <option value="all">Vše</option>
             <option value="active">Běží</option>
             <option value="completed">Hotovo</option>
         </select>
      </div>
      
      {!filteredProjects || filteredProjects.length === 0 ? (
          <div className="glass-panel p-8 text-center text-slate-600">
            <p className="mb-4 opacity-70">Žádné projekty nenalezeny.</p>
            {projects && projects.length === 0 && isAdmin && (
                <button className="text-blue-600 font-bold" onClick={() => setView('create')}>Vytvořit první</button>
            )}
          </div>
      ) : (
          <div className="grid gap-4 pb-20">
              {filteredProjects.map(p => {
                  const pTables = allTables.filter(t => t.projectId === p.id);
                  const stats = getStats(pTables);

                  return (
                    <div 
                        key={p.id} 
                        onClick={() => { setActiveProject(p); setView('detail'); }} 
                        className="glass-panel p-5 cursor-pointer hover:bg-white/40 transition-all active:scale-[0.98] group relative overflow-hidden"
                    >
                        {/* Decorative gradient blob */}
                        <div className={`absolute -right-4 -top-4 w-20 h-20 rounded-full blur-2xl transition-all ${stats.percent === 100 ? 'bg-green-500/20 group-hover:bg-green-500/30' : 'bg-blue-500/20 group-hover:bg-blue-500/30'}`}></div>

                        <div className="flex justify-between items-start relative z-10">
                            <div>
                                <h3 className="font-bold text-lg text-slate-800">{p.name}</h3>
                                <div className="flex items-center text-slate-600 text-xs mt-1">
                                    <MapPin size={12} className="mr-1" />
                                    {p.location}
                                </div>
                            </div>
                            {isAdmin && (
                                <button 
                                    onClick={(e) => handleDeleteProject(e, p.id)}
                                    className="text-slate-400 hover:text-red-500 p-2 -mr-2 -mt-2 transition-colors z-20"
                                >
                                    <Trash2 size={16} />
                                </button>
                            )}
                        </div>
                        
                        <div className="mt-4">
                            <div className="flex justify-between text-[10px] text-slate-600 font-bold mb-1 uppercase">
                                <span>Progres</span>
                                <span>{stats.percent}%</span>
                            </div>
                            <div className="w-full bg-slate-200/50 rounded-full h-1.5 overflow-hidden">
                                <div className={`h-1.5 rounded-full transition-all duration-500 ${stats.percent === 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${stats.percent}%` }}></div>
                            </div>
                        </div>

                        <div className="mt-4 flex gap-2 relative z-10">
                            <span className="text-[10px] bg-slate-100/50 border border-slate-200/50 px-2 py-1 rounded-md text-slate-600">S: {p.tableCounts.small}</span>
                            <span className="text-[10px] bg-slate-100/50 border border-slate-200/50 px-2 py-1 rounded-md text-slate-600">M: {p.tableCounts.medium}</span>
                            <span className="text-[10px] bg-slate-100/50 border border-slate-200/50 px-2 py-1 rounded-md text-slate-600">L: {p.tableCounts.large}</span>
                        </div>
                    </div>
                  );
              })}
          </div>
      )}
    </div>
  );
};

export default ProjectManagement;