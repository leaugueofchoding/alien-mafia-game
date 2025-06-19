// 기존 index.js 파일의 모든 내용을 이 코드로 교체해주세요.

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = 3001;
const gameRooms = {};
const ADMIN_ROOM = 'admin_room';
const timerIntervals = {};

const presetsPath = path.join(__dirname, 'presets.json');
const presetsData = fs.readFileSync(presetsPath, 'utf8');
const PRESETS = JSON.parse(presetsData);

const ROLE_DESCRIPTIONS = {
  '에일리언 여왕': '게임 중 단 한 번, [사냥] 능력으로 두 명을 제거할 수 있습니다. 특정 위기 상황에서는 네 명을 잡아먹기도 합니다.',
  '에일리언': '여왕의 부하입니다. 매일 밤 한 명을 [포식]할 수 있습니다.',
  '에일리언 알': '2일이 지나고 3일째부터 활동합니다. 부화 시 [오염] 또는 [부화]의 결과가 있습니다.',
  '함장': '2발의 총알로 의심되는 참여자를 [즉결 처분]할 수 있습니다.',
  '엔지니어': '함장이 사망하면 [비상탈출 버튼]을 가동할지 선택할 수 있습니다.',
  '의사': '모든 의사가 4일간 생존하면 [생화학 무기]를 개발하여 승리합니다.',
  '초능력자': '단 한 번, 4명의 정체를 [꿰뚫어보기]할 수 있습니다. 실패 시 부작용이 있습니다.',
  '수다쟁이': '매일 한 명의 정체를 익명으로 [폭로하기]합니다.',
  '뚱이': '탐사대의 빌런입니다. 비상탈출 시 식량을 모두 [호로록!] 먹어 치웁니다.',
  '신의 사도': '죽지 않고 4일간 기도에 성공하면 탐사대를 [구원]합니다.',
  '군인': '1발의 총알로 의심되는 참가자 한 명을 [저격]하여 탈락시킬 수 있습니다.', // 군인 설명 수정
  '일반 승객': '특별한 능력은 없지만, 투표를 통해 진실을 밝혀내야 합니다.'
};

const ENDING_MESSAGES = {
  crew_win_queen_eliminated: { // 새로운 승리 조건
    winner: '탐사대',
    reason: '마침내 에일리언 무리의 우두머리, 에일리언 여왕을 제거하는 데 성공했습니다! 탐사선에 평화가 찾아왔습니다.'
  },
  alien_win_assassinate: {
    winner: '에일리언', reason: '탐사대의 핵심 인물인 함장과 엔지니어를 모두 제거하는 데 성공했습니다!'
  },
};

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function broadcastUpdates(roomCode) {
  if (gameRooms[roomCode]) {
    const room = gameRooms[roomCode];
    io.to(ADMIN_ROOM).emit('updateAdmin', { rooms: gameRooms });
    io.to(roomCode).emit('boardUpdate', room);
    io.to(roomCode).emit('updateRoom', room);
  }
}

function checkWinConditions(roomCode) {
  const room = gameRooms[roomCode];
  if (!room || room.status !== 'playing') return false;

  let endingType = null;

  // 1. 탐사대 승리 조건: 에일리언 여왕 사망
  const alienQueen = room.players.find(p => p.role === '에일리언 여왕');
  if (alienQueen && alienQueen.status === 'dead') {
    endingType = 'crew_win_queen_eliminated';
  }

  // 2. 에일리언 승리 조건: 함장과 엔지니어 모두 사망 (여왕이 살아있을 때)
  if (!endingType) {
    const captain = room.players.find(p => p.role === '함장');
    const engineer = room.players.find(p => p.role === '엔지니어');
    if (captain && captain.status === 'dead' && engineer && engineer.status === 'dead') {
      endingType = 'alien_win_assassinate';
    }
  }

  if (endingType) {
    const ending = ENDING_MESSAGES[endingType];
    if (!ending) {
      console.error(`오류: 엔딩 메시지를 찾을 수 없습니다 - ${endingType}`);
      return false;
    }
    room.status = 'game_over';
    io.to(roomCode).emit('gameOver', { winner: ending.winner, reason: ending.reason });
    io.to(ADMIN_ROOM).emit('updateAdmin', { rooms: gameRooms });
    return true;
  }

  return false;
}

function eliminatePlayer(roomCode, playerId) {
  const room = gameRooms[roomCode];
  if (!room) return false;
  const player = room.players.find(p => p.id === playerId);

  if (player && player.status !== 'dead') {
    player.status = 'dead';
    io.to(playerId).emit('youAreDead');

    // ★★★ 함장 사망 감지 및 엔지니어에게 이벤트 전송 로직 ★★★
    if (player.role === '함장') {
      const engineer = room.players.find(p => p.role === '엔지니어' && p.status === 'alive');
      if (engineer) {
        // 살아있는 엔지니어에게만 선택 이벤트를 보냄
        io.to(engineer.id).emit('captainDiedChoice');
      }
    }
    return true;
  }
  return false;
}

app.use(express.static(path.join(__dirname, '../client/public')));
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, '../client/public', 'index.html')); });
app.get('/admin', (req, res) => { res.sendFile(path.join(__dirname, '../client/public', 'admin.html')); });

io.on('connection', (socket) => {

  socket.on('adminConnect', () => {
    socket.join(ADMIN_ROOM);
    socket.emit('updateAdmin', { rooms: gameRooms, presets: PRESETS });
  });

  socket.on('boardConnect', (data) => {
    const { roomCode } = data;
    if (gameRooms[roomCode]) {
      socket.join(roomCode);
      io.to(socket.id).emit('boardUpdate', gameRooms[roomCode]);
    }
  });

  socket.on('joinGame', (data) => {
    const { name, code } = data;
    socket.join(code);
    if (!gameRooms[code]) {
      gameRooms[code] = { players: [], status: 'waiting', day: 0, phase: 'lobby' };
    }
    const newPlayer = { id: socket.id, name: name, status: 'alive' };
    gameRooms[code].players.push(newPlayer);
    broadcastUpdates(code);
  });

  socket.on('startGame', (data) => {
    const { code, settings, groupCount } = data;
    const room = gameRooms[code];
    if (!room || room.status === 'playing') return;
    room.groupCount = groupCount;
    const roles = [];
    for (const roleName in settings) {
      for (let i = 0; i < settings[roleName]; i++) { roles.push(roleName); }
    }
    const players = room.players;
    while (roles.length < players.length) { roles.push('일반 승객'); }
    const shuffledRoles = shuffle(roles);
    players.forEach((player, index) => {
      player.role = shuffledRoles[index];
      player.description = ROLE_DESCRIPTIONS[shuffledRoles[index]] || '';
      player.abilityUsed = false; // 다른 능력들을 위해 유지

      // 함장 및 군인 총알 지급
      if (player.role === '함장') {
        player.bullets = 2;
      } else if (player.role === '군인') {
        player.bullets = 1;
      }
    });
    room.status = 'playing';
    room.phase = 'role_reveal';
    broadcastUpdates(code);
  });

  socket.on('selectGroup', (data) => {
    const { groupNumber } = data;
    let roomCode = '';
    let player = null;
    for (const code in gameRooms) {
      const p = gameRooms[code].players.find(p => p.id === socket.id);
      if (p) {
        roomCode = code;
        player = p;
        break;
      }
    }
    if (player && roomCode) {
      player.group = groupNumber;
      broadcastUpdates(roomCode);
    }
  });

  socket.on('nextPhase', (data) => {
    const { code, phase, day } = data;
    const room = gameRooms[code];
    if (!room) return;
    room.phase = phase;
    room.day = parseInt(day, 10);
    if (phase === 'night_alien_action') {
      room.selections = {};
    }
    broadcastUpdates(code);
  });

  socket.on('triggerAlienAction', (data) => {
    const { code } = data;
    const room = gameRooms[code];
    if (!room) return;
    const livingPlayers = room.players.filter(p => p.status === 'alive');
    // ★★★ 에일리언 여왕 능력 수정: 일반 포식 기능 제외 ★★★
    const aliens = livingPlayers.filter(p => p.role === '에일리언'); // 일반 에일리언만 선택
    const alienIds = livingPlayers.filter(p => p.role.includes('에일리언')).map(p => p.id); // 동료 확인용
    const targets = livingPlayers.filter(p => !alienIds.includes(p.id));

    // 일반 에일리언에게만 포식 행동 요청
    aliens.forEach(alien => {
      const otherAliens = livingPlayers.filter(p => p.role.includes('에일리언') && p.id !== alien.id).map(a => a.name);
      io.to(alien.id).emit('alienAction', { otherAliens, targets });
    });

    // 에일리언 여왕에게는 밤 알림만 전달 (나중에 [사냥] 능력 추가 시 여기에 로직 추가)
    const queen = livingPlayers.find(p => p.role === '에일리언 여왕');
    if (queen) {
      const otherAliens = livingPlayers.filter(p => p.role.includes('에일리언') && p.id !== queen.id).map(a => a.name);
      io.to(queen.id).emit('alienAction', { otherAliens, targets: [] }); // targets는 빈 배열로 보내 행동을 막음
    }
  });

  socket.on('startMeetingTimer', (roomCode) => {
    if (!gameRooms[roomCode] || timerIntervals[roomCode]) return;
    const room = gameRooms[roomCode];
    room.timeLeft = 120;

    timerIntervals[roomCode] = setInterval(() => {
      io.to(roomCode).emit('timerUpdate', { timeLeft: room.timeLeft });
      room.timeLeft--;

      if (room.timeLeft < 0) {
        clearInterval(timerIntervals[roomCode]);
        delete timerIntervals[roomCode];
      }
    }, 1000);
  });

  socket.on('eliminatePlayer', (data) => {
    const { roomCode, playerId } = data;
    // eliminatePlayer 함수가 true를 반환하는지 (즉, 실제로 사망 처리가 되었는지) 확인
    if (eliminatePlayer(roomCode, playerId)) {
      // 승리 조건 확인은 아침에만 하므로, 여기서는 상태 업데이트만 전파합니다.
      broadcastUpdates(roomCode);
    }
  });

  socket.on('revivePlayer', (data) => {
    const { roomCode, playerId } = data;
    const room = gameRooms[roomCode];
    if (!room) return;
    const player = room.players.find(p => p.id === playerId);
    if (player) {
      player.status = 'alive';
      io.to(playerId).emit('youAreAlive');
      broadcastUpdates(roomCode);
    }
  });

  socket.on('nightAction', (data) => {
    const { targetId } = data;
    const selectorId = socket.id;
    let roomCode = '';
    for (const code in gameRooms) {
      if (gameRooms[code].players.some(p => p.id === selectorId)) {
        roomCode = code;
        break;
      }
    }
    if (roomCode) {
      const room = gameRooms[roomCode];
      const alien = room.players.find(p => p.id === selectorId);
      if (targetId) {
        room.selections[selectorId] = targetId;
      } else {
        delete room.selections[selectorId];
      }
      const allAliens = room.players.filter(p => p.role.includes('에일리언'));
      allAliens.forEach(alienPlayer => {
        io.to(alienPlayer.id).emit('nightSelectionUpdate', { selections: room.selections });
      });
    }
  });

  socket.on('resolveNightActions', (data) => {
    const { code } = data;
    const room = gameRooms[code];
    if (!room || !room.selections) return;

    const targets = [...new Set(Object.values(room.selections))];

    targets.forEach(targetId => {
      eliminatePlayer(code, targetId);
    });

    const gameEnded = checkWinConditions(code);

    if (!gameEnded) {
      room.phase = 'night_crew_action';
      broadcastUpdates(code);
    }
  });

  // ★★★ 함장/군인 능력 사용 트리거 수정 ★★★
  socket.on('triggerCrewAction', (data) => {
    const { code } = data;
    const room = gameRooms[code];
    if (!room) return;

    const livingPlayers = room.players.filter(p => p.status === 'alive');

    // 군인 능력
    const soldier = livingPlayers.find(p => p.role === '군인' && p.bullets > 0);
    if (soldier) {
      const targets = livingPlayers.filter(p => p.id !== soldier.id);
      io.to(soldier.id).emit('soldierAction', { targets, bulletsLeft: soldier.bullets });
    }

    // 함장 능력
    const captain = livingPlayers.find(p => p.role === '함장' && p.bullets > 0);
    if (captain) {
      const targets = livingPlayers.filter(p => p.id !== captain.id);
      io.to(captain.id).emit('captainAction', { targets, bulletsLeft: captain.bullets });
    }
  });

  socket.on('useSoldierAbility', (data) => {
    const { targetId } = data;
    const selectorId = socket.id;
    let roomCode = '';
    for (const code in gameRooms) {
      if (gameRooms[code].players.some(p => p.id === selectorId)) { roomCode = code; break; }
    }

    if (roomCode) {
      const room = gameRooms[roomCode];
      const soldier = room.players.find(p => p.id === socket.id);
      if (room && soldier && soldier.role === '군인' && soldier.bullets > 0) {
        soldier.bullets--;
        eliminatePlayer(roomCode, targetId);

        // 상태는 즉시 업데이트하되, 게임 종료 여부는 확인하지 않습니다.
        broadcastUpdates(roomCode);
      }
    }
  });

  // ★★★ 함장 능력 사용 리스너 추가 ★★★
  socket.on('useCaptainAbility', (data) => {
    const { targetId } = data;
    const selectorId = socket.id;
    let roomCode = '';
    for (const code in gameRooms) {
      if (gameRooms[code].players.some(p => p.id === selectorId)) { roomCode = code; break; }
    }

    if (roomCode) {
      const room = gameRooms[roomCode];
      const captain = room.players.find(p => p.id === socket.id);
      if (room && captain && captain.role === '함장' && captain.bullets > 0) {
        captain.bullets--;
        eliminatePlayer(roomCode, targetId);

        // 상태는 즉시 업데이트하되, 게임 종료 여부는 확인하지 않습니다.
        broadcastUpdates(roomCode);
      }
    }
  });

  // ★★★ 엔지니어 선택 결과 처리 (기능은 다음 단계에서 구현) ★★★
  socket.on('engineerChoseToFight', () => {
    // TODO: '여왕의 만찬' 시나리오 진행 로직 구현
    let roomCode = '';
    for (const code in gameRooms) {
      if (gameRooms[code].players.some(p => p.id === socket.id)) { roomCode = code; break; }
    }
    console.log(`[${roomCode}] 방의 엔지니어가 계속 싸우는 것을 선택했습니다.`);
    // 나중에 여기에 화면 전환 로직이 들어갑니다.
  });

  socket.on('engineerChoseEscape', () => {
    // TODO: '비상탈출' 시나리오 진행 로직 구현
    let roomCode = '';
    for (const code in gameRooms) {
      if (gameRooms[code].players.some(p => p.id === socket.id)) { roomCode = code; break; }
    }
    console.log(`[${roomCode}] 방의 엔지니어가 비상탈출을 선택했습니다.`);
    // 나중에 여기에 화면 전환 로직이 들어갑니다.
  });

  socket.on('endNightAndStartMeeting', (data) => {
    const { code } = data;
    const room = gameRooms[code];
    if (!room) return;

    // 아침이 되기 직전, 밤 동안의 활동으로 인한 승패를 확인합니다.
    const gameEnded = checkWinConditions(code);

    // 만약 게임이 끝났다면, 다음 날로 넘어가지 않고 여기서 종료합니다.
    if (gameEnded) return;

    // 게임이 끝나지 않았다면, 다음 날 회의를 시작합니다.
    room.day++;
    room.phase = 'meeting';
    broadcastUpdates(code);
  });

  socket.on('debugStartGame', () => {
    const roomCode = 'test-' + Math.random().toString(36).substring(7);
    const dummyPlayers = [
      { id: 'bot1', name: '플레이어1', status: 'alive' },
      { id: 'bot2', name: '플레이어2', status: 'alive' },
      { id: 'bot3', name: '플레이어3', status: 'alive' },
      { id: 'bot4', name: '플레이어4', status: 'alive' }
    ];
    gameRooms[roomCode] = { players: dummyPlayers, status: 'waiting', day: 0, phase: 'lobby' };
    const room = gameRooms[roomCode];
    const roles = shuffle(['에일리언 여왕', '의사', '함장', '엔지니어']);
    room.players.forEach((player, index) => {
      player.role = roles[index];
      player.description = ROLE_DESCRIPTIONS[roles[index]] || '';
      if (player.role === '함장') {
        player.bullets = 2;
      }
    });
    room.status = 'playing';
    room.phase = 'role_reveal';
    broadcastUpdates(roomCode);
  });

  socket.on('disconnect', () => {
  });
});

server.listen(PORT, () => {
  console.log(`서버가 ${PORT}번 포트에서 실행 중입니다.`);
});