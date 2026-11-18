import path from 'node:path';
import express from 'express';
import { getDb } from './src/db.js';
import { createApiRouter } from './src/routes/api.js';
import { createWebRouter } from './src/routes/web.js';
import { renderNotFoundPage } from './src/views/publicPages.js';

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const PORT = Number(process.env.PORT || 3000);

getDb();

const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');

app.use((req, res, next) => {
  if (req.path === '/ats-media-house') {
    res.redirect('/ats-media-house/');
    return;
  }
  if (req.url.startsWith('/ats-media-house/')) {
    req.url = req.url.slice('/ats-media-house'.length) || '/';
  }
  next();
});

app.use('/css', express.static(path.join(ROOT_DIR, 'css')));
app.use('/js', express.static(path.join(ROOT_DIR, 'js')));
app.use('/assets', express.static(path.join(ROOT_DIR, 'assets')));
app.use('/uploads', express.static(path.join(ROOT_DIR, 'uploads')));
app.get('/presentation.html', (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'presentation.html'));
});

app.use('/api', createApiRouter());
app.use('/', createWebRouter());

app.use((_req, res) => {
  res.status(404).type('html').send(renderNotFoundPage());
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ATS media house server running on http://0.0.0.0:${PORT}`);
});
