import React from 'react';
import ReactDOM from 'react-dom/client';
import { LocaleThemeProvider } from './providers/LocaleThemeProvider';
import App from './App';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LocaleThemeProvider>
      <App />
    </LocaleThemeProvider>
  </React.StrictMode>,
);
