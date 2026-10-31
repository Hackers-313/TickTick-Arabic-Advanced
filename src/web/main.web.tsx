import { initializeWebApi } from './api.web';

// Initialize storage before React requests the first bootstrap.
initializeWebApi().then(() => import('../main')).catch((error: unknown) => {
  console.error('Web initialization failed', error);
  const root = document.getElementById('root');
  if (root) root.textContent = `تعذر فتح قاعدة البيانات المحلية: ${error instanceof Error ? error.message : String(error)}`;
});
