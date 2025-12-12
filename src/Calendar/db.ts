/**
 * IndexedDB storage module for calendar data
 * 
 * This module provides a persistent storage solution using IndexedDB API
 * to replace the previous localStorage implementation. Benefits include:
 * - Better performance for large datasets
 * - Structured data storage with proper indexing
 * - Asynchronous API that doesn't block the main thread
 * - Larger storage capacity than localStorage
 * 
 * The database schema includes two object stores:
 * - 'tags': Stores unique tag/description strings with auto-incrementing IDs
 * - 'intervals': Stores time intervals with references to tags
 * 
 * Migration from localStorage is handled automatically on first load.
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { DateInterval } from './ctx';

interface Tag {
    id?: number;
    name: string;
}

interface IntervalRecord {
    id?: number;
    identifier: string;
    start: Date;
    end: Date | null;
    tagId: number | null; // Reference to tag
    date: string; // Date string for grouping (e.g., "Mon Jan 01 2024")
}

interface CalendarDB extends DBSchema {
    tags: {
        key: number;
        value: Tag;
        indexes: { 'by-name': string };
    };
    intervals: {
        key: number;
        value: IntervalRecord;
        indexes: { 'by-date': string; 'by-identifier': string };
    };
}

const DB_NAME = 'calendar-db';
const DB_VERSION = 2; // Increment version for schema change
const TAGS_STORE = 'tags';
const INTERVALS_STORE = 'intervals';

let dbInstance: IDBPDatabase<CalendarDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<CalendarDB>> {
    if (dbInstance) {
        return dbInstance;
    }

    dbInstance = await openDB<CalendarDB>(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion) {
            // Create tags store
            if (!db.objectStoreNames.contains(TAGS_STORE)) {
                const tagStore = db.createObjectStore(TAGS_STORE, { keyPath: 'id', autoIncrement: true });
                tagStore.createIndex('by-name', 'name', { unique: true });
            }
            
            // Create intervals store
            if (!db.objectStoreNames.contains(INTERVALS_STORE)) {
                const intervalStore = db.createObjectStore(INTERVALS_STORE, { keyPath: 'id', autoIncrement: true });
                intervalStore.createIndex('by-date', 'date', { unique: false });
                intervalStore.createIndex('by-identifier', 'identifier', { unique: false });
            }
            
            // Migration from old schema (version 1) to new schema (version 2)
            if (oldVersion === 1 && db.objectStoreNames.contains('intervals')) {
                // Delete old store - data will be migrated from localStorage
                db.deleteObjectStore('intervals');
                // Recreate with new schema
                const intervalStore = db.createObjectStore(INTERVALS_STORE, { keyPath: 'id', autoIncrement: true });
                intervalStore.createIndex('by-date', 'date', { unique: false });
                intervalStore.createIndex('by-identifier', 'identifier', { unique: false });
            }
        },
    });

    return dbInstance;
}

// Helper function to get or create a tag
async function getOrCreateTag(db: IDBPDatabase<CalendarDB>, tagName: string): Promise<number> {
    if (!tagName) {
        return 0; // Use 0 for empty tags
    }
    
    const tx = db.transaction(TAGS_STORE, 'readwrite');
    const index = tx.store.index('by-name');
    
    // Try to find existing tag
    const existing = await index.get(tagName);
    if (existing?.id) {
        return existing.id;
    }
    
    // Create new tag
    const id = await tx.store.add({ name: tagName });
    await tx.done;
    
    return id as number;
}

// Helper function to get tag name by ID
async function getTagName(db: IDBPDatabase<CalendarDB>, tagId: number | null): Promise<string> {
    if (!tagId || tagId === 0) {
        return '';
    }
    
    const tag = await db.get(TAGS_STORE, tagId);
    return tag?.name || '';
}

export async function saveAllIntervals(calendar: Map<string, DateInterval[]>): Promise<void> {
    const db = await getDB();
    
    // Get all existing interval records
    const existingIntervals = await db.getAll(INTERVALS_STORE);
    const existingByIdentifier = new Map(
        existingIntervals.map(i => [i.identifier, i])
    );
    
    // Track which identifiers are still in use
    const currentIdentifiers = new Set<string>();
    
    // Process all intervals
    for (const [dateStr, intervals] of calendar.entries()) {
        for (const interval of intervals) {
            currentIdentifiers.add(interval.identifier);
            
            // Get or create tag
            const tagId = interval.msg ? await getOrCreateTag(db, interval.msg) : null;
            
            const intervalRecord: IntervalRecord = {
                identifier: interval.identifier,
                start: interval.start,
                end: interval.end,
                tagId,
                date: dateStr,
            };
            
            const existing = existingByIdentifier.get(interval.identifier);
            if (existing) {
                // Update existing record
                intervalRecord.id = existing.id;
            }
            
            await db.put(INTERVALS_STORE, intervalRecord);
        }
    }
    
    // Delete intervals that no longer exist
    for (const existing of existingIntervals) {
        if (!currentIdentifiers.has(existing.identifier)) {
            await db.delete(INTERVALS_STORE, existing.id!);
        }
    }
}

export async function getIntervals(date: string): Promise<DateInterval[] | undefined> {
    const db = await getDB();
    const index = db.transaction(INTERVALS_STORE).store.index('by-date');
    const records = await index.getAll(date);
    
    if (records.length === 0) {
        return undefined;
    }
    
    // Convert records back to DateInterval format
    const intervals: DateInterval[] = [];
    for (const record of records) {
        const tagName = await getTagName(db, record.tagId);
        intervals.push({
            identifier: record.identifier,
            start: new Date(record.start),
            end: record.end ? new Date(record.end) : null,
            msg: tagName,
        });
    }
    
    return intervals;
}

export async function deleteIntervals(date: string): Promise<void> {
    const db = await getDB();
    const tx = db.transaction(INTERVALS_STORE, 'readwrite');
    const index = tx.store.index('by-date');
    const records = await index.getAll(date);
    
    for (const record of records) {
        await tx.store.delete(record.id!);
    }
    
    await tx.done;
}

export async function getAllDates(): Promise<string[]> {
    const db = await getDB();
    const allRecords = await db.getAll(INTERVALS_STORE);
    const dates = new Set(allRecords.map(r => r.date));
    return Array.from(dates);
}

export async function getAllIntervals(): Promise<Map<string, DateInterval[]>> {
    const db = await getDB();
    const allRecords = await db.getAll(INTERVALS_STORE);
    const map = new Map<string, DateInterval[]>();
    
    // Group by date
    for (const record of allRecords) {
        if (!map.has(record.date)) {
            map.set(record.date, []);
        }
        
        const tagName = await getTagName(db, record.tagId);
        map.get(record.date)!.push({
            identifier: record.identifier,
            start: new Date(record.start),
            end: record.end ? new Date(record.end) : null,
            msg: tagName,
        });
    }
    
    return map;
}

export async function clearAllIntervals(): Promise<void> {
    const db = await getDB();
    await db.clear(INTERVALS_STORE);
    await db.clear(TAGS_STORE);
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
        const existingIntervals = await db.getAll(INTERVALS_STORE);
        if (existingIntervals.length > 0) {
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
        
        // Migrate data to new two-table structure
        for (const dateStr in obj) {
            const intervals = obj[dateStr];
            
            for (const interval of intervals) {
                // Get or create tag
                const tagId = interval.msg ? await getOrCreateTag(db, interval.msg) : null;
                
                // Create interval record
                const intervalRecord: IntervalRecord = {
                    identifier: interval.identifier,
                    start: new Date(interval.start),
                    end: interval.end ? new Date(interval.end) : null,
                    tagId,
                    date: dateStr,
                };
                
                await db.add(INTERVALS_STORE, intervalRecord);
            }
        }
        
        // Remove the old localStorage data after successful migration
        localStorage.removeItem("calendar");
        console.log('Successfully migrated calendar data from localStorage to IndexedDB with normalized schema');
        
        return true;
    } catch (e) {
        console.error('Failed to migrate calendar data from localStorage', e);
        return false;
    }
}

// Export function to get all tags (useful for UI)
export async function getAllTags(): Promise<Tag[]> {
    const db = await getDB();
    return await db.getAll(TAGS_STORE);
}
