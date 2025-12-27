import { Dexie } from 'dexie';
import type { Table as DexieTable } from 'dexie';
import { Project, Table, TeamMember, AttendanceRecord, AccessLog, UserProfile } from './types';

export class MSTDatabase extends Dexie {
  projects!: DexieTable<Project, string>;
  projectTables!: DexieTable<Table, string>; // Renamed from 'tables' to avoid conflict
  team!: DexieTable<TeamMember, string>;
  attendance!: DexieTable<AttendanceRecord, string>;
  logs!: DexieTable<AccessLog, number>;
  users!: DexieTable<UserProfile, string>;

  constructor() {
    super('MST_DB');
    // Bump version to 5 to handle schema rename
    this.version(5).stores({
      projects: 'id, lastSynced',
      projectTables: 'id, projectId, status, completedBy',
      team: 'id, name, email, currentProjectId',
      attendance: 'id, memberId, date, synced',
      logs: '++id, timestamp, action',
      users: 'id, email, role'
    });
  }
}

export const db = new MSTDatabase();