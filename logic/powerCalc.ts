import { TableType } from '../types';

// DOMAIN RULES
export const PANEL_POWER_W = 700;
export const PANELS_PER_STRING = 28;

// Derived Constants
// 1 String = 28 * 700W = 19600W = 19.6 kW
export const STRING_POWER_KW = (PANEL_POWER_W * PANELS_PER_STRING) / 1000;

export const STRINGS_PER_TABLE: Record<TableType, number> = {
    [TableType.Small]: 1,
    [TableType.Medium]: 1.5,
    [TableType.Large]: 2
};

export interface PowerStats {
    strings: number;
    panels: number;
    kwp: number;
    mw: number;
}

/**
 * Calculates power stats for a specific table type.
 */
export const calcTableStats = (type: TableType): PowerStats => {
    // Default to Small if type is undefined or invalid to avoid crashes, though type should be strict
    const strings = STRINGS_PER_TABLE[type] || 1;
    const panels = strings * PANELS_PER_STRING;
    const kwp = (panels * PANEL_POWER_W) / 1000;
    const mw = kwp / 1000;
    return { strings, panels, kwp, mw };
};

/**
 * Calculates aggregate stats for a project based on its table counts.
 */
export const calcProjectStats = (counts: { small: number; medium: number; large: number }): PowerStats => {
    let totalStrings = 0;
    
    totalStrings += (counts.small || 0) * STRINGS_PER_TABLE[TableType.Small];
    totalStrings += (counts.medium || 0) * STRINGS_PER_TABLE[TableType.Medium];
    totalStrings += (counts.large || 0) * STRINGS_PER_TABLE[TableType.Large];
    
    const panels = totalStrings * PANELS_PER_STRING;
    const kwp = (panels * PANEL_POWER_W) / 1000;
    const mw = kwp / 1000;
    
    return { strings: totalStrings, panels, kwp, mw };
};

/**
 * Helper to get just the kWp for a single table instance.
 */
export const calcSingleTableKwp = (type: TableType): number => {
    return calcTableStats(type).kwp;
};