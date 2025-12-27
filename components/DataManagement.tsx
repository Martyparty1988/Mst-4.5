import React, { useState, useRef, useEffect } from 'react';
import { db } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
    Database, CloudLightning, Save, Shield, 
    Download, Upload, FileJson, Trash2, 
    Lock, Unlock, History, RefreshCw, LogOut, Clock
} from 'lucide-react';
import { setScriptUrl, getScriptUrl, syncData, fetchDataFromCloud } from '../services/googleSheetService';
import LZString from 'lz-string';
import { UserProfile } from '../types';

interface Props {
    user: UserProfile;
    onLogout: () => void;
}

const DataManagement: React.FC<Props> = ({ user, onLogout }) => {
    const [scriptUrl, setLocalScriptUrl] = useState(getScriptUrl());
    const [syncStatus, setSyncStatus] = useState('');
    const [isEncrypted, setIsEncrypted] = useState(localStorage.getItem('MST_ENCRYPTION') === 'true');
    const [importInterval, setImportInterval] = useState(localStorage.getItem('MST_AUTO_IMPORT_INTERVAL') || '0');
    
    // Stats Live Queries
    const projectCount = useLiveQuery(() => db.projects.count());
    const tableCount = useLiveQuery(() => db.projectTables.count());
    const teamCount = useLiveQuery(() => db.team.count());
    const logs = useLiveQuery(() => db.logs.orderBy('timestamp').reverse().limit(10).toArray());

    const fileInputRef = useRef<HTMLInputElement>(null);
    const isAdmin = user.role === 'admin';

    const logAction = async (action: string, details: string) => {
        await db.logs.add({
            action,
            details,
            timestamp: Date.now(),
            user: user.name
        });
    };

    const handleSync = async () => {
        setSyncStatus('Odesílám...');
        await logAction('SYNC_START', 'Manual push initiated');
        const result = await syncData();
        setSyncStatus(result.success ? 'Hotovo' : 'Chyba');
        await logAction('SYNC_END', result.message);
        setTimeout(() => setSyncStatus(''), 3000);
    };
    
    const handleManualImport = async () => {
        if (!isAdmin) return;
        setSyncStatus('Stahuji...');
        const result = await fetchDataFromCloud();
        setSyncStatus(result.success ? 'Staženo' : 'Chyba');
        await logAction('IMPORT_CLOUD', result.message);
        setTimeout(() => setSyncStatus(''), 3000);
    }

    const saveSettings = () => {
        if (!isAdmin) return;
        setScriptUrl(scriptUrl);
        localStorage.setItem('MST_AUTO_IMPORT_INTERVAL', importInterval);
        logAction('CONFIG_UPDATE', `Backend URL or Interval (${importInterval}min) updated`);
        alert('Nastavení uloženo');
    };

    const toggleEncryption = () => {
        if (!isAdmin) return;
        const newState = !isEncrypted;
        setIsEncrypted(newState);
        localStorage.setItem('MST_ENCRYPTION', String(newState));
        logAction('SECURITY_CHANGE', `Encryption ${newState ? 'Enabled' : 'Disabled'}`);
    };

    const handleExport = async () => {
        if (!isAdmin) return;
        try {
            const projects = await db.projects.toArray();
            const tables = await db.projectTables.toArray();
            const team = await db.team.toArray();
            const attendance = await db.attendance.toArray();

            const payload = { projects, tables, team, attendance, version: 1, exportedAt: Date.now() };
            const jsonString = JSON.stringify(payload);
            
            // If encryption "enabled", we mock it by just compressing it (real encryption needs password input)
            const finalData = isEncrypted ? LZString.compressToEncodedURIComponent(jsonString) : jsonString;
            const fileName = `mst_backup_${new Date().toISOString().slice(0,10)}${isEncrypted ? '.mst' : '.json'}`;

            const blob = new Blob([finalData], { type: 'application/json' });
            const href = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = href;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            logAction('EXPORT', `Backup created: ${fileName}`);
        } catch (e) {
            console.error(e);
            alert('Chyba při exportu');
        }
    };

    const handleImportTrigger = () => {
        if (!isAdmin) return;
        fileInputRef.current?.click();
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const content = e.target?.result as string;
                let data;
                
                // Simple check if compressed
                if (content.startsWith('{') || content.startsWith('[')) {
                    data = JSON.parse(content);
                } else {
                    const decompressed = LZString.decompressFromEncodedURIComponent(content);
                    if (!decompressed) throw new Error("Nelze dekomprimovat/dešifrovat soubor.");
                    data = JSON.parse(decompressed);
                }

                if (window.confirm(`Obnovit data ze zálohy? (Projekty: ${data.projects?.length || 0}) \nPOZOR: Přepíše současná data!`)) {
                     await db.transaction('rw', db.projects, db.projectTables, db.team, db.attendance, async () => {
                        await db.projects.clear();
                        await db.projectTables.clear();
                        await db.team.clear();
                        await db.attendance.clear();

                        if(data.projects) await db.projects.bulkAdd(data.projects);
                        if(data.tables) await db.projectTables.bulkAdd(data.tables);
                        if(data.team) await db.team.bulkAdd(data.team);
                        if(data.attendance) await db.attendance.bulkAdd(data.attendance);
                    });
                    logAction('IMPORT', 'Data restored from backup file');
                    alert('Data úspěšně obnovena.');
                }
            } catch (err) {
                alert('Chyba importu: Neplatný formát souboru.');
                console.error(err);
            }
        };
        reader.readAsText(file);
        // Reset input
        event.target.value = '';
    };

    const handleClearLogs = async () => {
        if(!isAdmin) return;
        if(window.confirm('Smazat historii logů?')) {
            await db.logs.clear();
        }
    }

    const handleLogout = () => {
        if(window.confirm('Odhlásit se?')) {
            logAction('LOGOUT', 'User logged out');
            onLogout();
        }
    }

    return (
        <div className="space-y-6 pb-20 animate-fade-in">
            
            {/* 1. Storage Dashboard - Visible to all but reduced for employees */}
            <div className="glass-panel p-5">
                <div className="flex items-center gap-3 mb-4 border-b border-white/20 pb-3">
                    <Database className="text-blue-600" size={24} />
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">Profil & Data</h3>
                        <p className="text-xs text-slate-500">{user.email} ({user.role})</p>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/40 p-3 rounded-xl border border-white/30 flex flex-col items-center">
                        <span className="text-2xl font-bold text-slate-700">{projectCount || 0}</span>
                        <span className="text-[10px] uppercase font-bold text-slate-500">Projektů</span>
                    </div>
                    {/* Show simple stats for employees */}
                    <div className="bg-white/40 p-3 rounded-xl border border-white/30 flex flex-col items-center">
                        <span className="text-2xl font-bold text-slate-700">{teamCount || 0}</span>
                        <span className="text-[10px] uppercase font-bold text-slate-500">Tým</span>
                    </div>
                </div>
            </div>

            {/* ADMIN ONLY SECTIONS */}
            {isAdmin ? (
                <>
                    {/* 2. Backup & Restore */}
                    <div className="glass-panel p-5">
                        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <Save size={20} className="text-orange-500"/> Zálohování (Admin)
                        </h3>
                        <div className="flex gap-3">
                            <button onClick={handleExport} className="flex-1 glass-button py-3 flex flex-col items-center gap-1 hover:bg-white/50">
                                <Download size={20} className="text-blue-600" />
                                <span className="text-xs font-bold text-slate-700">Exportovat</span>
                            </button>
                            <button onClick={handleImportTrigger} className="flex-1 glass-button py-3 flex flex-col items-center gap-1 hover:bg-white/50">
                                <Upload size={20} className="text-green-600" />
                                <span className="text-xs font-bold text-slate-700">Importovat</span>
                            </button>
                            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".json,.mst" />
                        </div>
                    </div>

                    {/* 3. Cloud Configuration */}
                    <div className="glass-panel p-5 space-y-3">
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                            <CloudLightning size={18} className="text-purple-600" /> Cloud Sync
                        </div>
                        
                        <div className="relative">
                            <input 
                                type="text" 
                                className="glass-input w-full pl-3 pr-10 py-3 text-xs font-mono bg-white/50 focus:bg-white/80 transition-colors"
                                value={scriptUrl}
                                onChange={(e) => setLocalScriptUrl(e.target.value)}
                                placeholder="https://script.google.com/..."
                            />
                        </div>
                        
                        <div className="flex items-center justify-between py-2 border-b border-white/20">
                            <div className="flex items-center gap-2">
                                <Clock size={16} className="text-slate-500"/>
                                <span className="text-sm font-medium text-slate-600">Auto Import:</span>
                            </div>
                            <select 
                                value={importInterval}
                                onChange={(e) => setImportInterval(e.target.value)}
                                className="glass-input py-1 px-2 text-xs font-bold w-28"
                            >
                                <option value="0">Vypnuto</option>
                                <option value="1">1 min (Test)</option>
                                <option value="5">5 minut</option>
                                <option value="60">1 hodina</option>
                            </select>
                        </div>

                        <div className="flex gap-2 mt-2">
                            <button onClick={saveSettings} className="glass-button-primary flex-1 py-2 text-xs flex justify-center items-center gap-2 shadow-lg">
                                <Save size={14} /> Uložit
                            </button>
                            <button onClick={handleManualImport} className="glass-button flex-1 py-2 text-xs flex justify-center items-center gap-2 bg-white/40">
                                <Download size={14} /> Import
                            </button>
                        </div>
                    </div>

                    {/* 4. Security & Logs */}
                    <div className="glass-panel p-5">
                        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <Shield size={20} className="text-red-500"/> Bezpečnost
                        </h3>

                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                {isEncrypted ? <Lock size={18} className="text-green-600"/> : <Unlock size={18} className="text-slate-400"/>}
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold text-slate-700">Šifrování dat</span>
                                    <span className="text-[10px] text-slate-500">AES-256 (Simulace)</span>
                                </div>
                            </div>
                            <button 
                                onClick={toggleEncryption}
                                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${isEncrypted ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}
                            >
                                {isEncrypted ? 'Zapnuto' : 'Vypnuto'}
                            </button>
                        </div>

                        <div className="bg-black/5 rounded-xl p-3 overflow-hidden">
                            <div className="flex justify-between items-center mb-2">
                                <h4 className="text-xs font-bold text-slate-600 flex items-center gap-1"><History size={12}/> Log Aktivit</h4>
                                <button onClick={handleClearLogs} className="text-[10px] text-red-500 hover:text-red-700 flex items-center gap-0.5"><Trash2 size={10}/> Smazat</button>
                            </div>
                            <div className="max-h-32 overflow-y-auto space-y-2 pr-1">
                                {logs?.map(log => (
                                    <div key={log.id} className="text-[10px] border-l-2 border-blue-400 pl-2 py-0.5">
                                        <span className="font-mono opacity-50 block">{new Date(log.timestamp).toLocaleString()}</span>
                                        <span className="font-bold text-slate-700">{log.action}: </span>
                                        <span className="text-slate-600">{log.details}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </>
            ) : (
                // Employee only sees basic manual sync
                <div className="glass-panel p-5 text-center">
                    <p className="text-sm text-slate-600 mb-3">Jste přihlášen jako zaměstnanec.</p>
                    <button onClick={handleSync} className="glass-button w-full py-2 text-xs flex justify-center items-center gap-2 bg-white/40">
                        <RefreshCw size={14} className={syncStatus ? 'animate-spin' : ''} /> {syncStatus || 'Manuální Synchronizace'}
                    </button>
                </div>
            )}

            <div className="glass-panel p-5">
                 <button onClick={handleLogout} className="glass-button w-full py-3 text-red-600 border-red-200 hover:bg-red-50 flex items-center justify-center gap-2">
                    <LogOut size={16} /> Odhlásit se
                </button>
            </div>

            <div className="pt-2 text-center">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 opacity-60">
                MST Solar Tracker v1.2
              </p>
            </div>
        </div>
    );
};

export default DataManagement;