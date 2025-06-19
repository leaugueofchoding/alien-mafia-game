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
const timerIntervals = {}; // ★★★ 타이머를 별도로 관리할 객체 ★★★

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
  '군인': '단 한 번, 의심되는 참가자 한 명을 [저격]하여 탈락시킬 수 있습니다.',
  '일반 승객': '특별한 능력은 없지만, 투표를 통해 진실을 밝혀내야 합니다.'
};

// 엔딩 메세지

const ENDING_MESSAGES = {
  crew_win_eliminate: {
    winner: '탐사대',
    reason: '끈질긴 추적과 희생 끝에, 마침내 모든 에일리언을 제거하고 탐사선을 지켜냈습니다!'
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

// ★★★ 기존 checkWinConditions 함수를 모두 지우고, 이 코드로 교체해주세요. ★★★
function checkWinConditions(roomCode) {
  const room = gameRooms[roomCode];
  if (!room || room.status !== 'playing') return false;

  let endingType = null;

  // 에일리언 승리 조건: 함장과 엔지니어가 모두 사망
  const captain = room.players.find(p => p.role === '함장');
  const engineer = room.players.find(p => p.role === '엔지니어');
  if (captain && captain.status === 'dead' && engineer && engineer.status === 'dead') {
    endingType = 'alien_win_assassinate';
  }

  // 탐사대 승리 조건: 살아있는 에일리언이 없음
  // (위의 에일리언 승리 조건이 아닐 경우에만 체크)
  if (!endingType) {
    const totalLivingAliens = room.players.filter(p => p.role.includes('에일리언') && p.status === 'alive');
    if (totalLivingAliens.length === 0) {
      const totalLivingCrew = room.players.filter(p => !p.role.includes('에일리언') && p.status === 'alive');
      if (totalLivingCrew.length > 0) {
        endingType = 'crew_win_eliminate';
      }
    }
  }

  if (endingType) {
    const ending = ENDING_MESSAGES[endingType];
    if (!ending) { // 혹시 모를 오류 방지
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
      player.abilityUsed = false; // 능력 사용 여부 추적
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
    const aliens = livingPlayers.filter(p => p.role === '에일리언 여왕' || p.role === '에일리언');
    const alienIds = aliens.map(p => p.id);
    const targets = livingPlayers.filter(p => !alienIds.includes(p.id));
    aliens.forEach(alien => {
      const otherAliens = aliens.filter(a => a.id !== alien.id).map(a => a.name);
      io.to(alien.id).emit('alienAction', { otherAliens, targets });
    });
  });

  // ★★★ 타이머 로직 수정 ★★★
  socket.on('startMeetingTimer', (roomCode) => {
    // room 객체가 아닌 별도의 timerIntervals 객체에서 타이머를 관리합니다.
    if (!gameRooms[roomCode] || timerIntervals[roomCode]) return;

    console.log(`[${roomCode}] 방의 회의 타이머를 서버에서 시작합니다.`);
    const room = gameRooms[roomCode];
    room.timeLeft = 120; // 남은 시간은 room 객체에 저장해도 안전합니다.

    timerIntervals[roomCode] = setInterval(() => {
      io.to(roomCode).emit('timerUpdate', { timeLeft: room.timeLeft });
      room.timeLeft--;

      if (room.timeLeft < 0) {
        clearInterval(timerIntervals[roomCode]); // 올바른 타이머 ID로 종료
        delete timerIntervals[roomCode]; // 사용이 끝난 타이머 정보는 삭제
        console.log(`[${roomCode}] 방의 타이머가 종료되었습니다.`);
      }
    }, 1000);
  });

  // 기존 socket.on('eliminatePlayer', ...) 함수를 찾아 아래 코드로 교체하세요.

  // 기존 socket.on('eliminatePlayer', ...) 함수를 찾아 아래 두 개의 이벤트 리스너로 교체하세요.

  socket.on('eliminatePlayer', (data) => {
    const { roomCode, playerId } = data;
    const room = gameRooms[roomCode];
    if (!room) return;
    const player = room.players.find(p => p.id === playerId);

    if (player && player.status !== 'dead') {
      player.status = 'dead';
      io.to(playerId).emit('youAreDead');

      if (!checkWinConditions(roomCode)) {
        broadcastUpdates(roomCode);
      }
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
      const allAliens = room.players.filter(p => p.role === '에일리언' || p.role === '에일리언 여왕');
      allAliens.forEach(alienPlayer => {
        io.to(alienPlayer.id).emit('nightSelectionUpdate', { selections: room.selections });
      });
    }
  });

  // 기존 socket.on('resolveNightActions', ...)를 찾아 아래 코드로 교체하세요.

  socket.on('resolveNightActions', (data) => {
    const { code } = data;
    const room = gameRooms[code];
    if (!room || !room.selections) return;

    const targets = [...new Set(Object.values(room.selections))];

    targets.forEach(targetId => {
      const player = room.players.find(p => p.id === targetId);
      if (player && player.status !== 'dead') {
        player.status = 'dead';
        io.to(targetId).emit('youAreDead');
      }
    });

    // 모든 사망 처리가 끝난 후, 승리/패배 조건을 한 번만 확인합니다.
    const gameEnded = checkWinConditions(code);

    // 밤 동안 게임이 끝나지 않았다면, '탐사대 활동' 단계로 넘어갑니다.
    if (!gameEnded) {
      room.phase = 'night_crew_action';
      broadcastUpdates(code);
    }
  });

  // 군인 및 탐사대 활동 관련 기능 추가

  socket.on('triggerCrewAction', (data) => {
    const { code } = data;
    const room = gameRooms[code];
    if (!room) return;

    const soldier = room.players.find(p => p.role === '군인' && p.status === 'alive' && !p.abilityUsed);
    if (soldier) {
      const targets = room.players.filter(p => p.status === 'alive' && p.id !== soldier.id);
      io.to(soldier.id).emit('soldierAction', { targets });
    }
  });

  // useSoldierAbility 리스너를 찾아 이 코드로 교체하세요.
  socket.on('useSoldierAbility', (data) => {
    const { targetId } = data;
    const selectorId = socket.id;
    let roomCode = '';
    // 이 플레이어가 속한 방을 찾습니다.
    for (const code in gameRooms) {
      if (gameRooms[code].players.some(p => p.id === selectorId)) {
        roomCode = code;
        break;
      }
    }

    if (roomCode) {
      const room = gameRooms[roomCode];
      const soldier = room.players.find(p => p.id === socket.id);
      if (room && soldier && soldier.role === '군인' && !soldier.abilityUsed) {
        soldier.abilityUsed = true;
        if (eliminatePlayer(roomCode, targetId)) {
          if (!checkWinConditions(roomCode)) {
            broadcastUpdates(roomCode);
          }
        }
        // 능력 사용 후에는 일반 밤 화면으로 되돌려줍니다.
        io.to(selectorId).emit('updateRoom', room);
      }
    }
  });

  socket.on('endNightAndStartMeeting', (data) => {
    const { code } = data;
    const room = gameRooms[code];
    if (!room) return;

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
    const roles = shuffle(['에일리언 여왕', '의사', '군인', '엔지니어']);
    room.players.forEach((player, index) => {
      player.role = roles[index];
      player.description = ROLE_DESCRIPTIONS[roles[index]] || '';
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