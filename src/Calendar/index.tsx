import { JSX, useContext, useEffect, useRef, useState } from 'react';
import { CalendarContext, DateInterval } from './ctx';
import { intervalToDuration } from 'date-fns';

function humanDuration(time: number): string {
    if (time < 60) return time.toFixed(0) + 's';

    const { days, hours, minutes, seconds } = intervalToDuration({ start: 0, end: time * 1000 });

    const parts = [];
    if (days) parts.push(`${days}d`);
    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    if (seconds && time >= 60) parts.push(`${seconds}s`);

    return parts.join('');
}

const paletteColors = [
    '#f87171', // red-400
    '#fbbf24', // yellow-400
    '#34d399', // green-400
    '#60a5fa', // blue-400
    '#a78bfa', // purple-400
    '#f472b6', // pink-400
    '#fcd34d', // amber-400
    '#8b5cf6', // violet-400
    '#fca5a5', // rose-400
    '#a3e635', // lime-400
];

// Clickable past dates (showing the number of intervals for each date). When clicked set the current date in the context to that date.
// Also a button to load more past dates.
// Dark gray letter if all intervals are ended, otherwise white letter and white gray background. and a tooltip showing that there are active intervals.
function PastDatesCalendar(): JSX.Element {
    const calendarContext = useContext(CalendarContext);
    const showingResults = useRef<number>(5);

    const pastDates = calendarContext.getDates();



    return <div>
        <h3 className="text-base md:text-lg mb-2"> Past dates </h3>
        <ul className="past-dates-list list-none pl-0 md:pl-5">
            {pastDates.map((date, index) => {
                const intervals = calendarContext.getIntervals(date);
                return <li key={index} className="mb-1">
                    <button className={`date-button w-full text-left px-2 py-2 rounded text-sm md:text-base ${(intervals.every(interval => interval.end)) ? 'text-gray-400' : 'text-white bg-gray-600'}`}
                        onClick={() => {
                            calendarContext.setShowingDate(date);
                        }}
                        title={intervals.every(interval => interval.end) ? 'All intervals ended' : 'There are active intervals'}
                    >
                    <span>{date.toDateString()} ({intervals.length} intervals)</span>
                    </button>
                </li>;
            })}
            <li className="mt-2">
                <button className="load-more-button text-blue-500 w-full text-left px-2 py-2 text-sm md:text-base"
                    onClick={() => {
                        showingResults.current += 5;
                        // Force re-render
                        calendarContext.setShowingDate(calendarContext.showingDate);
                    }}>
                    {pastDates.length > showingResults.current ? 'Load more dates' : 'No more dates to load'}
                </button>
            </li>
        </ul>
    </div>
}


export function Calendar(): JSX.Element {
    return <div className="calendar">
        <h2>Calendar</h2>
        <div className="flex flex-col md:flex-row min-h-screen">
            <aside className="w-full md:w-64 bg-gray-800 text-white p-2 md:p-4">
                <PastDatesCalendar />
            </aside>

            <CalendarIntervalRepresentations />
        </div>
    </div>
}

function CalendarIntervalRepresentations(): JSX.Element {
    const calendarContext = useContext(CalendarContext);

    const [curDate, setCurDate] = useState(new Date());
    const intervals = calendarContext.getIntervals(calendarContext.showingDate);

    useEffect(() => {
        let intervalId: NodeJS.Timeout;
        let timeoutId: NodeJS.Timeout;
        const tick = () => {
            setCurDate(new Date());
        };

        const setup = () => {
            tick(); // update immediately
            const now = new Date();
            const msUntilNextSecond = 1000 - now.getMilliseconds();
            console.log('Setting up intervals, next second in ms:', msUntilNextSecond);

            // Set timeout to align with the start of the next minute
            timeoutId = setTimeout(() => {
                tick();
                // Now set an interval to update every full minute
                intervalId = setInterval(tick, /* 60 * */ 1000);
            }, msUntilNextSecond);
        };

        setup();

        return () => {
            clearTimeout(timeoutId);
            clearInterval(intervalId);
        };
    }, []);
    console.log('Current date:', curDate.toLocaleString(), 'Intervals:', intervals);

    return <div className="today-intervals px-2 md:px-4">
        {calendarContext.showingDate.toDateString() === curDate.toDateString() ?
            <h3 className="text-base md:text-lg">Today's Intervals ({intervals.length}) - ({curDate.getHours().toString().padStart(2, '0')}:{curDate.getMinutes().toString().padStart(2, '0')}:{curDate.getSeconds().toString().padStart(2, '0')} - (Total time: {
                humanDuration(intervals.reduce((acc, interval) => {
                    const elapsed = interval.end ? (interval.end.getTime() - interval.start.getTime()) / 1000 : (new Date().getTime() - interval.start.getTime()) / 1000;
                    return acc + (elapsed || 0);
                }, 0))
            })
            </h3> :
            <h3 className="text-base md:text-lg"> Historic Intervals for {calendarContext.showingDate.toDateString()} ({intervals.length})</h3>
        }
        <button className="text-sm md:text-base mb-2" onClick={() => {
            calendarContext.setIsStopLastIntervalOnAdd(!calendarContext.getIsStopLastIntervalOnAdd());
        }}
            title={`Toggle allowing only one interval to run at a time. Currently: ${calendarContext.getIsStopLastIntervalOnAdd() ? 'Only one allowed' : 'Multiple allowed'}`}
        > {calendarContext.getIsStopLastIntervalOnAdd() ? 'Allowing only one to run' : 'Allowing multiple to run'} </button>
        <CalendarIntervals intervals={intervals} minimized={false} />
        <button className="mouse text-sm md:text-base mt-2" onClick={() => {
            console.log('Adding interval');
            calendarContext.addInterval({} as DateInterval);
        }} > Add Interval</button>
    </div>;
}
function CalendarIntervals(props: { intervals: DateInterval[], minimized: boolean }): JSX.Element {
    const minimizedClass = 'text-gray-500';
    const [isMinimized, setIsMinimized] = useState(props.minimized);

    if (props.minimized) {
        if (props.intervals.length === 0)
            return <div className={` ${minimizedClass}`}
                onClick={() => setIsMinimized(!isMinimized)}>
                <p>No intervals for today</p>
            </div>;

        const lastInterval = props.intervals[props.intervals.length - 1];
        return <div className={minimizedClass}>
            <CalendarOneInterval interval={lastInterval} key={props.intervals.length - 1} readonly={true} />
        </div >;
    }


    const elem = props.intervals.map((_, index) => {
        const reversedIndex = props.intervals.length - 1 - index;
        const interval = props.intervals[reversedIndex];
        return <CalendarOneInterval key={index} interval={interval} readonly={false} />;
    })
    return <div>
        {elem}
    </div>

}

function CalendarOneInterval(props: { interval: DateInterval, key: number, readonly: boolean }): JSX.Element {
    const calendarContext = useContext(CalendarContext);
    const [originalInterval] = useState<DateInterval>(props.interval);
    const [intervalState, setIntervalState] = useState(props.interval);

    function hash(text: string): number {
        if (!text) return 0

        let state = 13 // prime
        for (let index = 0; index < text.length; index++) {
            const charCode: number = text.charCodeAt(index);
            state += state * charCode;
            // Prevent overflow by %
            state %= (charCode * 3109) // prime
        }
        return state;
    }
    const msgColorLabel = paletteColors[hash(intervalState.msg) % paletteColors.length];

    // If the interval has an end time, calculate the elapsed time in seconds, else with the current time
    const elapsedTime: number | null = intervalState.end
        ? (intervalState.end.getTime() - intervalState.start.getTime()) / 1000
        : (new Date().getTime() - intervalState.start.getTime()) / 1000;

    const interval_container = 'flex flex-col md:flex-row items-start md:items-center justify-between p-2 gap-2 border-b border-gray-200 dark:border-gray-700 ';
    if (props.readonly)
        return <div className={interval_container}>
            <div className="interval-duration font-semibold" > {humanDuration(elapsedTime || 0)} </div>
            <div className="interval" onClick={() => { setIsEditing(!isEditing); }}>
                <p className="text-sm md:text-base">{intervalState.start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} -- {intervalState.end ? intervalState.end.toLocaleTimeString() : 'No end time'}</p>
            </div>
        </div>


    const [isEditing, setIsEditing] = useState(false);
    useEffect(() => {
        setIntervalState(props.interval);
    }, [props.interval]);
    const CrudIcons = () => <div className="flex flex-row items-center justify-center gap-1 md:gap-0">
        <div className="flex flex-row md:flex-col items-center justify-center">
            <button className="play p-1 md:p-1.5" style={{ marginLeft: '10px', padding: '5px' }}
                title="Resume Interval (if last interval)"
                onClick={() => {
                    console.log('Stopping interval', intervalState);
                    const identifier = calendarContext.resumeInterval(intervalState);
                    if (!identifier)
                        console.log('Interval stopped', identifier);
                }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill={`${intervalState.end ? 'gray' : 'currentColor'}`} className="bi bi-play" viewBox="0 0 16 16">
                    <path d="M11.596 8.697L5.223 12.61A1 1 0 0 1 4 11.618V4.382a1 1 0 0 1 1.223-.992l6.373 3.913a1 1 0 0 1 0 1.992zM5.5 5.382v5.236l5.373-2.618L5.5 5.382z" />
                </svg>
            </button>
            <button className="stop p-1 md:p-1.5" style={{ marginLeft: '10px', padding: '5px' }}
                title="Stop Interval"
                onClick={() => {
                    console.log('Stopping interval', intervalState);
                    const identifier = calendarContext.stopInterval(intervalState);
                    if (!identifier)
                        console.log('Interval stopped', identifier);
                }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill={`${intervalState.end ? 'gray' : 'currentColor'}`} className="bi bi-stop" viewBox="0 0 16 16">
                    <path d="M3 3h10v10H3V3zm1 1v8h8V4H4z" />
                </svg>
            </button>
        </div>
        <div className="flex flex-row md:flex-col items-center justify-center">
            <button className="edit p-1 md:p-1.5"
                title="Edit Interval"
                style={{ marginLeft: '10px', padding: '5px' }}
                onClick={() => {
                    console.log('Editing interval', intervalState);
                    setIsEditing(true);
                }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill={`${intervalState.end ? 'gray' : 'currentColor'}`}
                    className="bi bi-pencil-square" viewBox="0 0 16 16">
                    <path d="M15.502 1.94a1.5 1.5 0 0 0-2.12 0l-1.415 1.414a1.5 1.5 0 0 0 0 2.121l2.121 2.121a1.5 1.5 0 0 0 2.121 0l1.414-1.414a1.5 1.5 0 0 0 0-2.121L15.502 1.94zM13.88 4.06L11.76 6.18l-2-2L11.88 2a1.5 1.5 0 0 1 .212-.212l1.414-1.414a1.5 1.5 0 0 1 .212-.212l-.212-.212zM14.5 16H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h8a2 2 0 0 1 .707.293l3.5 3.5A2 2 0 0 1 14.5 6v8a2 2 0 0 1-2 .707V16zM3 .5A2.5 2.5 0 0 0 .5 3v10a2.5 2.5 0 0 0 .146.854L3 .854V16h11V6H4V3H3v-.5z" />
                </svg>
            </button>
            <button className="delete p-1 md:p-1.5" style={{ marginLeft: '10px', padding: '5px' }}
                title="Delete Interval"
                onClick={() => {
                    console.log('Deleting interval', intervalState);
                    const identifier = calendarContext.deleteInterval(intervalState);
                    if (!identifier)
                        console.log('Interval deleted', identifier);
                }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill={`${intervalState.end ? 'gray' : 'currentColor'}`} className="bi bi-trash" viewBox="0 0 16 16">
                    <path d="M5.5 5.5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-.5.5h-4a.5.5 0 0 1-.5-.5v-6zM14 3H2v1h12V3zm-1-2H3a1 1 0 0 0-1 1v1h12V2a1 1 0 0 0-1-1zM3.118 4L2.39 14.39A2 2 0 0 0 4.39 16h7.22a2 2 0 0 0 2-1.61L12.882 4H3.118z" />
                </svg>
            </button>
        </div>
    </div>;
    const themeWhenEditing = 'bg-yellow-100 dark:bg-yellow-800 text-red-800 dark:text-red-200 border-red-500 dark:border-red-300';
    // If ended, disabled look
    const themeWhenNotEditing = intervalState.end ? 'text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-600 ' +
        'cursor-not-allowed' : '';



    return <>
        {isEditing ?
            <div className={`${themeWhenEditing}`}>
                <CalendarOneIntervalEdit interval={intervalState}
                    onSave={(interval) => {
                        console.log('Saving start HH:mm', interval.start.toLocaleTimeString(), 'end HH:mm', interval.end ? interval.end.toLocaleTimeString() : 'No end time');
                        setIntervalState(interval);
                        return interval.identifier;
                    }}
                    onStoppedEditing={(_) => {
                        console.log('Stopped editing interval, saving into calendar context', intervalState);
                        calendarContext.updateInterval(intervalState);
                        setIsEditing(false);
                    }}
                    onCancel={() => {
                        console.log('Cancelling edit, restoring original interval', originalInterval);
                        setIntervalState(originalInterval);
                        setIsEditing(false);
                    }}
                />
            </div>
            : <div className={`flex flex-col md:flex-row gap-2 md:gap-4 ${isEditing ? themeWhenEditing : themeWhenNotEditing} p-2`}>
                <div className="font-semibold text-sm md:text-base" > {humanDuration(elapsedTime || 0)} </div>
                <div className="interval flex-grow" onClick={() => { setIsEditing(!isEditing); }}>
                    <p className="text-sm md:text-base">{intervalState.start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} -- {intervalState.end ? intervalState.end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : 'No end time'}</p>
                </div>
                <CrudIcons />
                <div className="w-full md:w-auto">
                    {intervalState.msg && intervalState.msg.length > 0 &&
                        <span
                            style={{ backgroundColor: msgColorLabel }}
                            className='inline-flex items-center rounded-md px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-gray-500/10 ring-inset break-all'>
                            {intervalState.msg}
                        </span>
                    }
                </div>
            </div>
        }
    </>
}
function CalendarOneIntervalEdit(props: { interval: DateInterval, onSave: (interval: DateInterval) => string, onStoppedEditing: (identifier: string) => void, onCancel: () => void }): JSX.Element {
    const node = useRef<HTMLDivElement>(null);
    const calendarContext = useContext(CalendarContext);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (node && node.current && !node.current.contains(event.target as Node)) {
                props.onStoppedEditing(props.interval.identifier);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [props.interval]);

    useEffect(() => { // Focus on the first input when editing starts
        if (node && node.current) {
            const inputs = node.current.querySelectorAll('input');
            if (inputs.length > 0) {
                (inputs[0] as HTMLInputElement).focus();
            }
        }
    }, []);

    const [descriptOptions, setDescriptOptions] = useState<string[]>();

    const handleDescriptionSelect = () => {
        const descriptions = calendarContext.getDescriptions();
        if (descriptions.length > 0) {
            setDescriptOptions(descriptions);
        } else {
            setDescriptOptions(['No descriptions available']);
        }
    };

    const handleChangeSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value;
        props.onSave({ ...props.interval, msg: value });
        // setIntervalState(prev => ({...prev, msg: value }));
    };


    return <div className="interval-edit flex flex-col md:flex-row gap-2 md:gap-3 p-2" ref={node}
        onKeyDown={(e) => {
            if (e.key === 'Enter') {
                const identifier = props.onSave(props.interval);
                props.onStoppedEditing(identifier);
            }
        }} >
        <div className="flex items-center gap-1">
            <span className="text-sm">Start:</span>
            <EditableDateInHoursMinutes date={props.interval.start} canBeEmpty={false}
                onChange={(date) => {
                    if (!date) {
                        alert('Start date is required');
                        return;
                    }
                    const newInterval = { ...props.interval, start: date };
                    props.onSave(newInterval);
                }} />
        </div>
        <div className="flex items-center gap-1">
            <span className="text-sm">End:</span>
            <EditableDateInHoursMinutes date={props.interval.end || null} onChange={(date) => {
                const newInterval = { ...props.interval, end: date };
                props.onSave(newInterval);
            }} canBeEmpty={true} />
        </div>
        <input className="msg flex-grow px-2 py-1 text-sm border rounded min-w-0"
            type="text" value={props.interval.msg || ''}
            placeholder="Description"
            onChange={(e) => {
                const newInterval = { ...props.interval, msg: e.target.value };
                calendarContext.updateInterval(newInterval);
                props.onSave(newInterval);
            }} />
        <select
            className="text-sm px-2 py-1 border rounded min-w-0"
            onMouseDown={handleDescriptionSelect}
            onChange={handleChangeSelect}
            value={''}
        >
            <option value="">Select Description</option>
            {descriptOptions && descriptOptions.map((desc, index) => (
                <option key={index} value={desc}>{desc}</option>
            ))}
        </select>
    </div>
}

function EditableDateInHoursMinutes(props: { date: Date | null, onChange: (date: Date | null) => void, canBeEmpty: boolean }): JSX.Element {
    return <div className="editable-date flex gap-1" >
        <input type="text" className="flex-grow min-w-[3em] w-12 px-2 py-1 border rounded text-sm"
            value={props.date ? props.date.getHours() : ''} 
            placeholder="HH"
            onChange={(e) => {
                const newDate = new Date(props.date ? props.date : new Date());
                if (!e.target.value || e.target.value === '') {
                    if (props.canBeEmpty) {
                        props.onChange(null);
                    }
                    else {
                        newDate.setHours(0);
                        console.log("Hours changed to", newDate.getHours());
                        props.onChange(newDate);
                    }
                }
                else if (24 <= parseInt(e.target.value)) {
                    alert('Hours must be between 0 and 23');
                }
                else if (parseInt(e.target.value) < 0) {
                    alert('Hours must be between 0 and 23');
                    newDate.setHours(0);
                    props.onChange(newDate);
                }
                else {
                    newDate.setHours(parseInt(e.target.value));
                    props.onChange(newDate);
                }
            }} min={0} max={23} />
        <span className="self-center">:</span>
        <input className="flex-grow min-w-[3em] w-12 px-2 py-1 border rounded text-sm"
            type="text" value={props.date ? props.date.getMinutes() : ''}
            placeholder="MM"
            min={0} max={59} onChange={(e) => {
                const newDate = new Date(props.date ? props.date : new Date());
                if (!e.target.value || e.target.value === '') {
                    console.log("Minutes changed to", newDate.getMinutes());
                    newDate.setMinutes(0);
                    props.onChange(newDate);
                }
                else if (60 < parseInt(e.target.value) || parseInt(e.target.value) < 0) {
                    alert('Minutes must be between 0 and 59');
                }
                else {
                    console.log("Minutes changed toParen", parseInt(e.target.value));
                    newDate.setMinutes(parseInt(e.target.value));
                    props.onChange(newDate);
                }
            }} />
    </div>;
}
