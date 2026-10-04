const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const session = require('cookie-session');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DB_DIR = path.join(require('os').tmpdir(), 'koshkakan-db');
const DB_FILE = path.join(DB_DIR, 'koshkakan.sqlite');
require('fs').mkdirSync(DB_DIR, { recursive: true });
const db = new Database(DB_FILE);
db.pragma('foreign_keys=ON');
db.pragma('journal_mode=WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT DEFAULT 'customer',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS properties(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  description TEXT DEFAULT '',
  price INTEGER NOT NULL,
  capacity INTEGER NOT NULL,
  image TEXT DEFAULT '',
  approved INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(owner_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS bookings(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  checkin TEXT NOT NULL,
  checkout TEXT NOT NULL,
  guests INTEGER NOT NULL,
  total INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  payment_status TEXT DEFAULT 'unpaid',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(property_id) REFERENCES properties(id),
  FOREIGN KEY(customer_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS payments(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  method TEXT DEFAULT 'manual',
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(booking_id) REFERENCES bookings(id)
);
`);

const adminEmail = process.env.ADMIN_EMAIL || 'admin@koshkakan.local';
const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';
const existingAdmin = db.prepare('SELECT id FROM users WHERE email=?').get(adminEmail);
if (!existingAdmin) {
  db.prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)')
    .run('Admin', adminEmail, bcrypt.hashSync(adminPassword, 10), 'admin');
}

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  name: 'koshkakan',
  keys: [process.env.SESSION_SECRET || 'dev-only-change-me'],
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 7 * 86400000
}));

app.use(express.static(path.join(__dirname, 'public')));

function loadUser(req, res, next) {
  req.me = req.session.userId
    ? db.prepare('SELECT id,name,email,role FROM users WHERE id=?').get(req.session.userId)
    : null;
  next();
}
app.use(loadUser);

function auth(req, res, next) {
  if (!req.me) return res.status(401).json({ error: 'login_required' });
  next();
}
function role(required) {
  return (req, res, next) => {
    if (!req.me || req.me.role !== required) return res.status(403).json({ error: 'forbidden' });
    next();
  };
}
function cleanEmail(email) {
  return String(email || '').trim().toLowerCase();
}
function validDateRange(checkin, checkout) {
  const a = new Date(`${checkin}T00:00:00`);
  const b = new Date(`${checkout}T00:00:00`);
  return Number.isFinite(a.getTime()) && Number.isFinite(b.getTime()) && b > a;
}

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'koshkakan' }));
app.get('/api/me', (req, res) => res.json(req.me || null));

app.post('/api/register', (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = cleanEmail(req.body.email);
    const password = String(req.body.password || '');
    const requestedRole = req.body.role === 'owner' ? 'owner' : 'customer';

    if (!name || !email || password.length < 6) {
      return res.status(400).json({ error: 'ناو، ئیمەیڵ و وشەی نهێنییەکی کەمە لە ٦ پیت پێویستە.' });
    }

    const info = db.prepare(
      'INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)'
    ).run(name, email, bcrypt.hashSync(password, 10), requestedRole);

    req.session.userId = info.lastInsertRowid;
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'ئەم ئیمەیڵە پێشتر بەکارهاتووە.' });
  }
});

app.post('/api/login', (req, res) => {
  const email = cleanEmail(req.body.email);
  const password = String(req.body.password || '');
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(email);

  if (!u || !bcrypt.compareSync(password, u.password)) {
    return res.status(401).json({ error: 'ئیمەیڵ یان وشەی نهێنی هەڵەیە.' });
  }
  req.session.userId = u.id;
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

app.get('/api/properties', (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, u.name AS owner
    FROM properties p
    JOIN users u ON u.id = p.owner_id
    WHERE p.approved = 1
    ORDER BY p.id DESC
  `).all();
  res.json(rows);
});

app.post('/api/properties', auth, role('owner'), (req, res) => {
  const name = String(req.body.name || '').trim();
  const city = String(req.body.city || '').trim();
  const description = String(req.body.description || '').trim();
  const price = Number(req.body.price);
  const capacity = Number(req.body.capacity);
  const image = String(req.body.image || '').trim();

  if (!name || !city || !Number.isFinite(price) || price <= 0 || !Number.isInteger(capacity) || capacity < 1) {
    return res.status(400).json({ error: 'زانیارییەکانی کۆشک دروست نییە.' });
  }

  const r = db.prepare(`
    INSERT INTO properties(owner_id,name,city,description,price,capacity,image)
    VALUES(?,?,?,?,?,?,?)
  `).run(req.me.id, name, city, description, Math.round(price), capacity, image);

  res.json({ id: r.lastInsertRowid });
});

app.get('/api/owner/properties', auth, role('owner'), (req, res) => {
  res.json(db.prepare(
    'SELECT * FROM properties WHERE owner_id=? ORDER BY id DESC'
  ).all(req.me.id));
});

app.post('/api/bookings', auth, (req, res) => {
  const propertyId = Number(req.body.property_id);
  const checkin = String(req.body.checkin || '');
  const checkout = String(req.body.checkout || '');
  const guests = Number(req.body.guests);

  if (!Number.isInteger(propertyId) || !validDateRange(checkin, checkout)) {
    return res.status(400).json({ error: 'بەرواری چوون و گەڕان هەڵەیە.' });
  }

  const p = db.prepare('SELECT * FROM properties WHERE id=? AND approved=1').get(propertyId);
  if (!p) return res.status(404).json({ error: 'کۆشک نەدۆزرایەوە.' });

  if (!Number.isInteger(guests) || guests < 1 || guests > p.capacity) {
    return res.status(400).json({ error: `ژمارەی میوان دەبێت لە ١ تا ${p.capacity} بێت.` });
  }

  const overlap = db.prepare(`
    SELECT id FROM bookings
    WHERE property_id=?
      AND status IN ('pending','confirmed')
      AND checkin < ?
      AND checkout > ?
    LIMIT 1
  `).get(propertyId, checkout, checkin);

  if (overlap) {
    return res.status(409).json({ error: 'ئەم کۆشکە لەو بەروارانەدا پێشتر حجزکراوە.' });
  }

  const days = Math.max(
    1,
    Math.ceil((new Date(`${checkout}T00:00:00`) - new Date(`${checkin}T00:00:00`)) / 86400000)
  );
  const total = days * p.price;

  const r = db.prepare(`
    INSERT INTO bookings(property_id,customer_id,checkin,checkout,guests,total)
    VALUES(?,?,?,?,?,?)
  `).run(p.id, req.me.id, checkin, checkout, guests, total);

  res.json({ id: r.lastInsertRowid, total });
});

app.get('/api/bookings', auth, (req, res) => {
  if (req.me.role === 'owner') {
    return res.json(db.prepare(`
      SELECT b.*,p.name AS property,u.name AS customer
      FROM bookings b
      JOIN properties p ON p.id=b.property_id
      JOIN users u ON u.id=b.customer_id
      WHERE p.owner_id=?
      ORDER BY b.id DESC
    `).all(req.me.id));
  }

  res.json(db.prepare(`
    SELECT b.*,p.name AS property
    FROM bookings b
    JOIN properties p ON p.id=b.property_id
    WHERE b.customer_id=?
    ORDER BY b.id DESC
  `).all(req.me.id));
});

app.patch('/api/bookings/:id', auth, (req, res) => {
  const b = db.prepare(`
    SELECT b.*,p.owner_id
    FROM bookings b JOIN properties p ON p.id=b.property_id
    WHERE b.id=?
  `).get(req.params.id);

  if (!b) return res.sendStatus(404);
  if (req.me.role === 'owner' && b.owner_id !== req.me.id) return res.sendStatus(403);
  if (req.me.role === 'customer' && b.customer_id !== req.me.id) return res.sendStatus(403);

  const allowedStatus = ['pending','confirmed','cancelled','completed'];
  const status = allowedStatus.includes(req.body.status) ? req.body.status : b.status;
  const paymentStatus = ['unpaid','pending','paid','failed'].includes(req.body.payment_status)
    ? req.body.payment_status
    : b.payment_status;

  db.prepare('UPDATE bookings SET status=?,payment_status=? WHERE id=?')
    .run(status, paymentStatus, b.id);

  res.json({ ok: true });
});

app.post('/api/payments', auth, (req, res) => {
  const b = db.prepare(
    'SELECT * FROM bookings WHERE id=? AND customer_id=?'
  ).get(req.body.booking_id, req.me.id);

  if (!b) return res.sendStatus(404);

  const r = db.prepare(
    'INSERT INTO payments(booking_id,amount,method,status) VALUES(?,?,?,?)'
  ).run(b.id, b.total, req.body.method || 'manual', 'pending');

  db.prepare('UPDATE bookings SET payment_status=? WHERE id=?')
    .run('pending', b.id);

  res.json({
    id: r.lastInsertRowid,
    message: 'داواکاری پارەدان تۆمارکرا. Gateway ـی پارەدان دەتوانرێت دواتر زیاد بکرێت.'
  });
});

app.get('/api/admin/stats', auth, role('admin'), (req, res) => {
  res.json({
    users: db.prepare('SELECT COUNT(*) n FROM users').get().n,
    properties: db.prepare('SELECT COUNT(*) n FROM properties').get().n,
    pending: db.prepare('SELECT COUNT(*) n FROM properties WHERE approved=0').get().n,
    bookings: db.prepare('SELECT COUNT(*) n FROM bookings').get().n,
    revenue: db.prepare("SELECT COALESCE(SUM(total),0) n FROM bookings WHERE status='confirmed'").get().n
  });
});

app.get('/api/admin/properties', auth, role('admin'), (req, res) => {
  res.json(db.prepare(`
    SELECT p.*,u.name AS owner,u.email
    FROM properties p JOIN users u ON u.id=p.owner_id
    ORDER BY p.id DESC
  `).all());
});

app.patch('/api/admin/properties/:id', auth, role('admin'), (req, res) => {
  db.prepare('UPDATE properties SET approved=? WHERE id=?')
    .run(req.body.approved ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

app.get('/api/admin/users', auth, role('admin'), (req, res) => {
  res.json(db.prepare(
    'SELECT id,name,email,role,created_at FROM users ORDER BY id DESC'
  ).all());
});

app.patch('/api/admin/users/:id/role', auth, role('admin'), (req, res) => {
  const allowed = ['customer','owner'];
  if (!allowed.includes(req.body.role)) return res.status(400).json({ error: 'role_invalid' });
  db.prepare('UPDATE users SET role=? WHERE id=?').run(req.body.role, req.params.id);
  res.json({ ok: true });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Koshkakan running on port ${PORT}`);
});
