import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './styles/tokens.css';
import './styles/themes.css';
import './styles/app.css';

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);

// Offline support. Dev is excluded so an installed worker never shadows Vite's
// module graph, and registration is deferred past load so it cannot compete with
// the first render. BASE_URL keeps the Pages path out of the source, and the
// scope the browser derives from it is exactly the app's own directory.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}
