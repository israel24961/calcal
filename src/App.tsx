import { ApiProvider } from './ApiContext'
import { Calendar } from './Calendar'
import './App.css'
import { CalendarProvider } from './Calendar/ctx'

function App() {

    return (
        <ApiProvider>
            <CalendarProvider>
                <Calendar />
            </CalendarProvider>

        </ApiProvider>
    )
}



export default App
