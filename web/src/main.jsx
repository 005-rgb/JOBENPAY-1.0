import { createRoot } from 'react-dom/client';

import App from './App.jsx';
import './i18n.js';
import './styles/reset.css';
import './styles/global.css';

createRoot(document.getElementById('root')).render(<App />);
