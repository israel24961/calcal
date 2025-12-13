import { createContext, useState, useEffect } from 'react';
import { getAllIntervals, saveAllIntervals, migrateFromLocalStorage, getAllTags } from './db';

export interface DateInterval {
    identifier: string;
    start: Date;
    end: Date | null;
    msg: string;
    // TODO use library
}

interface CalendarContextType {
    addInterval(dateInterval: DateInterval): void;
    updateInterval(dateInterval: DateInterval): string | null;
    stopInterval(dateInterval: DateInterval): string | null;
    resumeInterval(dateInterval: DateInterval): string | null;
    getIntervals(date: Date): DateInterval[];
    getDates(): Date[];
    deleteInterval(dateInterval: DateInterval): string | null;
    getDescriptions(): Promise<string[]>;
    setIsStopLastIntervalOnAdd(value: boolean): void;
    getIsStopLastIntervalOnAdd(): boolean;
    showingDate: Date;
    setShowingDate(date: Date): void;
}

export const CalendarContext = createContext<CalendarContextType>({
    getIntervals: () => [],
    stopInterval: () => null,
    getDates: () => [],
    addInterval: () => { },
    updateInterval: () => null,
    resumeInterval: () => null,
    deleteInterval: () => null,
    getDescriptions: async () => [],
    setIsStopLastIntervalOnAdd: () => { },
    getIsStopLastIntervalOnAdd: () => true,
    showingDate: new Date(),
    setShowingDate: () => { },
})

export const CalendarProvider = ({ children }: any) => {
    const [calendar, setCalendar] = useState<Map<string, DateInterval[]>>(new Map());
    const [isLoading, setIsLoading] = useState(true);

    // Load calendar from IndexedDB on mount
    useEffect(() => {
        const loadCalendar = async () => {
            try {
                // First, try to migrate data from localStorage if it exists
                await migrateFromLocalStorage();
                
                // Then load all data from IndexedDB
                const data = await getAllIntervals();
                setCalendar(data);
                console.log('Calendar loaded from IndexedDB');
            } catch (e) {
                console.error('Failed to load calendar from IndexedDB', e);
            } finally {
                setIsLoading(false);
            }
        };
        
        loadCalendar();
    }, []);

    // Save calendar to IndexedDB whenever it changes
    useEffect(() => {
        if (isLoading) {
            return; // Don't save during initial load
        }

        const saveCalendar = async () => {
            try {
                // Save all intervals in a single transaction
                await saveAllIntervals(calendar);
                console.log('Calendar saved to IndexedDB');
            } catch (e) {
                console.error('Failed to save calendar to IndexedDB', e);
            }
        };

        saveCalendar();
    }, [calendar, isLoading]);

    const [isStopLastIntervalOnAdd, setIsStopLastIntervalOnAdd] = useState<boolean>(true);

    const addIntervalCalendar = (dateInterval: DateInterval) => {
        // Check intervals with null end date
        const nowDate = showingDate;
        if (isStopLastIntervalOnAdd) {
            console.log('Checking for intervals with no end date before adding new interval');
            const currentIntervals = getIntervals(calendar, dateInterval.start || nowDate);
            console.log('Current intervals for date', dateInterval.start || nowDate, ':', currentIntervals);
            let hasBeenModified = false;
            for (let i = 0; i < currentIntervals.length; i++) {
                const interval = currentIntervals[i];
                console.log('Checking interval', interval.identifier, 'with end date', interval.end);
                if (!interval.end) {
                    console.log('Stopping interval [', interval.identifier, '] at', cropDateToHoursMinutes(nowDate));
                    // If there is an interval with no end date, stop adding new intervals
                    const intervalUpdated = { ...interval, end: cropDateToHoursMinutes(nowDate) };
                    // Update the existing interval with the current 
                    currentIntervals[i] = intervalUpdated;
                    hasBeenModified = true;
                }
            }
            if (hasBeenModified) {
                // If we modified the intervals, update the calendar
                const newDDI = new Map(calendar);
                const day = new Date(dateInterval.start);
                day.setHours(0, 0, 0, 0);
                newDDI.set(day.toDateString(), currentIntervals);
                setCalendar(() => newDDI);
            }
        }
        setCalendar(() => {
            const newDDI = addInterval(calendar, dateInterval);
            console.log('Adding interval', dateInterval, 'to calendar', newDDI);
            return newDDI;
        })

    }
    const getIntervalsCalendar = (_date: Date): DateInterval[] => {
        if (!_date) {
            return getIntervals(calendar, showingDate);
        }
        return getIntervals(calendar, _date);
    }
    const [showingDate, setShowingDate] = useState<Date>(new Date());

    const calendarValue: CalendarContextType = {
        showingDate,
        setShowingDate,
        addInterval: addIntervalCalendar,
        getIntervals: getIntervalsCalendar,
        getDates: () => {
            const dates: Date[] = [];
            calendar.forEach((_, day) => {
                const date = new Date(day);
                dates.push(date);
            });
            return dates;
        },
        resumeInterval: (dateInterval: DateInterval) => {
            if (!dateInterval.end) {
                console.warn('Cannot resume an interval that does not have an end date:', dateInterval);
                return null;
            }

            if (canResumeInterval(dateInterval)) {
                // If the interval can be resumed set the end date to null
                const croppedInterval = cropDayInterval(dateInterval);
                const dayD = new Date(croppedInterval.start);
                dayD.setHours(0, 0, 0, 0);
                const day = dayD.toDateString();
                const existingIntervals = calendar.get(day) || [];
                const index = existingIntervals.findIndex(interval => interval.identifier === croppedInterval.identifier);
                if (index !== -1) {
                    // Resume the interval by setting the end date to null
                    existingIntervals[index].end = null;
                    // Update the calendar
                    const newCalendar = new Map(calendar);
                    newCalendar.set(day, existingIntervals);
                    setCalendar(newCalendar);
                } else {
                    console.warn('Interval not found for identifier:', croppedInterval.identifier);
                }
                return croppedInterval.identifier;
            }
            // Add a new interval with the same description and start date
            const now = cropDateToHoursMinutes(new Date());
            const newInterval: DateInterval = {
                identifier: Math.random().toString(36).substring(2, 15),
                start: now,
                end: null,
                msg: dateInterval.msg || ""
            };
            console.log('Resuming interval with new interval:', newInterval);
            addIntervalCalendar(newInterval);
            return newInterval.identifier;
        },
        stopInterval: (dateInterval: DateInterval) => {
            // Look with the identifier in the calendar
            if (dateInterval.end) {
                console.warn('Cannot stop an interval that already has an end date:', dateInterval)
                return null;
            }
            const croppedInterval = cropDayInterval(dateInterval);
            const dayD = new Date(croppedInterval.start);
            dayD.setHours(0, 0, 0, 0);
            const day = dayD.toDateString();

            const existingIntervals = calendar.get(day) || [];

            const index = existingIntervals.findIndex(interval => interval.identifier === croppedInterval.identifier);

            if (index !== -1) {
                // Stop the interval by setting the end date to now
                const now = cropDateToHoursMinutes(new Date());
                existingIntervals[index].end = now;
                // Update the calendar
                const newCalendar = new Map(calendar);
                newCalendar.set(day, existingIntervals);
                setCalendar(newCalendar);
            } else {
                console.warn('Interval not found for identifier:', croppedInterval.identifier);
            }
            return croppedInterval.identifier;
        },
        getDescriptions: async () => {
            try {
                const tags = await getAllTags();
                const tagNames = tags.map(tag => tag.name).filter(name => name);
                return tagNames.length > 0 ? tagNames.sort() : ['No descriptions available'];
            } catch (e) {
                console.error('Failed to get descriptions from database', e);
                return ['No descriptions available'];
            }
        },
        deleteInterval: (dateInterval: DateInterval): string | null => {
            if (!dateInterval.start)
                return 'Start date is required';

            const croppedInterval = cropDayInterval(dateInterval);
            const dayD = new Date(croppedInterval.start);
            dayD.setHours(0, 0, 0, 0);
            const day = dayD.toDateString();
            const existingIntervals = calendar.get(day) || [];
            if (existingIntervals.length === 0)
                return 'No intervals found for the specified date : ' + day;

            const index = existingIntervals.findIndex(interval => interval.identifier === croppedInterval.identifier);

            if (index !== -1) {
                // Remove existing interval
                existingIntervals.splice(index, 1);
                if (existingIntervals.length === 0) {
                    calendar.delete(day); // Remove the day key if no intervals left
                } else {
                    calendar.set(day, existingIntervals);
                }
                setCalendar(new Map(calendar)); // Trigger re-render
                return null; // No error
            } else {
                return 'Interval not found';
            }
        },
        updateInterval: function(dateInterval: DateInterval): string | null {
            if (!dateInterval.start) {
                return 'Start date is required';
            }

            const croppedInterval = cropDayInterval(dateInterval);
            const dayD = new Date(croppedInterval.start);
            dayD.setHours(0, 0, 0, 0);
            const day = dayD.toDateString();
            const existingIntervals = calendar.get(day) || [];
            if (existingIntervals.length === 0) {
                return 'No intervals found for the specified date : ' + day;
            }

            const index = existingIntervals.findIndex(interval => interval.identifier === croppedInterval.identifier);

            if (index !== -1) {
                // Update existing interval
                existingIntervals[index] = croppedInterval;
                const newCal = new Map(calendar)
                newCal.set(day, existingIntervals);
                setCalendar(newCal);
            } else {
                return 'Interval not found';
            }

            return croppedInterval.identifier; // Return the identifier of the updated interval
        },
        setIsStopLastIntervalOnAdd: (value: boolean) => {
            setIsStopLastIntervalOnAdd(value);
        },
        getIsStopLastIntervalOnAdd: () => isStopLastIntervalOnAdd
    };


    return (
        <CalendarContext.Provider value={calendarValue}>
            {children}
        </CalendarContext.Provider>
    );
}
function cropDateToHoursMinutes(date: Date): Date {
    const croppedDate = new Date(date);
    croppedDate.setHours(date.getHours(), date.getMinutes(), 0, 0); // Set seconds and milliseconds to 0
    return croppedDate;
}
function cropDayInterval(dateInterval: DateInterval): DateInterval {
    const start = cropDateToHoursMinutes(dateInterval.start);
    if (!start) {
        throw new Error('Start date is required');
    }
    const end = dateInterval.end ? cropDateToHoursMinutes(dateInterval.end) : null;
    return { ...dateInterval, start: start, end: end };
}

function addInterval(ddI: Map<string, DateInterval[]>, dateInterval: DateInterval) {
    const ddF = new Map(ddI);

    if (!dateInterval.start) {
        dateInterval.start = new Date();
    }
    const dayD = new Date(dateInterval.start);
    dayD.setHours(0, 0, 0, 0);
    const day = dayD.toDateString()
    dateInterval = cropDayInterval(dateInterval);

    // Random identifier for the interval - set BEFORE adding to map
    dateInterval.identifier = dateInterval.identifier || Math.random().toString(36).substring(2, 15);

    const isDayKey = ddF.has(day);
    if (isDayKey) {
        const dayIntervals = ddF.get(day)!;
        ddF.set(day, [...dayIntervals, dateInterval]);
    } else {
        ddF.set(day, [dateInterval]);
    }

    return ddF;
}
function getIntervals(ddI: Map<string, DateInterval[]>, date: Date): DateInterval[] {
    const dayD = new Date(date);
    dayD.setHours(0, 0, 0, 0); // Set to the start of the day
    const day = dayD.toDateString();
    return ddI.get(day) ?? [];
}

function canResumeInterval(dateInterval: DateInterval): boolean {

    if (!dateInterval.end) {
        return true;
    }
    // Check more than a minute hasn't passed since the end
    const end = new Date(dateInterval.end);
    console.log('Checking if interval can be resumed. End date:', end);
    const now = new Date();
    console.log('Current date:', now);
    const diff = now.getTime() - end.getTime();
    console.log('Difference in milliseconds:', diff);
    return diff < 60 * 1000; // Less than a minute
}
