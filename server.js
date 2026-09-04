const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'expedicao-brasil-segredo';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'expedicao_brasil',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
});

const games = [
  { id: 'ditados', title: 'Ditados do Brasil', region: 'Nordeste', difficulty: 'Fácil', objective: 'Entender expressões locais e decifrar significados.', icon: '🧭', color: '#ffb703' },
  { id: 'mapa', title: 'Mapa das Regiões', region: 'Centro-Oeste', difficulty: 'Médio', objective: 'Reconhecer símbolos e características das regiões.', icon: '🗺️', color: '#8ecae6' },
  { id: 'troco', title: 'Troco da Feirinha', region: 'Sudeste', difficulty: 'Médio', objective: 'Aplicar cálculo mental em situações reais do dia a dia.', icon: '💰', color: '#a1d99b' },
  { id: 'expressoes', title: 'Expressões do Brasil', region: 'Sul', difficulty: 'Difícil', objective: 'Decodificar gírias e sotaques para viajar pelo país.', icon: '🎧', color: '#d4a5ff' }
];

const levelFromXp = (xp) => Math.max(1, Math.floor(xp / 150) + 1);

async function insertUserGamesProgress(userId) {
  for (const game of games) {
    await pool.execute(
      `INSERT IGNORE INTO user_games
       (user_id, game_id, unlocked, best_score, attempts, stage)
       VALUES (?, ?, 1, 0, 0, 'inicial')`,
      [userId, game.id]
    );
  }
}

async function ensureUserDefaults() {
  const [users] = await pool.execute('SELECT id FROM users');
  for (const user of users) await insertUserGamesProgress(user.id);
}

async function awardBadge(userId, gameId, score) {
  const criteria = {
    ditados: { threshold: 80, name: 'Selo do Sotaque', description: 'Decifrou expressões brasileiras com precisão.', icon: '🗣️' },
    mapa: { threshold: 75, name: 'Mapa de Ouro', description: 'Navegou pelas regiões do Brasil com maestria.', icon: '🧭' },
    troco: { threshold: 90, name: 'Guardião do Troco', description: 'Resolveu contas com agilidade e exatidão.', icon: '💸' },
    expressoes: { threshold: 85, name: 'Decifrador Cultural', description: 'Desvendou gírias e sotaques de diversas regiões.', icon: '🌎' }
  };

  const rule = criteria[gameId];
  if (!rule || score < rule.threshold) return null;

  const [existing] = await pool.execute(
    'SELECT id FROM badges WHERE user_id = ? AND name = ?',
    [userId, rule.name]
  );
  if (existing.length) return null;

  await pool.execute(
    'INSERT INTO badges (user_id, name, description, icon) VALUES (?, ?, ?, ?)',
    [userId, rule.name, rule.description, rule.icon]
  );

  return rule;
}

const generateToken = (user) => jwt.sign(
  { id: user.id, email: user.email, role: user.role, name: user.name },
  JWT_SECRET,
  { expiresIn: '7d' }
);

const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) return res.status(401).json({ message: 'Token de acesso ausente.' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
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

async function getDashboard(userId) {
  const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) return null;

  const [records] = await pool.query(
    'SELECT * FROM game_results WHERE user_id = ? ORDER BY created_at DESC LIMIT 10',
    [userId]
  );
  const [badges] = await pool.query(
    'SELECT * FROM badges WHERE user_id = ? ORDER BY earned_at DESC',
    [userId]
  );
  const [progress] = await pool.query(
    'SELECT * FROM user_games WHERE user_id = ? ORDER BY game_id',
    [userId]
  );
  const [leaderboard] = await pool.query(
    'SELECT id, name, xp, level FROM users ORDER BY xp DESC, created_at ASC LIMIT 10'
  );

  const totalScore = records.reduce((sum, record) => sum + Number(record.score), 0);
  const totalCorrect = records.reduce((sum, record) => sum + Number(record.correct_answers), 0);
  const totalQuestions = records.reduce((sum, record) => sum + Number(record.total_questions), 0);
  const accuracy = totalQuestions ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

  return {
    user: publicUserData(user),
    stats: { totalScore, attempts: records.length, accuracy, medals: badges.length, level: user.level, xp: user.xp },
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
}

async function updateUserProgress(userId, gameId, score, completed) {
  const [rows] = await pool.execute(
    'SELECT * FROM user_games WHERE user_id = ? AND game_id = ?',
    [userId, gameId]
  );
  const row = rows[0];
  const nextBest = row ? Math.max(Number(row.best_score || 0), score) : score;
  const nextAttempts = row ? Number(row.attempts || 0) + 1 : 1;
  const nextStage = completed ? 'concluido' : 'em_andamento';

  await pool.execute(`
    INSERT INTO user_games
      (user_id, game_id, unlocked, best_score, attempts, stage, updated_at)
    VALUES (?, ?, 1, ?, ?, ?, CURRENT_TIMESTAMP)
    ON DUPLICATE KEY UPDATE
      unlocked = 1,
      best_score = GREATEST(best_score, VALUES(best_score)),
      attempts = attempts + 1,
      stage = VALUES(stage),
      updated_at = CURRENT_TIMESTAMP
  `, [userId, gameId, nextBest, nextAttempts, nextStage]);
}

async function updateUserXp(userId, gainedXp) {
  const [[user]] = await pool.query('SELECT xp FROM users WHERE id = ?', [userId]);
  const nextXp = Number(user?.xp || 0) + gainedXp;
  await pool.execute(
    'UPDATE users SET xp = ?, level = ? WHERE id = ?',
    [nextXp, levelFromXp(nextXp), userId]
  );
  return nextXp;
}

async function start() {
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    await ensureUserDefaults();

    app.listen(PORT, () => {
      console.log(`Servidor da Expedição Brasil rodando em http://localhost:${PORT}`);
      console.log(`Banco MySQL conectado: ${process.env.DB_NAME || 'expedicao_brasil'}`);
    });
  } catch (error) {
    console.error('Não foi possível conectar ao MySQL.');
    console.error(error.message);
    process.exit(1);
  }
}

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', message: 'API da Expedição Brasil ativa.', database: 'mysql' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Banco de dados indisponível.' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role = 'aluno' } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ message: 'Nome, e-mail e senha são obrigatórios.' });

    const cleanedEmail = String(email).trim().toLowerCase();
    const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [cleanedEmail]);
    if (existing.length) return res.status(409).json({ message: 'Este e-mail já está cadastrado.' });

    const passwordHash = bcrypt.hashSync(String(password), 10);
    const [result] = await pool.execute(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [String(name).trim(), cleanedEmail, passwordHash, role]
    );

    const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
    await insertUserGamesProgress(user.id);

    return res.status(201).json({ token: generateToken(user), user: publicUserData(user) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Erro ao cadastrar usuário.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: 'Informe e-mail e senha.' });

    const [users] = await pool.execute(
      'SELECT * FROM users WHERE email = ?',
      [String(email).trim().toLowerCase()]
    );
    const user = users[0];
    if (!user) return res.status(401).json({ message: 'Usuário não encontrado.' });

    const valid = bcrypt.compareSync(String(password), user.password_hash);
    if (!valid) return res.status(401).json({ message: 'Senha incorreta.' });

    return res.json({ token: generateToken(user), user: publicUserData(user) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Erro ao realizar login.' });
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ message: 'Usuário não encontrado.' });
    return res.json({ user: publicUserData(user) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Erro ao buscar usuário.' });
  }
});

app.get('/api/dashboard', requireAuth, async (req, res) => {
  try {
    const dashboard = await getDashboard(req.user.id);
    if (!dashboard) return res.status(404).json({ message: 'Usuário não encontrado.' });
    return res.json(dashboard);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Erro ao carregar dashboard.' });
  }
});

app.get('/api/games', requireAuth, async (req, res) => {
  try {
    const dashboard = await getDashboard(req.user.id);
    if (!dashboard) return res.status(404).json({ message: 'Usuário não encontrado.' });
    return res.json({ games: dashboard.games });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Erro ao carregar jogos.' });
  }
});

app.get('/api/leaderboard', requireAuth, async (req, res) => {
  try {
    const [leaderboard] = await pool.query(
      'SELECT id, name, xp, level FROM users ORDER BY xp DESC, created_at ASC LIMIT 10'
    );
    return res.json({ leaderboard });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Erro ao carregar ranking.' });
  }
});

app.post('/api/games/submit', requireAuth, async (req, res) => {
  try {
    const { gameId, score, totalQuestions, correctAnswers, completed = true, feedback = '' } = req.body || {};

    if (!gameId || typeof score !== 'number' || !games.some((game) => game.id === gameId)) {
      return res.status(400).json({ message: 'Jogo inválido ou pontuação ausente.' });
    }

    const medal = await awardBadge(req.user.id, gameId, score);
    const gainedXp = Math.max(50, Math.round(score / 2));
    const nextXp = await updateUserXp(req.user.id, gainedXp);
    await updateUserProgress(req.user.id, gameId, score, Boolean(completed));

    const [result] = await pool.execute(`
      INSERT INTO game_results (user_id, game_id, title, score, total_questions, correct_answers, completed, medal, feedback)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      req.user.id,
      gameId,
      games.find((game) => game.id === gameId).title,
      score,
      Number(totalQuestions || 0),
      Number(correctAnswers || 0),
      completed ? 1 : 0,
      medal ? medal.name : null,
      feedback || 'Jornada concluída com sucesso!'
    ]);

    const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);

    return res.json({
      success: true,
      resultId: result.insertId,
      medal: medal ? medal.name : null,
      xp: nextXp,
      level: user.level,
      user: publicUserData(user)
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Erro ao registrar progresso do jogo.' });
  }
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

start();
