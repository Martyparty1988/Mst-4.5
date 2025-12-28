import Dexie, { type Table as DexieTable } from 'dexie';
import { Project, Table, TeamMember, AttendanceRecord, AccessLog, UserProfile, Tool, ChatMessage, DailyReport } from './types';

export class MSTDatabase extends Dexie {
  projects!: DexieTable<Project, string>;
  projectTables!: DexieTable<Table, string>; // Renamed from 'tables' to avoid conflict
  team!: DexieTable<TeamMember, string>;
  attendance!: DexieTable<AttendanceRecord, string>;
  tools!: DexieTable<Tool, string>;
  logs!: DexieTable<AccessLog, number>;
  users!: DexieTable<UserProfile, string>;
  chat!: DexieTable<ChatMessage, string>;
  dailyReports!: DexieTable<DailyReport, string>;

  constructor() {
    super('MST_DB');
    // Bump version to 6 to handle new tables
    this.version(6).stores({
      projects: 'id, lastSynced',
      projectTables: 'id, projectId, status, completedBy',
      team: 'id, name, email, currentProjectId',
      attendance: 'id, memberId, date, synced',
      logs: '++id, timestamp, action',
      users: 'id, email, role',
      tools: 'id, status, borrowedBy',
      chat: 'id, timestamp, senderId, projectId, isRead',
      dailyReports: 'id, date, generatedAt'
    });
  }
}

export const db = new MSTDatabase();