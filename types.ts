
export enum TableStatus {
  Pending = 0,
  Completed = 1,
  Issue = 2
}

export enum TableType {
  Small = 'S',
  Medium = 'M',
  Large = 'L'
}

export type UserRole = 'admin' | 'employee';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  photoUrl?: string;
}

export interface Table {
  id: string; // usually `${projectId}_${index}`
  projectId: string;
  index: number;
  type: TableType;
  status: TableStatus;
  x: number; // grid coordinate X
  y: number; // grid coordinate Y
  completedBy?: string; // Member ID who installed it
  completedAt?: number; // Timestamp
}

export interface Project {
  id: string;
  name: string;
  location: string;
  tableCounts: {
    small: number;
    medium: number;
    large: number;
  };
  createdDate: number;
  lastSynced: number;
  tablesGenerated: boolean;
  assignedEmployees?: string[]; // List of TeamMember IDs
}

export interface TeamMember {
  id: string;
  name: string;
  email?: string; // Link to login
  role: string; // Job title (Installer, etc.)
  hourlyRate: number;
  isActive: boolean;
  currentProjectId?: string; // Assigned project
  phone?: string;
  notes?: string;
}

export interface AttendanceRecord {
  id: string; // uuid
  memberId: string;
  date: string; // ISO date YYYY-MM-DD
  checkIn: number; // timestamp
  checkOut?: number; // timestamp
  type: 'Work' | 'Sick' | 'Vacation';
  synced: boolean;
}

export interface AccessLog {
    id?: number;
    action: string;
    details: string;
    timestamp: number;
    user: string;
}

// Interfaces for Google Sheets Sync
export interface SyncPayload {
  projects: Project[];
  tables: Table[]; // Only send updated tables in real app to save bandwidth
  team: TeamMember[];
  attendance: AttendanceRecord[];
}
