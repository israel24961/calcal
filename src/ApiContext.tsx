import { createContext } from 'react';


// This is the context that will be used to pass the url 


interface ApiContextType {
    url: string;
    headers: Headers;
    ffetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
    ListHouses(): Promise<Response>;
}
export const ApiContext = createContext<ApiContextType>({} as ApiContextType);

//Set in the header to accept only application/json
export const ApiProvider = ({ children }: any) => {
    const url = "/api";
    if (!url) {
        throw new Error('VITE_URLBACK is not set');
    }
    const headers = new Headers();
    headers.append('Accept', 'application/json');
    headers.append('Content-Type', 'application/json');

    const ffetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const resp = await fetch(input, { headers, ...init });
        if (!resp.ok) {
            // Return empty response if the request fails
            const emptyResponse = "{}";
            return new Response(emptyResponse, { status: resp.status, statusText: resp.statusText });
        }
        return resp;
    }

    const ListHouses = async () => {
        return ffetch(url + '/House/ListHouses');
    }

    return (
        <ApiContext.Provider value={{ url, headers, ffetch, ListHouses }}>
            {children}
        </ApiContext.Provider>
    );
}

