import React, { useState, useEffect } from 'react';
import ProjectManagement from './components/ProjectManagement';
import TeamManagement from './components/TeamManagement';
import DataManagement from './components/DataManagement';
import Login from './components/Login';
import { syncData, fetchDataFromCloud } from './services/googleSheetService';
import { LayoutGrid, Users, Database, CloudLightning, Loader2 } from 'lucide-react';
import { db } from './db';
import { UserProfile } from './types';

function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [page, setPage] = useState<'projects' | 'team' | 'data'>('projects');
  const [syncStatus, setSyncStatus] = useState('');
  const [isAutoSyncing, setIsAutoSyncing] = useState(false);

  // Restore session
  useEffect(() => {
    const restoreSession = async () => {
        const users = await db.users.toArray();
        if (users.length > 0) {
            // Restore the first user found for demo
            setCurrentUser(users[0]);
        }
    };
    restoreSession();
  }, []);

  const handleLogin = (user: UserProfile) => {
      setCurrentUser(user);
      setPage('projects');
  };

  const handleLogout = async () => {
      await db.users.clear();
      setCurrentUser(null);
  };

  const handleSync = async () => {
    setSyncStatus('Sync...');
    const result = await syncData();
    setSyncStatus(result.success ? 'Hotovo' : 'Chyba');
    setTimeout(() => setSyncStatus(''), 3000);
  };

  // Background Auto-Import Logic (Only if Admin)
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'admin') return;

    const checkAutoImport = async () => {
        // Read directly from LS to avoid stale closures
        const intervalMinStr = localStorage.getItem('MST_AUTO_IMPORT_INTERVAL');
        const intervalMin = intervalMinStr ? parseInt(intervalMinStr) : 0;
        
        if (intervalMin === 0) return;

        const lastImportStr = localStorage.getItem('MST_LAST_AUTO_IMPORT');
        const lastImport = lastImportStr ? parseInt(lastImportStr) : 0;
        const now = Date.now();
        const elapsedMinutes = (now - lastImport) / 60000;

        // Check conditions: Internet Online AND Time elapsed
        if (navigator.onLine && elapsedMinutes >= intervalMin && !isAutoSyncing) {
            console.log('[MST] Auto-Import Triggered');
            setIsAutoSyncing(true);
            try {
                const result = await fetchDataFromCloud();
                if (result.success) {
                    localStorage.setItem('MST_LAST_AUTO_IMPORT', now.toString());
                    await db.logs.add({
                        action: 'AUTO_IMPORT',
                        details: 'Background fetch success',
                        timestamp: now,
                        user: 'System'
                    });
                }
            } catch (e) {
                console.error('[MST] Auto-import failed', e);
            } finally {
                setIsAutoSyncing(false);
            }
        }
    };

    // Check every 30 seconds
    const intervalId = setInterval(checkAutoImport, 30000);
    return () => clearInterval(intervalId);
  }, [isAutoSyncing, currentUser]);

  if (!currentUser) {
      return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen flex flex-col font-sans text-slate-800">
      
      {/* iOS Glass Header */}
      <header className="sticky top-0 z-50 glass-panel border-t-0 border-l-0 border-r-0 rounded-none px-6 py-4 flex justify-between items-center bg-white/20 backdrop-blur-xl shadow-sm">
        <div className="flex items-center gap-2">
           <img 
            src={currentUser.photoUrl} 
            alt="User" 
            className="w-8 h-8 rounded-full border border-white shadow-sm"
           />
          <div className="flex flex-col">
              <h1 className="font-bold text-sm tracking-tight text-white drop-shadow-md leading-none">MST</h1>
              <span className="text-[10px] text-white/80 font-bold uppercase">{currentUser.role === 'admin' ? 'Admin' : 'Tým'}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
            {isAutoSyncing && <Loader2 size={16} className="animate-spin text-blue-600" />}
            <button 
            onClick={handleSync}
            className="glass-button px-3 py-1.5 text-xs flex items-center gap-1 text-slate-800 bg-white/50 hover:bg-white/70 active:scale-95 transition-transform">
            <CloudLightning size={14} />
            {syncStatus || 'Sync'}
            </button>
        </div>
      </header>

      {/* Main Tab Navigation (Top Segmented Control) */}
      <div className="px-4 mt-4 sticky top-[72px] z-40">
        <div className="glass-panel p-1.5 flex justify-between items-center shadow-lg bg-white/30 backdrop-blur-2xl">
           <button 
              onClick={() => setPage('projects')}
              className={`flex-1 flex items-center justify-center py-2.5 rounded-xl transition-all duration-300 gap-2 ${page === 'projects' ? 'bg-white shadow-md text-blue-600 scale-[1.02]' : 'text-slate-600 hover:bg-white/20'}`}>
              <LayoutGrid size={18} strokeWidth={2.5} />
              <span className="text-xs font-bold uppercase tracking-wide">Projekty</span>
           </button>
           <button 
              onClick={() => setPage('team')}
              className={`flex-1 flex items-center justify-center py-2.5 rounded-xl transition-all duration-300 gap-2 ${page === 'team' ? 'bg-white shadow-md text-blue-600 scale-[1.02]' : 'text-slate-600 hover:bg-white/20'}`}>
              <Users size={18} strokeWidth={2.5} />
              <span className="text-xs font-bold uppercase tracking-wide">Tým</span>
           </button>
           <button 
              onClick={() => setPage('data')}
              className={`flex-1 flex items-center justify-center py-2.5 rounded-xl transition-all duration-300 gap-2 ${page === 'data' ? 'bg-white shadow-md text-blue-600 scale-[1.02]' : 'text-slate-600 hover:bg-white/20'}`}>
              <Database size={18} strokeWidth={2.5} />
              <span className="text-xs font-bold uppercase tracking-wide">Data</span>
           </button>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 p-4 w-full max-w-lg mx-auto mb-6">
        {page === 'projects' && <ProjectManagement user={currentUser} />}
        {page === 'team' && <TeamManagement user={currentUser} />}
        {page === 'data' && <DataManagement user={currentUser} onLogout={handleLogout} />}
      </main>
    </div>
  );
}

export default App;