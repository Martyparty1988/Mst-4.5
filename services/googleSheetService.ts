import LZString from 'lz-string';
import { db } from '../db';
import { SyncPayload } from '../types';

// In a real app, this URL comes from the deployed Google Apps Script Web App
const SCRIPT_URL = localStorage.getItem('MST_SCRIPT_URL') || '';

export const setScriptUrl = (url: string) => {
  localStorage.setItem('MST_SCRIPT_URL', url);
};

export const getScriptUrl = () => {
  return localStorage.getItem('MST_SCRIPT_URL') || '';
};

export const syncData = async (): Promise<{ success: boolean; message: string }> => {
  const url = getScriptUrl();
  if (!url) {
    return { success: false, message: 'Není nastavena URL Google Apps Scriptu.' };
  }

  try {
    // 1. Gather all data from IndexedDB
    const projects = await db.projects.toArray();
    const tables = await db.projectTables.toArray();
    const team = await db.team.toArray();
    const attendance = await db.attendance.toArray();

    const payload: SyncPayload = {
      projects,
      tables,
      team,
      attendance
    };

    // 2. Compress data
    const jsonString = JSON.stringify(payload);
    const compressed = LZString.compressToEncodedURIComponent(jsonString);

    // 3. Send to Google Sheets
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ data: compressed }), 
    });

    const result = await response.json();

    if (result.status === 'success') {
      // Update sync timestamps locally
      const now = Date.now();
      await db.projects.where('id').anyOf(projects.map(p => p.id)).modify({ lastSynced: now });
      await db.attendance.where('id').anyOf(attendance.map(a => a.id)).modify({ synced: true });
      return { success: true, message: 'Synchronizace proběhla úspěšně.' };
    } else {
      return { success: false, message: 'Chyba serveru: ' + result.message };
    }

  } catch (error) {
    console.error('Sync error:', error);
    return { success: false, message: 'Chyba při synchronizaci. Zkontrolujte připojení.' };
  }
};

export const fetchDataFromCloud = async (): Promise<{ success: boolean; message: string }> => {
    const url = getScriptUrl();
    if (!url) return { success: false, message: 'Chybí URL' };

    try {
        // GET Request to GAS
        const response = await fetch(url, { method: 'GET' });
        const result = await response.json();

        if (result.status === 'success' && result.data) {
             const success = await importData(result.data);
             if (success) {
                 return { success: true, message: 'Data stažena.' };
             } else {
                 return { success: false, message: 'Chyba dekomprese.' };
             }
        }
        return { success: false, message: 'Žádná data.' };
    } catch (e) {
        console.error(e);
        return { success: false, message: 'Chyba sítě.' };
    }
};

export const importData = async (compressedData: string) => {
    // Decompress and populate DB
    try {
        const json = LZString.decompressFromEncodedURIComponent(compressedData);
        if(!json) throw new Error("Decompression failed");
        const data: SyncPayload = JSON.parse(json);
        
        await db.transaction('rw', db.projects, db.projectTables, db.team, db.attendance, async () => {
            // Strategy: Overwrite local data with cloud data
            // In a real app, you might want a smarter merge strategy
            await db.projects.clear();
            await db.projectTables.clear();
            await db.team.clear();
            await db.attendance.clear();

            if (data.projects) await db.projects.bulkPut(data.projects);
            if (data.tables) await db.projectTables.bulkPut(data.tables);
            if (data.team) await db.team.bulkPut(data.team);
            if (data.attendance) await db.attendance.bulkPut(data.attendance);
        });
        return true;
    } catch (e) {
        console.error(e);
        return false;
    }
}