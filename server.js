const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000; // 修改默认端口为3001

// 数据存储目录
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 确保用户文件存在
if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify({}), 'utf8');
}

// 中间件
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

// 简单的会话管理
const sessions = {};

// 生成会话令牌
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// 哈希密码
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// 获取用户数据
function getUsers() {
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data);
}

// 保存用户数据
function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

// 获取用户卡片文件路径
function getUserCardsPath(username) {
    return path.join(DATA_DIR, `${username}_cards.json`);
}

// 注册路由
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    
    const users = getUsers();
    
    if (users[username]) {
        return res.status(400).json({ error: '用户名已存在' });
    }
    
    // 存储新用户
    users[username] = {
        passwordHash: hashPassword(password),
        createdAt: new Date().toISOString()
    };
    
    saveUsers(users);
    
    // 创建空的卡片文件
    fs.writeFileSync(getUserCardsPath(username), JSON.stringify([]), 'utf8');
    
    res.status(201).json({ message: '注册成功' });
});

// 登录路由
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    
    const users = getUsers();
    const user = users[username];
    
    if (!user || user.passwordHash !== hashPassword(password)) {
        return res.status(401).json({ error: '用户名或密码错误' });
    }
    
    // 创建会话
    const token = generateToken();
    sessions[token] = {
        username,
        createdAt: new Date().toISOString()
    };
    
    res.json({ token, username });
});

// 验证会话中间件
function authenticateToken(req, res, next) {
    const token = req.headers['authorization'];
    
    if (!token || !sessions[token]) {
        return res.status(401).json({ error: '未授权' });
    }
    
    req.user = sessions[token];
    next();
}

// 获取卡片
app.get('/api/cards', authenticateToken, (req, res) => {
    const { username } = req.user;
    const cardsPath = getUserCardsPath(username);
    
    if (!fs.existsSync(cardsPath)) {
        return res.json([]);
    }
    
    const cards = JSON.parse(fs.readFileSync(cardsPath, 'utf8'));
    res.json(cards);
});

// 保存卡片
app.post('/api/cards', authenticateToken, (req, res) => {
    const { username } = req.user;
    const cards = req.body;
    
    if (!Array.isArray(cards)) {
        return res.status(400).json({ error: '无效的卡片数据' });
    }
    
    fs.writeFileSync(getUserCardsPath(username), JSON.stringify(cards, null, 2), 'utf8');
    res.json({ message: '卡片保存成功' });
});

// 退出登录
app.post('/api/logout', authenticateToken, (req, res) => {
    const token = req.headers['authorization'];
    delete sessions[token];
    res.json({ message: '退出成功' });
});

// 健康检查接口
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// 读取SSL证书
const privateKey = fs.readFileSync('ssl/server.key', 'utf8');
const certificate = fs.readFileSync('ssl/server.cert', 'utf8');
const credentials = { key: privateKey, cert: certificate };

// 创建HTTPS服务器
const httpsServer = https.createServer(credentials, app);

// 启动HTTPS服务器
httpsServer.listen(PORT, () => {
    console.log(`HTTPS服务器运行在 https://localhost:${PORT}`);
});

// 同时保留HTTP服务器以便兼容
app.listen(PORT + 1, () => {
    console.log(`HTTP服务器运行在 http://localhost:${PORT + 1}`);
});