import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { DateInterval } from './ctx';

interface CalendarDB extends DBSchema {
    intervals: {
        key: string; // date string (e.g., "Mon Jan 01 2024")
        value: {
            date: string;
            intervals: DateInterval[];
        };
    };
}

const DB_NAME = 'calendar-db';
const DB_VERSION = 1;
const STORE_NAME = 'intervals';

let dbInstance: IDBPDatabase<CalendarDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<CalendarDB>> {
    if (dbInstance) {
        return dbInstance;
    }

    dbInstance = await openDB<CalendarDB>(DB_NAME, DB_VERSION, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'date' });
            }
        },
    });

    return dbInstance;
}

export async function saveAllIntervals(calendar: Map<string, DateInterval[]>): Promise<void> {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    
    // Get all existing keys to determine what to delete
    const existingKeys = await db.getAllKeys(STORE_NAME);
    const currentKeys = new Set(calendar.keys());
    
    // Delete keys that are no longer in the calendar
    for (const key of existingKeys) {
        if (!currentKeys.has(key)) {
            await tx.store.delete(key);
        }
    }
    
    // Save or update all current intervals
    for (const [date, intervals] of calendar.entries()) {
        if (intervals.length > 0) {
            await tx.store.put({ date, intervals });
        } else {
            await tx.store.delete(date);
        }
    }
    
    await tx.done;
}

export async function getIntervals(date: string): Promise<DateInterval[] | undefined> {
    const db = await getDB();
    const record = await db.get(STORE_NAME, date);
    return record?.intervals;
}

export async function deleteIntervals(date: string): Promise<void> {
    const db = await getDB();
    await db.delete(STORE_NAME, date);
}

export async function getAllDates(): Promise<string[]> {
    const db = await getDB();
    const keys = await db.getAllKeys(STORE_NAME);
    return keys;
}

export async function getAllIntervals(): Promise<Map<string, DateInterval[]>> {
    const db = await getDB();
    const allRecords = await db.getAll(STORE_NAME);
    const map = new Map<string, DateInterval[]>();
    
    for (const record of allRecords) {
        // Parse dates from stored data
        const intervals = record.intervals.map(interval => ({
            ...interval,
            start: new Date(interval.start),
            end: interval.end ? new Date(interval.end) : null,
        }));
        map.set(record.date, intervals);
    }
    
    return map;
}

export async function clearAllIntervals(): Promise<void> {
    const db = await getDB();
    await db.clear(STORE_NAME);
}

// Migration function to move data from localStorage to IndexedDB
export async function migrateFromLocalStorage(): Promise<boolean> {
    const stored = localStorage.getItem("calendar");
    if (!stored) {
        return false; // No data to migrate
    }

    try {
        const db = await getDB();
        
        // Check if IndexedDB already has data - if so, migration already happened
        const existingKeys = await db.getAllKeys(STORE_NAME);
        if (existingKeys.length > 0) {
            console.log('IndexedDB already has data, skipping migration');
            // Clean up localStorage since migration was already done
            localStorage.removeItem("calendar");
            return false;
        }

        const obj = JSON.parse(stored) as Record<string, Array<{
            identifier: string;
            start: string | Date;
            end: string | Date | null;
            msg: string;
        }>>;
        
        // Start a transaction to write all data
        const tx = db.transaction(STORE_NAME, 'readwrite');
        
        for (const key in obj) {
            const intervals = obj[key].map((interval) => ({
                ...interval,
                start: new Date(interval.start),
                end: interval.end ? new Date(interval.end) : null,
            }));
            await tx.store.put({ date: key, intervals });
        }
        
        await tx.done;
        
        // Remove the old localStorage data after successful migration
        localStorage.removeItem("calendar");
        console.log('Successfully migrated calendar data from localStorage to IndexedDB');
        
        return true;
    } catch (e) {
        console.error('Failed to migrate calendar data from localStorage', e);
        return false;
    }
}
