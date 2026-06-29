const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'barbershop.db');

let db = null;

async function initDatabase() {
    const SQL = await initSqlJs();

    if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
    }

    db.run('PRAGMA foreign_keys = ON');

    db.run(`
        CREATE TABLE IF NOT EXISTS barbers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT DEFAULT NULL,
            photo TEXT DEFAULT NULL,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    const barberColumns = db.exec("PRAGMA table_info('barbers')");
    const barberCols = barberColumns.length ? barberColumns[0].values.map(v => v[1]) : [];
    if (!barberCols.includes('phone')) {
        db.run("ALTER TABLE barbers ADD COLUMN phone TEXT DEFAULT NULL");
    }

    db.run(`
        CREATE TABLE IF NOT EXISTS styles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            price REAL NOT NULL,
            photo TEXT DEFAULT NULL,
            description TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS bookings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_name TEXT NOT NULL,
            customer_phone TEXT NOT NULL,
            barber_id INTEGER NOT NULL,
            style_id INTEGER NOT NULL,
            queue_number INTEGER NOT NULL,
            status TEXT DEFAULT 'waiting',
            notified_whatsapp INTEGER DEFAULT 0,
            notified_browser INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (barber_id) REFERENCES barbers(id),
            FOREIGN KEY (style_id) REFERENCES styles(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    `);

    const adminExists = db.exec("SELECT COUNT(*) as count FROM settings WHERE key = 'admin_password'");
    if (!adminExists.length || !adminExists[0].values.length || adminExists[0].values[0][0] === 0) {
        db.run("INSERT INTO settings (key, value) VALUES ('admin_password', ?)", ['admin123']);
        console.log('✓ Admin password created (default: admin123)');
    }

    const shopName = db.exec("SELECT COUNT(*) as count FROM settings WHERE key = 'shop_name'");
    if (!shopName.length || !shopName[0].values.length || shopName[0].values[0][0] === 0) {
        db.run("INSERT INTO settings (key, value) VALUES ('shop_name', 'BarberShop Pro')");
    }

    const shopAddr = db.exec("SELECT COUNT(*) as count FROM settings WHERE key = 'address'");
    if (!shopAddr.length || !shopAddr[0].values.length || shopAddr[0].values[0][0] === 0) {
        db.run("INSERT INTO settings (key, value) VALUES ('address', '')");
    }

    const barberCount = db.exec('SELECT COUNT(*) as count FROM barbers');
    if (!barberCount.length || !barberCount[0].values.length || barberCount[0].values[0][0] === 0) {
        db.run('INSERT INTO barbers (name) VALUES (?)', ['أحمد']);
        db.run('INSERT INTO barbers (name) VALUES (?)', ['يوسف']);
        db.run('INSERT INTO barbers (name) VALUES (?)', ['خالد']);
        console.log('✓ Sample barbers created');

        db.run('INSERT INTO styles (name, price, description) VALUES (?, ?, ?)', ['حلاقة كلاسيك', 10, 'حلاقة عادية مع مشط ومقص']);
        db.run('INSERT INTO styles (name, price, description) VALUES (?, ?, ?)', ['حلاقة زيرو', 8, 'حلاقة بالماكينة رقم 0']);
        db.run('INSERT INTO styles (name, price, description) VALUES (?, ?, ?)', ['حلاقة مودرن', 15, 'حلاقة عصرية بتصميم']);
        db.run('INSERT INTO styles (name, price, description) VALUES (?, ?, ?)', ['حلاقة لحية', 5, 'تشذيب وتحديد اللحية']);
        db.run('INSERT INTO styles (name, price, description) VALUES (?, ?, ?)', ['حلاقة كاملة', 20, 'حلاقة رأس + لحية + تنظيف']);
        console.log('✓ Sample styles created');
    }

    saveDatabase();
    console.log('✓ Database initialized');
    return db;
}

function saveDatabase() {
    if (db) {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(DB_PATH, buffer);
    }
}

function getDb() {
    if (!db) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }
    return db;
}

function queryAll(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

function queryOne(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    let result = null;
    if (stmt.step()) {
        result = stmt.getAsObject();
    }
    stmt.free();
    return result;
}

function run(sql, params = []) {
    db.run(sql, params);
    saveDatabase();
    return { changes: db.getRowsModified() };
}

function insert(sql, params = []) {
    db.run(sql, params);
    const id = db.exec('SELECT last_insert_rowid() as id');
    saveDatabase();
    return { lastInsertRowid: id[0].values[0][0], changes: db.getRowsModified() };
}

module.exports = { initDatabase, getDb, queryAll, queryOne, run, insert, saveDatabase };
