const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Dirs
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DATA_FILE = path.join(__dirname, 'data.json');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Persist filesystem state to JSON
function loadState() {
  if (fs.existsSync(DATA_FILE)) {
    try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch {}
  }
  return { root: { id: 'root', name: 'root', type: 'folder', children: [], created: new Date().toISOString() } };
}
function saveState() { fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2)); }
let state = loadState();

function findNode(id, node = state.root) {
  if (node.id === id) return node;
  if (node.children) for (const c of node.children) { const r = findNode(id, c); if (r) return r; }
  return null;
}
function findParent(id, node = state.root, parent = null) {
  if (node.id === id) return parent;
  if (node.children) for (const c of node.children) { const r = findParent(id, c, node); if (r) return r; }
  return null;
}
function collectFileIds(node, ids = []) {
  if (node.type === 'file' && node.diskName) ids.push(node.diskName);
  if (node.children) node.children.forEach(c => collectFileIds(c, ids));
  return ids;
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Multer config - store to disk with uuid filenames
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 * 1024 } });

// GET /api/state — full filesystem tree
app.get('/api/state', (req, res) => res.json(state));

// POST /api/upload?folderId=xxx — upload files into a folder
app.post('/api/upload', upload.array('files'), (req, res) => {
  const folderId = req.query.folderId || 'root';
  const folder = findNode(folderId);
  if (!folder || folder.type !== 'folder') return res.status(404).json({ error: 'Folder not found' });
  const added = [];
  for (const f of req.files) {
    const node = {
      id: uuidv4(),
      name: Buffer.from(f.originalname, 'latin1').toString('utf8'),
      type: 'file',
      size: f.size,
      diskName: f.filename,
      created: new Date().toISOString()
    };
    folder.children.push(node);
    added.push(node);
  }
  saveState();
  res.json({ added });
});

// POST /api/folder — create new folder
app.post('/api/folder', (req, res) => {
  const { parentId = 'root', name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const parent = findNode(parentId);
  if (!parent || parent.type !== 'folder') return res.status(404).json({ error: 'Parent not found' });
  const node = { id: uuidv4(), name, type: 'folder', children: [], created: new Date().toISOString() };
  parent.children.push(node);
  saveState();
  res.json(node);
});

// PATCH /api/item/:id — rename
app.patch('/api/item/:id', (req, res) => {
  const node = findNode(req.params.id);
  if (!node) return res.status(404).json({ error: 'Not found' });
  if (req.body.name) node.name = req.body.name;
  saveState();
  res.json(node);
});

// DELETE /api/item/:id — delete file or folder (recursive)
app.delete('/api/item/:id', (req, res) => {
  const id = req.params.id;
  if (id === 'root') return res.status(400).json({ error: 'Cannot delete root' });
  const node = findNode(id);
  if (!node) return res.status(404).json({ error: 'Not found' });
  const diskFiles = collectFileIds(node);
  diskFiles.forEach(df => {
    const fp = path.join(UPLOADS_DIR, df);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  });
  const parent = findParent(id);
  if (parent) parent.children = parent.children.filter(c => c.id !== id);
  saveState();
  res.json({ ok: true });
});

// GET /api/download/:id — download a file
app.get('/api/download/:id', (req, res) => {
  const node = findNode(req.params.id);
  if (!node || node.type !== 'file') return res.status(404).json({ error: 'Not found' });
  const fp = path.join(UPLOADS_DIR, node.diskName);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'File missing from disk' });
  res.download(fp, node.name);
});

// POST /api/new-txt — create empty text file
app.post('/api/new-txt', (req, res) => {
  const { folderId = 'root', name = 'untitled.txt' } = req.body;
  const folder = findNode(folderId);
  if (!folder || folder.type !== 'folder') return res.status(404).json({ error: 'Folder not found' });
  const diskName = uuidv4() + '.txt';
  fs.writeFileSync(path.join(UPLOADS_DIR, diskName), '');
  const node = { id: uuidv4(), name, type: 'file', size: 0, diskName, created: new Date().toISOString() };
  folder.children.push(node);
  saveState();
  res.json(node);
});

app.listen(PORT, () => console.log(`VAULT running on http://localhost:${PORT}`));
