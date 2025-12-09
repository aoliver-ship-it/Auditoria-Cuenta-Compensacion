import { useState, useCallback, SetStateAction } from 'react';

/**
 * A custom hook to manage state with undo and redo functionality.
 */
export const useHistory = <T,>(initialState: T): [
    T,                                      // present state
    (action: SetStateAction<T>) => void, // setState function
    () => void,                             // undo function
    boolean,                                // canUndo boolean
    () => void,                             // redo function
    boolean,                                // canRedo boolean
    (newState: T) => void                   // reset function
] => {
    const [history, setHistory] = useState<{ past: T[], present: T, future: T[] }>({
        past: [],
        present: initialState,
        future: []
    });

    const canUndo = history.past.length > 0;
    const canRedo = history.future.length > 0;

    const setState = useCallback((action: SetStateAction<T>) => {
        setHistory(currentHistory => {
            const newPresent = typeof action === 'function' 
                ? (action as (prevState: T) => T)(currentHistory.present) 
                : action;

            // This check was removed as it's unreliable for complex objects
            // and was preventing state updates from being saved to history.
            // if (JSON.stringify(newPresent) === JSON.stringify(currentHistory.present)) {
            //     return currentHistory;
            // }

            return {
                past: [...currentHistory.past, currentHistory.present],
                present: newPresent,
                future: [] // A new state change clears the redo history
            };
        });
    }, []);

    const undo = useCallback(() => {
        setHistory(currentHistory => {
            if (currentHistory.past.length === 0) {
                return currentHistory;
            }
            const previous = currentHistory.past[currentHistory.past.length - 1];
            const newPast = currentHistory.past.slice(0, currentHistory.past.length - 1);
            return {
                past: newPast,
                present: previous,
                future: [currentHistory.present, ...currentHistory.future]
            };
        });
    }, []);
    
    const redo = useCallback(() => {
        setHistory(currentHistory => {
            if (currentHistory.future.length === 0) {
                return currentHistory;
            }
            const next = currentHistory.future[0];
            const newFuture = currentHistory.future.slice(1);
            return {
                past: [...currentHistory.past, currentHistory.present],
                present: next,
                future: newFuture
            };
        });
    }, []);

    const reset = useCallback((newState: T) => {
        setHistory({
            past: [],
            present: newState,
            future: []
        });
    }, []);

    return [history.present, setState, undo, canUndo, redo, canRedo, reset];
};