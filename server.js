const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000; 

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify({}), 'utf8');
}

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(__dirname));

const sessions = {};

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

function getUsers() {
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data);
}

function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function getUserCardsPath(username) {
    return path.join(DATA_DIR, `${username}_cards.json`);
}

app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password cannot be empty' });
    }
    
    const users = getUsers();
    
    if (users[username]) {
        return res.status(400).json({ error: 'Username already exists' });
    }
    
    users[username] = {
        passwordHash: hashPassword(password),
        createdAt: new Date().toISOString()
    };
    
    saveUsers(users);
    
    fs.writeFileSync(getUserCardsPath(username), JSON.stringify([]), 'utf8');
    
    res.status(201).json({ message: 'Registration successful' });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password cannot be empty' });
    }
    
    const users = getUsers();
    const user = users[username];
    
    if (!user || user.passwordHash !== hashPassword(password)) {
        return res.status(401).json({ error: 'Username or password is incorrect' });
    }
    
    const token = generateToken();
    sessions[token] = {
        username,
        createdAt: new Date().toISOString()
    };
    
    res.json({ token, username });
});

function authenticateToken(req, res, next) {
    const token = req.headers['authorization'];
    
    if (!token || !sessions[token]) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    req.user = sessions[token];
    next();
}

app.get('/api/cards', authenticateToken, (req, res) => {
    const { username } = req.user;
    const cardsPath = getUserCardsPath(username);
    
    if (!fs.existsSync(cardsPath)) {
        return res.json([]);
    }
    
    const data = JSON.parse(fs.readFileSync(cardsPath, 'utf8'));
    
    // 处理旧格式数据（只有卡片数组）和新格式数据（包含分数）
    if (Array.isArray(data)) {
        // 旧格式，返回卡片数组
        res.json(data);
    } else {
        // 新格式，返回完整数据
        res.json(data);
    }
});

app.post('/api/cards', authenticateToken, (req, res) => {
    const { username } = req.user;
    const data = req.body;
    
    // 验证数据结构
    if (Array.isArray(data)) {
        // 旧格式：只有卡片数组
        if (!data.every(card => card.id && card.front && card.back)) {
            return res.status(400).json({ error: 'Invalid card data format' });
        }
        fs.writeFileSync(getUserCardsPath(username), JSON.stringify(data, null, 2), 'utf8');
    } else {
        // 新格式：包含卡片和分数数据
        if (!data.cards || !Array.isArray(data.cards) || 
            !data.gemSlots || !Array.isArray(data.gemSlots) ||
            !data.gemScore || !Array.isArray(data.gemScore)) {
            return res.status(400).json({ error: 'Invalid data format' });
        }
        
        // 验证卡片数据
        if (!data.cards.every(card => card.id && card.front && card.back)) {
            return res.status(400).json({ error: 'Invalid card data format' });
        }
        
        // 验证分数数据
        if (data.gemSlots.length !== 6 || data.gemScore.length !== 6) {
            return res.status(400).json({ error: 'Invalid score data format' });
        }
        
        fs.writeFileSync(getUserCardsPath(username), JSON.stringify(data, null, 2), 'utf8');
    }
    
    res.json({ message: 'Data saved successfully' });
});

app.post('/api/logout', authenticateToken, (req, res) => {
    const token = req.headers['authorization'];
    delete sessions[token];
    res.json({ message: 'Logout successful' });
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// 代理有道API请求
app.get('/api/youdao-audio', async (req, res) => {
    try {
        const { audio, type } = req.query;
        
        if (!audio) {
            return res.status(400).json({ error: 'Audio parameter is required' });
        }
        
        const youdaoUrl = `http://dict.youdao.com/dictvoice?audio=${encodeURIComponent(audio)}&type=${type || '1'}`;
        
        const response = await fetch(youdaoUrl);
        
        if (!response.ok) {
            return res.status(response.status).json({ error: 'Failed to fetch audio from Youdao' });
        }
        
        const audioBuffer = await response.buffer();
        
        res.set({
            'Content-Type': 'audio/mp3',
            'Content-Length': audioBuffer.length,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        
        res.send(audioBuffer);
    } catch (error) {
        console.error('Error proxying Youdao audio:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

const privateKey = fs.readFileSync('ssl/server.key', 'utf8');
const certificate = fs.readFileSync('ssl/server.cert', 'utf8');
const credentials = { key: privateKey, cert: certificate };

const httpsServer = https.createServer(credentials, app);

// 设置HTTPS服务器的最大请求大小
httpsServer.maxHeaderSize = 64 * 1024; // 64KB headers
httpsServer.maxConnections = 1000;

httpsServer.listen(PORT, () => {
    console.log(`HTTPS server is running on https://localhost:${PORT}`);
});

app.listen(PORT + 1, () => {
    console.log(`HTTP server is running on http://localhost:${PORT + 1}`);
});