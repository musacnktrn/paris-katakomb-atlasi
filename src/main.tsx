// ureten: codex
import {createRoot} from 'react-dom/client';
import App from './App';
import 'maplibre-gl/dist/maplibre-gl.css';
import './technical.css';
createRoot(document.getElementById('root')!).render(<App/>);
if('serviceWorker'in navigator && import.meta.env.PROD)window.addEventListener('load',()=>{navigator.serviceWorker.register(new URL('./sw.js',document.baseURI),{scope:'./'}).catch(error=>console.error('PWA kurulumu:',error));});
