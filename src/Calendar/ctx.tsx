import { createContext, useState, useEffect } from 'react';
import { intervalToDuration } from 'date-fns';

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
    getDescriptions(): string[];
    setIsStopLastIntervalOnAdd(value: boolean): void;
    getIsStopLastIntervalOnAdd(): boolean;
    showingDate: Date;
    setShowingDate(date: Date): void;
    // Other functions
    exportToClipboardAsMarkdownTable(): void;
}

export const CalendarContext = createContext<CalendarContextType>({
    getIntervals: () => [],
    stopInterval: () => null,
    getDates: () => [],
    addInterval: () => { },
    updateInterval: () => null,
    resumeInterval: () => null,
    deleteInterval: () => null,
    getDescriptions: () => [],
    setIsStopLastIntervalOnAdd: () => { },
    getIsStopLastIntervalOnAdd: () => true,
    showingDate: new Date(),
    setShowingDate: () => { },
    exportToClipboardAsMarkdownTable: () => { },
})

function mapToObj(map: Map<string, DateInterval[]>): Record<string, DateInterval[]> {
    return Object.fromEntries(map.entries());
}

function objToMap(obj: Record<string, DateInterval[]>): Map<string, DateInterval[]> {
    const map = new Map<string, DateInterval[]>();
    for (const key in obj) {
        const intervals = obj[key].map(interval => ({
            ...interval,
            start: new Date(interval.start),
            end: interval.end ? new Date(interval.end) : null,
        }));
        map.set(key, intervals);
    }
    return map;
}

export const CalendarProvider = ({ children }: any) => {
    const [calendar, setCalendar] = useState<Map<string, DateInterval[]>>(
        () => {
            const stored = localStorage.getItem("calendar");
            if (stored) {
                try {
                    return objToMap(JSON.parse(stored));
                } catch (e) {
                    console.warn("Failed to parse calendar from localStorage", e);
                }
            }
            return new Map<string, DateInterval[]>();
        });
    useEffect(() => {
        // Save calendar to localStorage whenever it changes
        const saveCalendar = () => {
            try {
                localStorage.setItem("calendar", JSON.stringify(mapToObj(calendar)));
                console.log('Calendar saved to localStorage');
            } catch (e) {
                console.error('Failed to save calendar to localStorage', e);
            }
        };

        saveCalendar();

    }, [calendar]);

    const [isStopLastIntervalOnAdd, setIsStopLastIntervalOnAdd] = useState<boolean>(true);
    const [descriptions, setDescriptions] = useState<string[]>([]);

    const addIntervalCalendar = (dateInterval: DateInterval) => {
        // Check intervals with null end date ( if the showing date is today, use the current date)
        let nowDate = new Date();

        if (showingDate.getDate() !== nowDate.getDate()) {
            nowDate = showingDate;
        }

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
        getDescriptions: () => {
            return descriptions.length > 0 ? descriptions : ['No descriptions available'];
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

            // Update the descriptions
            const newDescriptions = existingIntervals.map(interval => interval.msg);
            // Compare the new descriptions with the existing ones
            if (JSON.stringify(newDescriptions) !== JSON.stringify(descriptions)) {
                const uniqueDescriptions = Array.from(new Set(newDescriptions));
                console.log('Updating descriptions', uniqueDescriptions);
                uniqueDescriptions.sort();

                setDescriptions(uniqueDescriptions);
            }
            return croppedInterval.identifier; // Return the identifier of the updated interval
        },
        setIsStopLastIntervalOnAdd: (value: boolean) => {
            setIsStopLastIntervalOnAdd(value);
        },
        getIsStopLastIntervalOnAdd: () => isStopLastIntervalOnAdd,
        exportToClipboardAsMarkdownTable: () => {
            exportToClipboardAsMarkdownTable(calendarValue, showingDate);
        }

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

    const isDayKey = ddF.has(day);
    if (isDayKey) {
        const dayIntervals = ddF.get(day)!;
        ddF.set(day, [...dayIntervals, dateInterval]);
    } else {
        ddF.set(day, [dateInterval]);
    }

    // Random identifier for the interval
    dateInterval.identifier = dateInterval.identifier || Math.random().toString(36).substring(2, 15);

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

function exportToClipboardAsMarkdownTable(calendarContext: CalendarContextType, date: Date) {
    const intervals = calendarContext.getIntervals(date);
    if (intervals.length === 0) {
        console.warn('No intervals found for date', date);
        return;
    }

    let markdownTable = '|Duration | Start Time | End Time | Description |\n';
    markdownTable += '|----------|------------|----------|-------------|\n';

    intervals.forEach(interval => {
        const startTime = interval.start ? interval.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A';
        const endTime = interval.end ? interval.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Ongoing';
        const description = interval.msg || '';
        markdownTable += `| ${humanDuration(((interval.end ? interval.end.getTime() : new Date().getTime()) - interval.start.getTime()) / 1000)} | ${startTime} | ${endTime} | ${description} |\n`;
    });

    // Append Now other table with duration per description
    
    const durationMap: Map<string, number> = new Map();
    intervals.forEach(interval => {
        const desc = interval.msg || 'No Description';
        const duration = ((interval.end ? interval.end.getTime() : new Date().getTime()) - interval.start.getTime()) / 1000;
        if (durationMap.has(desc)) {
            durationMap.set(desc, durationMap.get(desc)! + duration);
        } else {
            durationMap.set(desc, duration);
        }
    });
    markdownTable += `\n| Description | Total Duration |\n`;
    markdownTable += `|-------------|----------------|\n`;
    durationMap.forEach((duration, desc) => {
        markdownTable += `| ${desc} | ${humanDuration(duration)} |\n`;
    });

    navigator.clipboard.writeText(markdownTable).then(() => {
        console.log('Markdown table copied to clipboard');
    }).catch(err => {
        console.error('Could not copy text: ', err);
    });
}

export function humanDuration(time: number): string {
    if (time < 60) return time.toFixed(0) + 's';

    const { days, hours, minutes, seconds } = intervalToDuration({ start: 0, end: time * 1000 });

    const parts = [];
    if (days) parts.push(`${days}d`);
    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    if (seconds && time >= 60) parts.push(`${seconds}s`);

    return parts.join('');
}
