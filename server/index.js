const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { initDatabase, getDb, queryAll, queryOne, run, insert } = require('./database');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }
});

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/client', express.static(path.join(__dirname, '..', 'client')));

// ==================== IMAGE UPLOAD ====================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const type = req.body.type || 'barbers';
        cb(null, path.join(__dirname, 'uploads', type));
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + ext);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|gif|webp/;
        const ext = allowed.test(path.extname(file.originalname).toLowerCase());
        const mime = allowed.test(file.mimetype);
        cb(null, ext && mime);
    }
});

// ==================== AUTH ====================
app.post('/api/admin/login', (req, res) => {
    try {
        const { password } = req.body;
        if (!password) return res.status(401).json({ error: 'كلمة المرور مطلوبة' });

        let valid = false;
        const stored = queryOne("SELECT value FROM settings WHERE key = 'admin_password'");

        if (stored && stored.value) {
            try { valid = bcrypt.compareSync(password, stored.value); } catch (e) {}
            if (!valid) valid = (password === stored.value);
        }

        if (password === ADMIN_PASSWORD) valid = true;

        if (valid) {
            res.json({ success: true, token: ADMIN_PASSWORD });
        } else {
            res.status(401).json({ error: 'كلمة المرور خاطئة' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

function requireAdmin(req, res, next) {
    const token = req.headers.authorization;
    if (!token || token !== 'Bearer ' + ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

app.put('/api/admin/password', requireAdmin, (req, res) => {
    try {
        const { newPassword } = req.body;
        if (!newPassword || newPassword.length < 4) {
            return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 4 أحرف على الأقل' });
        }
        run("UPDATE settings SET value = ? WHERE key = 'admin_password'", [newPassword]);
        res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==================== BARBERS ====================
app.get('/api/barbers', (req, res) => {
    try {
        const barbers = queryAll('SELECT * FROM barbers WHERE is_active = 1 ORDER BY id');
        res.json(barbers);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/barbers/all', (req, res) => {
    const token = req.headers.authorization;
    if (!token || token !== 'Bearer ' + ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const barbers = queryAll('SELECT * FROM barbers ORDER BY id');
        res.json(barbers);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/barbers', (req, res) => {
    const token = req.headers.authorization;
    if (!token || token !== 'Bearer ' + ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
    const multerMiddleware = upload.single('photo');
    multerMiddleware(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message });
        try {
            const { name } = req.body;
            if (!name || !name.trim()) return res.status(400).json({ error: 'الاسم مطلوب' });
            const photo = req.file ? '/uploads/barbers/' + req.file.filename : null;
            const result = insert('INSERT INTO barbers (name, photo) VALUES (?, ?)', [name.trim(), photo]);
            res.json({ id: result.lastInsertRowid, name: name.trim(), photo });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });
});

app.put('/api/barbers/:id', (req, res) => {
    const token = req.headers.authorization;
    if (!token || token !== 'Bearer ' + ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
    const multerMiddleware = upload.single('photo');
    multerMiddleware(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message });
        try {
            const { id } = req.params;
            const { name, is_active } = req.body;
            const barber = queryOne('SELECT * FROM barbers WHERE id = ?', [id]);
            if (!barber) return res.status(404).json({ error: 'الحلاق غير موجود' });

            let photo = barber.photo;
            if (req.file) photo = '/uploads/barbers/' + req.file.filename;

            const activeVal = is_active !== undefined ? (is_active === '0' || is_active === false ? 0 : 1) : barber.is_active;
            run('UPDATE barbers SET name = ?, photo = ?, is_active = ? WHERE id = ?',
                [name || barber.name, photo, activeVal, id]);
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });
});

app.delete('/api/barbers/:id', requireAdmin, (req, res) => {
    try {
        const { id } = req.params;
        const hasBookings = queryOne("SELECT COUNT(*) as count FROM bookings WHERE barber_id = ? AND status = 'waiting'", [id]);
        if (hasBookings.count > 0) {
            return res.status(400).json({ error: 'لا يمكن حذف حلاق لديه حجوزات نشطة' });
        }
        run('UPDATE barbers SET is_active = 0 WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== STYLES ====================
app.get('/api/styles', (req, res) => {
    try {
        const styles = queryAll('SELECT * FROM styles ORDER BY id');
        res.json(styles);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/styles', (req, res) => {
    const token = req.headers.authorization;
    if (!token || token !== 'Bearer ' + ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
    const multerMiddleware = upload.single('photo');
    multerMiddleware(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message });
        try {
            const { name, price, description } = req.body;
            if (!name || !price) return res.status(400).json({ error: 'الاسم والسعر مطلوبان' });
            const p = parseFloat(price);
            if (isNaN(p) || p <= 0) return res.status(400).json({ error: 'السعر غير صحيح' });
            const photo = req.file ? '/uploads/styles/' + req.file.filename : null;
            const result = insert('INSERT INTO styles (name, price, photo, description) VALUES (?, ?, ?, ?)',
                [name.trim(), p, photo, description || '']);
            res.json({ id: result.lastInsertRowid, name: name.trim(), price: p, photo });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });
});

app.put('/api/styles/:id', (req, res) => {
    const token = req.headers.authorization;
    if (!token || token !== 'Bearer ' + ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
    const multerMiddleware = upload.single('photo');
    multerMiddleware(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message });
        try {
            const { id } = req.params;
            const { name, price, description } = req.body;
            const style = queryOne('SELECT * FROM styles WHERE id = ?', [id]);
            if (!style) return res.status(404).json({ error: 'نوع الحلاقة غير موجود' });

            let photo = style.photo;
            if (req.file) photo = '/uploads/styles/' + req.file.filename;

            run('UPDATE styles SET name = ?, price = ?, photo = ?, description = ? WHERE id = ?', [
                name || style.name,
                price ? parseFloat(price) : style.price,
                photo,
                description !== undefined ? description : style.description,
                id
            ]);
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });
});

app.delete('/api/styles/:id', requireAdmin, (req, res) => {
    try {
        const { id } = req.params;
        const hasBookings = queryOne("SELECT COUNT(*) as count FROM bookings WHERE style_id = ? AND status = 'waiting'", [id]);
        if (hasBookings.count > 0) {
            return res.status(400).json({ error: 'لا يمكن حذف نوع حلاقة له حجوزات نشطة' });
        }
        run('DELETE FROM styles WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== BOOKINGS ====================
app.post('/api/book', (req, res) => {
    try {
        const { customer_name, customer_phone, barber_id, style_id } = req.body;
        if (!customer_name || !customer_phone || !barber_id || !style_id) {
            return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        }

        const barber = queryOne('SELECT * FROM barbers WHERE id = ? AND is_active = 1', [barber_id]);
        if (!barber) return res.status(400).json({ error: 'الحلاق غير موجود' });

        const style = queryOne('SELECT * FROM styles WHERE id = ?', [style_id]);
        if (!style) return res.status(400).json({ error: 'نوع الحلاقة غير موجود' });

        const maxNum = queryOne("SELECT MAX(queue_number) as max FROM bookings WHERE status = 'waiting'");
        const queue_number = (maxNum && maxNum.max ? maxNum.max : 0) + 1;

        insert(
            'INSERT INTO bookings (customer_name, customer_phone, barber_id, style_id, queue_number) VALUES (?, ?, ?, ?, ?)',
            [customer_name.trim(), customer_phone.trim(), barber_id, style_id, queue_number]
        );

        const booking = queryOne(`
            SELECT b.*, br.name as barber_name, s.name as style_name, s.price
            FROM bookings b
            JOIN barbers br ON b.barber_id = br.id
            JOIN styles s ON b.style_id = s.id
            WHERE b.queue_number = ? AND b.customer_phone = ?
            ORDER BY b.id DESC LIMIT 1
        `, [queue_number, customer_phone.trim()]);

        io.emit('queue-updated', { action: 'new-booking', booking });
        io.emit('queue-counts', getQueueCounts());

        res.json(booking);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/queue', (req, res) => {
    try {
        const queue = queryAll(`
            SELECT b.*, br.name as barber_name, br.photo as barber_photo,
                   s.name as style_name, s.price
            FROM bookings b
            JOIN barbers br ON b.barber_id = br.id
            JOIN styles s ON b.style_id = s.id
            WHERE b.status = 'waiting' OR b.status = 'in_progress'
            ORDER BY b.queue_number ASC
        `);
        res.json(queue);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/queue/full', (req, res) => {
    const token = req.headers.authorization;
    if (!token || token !== 'Bearer ' + ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const queue = queryAll(`
            SELECT b.*, br.name as barber_name, br.photo as barber_photo,
                   s.name as style_name, s.price
            FROM bookings b
            JOIN barbers br ON b.barber_id = br.id
            JOIN styles s ON b.style_id = s.id
            WHERE b.status != 'done'
            ORDER BY b.queue_number ASC
        `);
        res.json(queue);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/queue/check/:phone', (req, res) => {
    try {
        const { phone } = req.params;
        const booking = queryOne(`
            SELECT b.*, br.name as barber_name, s.name as style_name, s.price
            FROM bookings b
            JOIN barbers br ON b.barber_id = br.id
            JOIN styles s ON b.style_id = s.id
            WHERE b.customer_phone = ? AND (b.status = 'waiting' OR b.status = 'in_progress')
            ORDER BY b.created_at DESC
            LIMIT 1
        `, [phone]);

        if (!booking) return res.json(null);

        const ahead = queryOne("SELECT COUNT(*) as count FROM bookings WHERE status = 'waiting' AND queue_number < ?", [booking.queue_number]);
        res.json({ ...booking, ahead: ahead.count });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/queue/:id/status', (req, res) => {
    const token = req.headers.authorization;
    if (!token || token !== 'Bearer ' + ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!['waiting', 'in_progress', 'done'].includes(status)) {
            return res.status(400).json({ error: 'حالة غير صالحة' });
        }

        run('UPDATE bookings SET status = ? WHERE id = ?', [status, id]);
        const booking = queryOne(`
            SELECT b.*, br.name as barber_name, s.name as style_name
            FROM bookings b
            JOIN barbers br ON b.barber_id = br.id
            JOIN styles s ON b.style_id = s.id
            WHERE b.id = ?
        `, [id]);

        io.emit('queue-updated', { action: 'status-change', booking, status });

        if (status === 'in_progress') {
            io.emit('your-turn', { booking, phone: booking.customer_phone });
        }

        io.emit('queue-counts', getQueueCounts());

        if (status === 'done') {
            const nextInLine = queryOne("SELECT * FROM bookings WHERE status = 'waiting' ORDER BY queue_number ASC LIMIT 1");
            if (nextInLine) {
                io.emit('nearly-your-turn', { booking: nextInLine });
            }
        }

        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/queue/:id', (req, res) => {
    const token = req.headers.authorization;
    if (!token || token !== 'Bearer ' + ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
    try {
        run("UPDATE bookings SET status = 'done' WHERE id = ?", [req.params.id]);
        io.emit('queue-updated', { action: 'cancelled', id: parseInt(req.params.id) });
        io.emit('queue-counts', getQueueCounts());
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

function getQueueCounts() {
    try {
        const waiting = queryOne("SELECT COUNT(*) as count FROM bookings WHERE status = 'waiting'");
        const inProgress = queryOne("SELECT COUNT(*) as count FROM bookings WHERE status = 'in_progress'");
        return { waiting: waiting.count, in_progress: inProgress.count };
    } catch {
        return { waiting: 0, in_progress: 0 };
    }
}

// ==================== STATS ====================
app.get('/api/admin/stats', (req, res) => {
    const token = req.headers.authorization;
    if (!token || token !== 'Bearer ' + ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const totalBookings = queryOne('SELECT COUNT(*) as count FROM bookings');
        const todayBookings = queryOne("SELECT COUNT(*) as count FROM bookings WHERE DATE(created_at) = DATE('now')");
        const waiting = queryOne("SELECT COUNT(*) as count FROM bookings WHERE status = 'waiting'");
        const done = queryOne("SELECT COUNT(*) as count FROM bookings WHERE status = 'done'");
        const barbersCount = queryOne('SELECT COUNT(*) as count FROM barbers WHERE is_active = 1');
        const stylesCount = queryOne('SELECT COUNT(*) as count FROM styles');
        res.json({
            totalBookings: totalBookings.count,
            todayBookings: todayBookings.count,
            waiting: waiting.count,
            done: done.count,
            barbersCount: barbersCount.count,
            stylesCount: stylesCount.count
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== SOCKET.IO ====================
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('join-queue-track', (phone) => {
        socket.join('track-' + phone);
    });

    socket.on('join-admin', () => {
        socket.join('admin-room');
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// ==================== SERVE FRONTEND ====================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

// ==================== START ====================
(async () => {
    await initDatabase();

    server.listen(PORT, '0.0.0.0', () => {
        console.log('');
        console.log('╔══════════════════════════════════════════╗');
        console.log('║       BarberShop Queue System            ║');
        console.log('╠══════════════════════════════════════════╣');
        console.log('║  Server: http://localhost:' + PORT + '           ║');
        console.log('║  Admin:  http://localhost:' + PORT + '/admin        ║');
        console.log('║                                          ║');
        console.log('║  Admin Password: ' + ADMIN_PASSWORD + '              ║');
        console.log('╚══════════════════════════════════════════╝');
        console.log('');
    });
})();
