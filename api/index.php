<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

function respond(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function requestBody(): array
{
    $rawBody = file_get_contents('php://input');
    if ($rawBody === false || $rawBody === '') {
        return [];
    }

    $body = json_decode($rawBody, true);
    if (!is_array($body)) {
        respond(400, ['message' => 'Corpo da requisição inválido.']);
    }

    return $body;
}

function base64UrlEncode(string $value): string
{
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

function generateToken(array $user, string $secret): string
{
    $issuedAt = time();
    $header = base64UrlEncode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $payload = base64UrlEncode(json_encode([
        'id' => (int) $user['id'],
        'email' => $user['email'],
        'role' => $user['role'],
        'name' => $user['name'],
        'iat' => $issuedAt,
        'exp' => $issuedAt + (7 * 24 * 60 * 60),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    $signature = base64UrlEncode(hash_hmac('sha256', $header . '.' . $payload, $secret, true));

    return $header . '.' . $payload . '.' . $signature;
}

function authenticatedUserId(string $secret): int
{
    $authorization = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/^Bearer\s+(.+)$/i', $authorization, $matches)) {
        respond(401, ['message' => 'Token de acesso ausente.']);
    }

    $parts = explode('.', $matches[1]);
    if (count($parts) !== 3) {
        respond(401, ['message' => 'Sessão inválida ou expirada.']);
    }

    [$header, $payload, $signature] = $parts;
    $expectedSignature = base64UrlEncode(hash_hmac('sha256', $header . '.' . $payload, $secret, true));
    $decodedPayload = base64_decode(strtr($payload, '-_', '+/'));
    $tokenData = $decodedPayload === false ? null : json_decode($decodedPayload, true);

    if (
        !hash_equals($expectedSignature, $signature)
        || !is_array($tokenData)
        || !isset($tokenData['id'], $tokenData['exp'])
        || (int) $tokenData['exp'] <= time()
    ) {
        respond(401, ['message' => 'Sessão inválida ou expirada.']);
    }

    return (int) $tokenData['id'];
}

function publicUserData(array $user): array
{
    return [
        'id' => (int) $user['id'],
        'name' => $user['name'],
        'email' => $user['email'],
        'role' => $user['role'],
        'xp' => (int) $user['xp'],
        'level' => (int) $user['level'],
        'avatar' => $user['avatar'],
        'created_at' => $user['created_at'],
    ];
}

function insertUserGamesProgress(PDO $db, int $userId): void
{
    $statement = $db->prepare(
        "INSERT IGNORE INTO user_games
         (user_id, game_id, unlocked, best_score, attempts, stage)
         VALUES (?, ?, 1, 0, 0, 'inicial')"
    );

    foreach (gameDefinitions() as $game) {
        $statement->execute([$userId, $game['id']]);
    }
}

function gameDefinitions(): array
{
    return [
        ['id' => 'ditados', 'title' => 'Ditados do Brasil', 'region' => 'Nordeste', 'difficulty' => 'Fácil', 'objective' => 'Entender expressões locais e decifrar significados.', 'icon' => '🧭', 'color' => '#ffb703'],
        ['id' => 'mapa', 'title' => 'Mapa das Regiões', 'region' => 'Centro-Oeste', 'difficulty' => 'Médio', 'objective' => 'Reconhecer símbolos e características das regiões.', 'icon' => '🗺️', 'color' => '#8ecae6'],
        ['id' => 'troco', 'title' => 'Troco da Feirinha', 'region' => 'Sudeste', 'difficulty' => 'Médio', 'objective' => 'Aplicar cálculo mental em situações reais do dia a dia.', 'icon' => '💰', 'color' => '#a1d99b'],
        ['id' => 'expressoes', 'title' => 'Expressões do Brasil', 'region' => 'Sul', 'difficulty' => 'Difícil', 'objective' => 'Decodificar gírias e sotaques para viajar pelo país.', 'icon' => '🎧', 'color' => '#d4a5ff'],
    ];
}

function findUser(PDO $db, int $userId): ?array
{
    $statement = $db->prepare('SELECT * FROM users WHERE id = ?');
    $statement->execute([$userId]);
    $user = $statement->fetch(PDO::FETCH_ASSOC);

    return $user === false ? null : $user;
}

function dashboard(PDO $db, int $userId): ?array
{
    $user = findUser($db, $userId);
    if ($user === null) {
        return null;
    }

    insertUserGamesProgress($db, $userId);

    $statement = $db->prepare('SELECT * FROM game_results WHERE user_id = ? ORDER BY created_at DESC LIMIT 10');
    $statement->execute([$userId]);
    $records = $statement->fetchAll(PDO::FETCH_ASSOC);
    foreach ($records as &$record) {
        foreach (['id', 'user_id', 'score', 'total_questions', 'correct_answers', 'completed'] as $field) {
            $record[$field] = (int) $record[$field];
        }
    }
    unset($record);

    $statement = $db->prepare('SELECT * FROM badges WHERE user_id = ? ORDER BY earned_at DESC');
    $statement->execute([$userId]);
    $badges = $statement->fetchAll(PDO::FETCH_ASSOC);
    foreach ($badges as &$badge) {
        $badge['id'] = (int) $badge['id'];
        $badge['user_id'] = (int) $badge['user_id'];
    }
    unset($badge);

    $statement = $db->prepare('SELECT * FROM user_games WHERE user_id = ? ORDER BY game_id');
    $statement->execute([$userId]);
    $progress = $statement->fetchAll(PDO::FETCH_ASSOC);
    foreach ($progress as &$item) {
        foreach (['id', 'user_id', 'unlocked', 'best_score', 'attempts'] as $field) {
            $item[$field] = (int) $item[$field];
        }
    }
    unset($item);

    $leaderboard = $db->query(
        'SELECT id, name, xp, level FROM users ORDER BY xp DESC, created_at ASC LIMIT 10'
    )->fetchAll(PDO::FETCH_ASSOC);
    foreach ($leaderboard as &$entry) {
        foreach (['id', 'xp', 'level'] as $field) {
            $entry[$field] = (int) $entry[$field];
        }
    }
    unset($entry);

    $totalScore = array_sum(array_column($records, 'score'));
    $totalCorrect = array_sum(array_column($records, 'correct_answers'));
    $totalQuestions = array_sum(array_column($records, 'total_questions'));

    $games = [];
    foreach (gameDefinitions() as $game) {
        $item = null;
        foreach ($progress as $progressItem) {
            if ($progressItem['game_id'] === $game['id']) {
                $item = $progressItem;
                break;
            }
        }

        $game['unlocked'] = $item !== null ? (bool) $item['unlocked'] : false;
        $game['best_score'] = $item !== null ? $item['best_score'] : 0;
        $game['attempts'] = $item !== null ? $item['attempts'] : 0;
        $game['stage'] = $item !== null ? $item['stage'] : 'inicial';
        $games[] = $game;
    }

    return [
        'user' => publicUserData($user),
        'stats' => [
            'totalScore' => $totalScore,
            'attempts' => count($records),
            'accuracy' => $totalQuestions ? (int) round(($totalCorrect / $totalQuestions) * 100) : 0,
            'medals' => count($badges),
            'level' => (int) $user['level'],
            'xp' => (int) $user['xp'],
        ],
        'games' => $games,
        'history' => $records,
        'badges' => $badges,
        'leaderboard' => $leaderboard,
    ];
}

function awardBadge(PDO $db, int $userId, string $gameId, int $score): ?array
{
    $criteria = [
        'ditados' => ['threshold' => 80, 'name' => 'Selo do Sotaque', 'description' => 'Decifrou expressões brasileiras com precisão.', 'icon' => '🗣️'],
        'mapa' => ['threshold' => 75, 'name' => 'Mapa de Ouro', 'description' => 'Navegou pelas regiões do Brasil com maestria.', 'icon' => '🧭'],
        'troco' => ['threshold' => 90, 'name' => 'Guardião do Troco', 'description' => 'Resolveu contas com agilidade e exatidão.', 'icon' => '💸'],
        'expressoes' => ['threshold' => 85, 'name' => 'Decifrador Cultural', 'description' => 'Desvendou gírias e sotaques de diversas regiões.', 'icon' => '🌎'],
    ];
    $rule = $criteria[$gameId] ?? null;
    if ($rule === null || $score < $rule['threshold']) {
        return null;
    }

    $statement = $db->prepare('SELECT id FROM badges WHERE user_id = ? AND name = ?');
    $statement->execute([$userId, $rule['name']]);
    if ($statement->fetchColumn() !== false) {
        return null;
    }

    $statement = $db->prepare('INSERT INTO badges (user_id, name, description, icon) VALUES (?, ?, ?, ?)');
    $statement->execute([$userId, $rule['name'], $rule['description'], $rule['icon']]);

    return $rule;
}

function updateUserProgress(PDO $db, int $userId, string $gameId, int $score, bool $completed): void
{
    $statement = $db->prepare('SELECT best_score, attempts FROM user_games WHERE user_id = ? AND game_id = ?');
    $statement->execute([$userId, $gameId]);
    $current = $statement->fetch(PDO::FETCH_ASSOC);
    $nextBest = $current ? max((int) $current['best_score'], $score) : $score;
    $nextAttempts = $current ? (int) $current['attempts'] + 1 : 1;
    $nextStage = $completed ? 'concluido' : 'em_andamento';

    $statement = $db->prepare("
        INSERT INTO user_games
          (user_id, game_id, unlocked, best_score, attempts, stage, updated_at)
        VALUES (?, ?, 1, ?, ?, ?, CURRENT_TIMESTAMP)
        ON DUPLICATE KEY UPDATE
          unlocked = 1,
          best_score = GREATEST(best_score, VALUES(best_score)),
          attempts = attempts + 1,
          stage = VALUES(stage),
          updated_at = CURRENT_TIMESTAMP
    ");
    $statement->execute([$userId, $gameId, $nextBest, $nextAttempts, $nextStage]);
}

function dispatch(PDO $db, string $jwtSecret): void
{
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
    $route = preg_replace('#^/api#', '', is_string($path) ? $path : '/');
    $route = rtrim($route, '/') ?: '/';

    if ($method === 'GET' && $route === '/health') {
        $db->query('SELECT 1');
        respond(200, ['status' => 'ok', 'message' => 'API da Expedição Brasil ativa.', 'database' => 'mysql']);
    }

    if ($method === 'POST' && $route === '/auth/register') {
        $body = requestBody();
        $name = trim((string) ($body['name'] ?? ''));
        $email = strtolower(trim((string) ($body['email'] ?? '')));
        $password = (string) ($body['password'] ?? '');
        $role = (string) ($body['role'] ?? 'aluno');
        if ($name === '' || $email === '' || $password === '') {
            respond(400, ['message' => 'Nome, e-mail e senha são obrigatórios.']);
        }

        $statement = $db->prepare('SELECT id FROM users WHERE email = ?');
        $statement->execute([$email]);
        if ($statement->fetchColumn() !== false) {
            respond(409, ['message' => 'Este e-mail já está cadastrado.']);
        }

        $statement = $db->prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)');
        $statement->execute([$name, $email, password_hash($password, PASSWORD_BCRYPT, ['cost' => 10]), $role]);
        $user = findUser($db, (int) $db->lastInsertId());
        insertUserGamesProgress($db, (int) $user['id']);

        respond(201, ['token' => generateToken($user, $jwtSecret), 'user' => publicUserData($user)]);
    }

    if ($method === 'POST' && $route === '/auth/login') {
        $body = requestBody();
        $email = strtolower(trim((string) ($body['email'] ?? '')));
        $password = (string) ($body['password'] ?? '');
        if ($email === '' || $password === '') {
            respond(400, ['message' => 'Informe e-mail e senha.']);
        }

        $statement = $db->prepare('SELECT * FROM users WHERE email = ?');
        $statement->execute([$email]);
        $user = $statement->fetch(PDO::FETCH_ASSOC);
        if ($user === false) {
            respond(401, ['message' => 'Usuário não encontrado.']);
        }
        if (!password_verify($password, $user['password_hash'])) {
            respond(401, ['message' => 'Senha incorreta.']);
        }

        respond(200, ['token' => generateToken($user, $jwtSecret), 'user' => publicUserData($user)]);
    }

    $protectedRoutes = ['/auth/me', '/dashboard', '/games', '/leaderboard', '/games/submit'];
    if (in_array($route, $protectedRoutes, true)) {
        $userId = authenticatedUserId($jwtSecret);
    }

    if ($method === 'GET' && $route === '/auth/me') {
        $user = findUser($db, $userId);
        if ($user === null) {
            respond(404, ['message' => 'Usuário não encontrado.']);
        }
        respond(200, ['user' => publicUserData($user)]);
    }

    if ($method === 'GET' && $route === '/dashboard') {
        $data = dashboard($db, $userId);
        if ($data === null) {
            respond(404, ['message' => 'Usuário não encontrado.']);
        }
        respond(200, $data);
    }

    if ($method === 'GET' && $route === '/games') {
        $data = dashboard($db, $userId);
        if ($data === null) {
            respond(404, ['message' => 'Usuário não encontrado.']);
        }
        respond(200, ['games' => $data['games']]);
    }

    if ($method === 'GET' && $route === '/leaderboard') {
        $leaderboard = $db->query(
            'SELECT id, name, xp, level FROM users ORDER BY xp DESC, created_at ASC LIMIT 10'
        )->fetchAll(PDO::FETCH_ASSOC);
        foreach ($leaderboard as &$entry) {
            foreach (['id', 'xp', 'level'] as $field) {
                $entry[$field] = (int) $entry[$field];
            }
        }
        unset($entry);
        respond(200, ['leaderboard' => $leaderboard]);
    }

    if ($method === 'POST' && $route === '/games/submit') {
        $body = requestBody();
        $gameId = $body['gameId'] ?? null;
        $score = $body['score'] ?? null;
        $game = null;
        foreach (gameDefinitions() as $item) {
            if ($item['id'] === $gameId) {
                $game = $item;
                break;
            }
        }
        if ($game === null || (!is_int($score) && !is_float($score))) {
            respond(400, ['message' => 'Jogo inválido ou pontuação ausente.']);
        }

        $score = (int) $score;
        $completed = (bool) ($body['completed'] ?? true);
        $db->beginTransaction();
        try {
            $medal = awardBadge($db, $userId, $gameId, $score);
            $statement = $db->prepare('SELECT xp FROM users WHERE id = ?');
            $statement->execute([$userId]);
            $currentXp = $statement->fetchColumn();
            if ($currentXp === false) {
                $db->rollBack();
                respond(404, ['message' => 'Usuário não encontrado.']);
            }

            $nextXp = (int) $currentXp + max(50, (int) round($score / 2));
            $nextLevel = max(1, (int) floor($nextXp / 150) + 1);
            $statement = $db->prepare('UPDATE users SET xp = ?, level = ? WHERE id = ?');
            $statement->execute([$nextXp, $nextLevel, $userId]);
            updateUserProgress($db, $userId, $gameId, $score, $completed);

            $statement = $db->prepare(
                'INSERT INTO game_results (user_id, game_id, title, score, total_questions, correct_answers, completed, medal, feedback)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $statement->execute([
                $userId,
                $gameId,
                $game['title'],
                $score,
                (int) ($body['totalQuestions'] ?? 0),
                (int) ($body['correctAnswers'] ?? 0),
                $completed ? 1 : 0,
                $medal['name'] ?? null,
                (string) ($body['feedback'] ?? 'Jornada concluída com sucesso!'),
            ]);
            $resultId = (int) $db->lastInsertId();
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $error;
        }

        $user = findUser($db, $userId);
        respond(200, [
            'success' => true,
            'resultId' => $resultId,
            'medal' => $medal['name'] ?? null,
            'xp' => $nextXp,
            'level' => $nextLevel,
            'user' => publicUserData($user),
        ]);
    }

    respond(404, ['message' => 'Rota não encontrada.']);
}

try {
    $configPath = __DIR__ . '/config.php';
    if (!is_file($configPath)) {
        throw new RuntimeException('Crie api/config.php a partir de api/config.example.php.');
    }

    $config = require $configPath;
    foreach (['host', 'database', 'username', 'password', 'jwt_secret'] as $key) {
        if (!isset($config[$key]) || $config[$key] === '' || str_starts_with((string) $config[$key], 'PREENCHA_')) {
            throw new RuntimeException('A configuração da API está incompleta: ' . $key);
        }
    }

    $port = (int) ($config['port'] ?? 3306);
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        $config['host'],
        $port,
        $config['database']
    );
    $db = new PDO($dsn, $config['username'], $config['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    dispatch($db, $config['jwt_secret']);
} catch (Throwable $error) {
    error_log('Expedicao API: ' . $error->getMessage());
    respond(500, ['message' => 'Erro interno da API. Verifique a configuração e os logs da hospedagem.']);
}
