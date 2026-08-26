const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'expedicao-brasil-segredo';

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'app.db'));
db.pragma('journal_mode = WAL');

const games = [
  {
    id: 'ditados',
    title: 'Ditados do Brasil',
    region: 'Nordeste',
    difficulty: 'Fácil',
    objective: 'Entender expressões locais e decifrar significados.',
    icon: '🧭',
    color: '#ffb703'
  },
  {
    id: 'mapa',
    title: 'Mapa das Regiões',
    region: 'Centro-Oeste',
    difficulty: 'Médio',
    objective: 'Reconhecer símbolos e características das regiões.',
    icon: '🗺️',
    color: '#8ecae6'
  },
  {
    id: 'troco',
    title: 'Troco da Feirinha',
    region: 'Sudeste',
    difficulty: 'Médio',
    objective: 'Aplicar cálculo mental em situações reais do dia a dia.',
    icon: '💰',
    color: '#a1d99b'
  },
  {
    id: 'expressoes',
    title: 'Expressões do Brasil',
    region: 'Sul',
    difficulty: 'Difícil',
    objective: 'Decodificar gírias e sotaques para viajar pelo país.',
    icon: '🎧',
    color: '#d4a5ff'
  }
];

const levelFromXp = (xp) => Math.max(1, Math.floor(xp / 150) + 1);

const insertUserGamesProgress = (userId) => {
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO user_games (user_id, game_id, unlocked, best_score, attempts, stage) VALUES (?, ?, 1, 0, 0, 'inicial')"
  );
  games.forEach((game) => stmt.run(userId, game.id));
};

const createTables = () => {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'aluno',
      xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      avatar TEXT DEFAULT '🧭',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS user_games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      game_id TEXT NOT NULL,
      unlocked INTEGER DEFAULT 0,
      best_score INTEGER DEFAULT 0,
      attempts INTEGER DEFAULT 0,
      stage TEXT DEFAULT 'inicial',
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, game_id)
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS game_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      game_id TEXT NOT NULL,
      title TEXT NOT NULL,
      score INTEGER NOT NULL,
      total_questions INTEGER NOT NULL,
      correct_answers INTEGER NOT NULL,
      completed INTEGER DEFAULT 0,
      medal TEXT,
      feedback TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS badges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      icon TEXT NOT NULL,
      earned_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, name)
    )
  `).run();
};

const ensureUserDefaults = () => {
  const users = db.prepare('SELECT id FROM users').all();
  users.forEach((user) => insertUserGamesProgress(user.id));
};

const awardBadge = (userId, gameId, score) => {
  const criteria = {
    ditados: { threshold: 80, name: 'Selo do Sotaque', description: 'Decifrou expressões brasileiras com precisão.', icon: '🗣️' },
    mapa: { threshold: 75, name: 'Mapa de Ouro', description: 'Navegou pelas regiões do Brasil com maestria.', icon: '🧭' },
    troco: { threshold: 90, name: 'Guardião do Troco', description: 'Resolveu contas com agilidade e exatidão.', icon: '💸' },
    expressoes: { threshold: 85, name: 'Decifrador Cultural', description: 'Desvendou gírias e sotaques de diversas regiões.', icon: '🌎' }
  };

  const rule = criteria[gameId];
  if (!rule || score < rule.threshold) return null;

  const existing = db.prepare('SELECT id FROM badges WHERE user_id = ? AND name = ?').get(userId, rule.name);
  if (existing) return null;

  db.prepare('INSERT INTO badges (user_id, name, description, icon) VALUES (?, ?, ?, ?)').run(
    userId,
    rule.name,
    rule.description,
    rule.icon
  );

  return rule;
};

const generateToken = (user) => jwt.sign(
  {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name
  },
  JWT_SECRET,
  { expiresIn: '7d' }
);

const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    return res.status(401).json({ message: 'Token de acesso ausente.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Sessão inválida ou expirada.' });
  }
};

const publicUserData = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  xp: user.xp,
  level: user.level,
  avatar: user.avatar,
  created_at: user.created_at
});

const getDashboard = (userId) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const records = db.prepare(
    'SELECT * FROM game_results WHERE user_id = ? ORDER BY created_at DESC LIMIT 10'
  ).all(userId);
  const badges = db.prepare(
    'SELECT * FROM badges WHERE user_id = ? ORDER BY earned_at DESC'
  ).all(userId);
  const progress = db.prepare(
    'SELECT * FROM user_games WHERE user_id = ? ORDER BY game_id'
  ).all(userId);

  const totalScore = records.reduce((sum, record) => sum + record.score, 0);
  const totalCorrect = records.reduce((sum, record) => sum + Number(record.correct_answers), 0);
  const totalQuestions = records.reduce((sum, record) => sum + Number(record.total_questions), 0);
  const accuracy = totalQuestions ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

  const leaderboard = db.prepare(
    'SELECT id, name, xp, level FROM users ORDER BY xp DESC, created_at ASC LIMIT 10'
  ).all();

  return {
    user: publicUserData(user),
    stats: {
      totalScore,
      attempts: records.length,
      accuracy,
      medals: badges.length,
      level: user.level,
      xp: user.xp
    },
    games: games.map((game) => {
      const item = progress.find((entry) => entry.game_id === game.id) || null;
      return {
        ...game,
        unlocked: item ? Boolean(item.unlocked) : false,
        best_score: item ? item.best_score : 0,
        attempts: item ? item.attempts : 0,
        stage: item ? item.stage : 'inicial'
      };
    }),
    history: records,
    badges,
    leaderboard
  };
};

const updateUserProgress = (userId, gameId, score, completed) => {
  const row = db.prepare('SELECT * FROM user_games WHERE user_id = ? AND game_id = ?').get(userId, gameId);
  const nextBest = row ? Math.max(row.best_score || 0, score) : score;
  const nextAttempts = row ? (row.attempts || 0) + 1 : 1;
  const nextStage = completed ? 'concluido' : 'em_andamento';

  db.prepare(`
    INSERT INTO user_games (user_id, game_id, unlocked, best_score, attempts, stage, updated_at)
    VALUES (?, ?, 1, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, game_id)
    DO UPDATE SET
      unlocked = 1,
      best_score = MAX(best_score, excluded.best_score),
      attempts = attempts + 1,
      stage = excluded.stage,
      updated_at = CURRENT_TIMESTAMP
  `).run(userId, gameId, nextBest, nextAttempts, nextStage);
};

const updateUserXp = (userId, gainedXp) => {
  const user = db.prepare('SELECT xp FROM users WHERE id = ?').get(userId);
  const nextXp = (user?.xp || 0) + gainedXp;
  db.prepare('UPDATE users SET xp = ?, level = ? WHERE id = ?').run(nextXp, levelFromXp(nextXp), userId);
  return nextXp;
};

createTables();
ensureUserDefaults();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'API da Expedição Brasil ativa.' });
});

app.post('/api/auth/register', (req, res) => {
  const { name, email, password, role = 'aluno' } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Nome, e-mail e senha são obrigatórios.' });
  }

  const cleanedEmail = String(email).trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanedEmail);
  if (existing) {
    return res.status(409).json({ message: 'Este e-mail já está cadastrado.' });
  }

  const passwordHash = bcrypt.hashSync(String(password), 10);
  const result = db.prepare(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)'
  ).run(name.trim(), cleanedEmail, passwordHash, role);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  insertUserGamesProgress(user.id);

  return res.status(201).json({
    token: generateToken(user),
    user: publicUserData(user)
  });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: 'Informe e-mail e senha.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).trim().toLowerCase());
  if (!user) {
    return res.status(401).json({ message: 'Usuário não encontrado.' });
  }

  const valid = bcrypt.compareSync(String(password), user.password_hash);
  if (!valid) {
    return res.status(401).json({ message: 'Senha incorreta.' });
  }

  return res.json({
    token: generateToken(user),
    user: publicUserData(user)
  });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) {
    return res.status(404).json({ message: 'Usuário não encontrado.' });
  }
  return res.json({ user: publicUserData(user) });
});

app.get('/api/dashboard', requireAuth, (req, res) => {
  const dashboard = getDashboard(req.user.id);
  return res.json(dashboard);
});

app.get('/api/games', requireAuth, (req, res) => {
  const dashboard = getDashboard(req.user.id);
  return res.json({ games: dashboard.games });
});

app.get('/api/leaderboard', requireAuth, (req, res) => {
  const leaderboard = db.prepare(
    'SELECT id, name, xp, level FROM users ORDER BY xp DESC, created_at ASC LIMIT 10'
  ).all();
  return res.json({ leaderboard });
});

app.post('/api/games/submit', requireAuth, (req, res) => {
  const { gameId, score, totalQuestions, correctAnswers, completed = true, feedback = '' } = req.body || {};

  if (!gameId || typeof score !== 'number' || !games.some((game) => game.id === gameId)) {
    return res.status(400).json({ message: 'Jogo inválido ou pontuação ausente.' });
  }

  const medal = awardBadge(req.user.id, gameId, score);
  const gainedXp = Math.max(50, Math.round(score / 2));
  const nextXp = updateUserXp(req.user.id, gainedXp);
  updateUserProgress(req.user.id, gameId, score, Boolean(completed));

  const result = db.prepare(`
    INSERT INTO game_results (user_id, game_id, title, score, total_questions, correct_answers, completed, medal, feedback)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.id,
    gameId,
    games.find((game) => game.id === gameId).title,
    score,
    Number(totalQuestions || 0),
    Number(correctAnswers || 0),
    completed ? 1 : 0,
    medal ? medal.name : null,
    feedback || 'Jornada concluída com sucesso!'
  );

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

  return res.json({
    success: true,
    resultId: result.lastInsertRowid,
    medal: medal ? medal.name : null,
    xp: nextXp,
    level: user.level,
    user: publicUserData(user)
  });
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor da Expedição Brasil rodando em http://localhost:${PORT}`);
});
