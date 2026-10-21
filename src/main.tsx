import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { gameStore } from './stores/gameStore';
import { createBrowserSaveRepository } from './services/save/saveRepository';

gameStore.connectPersistence(createBrowserSaveRepository());

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)
