const API_BASE = '/api';
const state = {
  token: localStorage.getItem('expedicao-token') || '',
  user: null,
  dashboard: null,
  activeGame: null,
  currentGameSession: null
};

const authScreen = document.getElementById('authScreen');
const dashboardScreen = document.getElementById('dashboardScreen');
const dashboardBtn = document.getElementById('dashboardBtn');
const logoutBtn = document.getElementById('logoutBtn');
const authMessage = document.getElementById('authMessage');
const welcomeUser = document.getElementById('welcomeUser');
const levelPill = document.getElementById('levelPill');
const totalScore = document.getElementById('totalScore');
const accuracyScore = document.getElementById('accuracyScore');
const attemptsCount = document.getElementById('attemptsCount');
const medalsCount = document.getElementById('medalsCount');
const gamesList = document.getElementById('gamesList');
const leaderboardList = document.getElementById('leaderboardList');
const badgesList = document.getElementById('badgesList');
const historyList = document.getElementById('historyList');
const gameModal = document.getElementById('gameModal');
const gameModalTitle = document.getElementById('gameModalTitle');
const gameModalMeta = document.getElementById('gameModalMeta');
const gameContent = document.getElementById('gameContent');

const gameDefinitions = {
  ditados: {
    title: 'Ditados do Brasil',
    region: 'Nordeste',
    difficulty: 'Fácil',
    icon: '🧭',
    questions: [
      {
        prompt: 'Qual expressão significa “está muito confuso ou sem rumo”?',
        options: ['Tá no mato', 'Tá no bom', 'Tá na areia'],
        answer: 0,
        hint: 'Pense em algo que parece estar perdido sem direção.',
        explanation: '“Tá no mato” é uma expressão usada para indicar confusão ou desorientação.'
      },
      {
        prompt: 'Em várias regiões, “bora” significa:',
        options: ['Vamos embora', 'Comer agora', 'Parar quieto'],
        answer: 0,
        hint: 'É uma forma de incentivar a ação.',
        explanation: '“Bora” é uma expressão popular para convidar alguém a ir ou começar algo.'
      },
      {
        prompt: 'Qual frase melhor traduz “meu deu trabalho”?',
        options: ['A situação foi difícil', 'Vou ficar em casa', 'Já cheguei'],
        answer: 0,
        hint: 'Neste caso, a ideia é de esforço ou esforço grande.',
        explanation: 'A expressão transmite que algo exigiu muito trabalho ou desgaste.'
      }
    ]
  },
  mapa: {
    title: 'Mapa das Regiões',
    region: 'Brasil',
    difficulty: 'Médio',
    icon: '🗺️',
    questions: [
      {
        prompt: 'Qual região é conhecida pela produção de café e pela diversidade cultural?',
        options: ['Sudeste', 'Norte', 'Nordeste'],
        answer: 0,
        hint: 'Ela reúne grandes cidades e importantes cidades históricas.',
        explanation: 'O Sudeste é reconhecido pela produção cafeeira, cidades como São Paulo e Minas Gerais e grande diversidade cultural.'
      },
      {
        prompt: 'Qual região tem o maior território e uma grande presença da floresta amazônica?',
        options: ['Norte', 'Sul', 'Centro-Oeste'],
        answer: 0,
        hint: 'Pense na região que abriga a maior floresta tropical do planeta.',
        explanation: 'O Norte é a região da Amazônia, com grande extensão territorial e biodiversidade enorme.'
      },
      {
        prompt: 'A tradição gaúcha e o uso de chimarrão estão ligados a qual região?',
        options: ['Sul', 'Nordeste', 'Centro-Oeste'],
        answer: 0,
        hint: 'A região conhecida por festas tradicionais e clima mais frio.',
        explanation: 'O Sul tem forte ligação com a tradição gaúcha e o chimarrão.'
      }
    ]
  },
  troco: {
    title: 'Troco da Feirinha',
    region: 'Sudeste',
    difficulty: 'Médio',
    icon: '💰',
    questions: [
      {
        prompt: 'Uma fruta custa R$ 3,50 e você compra 2. Quanto paga?',
        options: ['R$ 6,00', 'R$ 7,00', 'R$ 5,50'],
        answer: 1,
        hint: 'Multiplique 3,50 por 2.',
        explanation: '3,50 × 2 = 7,00 reais.'
      },
      {
        prompt: 'Você deu R$ 20,00 para pagar uma compra de R$ 13,75. Quanto recebe de troco?',
        options: ['R$ 6,25', 'R$ 6,75', 'R$ 5,25'],
        answer: 0,
        hint: 'Subtraia o valor da compra do que você pagou.',
        explanation: '20,00 − 13,75 = 6,25 reais de troco.'
      },
      {
        prompt: 'Se 3 doces custam R$ 4,50, quanto custa 1 doce?',
        options: ['R$ 1,50', 'R$ 2,00', 'R$ 1,00'],
        answer: 0,
        hint: 'Divida o total por 3.',
        explanation: '4,50 ÷ 3 = 1,50 reais por doce.'
      }
    ]
  },
  expressoes: {
    title: 'Expressões do Brasil',
    region: 'Brasil',
    difficulty: 'Difícil',
    icon: '🎧',
    questions: [
      {
        prompt: 'Qual expressão significa “ficar muito feliz ou empolgado”?',
        options: ['Estar de cara nova', 'Tirar o maior onda', 'Estou no clima'],
        answer: 1,
        hint: 'Pense em uma expressão popular que combina entusiasmo e vibração.',
        explanation: '“Tirar o maior onda” é uma expressão usada para dizer que alguém está muito animado ou empolgado.'
      },
      {
        prompt: 'O que “deu ruim” significa?',
        options: ['Entrou em contato', 'Acabou dando errado', 'Foi bem direcionado'],
        answer: 1,
        hint: 'É uma expressão usada quando algo não saiu como planejado.',
        explanation: '“Deu ruim” significa que algo aconteceu de forma negativa ou saiu errado.'
      },
      {
        prompt: 'Qual frase melhor explica “meu amigo é um trenzinho”?',
        options: ['É muito lento', 'É muito rápido e sempre adora correr', 'É muito simpático'],
        answer: 1,
        hint: 'Pense em algo relacionado a velocidade ou continuidade.',
        explanation: '“É um trenzinho” pode ser usado em contexto de brincadeira para dizer que a pessoa é muito rápida ou agitada.'
      }
    ]
  }
};

function setAuthMessage(text, isError = false) {
  authMessage.textContent = text;
  authMessage.classList.toggle('hidden', !text);
  authMessage.style.background = isError ? 'rgba(242, 92, 100, 0.08)' : 'rgba(61, 191, 140, 0.12)';
  authMessage.style.color = isError ? '#8a2a32' : '#276c4d';
}

function toggleAuthViews(isAuthenticated) {
  authScreen.classList.toggle('hidden', isAuthenticated);
  dashboardScreen.classList.toggle('hidden', !isAuthenticated);
  dashboardBtn.classList.toggle('hidden', !isAuthenticated);
  logoutBtn.classList.toggle('hidden', !isAuthenticated);
}

function getAuthHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${state.token}`
  };
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {})
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || 'Erro ao carregar dados.');
  }
  return payload;
}

async function registerUser(event) {
  event.preventDefault();
  const name = document.getElementById('registerName').value.trim();
  const email = document.getElementById('registerEmail').value.trim();
  const password = document.getElementById('registerPassword').value;

  try {
    const result = await apiFetch('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, role: 'aluno' })
    });

    state.token = result.token;
    state.user = result.user;
    localStorage.setItem('expedicao-token', result.token);
    setAuthMessage('Cadastro realizado com sucesso!');
    await loadDashboard();
  } catch (error) {
    setAuthMessage(error.message, true);
  }
}

async function loginUser(event) {
  event.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  try {
    const result = await apiFetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    state.token = result.token;
    state.user = result.user;
    localStorage.setItem('expedicao-token', result.token);
    setAuthMessage('Login realizado com sucesso!');
    await loadDashboard();
  } catch (error) {
    setAuthMessage(error.message, true);
  }
}

async function loadDashboard() {
  try {
    const data = await apiFetch('/dashboard');
    state.dashboard = data;
    state.user = data.user;
    renderDashboard(data);
    toggleAuthViews(true);
  } catch (error) {
    localStorage.removeItem('expedicao-token');
    state.token = '';
    toggleAuthViews(false);
    setAuthMessage(error.message, true);
  }
}

function renderDashboard(data) {
  const { user, stats, games, badges, history, leaderboard } = data;
  welcomeUser.textContent = `Bem-vindo(a), ${user.name}!`;
  levelPill.textContent = `Nível ${user.level}`;
  totalScore.textContent = stats.totalScore;
  accuracyScore.textContent = `${stats.accuracy}%`;
  attemptsCount.textContent = stats.attempts;
  medalsCount.textContent = stats.medals;

  gamesList.innerHTML = games.map((game) => `
    <article class="game-card">
      <div class="game-top">
        <div class="game-title-wrap">
          <div class="game-icon" style="background:${game.color || 'rgba(255, 197, 81, 0.1)'}">${game.icon}</div>
          <div>
            <h4>${game.title}</h4>
            <span class="tag">${game.difficulty}</span>
          </div>
        </div>
        <span class="tag">${game.region}</span>
      </div>
      <p>${game.objective}</p>
      <div class="meta-row">
        <span>Melhor: ${game.best_score || 0} pts</span>
        <span>Jogou ${game.attempts || 0}x</span>
      </div>
      <button class="small-btn" data-game-id="${game.id}">Jogar</button>
    </article>
  `).join('');

  gamesList.querySelectorAll('[data-game-id]').forEach((button) => {
    button.addEventListener('click', () => openGame(button.dataset.gameId));
  });

  leaderboardList.innerHTML = leaderboard.map((person, index) => `
    <li>
      <span>#${index + 1} ${person.name}</span>
      <span>${person.xp} XP</span>
    </li>
  `).join('');

  badgesList.innerHTML = badges.length
    ? badges.map((badge) => `
      <div class="badge-item">
        <div class="badge-icon">${badge.icon}</div>
        <div>
          <strong>${badge.name}</strong>
          <span>${badge.description}</span>
        </div>
      </div>
    `).join('')
    : '<p class="empty-state">Ainda não há medalhas conquistadas. Faça sua primeira missão!</p>';

  historyList.innerHTML = history.length
    ? history.map((entry) => `
      <div class="history-item">
        <strong>${entry.title}</strong>
        <span>${entry.score} pts • ${entry.correct_answers}/${entry.total_questions} acertos</span>
      </div>
    `).join('')
    : '<p class="empty-state">Seu histórico está vazio. Comece a explorar.</p>';
}

function openGame(gameId) {
  state.activeGame = gameId;
  const definition = gameDefinitions[gameId];
  if (!definition) return;

  state.currentGameSession = {
    gameId,
    score: 0,
    currentIndex: 0,
    correctAnswers: 0
  };

  gameModalTitle.textContent = definition.title;
  gameModalMeta.textContent = `${definition.region} • ${definition.difficulty}`;
  renderQuestion();
  gameModal.classList.remove('hidden');
}

function renderQuestion() {
  const gameId = state.activeGame;
  const definition = gameDefinitions[gameId];
  const session = state.currentGameSession;
  const question = definition.questions[session.currentIndex];

  if (!question) {
    finishGame();
    return;
  }

  const questionMarkup = `
    <div class="question-card">
      <h4>Questão ${session.currentIndex + 1}</h4>
      <p>${question.prompt}</p>
      <div class="option-list">
        ${question.options.map((option, index) => `
          <button class="option-btn" data-index="${index}">${option}</button>
        `).join('')}
      </div>
      <div class="hint-box">💡 Dica: ${question.hint}</div>
      <div class="game-footer">
        <div class="progress-summary">${session.currentIndex + 1}/${definition.questions.length}</div>
      </div>
    </div>
  `;

  gameContent.innerHTML = questionMarkup;
  gameContent.querySelectorAll('.option-btn').forEach((button) => {
    button.addEventListener('click', () => evaluateAnswer(button.dataset.index, question));
  });
}

function evaluateAnswer(selectedIndex, question) {
  const buttons = gameContent.querySelectorAll('.option-btn');
  const isCorrect = Number(selectedIndex) === question.answer;

  buttons.forEach((button) => {
    const optionIndex = Number(button.dataset.index);
    button.disabled = true;
    button.classList.add(optionIndex === Number(question.answer) ? 'correct' : 'wrong');
    if (optionIndex === Number(question.answer)) button.textContent += ' ✓';
    if (optionIndex === Number(selectedIndex) && !isCorrect) button.textContent += ' ✕';
  });

  const feedbackClass = isCorrect ? 'success' : 'error';
  const feedbackText = isCorrect
    ? `Correto! ${question.explanation}`
    : `Não foi dessa vez. ${question.explanation}`;

  const nextButton = document.createElement('button');
  nextButton.className = 'primary-btn';
  nextButton.textContent = state.currentGameSession.currentIndex === gameDefinitions[state.activeGame].questions.length - 1 ? 'Finalizar missão' : 'Próxima questão';
  nextButton.addEventListener('click', () => {
    if (isCorrect) {
      state.currentGameSession.correctAnswers += 1;
    }

    const questionValue = 100 / gameDefinitions[state.activeGame].questions.length;
    state.currentGameSession.score += isCorrect ? questionValue : 0;
    state.currentGameSession.currentIndex += 1;

    renderQuestion();
  });

  const feedback = document.createElement('div');
  feedback.className = `feedback-box ${feedbackClass}`;
  feedback.textContent = feedbackText;

  gameContent.appendChild(feedback);
  gameContent.appendChild(nextButton);
}

async function finishGame() {
  const session = state.currentGameSession;
  const finalScore = Math.round(session.score);
  const totalQuestions = gameDefinitions[state.activeGame].questions.length;
  const finalMessage = `Missão concluída! Você marcou ${finalScore} pontos e acertou ${session.correctAnswers} de ${totalQuestions}.`;

  const feedback = document.createElement('div');
  feedback.className = 'feedback-box success';
  feedback.textContent = finalMessage;

  gameContent.innerHTML = `
    <div class="question-card">
      <h4>🚀 Missão concluída!</h4>
      <p>${finalMessage}</p>
      <div class="game-footer">
        <span class="progress-summary">Pontuação final: ${finalScore} pts</span>
      </div>
    </div>
  `;

  gameContent.appendChild(feedback);

  const action = document.createElement('button');
  action.className = 'primary-btn';
  action.textContent = 'Salvar progresso';
  action.addEventListener('click', async () => {
    try {
      await apiFetch('/games/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: state.activeGame,
          score: finalScore,
          totalQuestions,
          correctAnswers: session.correctAnswers,
          completed: true,
          feedback: finalMessage
        })
      });

      gameModal.classList.add('hidden');
      await loadDashboard();
    } catch (error) {
      setAuthMessage(error.message, true);
    }
  });

  gameContent.appendChild(action);
}

function closeGame() {
  gameModal.classList.add('hidden');
  state.currentGameSession = null;
  state.activeGame = null;
}

async function init() {
  document.getElementById('loginForm').addEventListener('submit', loginUser);
  document.getElementById('registerForm').addEventListener('submit', registerUser);
  document.querySelectorAll('.tab-btn').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((btn) => btn.classList.toggle('active', btn === button));
      document.getElementById('loginForm').classList.toggle('active', button.dataset.tab === 'login');
      document.getElementById('registerForm').classList.toggle('active', button.dataset.tab === 'register');
    });
  });

  dashboardBtn.addEventListener('click', () => {
    if (!state.token) return;
    loadDashboard();
  });

  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('expedicao-token');
    state.token = '';
    state.user = null;
    state.dashboard = null;
    toggleAuthViews(false);
    setAuthMessage('Você saiu da sua sessão.');
  });

  document.getElementById('closeGameModal').addEventListener('click', closeGame);
  gameModal.addEventListener('click', (event) => {
    if (event.target === gameModal) closeGame();
  });

  if (state.token) {
    try {
      const me = await apiFetch('/auth/me');
      state.user = me.user;
      await loadDashboard();
    } catch (error) {
      state.token = '';
      localStorage.removeItem('expedicao-token');
      toggleAuthViews(false);
    }
  } else {
    toggleAuthViews(false);
  }
}

init();
