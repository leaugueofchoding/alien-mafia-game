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
  '군인': '1발의 총알로 의심되는 참가자 한 명을 [저격]하여 탈락시킬 수 있습니다.',
  '일반 승객': '특별한 능력은 없지만, 투표를 통해 진실을 밝혀내야 합니다.'
};

const ENDING_MESSAGES = {
  crew_win_queen_eliminated: {
    winner: '탐사대',
    reason: '마침내 에일리언 무리의 우두머리, 에일리언 여왕을 제거하는 데 성공했습니다! 탐사선에 평화가 찾아왔습니다.'
  },
  alien_win_assassinate: {
    winner: '에일리언', reason: '탐사대의 핵심 인물인 함장과 엔지니어를 모두 제거하는 데 성공했습니다!'
  },
  alien_win_escape_timeout: {
    winner: '에일리언',
    reason: '탐사대는 제한 시간 내에 의견을 모으지 못하고 귀중한 탈출 기회를 놓치고 말았습니다. 함선에 남은 이들에게 남은 것은 절망뿐입니다.'
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
  let detailLog = '';

  const alienQueen = room.players.find(p => p.role === '에일리언 여왕');
  if (alienQueen && alienQueen.status === 'dead') {
    endingType = 'crew_win_queen_eliminated';
    const captain = room.players.find(p => p.role === '함장');
    const soldier = room.players.find(p => p.role === '군인');

    switch (alienQueen.causeOfDeath) {
      case 'captain_shot':
        detailLog = `${captain ? captain.name : '함장'}이(가) 에일리언 여왕을 즉결처분으로 사살했습니다.`;
        break;
      case 'soldier_shot':
        detailLog = `${soldier ? soldier.name : '군인'}이(가) 에일리언 여왕을 사살하는데 성공했습니다.`;
        break;
      case 'ejected':
        detailLog = `탐사대의 예리한 감각과 추론으로 에일리언 여왕을 방출했습니다.`;
        break;
      default:
        detailLog = `에일리언 여왕이 제거되었습니다.`;
    }
  }

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
    io.to(roomCode).emit('gameOver', { winner: ending.winner, reason: ending.reason, detailLog: detailLog });
    io.to(ADMIN_ROOM).emit('updateAdmin', { rooms: gameRooms });
    return true;
  }

  return false;
}

// server/index.js

// 이 함수 전체를 아래 코드로 교체해주세요.
function eliminatePlayer(roomCode, playerId, cause = 'unknown') {
  const room = gameRooms[roomCode];
  if (!room) return false;
  const player = room.players.find(p => p.id === playerId);

  if (player && player.status !== 'dead') {
    player.status = 'dead';
    player.causeOfDeath = cause;
    io.to(playerId).emit('youAreDead');

    // ★★★ 핵심 수정 ★★★
    // 함장 사망 시, 이벤트를 직접 보내는 대신 '상태'를 변경하고 전파합니다.
    if (player.role === '함장') {
      const engineer = room.players.find(p => p.role === '엔지니어' && p.status === 'alive');
      if (engineer) {
        // '엔지니어의 선택'이 필요한 상황임을 게임 상태에 기록합니다.
        room.pendingAction = 'engineer_choice';
        // broadcastUpdates를 통해 모든 클라이언트(플레이어, 관리자)가 이 상태를 알게 됩니다.
        broadcastUpdates(roomCode);
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
    const shuffledRoles = shuffle(roles);
    players.forEach((player, index) => {
      player.role = shuffledRoles[index];
      player.description = ROLE_DESCRIPTIONS[shuffledRoles[index]] || '';
      player.abilityUsed = false;

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

  // server/index.js

  // 1. 이 함수로 교체해주세요.
  socket.on('nextPhase', (data) => {
    const { code, phase, day } = data;
    const room = gameRooms[code];
    if (!room) return;

    // ★★★ 추가: 타이머 인터벌 초기화 로직 ★★★
    // 만약 현재 방에 실행중인 타이머가 있다면, 다음 단계로 넘어가기 전에 종료합니다.
    if (timerIntervals[code]) {
      clearInterval(timerIntervals[code]);
      delete timerIntervals[code];
      console.log(`[${code}] 회의 단계가 종료되어 타이머를 초기화합니다.`);
    }

    room.phase = phase;
    room.day = parseInt(day, 10);
    if (phase === 'night_alien_action') {
      room.selections = {};
    }
    broadcastUpdates(code);
  });

  // server/index.js

  // 1. 이 함수로 교체
  socket.on('triggerAlienAction', (data) => {
    const { code } = data;
    const room = gameRooms[code];
    if (!room) return;

    // ★★★ 추가: 에일리언 활동이 시작되었음을 상태에 기록
    room.alienActionTriggered = true;

    const livingPlayers = room.players.filter(p => p.status === 'alive');
    const allAlienRoles = livingPlayers.filter(p => p.role.includes('에일리언'));
    const allAlienIds = allAlienRoles.map(p => p.id);
    const targets = livingPlayers.filter(p => !allAlienIds.includes(p.id));

    const normalAliens = allAlienRoles.filter(p => p.role === '에일리언');
    normalAliens.forEach(alien => {
      const otherAliens = allAlienRoles.filter(a => a.id !== alien.id).map(a => a.name);
      io.to(alien.id).emit('alienAction', { otherAliens, targets });
    });

    const queen = allAlienRoles.find(p => p.role === '에일리언 여왕');
    if (queen) {
      const otherAliens = allAlienRoles.filter(a => a.id !== queen.id).map(a => a.name);
      if (!queen.abilityUsed) {
        io.to(queen.id).emit('queenHuntAction', { otherAliens, targets });
      } else {
        io.to(queen.id).emit('alienAction', { otherAliens, targets: [] });
      }
    }

    // ★★★ 추가: 변경된 상태를 즉시 전파하여 관리자 UI 갱신
    broadcastUpdates(code);
  });

  // 2. 이 함수로 교체
  socket.on('triggerQueenRampage', (data) => {
    const { code } = data;
    const room = gameRooms[code];
    if (!room || room.pendingAction !== 'queen_rampage') return;

    // ★★★ 추가: 만찬이 시작되었음을 상태에 기록
    room.rampageTriggered = true;

    console.log(`[${code}] 관리자가 여왕의 만찬을 시작시켰습니다.`);
    const queen = room.players.find(p => p.role === '에일리언 여왕' && p.status === 'alive');
    if (queen) {
      const allAlienIds = room.players.filter(p => p.role.includes('에일리언')).map(p => p.id);
      const targets = room.players.filter(p => p.status === 'alive' && !allAlienIds.includes(p.id));
      io.to(queen.id).emit('queenRampageAction', { targets });
    }

    // ★★★ 추가: 변경된 상태를 즉시 전파하여 관리자 UI 갱신
    broadcastUpdates(code);
  });

  // server/index.js

  // 이 함수를 아래 코드로 교체해주세요.
  socket.on('startMeetingTimer', (roomCode) => {
    if (!gameRooms[roomCode] || timerIntervals[roomCode]) return;
    const room = gameRooms[roomCode];
    room.timeLeft = 120;

    timerIntervals[roomCode] = setInterval(() => {
      const payload = { roomCode: roomCode, timeLeft: room.timeLeft };
      io.to(roomCode).emit('timerUpdate', payload);
      io.to(ADMIN_ROOM).emit('timerUpdate', payload);

      // ★★★ 디버깅용 로그 추가 ★★★
      console.log(`[디버그] 방 ${roomCode}의 타이머(${room.timeLeft}초) 정보를 관리자에게 전송했습니다.`);

      room.timeLeft--;

      if (room.timeLeft < 0) {
        clearInterval(timerIntervals[roomCode]);
        delete timerIntervals[roomCode];
      }
    }, 1000);
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

  // server/index.js

  // server/index.js

  // 이 함수를 아래 코드로 통째로 교체해주세요.
  socket.on('resolveNightActions', (data) => {
    const { code } = data;
    const room = gameRooms[code];
    if (!room || !room.selections) return;

    console.log(`[${code}] 밤 활동 결과 정산 시작. 현재 선택 현황:`, room.selections);

    const targetsToEliminate = [];
    for (const selectorId in room.selections) {
      const selection = room.selections[selectorId];
      if (Array.isArray(selection)) {
        targetsToEliminate.push(...selection);
      } else {
        targetsToEliminate.push(selection);
      }
    }

    const uniqueTargets = [...new Set(targetsToEliminate)];
    console.log(`[${code}] 제거될 대상:`, uniqueTargets);

    uniqueTargets.forEach(targetId => {
      eliminatePlayer(code, targetId, 'alien_kill');
    });

    // ★★★ 핵심 수정 ★★★
    // 밤 활동으로 인한 사망 처리 직후, 즉시 승리/패배 조건을 확인합니다.
    const gameEnded = checkWinConditions(code);
    if (gameEnded) {
      // 게임이 종료되었다면, 여기서 로직을 중단하고 더 이상 진행하지 않습니다.
      return;
    }

    // '여왕의 만찬' 같은 일회성 액션의 상태를 여기서 확실히 제거합니다.
    if (room.pendingAction === 'queen_rampage') {
      delete room.pendingAction;
      delete room.rampageTriggered;
    }

    // 일반 에일리언 활동 시작 플래그 제거
    delete room.alienActionTriggered;

    room.phase = 'night_crew_action';
    broadcastUpdates(code);
  });

  // 3. 이 함수로 교체해주세요.
  socket.on('triggerCrewAction', (data) => {
    const { code } = data;
    const room = gameRooms[code];
    if (!room) return;

    // ★★★ 추가된 부분: 활동이 시작되었음을 상태에 기록 ★★★
    room.crewActionTriggered = true;

    const livingPlayers = room.players.filter(p => p.status === 'alive');

    const soldier = livingPlayers.find(p => p.role === '군인' && p.bullets > 0);
    if (soldier) {
      const targets = livingPlayers.filter(p => p.id !== soldier.id);
      io.to(soldier.id).emit('soldierAction', { targets, bulletsLeft: soldier.bullets });
    }

    const captain = livingPlayers.find(p => p.role === '함장' && p.bullets > 0);
    if (captain) {
      const targets = livingPlayers.filter(p => p.id !== captain.id);
      io.to(captain.id).emit('captainAction', { targets, bulletsLeft: captain.bullets });
    }

    // ★★★ 추가된 부분: 변경된 상태를 모든 클라이언트에 전파하여 UI를 갱신 ★★★
    broadcastUpdates(code);
  });

  // server/index.js

  // 'engineerChoseEscape' 핸들러 추가
  socket.on('engineerChoseEscape', () => {
    let roomCode = '';
    for (const code in gameRooms) {
      if (gameRooms[code].players.some(p => p.id === socket.id)) { roomCode = code; break; }
    }
    if (!roomCode) return;

    const room = gameRooms[roomCode];
    console.log(`[${roomCode}] 엔지니어가 비상탈출을 선택했습니다.`);

    // ★★★ 추가: 생존자 수 체크 ★★★
    const livingPlayers = room.players.filter(p => p.status === 'alive');
    if (livingPlayers.length < 4) {
      console.log(`[${roomCode}] 생존자가 4명 미만이라 비상탈출이 불가능합니다.`);
      room.status = 'game_over';
      const ending = { winner: '에일리언', reason: `생존 인원이 4명보다 적어 비상탈출 캡슐을 가동할 수 없습니다. 남은 탐사대는 절망에 빠졌습니다.` };
      io.to(roomCode).emit('gameOver', ending);
      io.to(ADMIN_ROOM).emit('updateAdmin', { rooms: gameRooms });
      return;
    }

    room.pendingAction = 'escape_survivor_selection';
    broadcastUpdates(roomCode);
  });

  // 2. 'startEscapeSequence' 핸들러 추가
  socket.on('startEscapeSequence', (data) => {
    const { code, survivorIds } = data;
    const room = gameRooms[code];
    if (!room) return;

    console.log(`[${code}] 비상탈출 시퀀스가 시작되었습니다. 탑승자:`, survivorIds);

    // 선택된 생존자 정보를 방 상태에 저장
    room.escapees = room.players.filter(p => survivorIds.includes(p.id));

    // 게임 단계를 '비상탈출 시퀀스'로 전환
    room.phase = 'escape_sequence';
    room.escapeStep = 0; // 0단계부터 시작
    delete room.pendingAction; // '생존자 선택' 상태는 완료되었으므로 삭제

    broadcastUpdates(code);
  });

  // 비상탈출 타이머 시작 핸들러
  socket.on('startEscapeTimer', (roomCode) => {
    if (!gameRooms[roomCode] || timerIntervals[roomCode]) return;
    const room = gameRooms[roomCode];
    room.timeLeft = 210; // 3분 30초

    timerIntervals[roomCode] = setInterval(() => {
      const payload = { roomCode: roomCode, timeLeft: room.timeLeft };
      io.to(roomCode).emit('timerUpdate', payload);
      io.to(ADMIN_ROOM).emit('timerUpdate', payload);

      room.timeLeft--;

      if (room.timeLeft < 0) {
        clearInterval(timerIntervals[roomCode]);
        delete timerIntervals[roomCode];
      }
    }, 1000);
  });

  // 관리자에 의한 비상탈출 실패 처리 핸들러
  socket.on('forceEscapeFailure', (data) => {
    const { code } = data;
    const room = gameRooms[code];
    if (!room) return;

    room.status = 'game_over';
    const ending = ENDING_MESSAGES['alien_win_escape_timeout'];
    io.to(code).emit('gameOver', { winner: ending.winner, reason: ending.reason });
    broadcastUpdates(code);
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
        eliminatePlayer(roomCode, targetId, 'soldier_shot');
        broadcastUpdates(roomCode);
      }
    }
  });

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
        eliminatePlayer(roomCode, targetId, 'captain_shot');
        broadcastUpdates(roomCode);
      }
    }
  });

  socket.on('useQueenHunt', (data) => {
    const { targetIds } = data;
    const selectorId = socket.id;
    let roomCode = '';
    for (const code in gameRooms) {
      if (gameRooms[code].players.some(p => p.id === selectorId)) { roomCode = code; break; }
    }

    if (roomCode) {
      const room = gameRooms[roomCode];
      const queen = room.players.find(p => p.id === socket.id);
      if (room && queen && queen.role === '에일리언 여왕' && !queen.abilityUsed && targetIds && targetIds.length === 2) {
        queen.abilityUsed = true;
        room.selections[selectorId] = targetIds;

        const allAliens = room.players.filter(p => p.role.includes('에일리언'));
        allAliens.forEach(alienPlayer => {
          io.to(alienPlayer.id).emit('nightSelectionUpdate', { selections: room.selections });
        });
      }
    }
  });

  socket.on('triggerQueenRampage', (data) => {
    const { code } = data;
    const room = gameRooms[code];
    if (!room || room.pendingAction !== 'queen_rampage') return;

    // ★★★ 추가: 만찬이 시작되었음을 상태에 기록
    room.rampageTriggered = true;

    console.log(`[${code}] 관리자가 여왕의 만찬을 시작시켰습니다.`);
    const queen = room.players.find(p => p.role === '에일리언 여왕' && p.status === 'alive');
    if (queen) {
      const allAlienIds = room.players.filter(p => p.role.includes('에일리언')).map(p => p.id);
      const targets = room.players.filter(p => p.status === 'alive' && !allAlienIds.includes(p.id));
      io.to(queen.id).emit('queenRampageAction', { targets });
    }

    // ★★★ 추가: 변경된 상태를 즉시 전파하여 관리자 UI 갱신
    broadcastUpdates(code);
  });

  // server/index.js

  // 3. 이 함수로 교체해주세요.
  socket.on('useQueenRampage', (data) => {
    const { targetIds } = data;
    const selectorId = socket.id;
    let roomCode = '';
    for (const code in gameRooms) {
      if (gameRooms[code].players.some(p => p.id === selectorId)) { roomCode = code; break; }
    }

    if (roomCode) {
      const room = gameRooms[roomCode];
      const queen = room.players.find(p => p.id === socket.id);
      // ★★★ 수정: 0명 이상, 4명 이하 선택을 허용하도록 조건 변경 ★★★
      if (room && queen && queen.role === '에일리언 여왕' && targetIds && targetIds.length >= 0 && targetIds.length <= 4) {
        room.selections[selectorId] = targetIds;

        console.log(`[${roomCode}] 여왕 만찬 선택 기록:`, room.selections);
        io.to(selectorId).emit('actionConfirmed');

        const allAliens = room.players.filter(p => p.role.includes('에일리언'));
        allAliens.forEach(alienPlayer => {
          io.to(alienPlayer.id).emit('nightSelectionUpdate', { selections: room.selections });
        });

        broadcastUpdates(roomCode);
      }
    }
  });

  socket.on('engineerChoseToFight', () => {
    let roomCode = '';
    for (const code in gameRooms) {
      if (gameRooms[code].players.some(p => p.id === socket.id)) { roomCode = code; break; }
    }
    if (!roomCode) return;

    console.log(`[${roomCode}] 엔지니어가 싸움을 선택했습니다. 여왕의 만찬을 준비합니다.`);
    const room = gameRooms[roomCode];
    room.pendingAction = 'queen_rampage';
    io.to(roomCode).emit('feastAnnounced');
    broadcastUpdates(roomCode);
  });

  socket.on('engineerChoseEscape', () => {
    let roomCode = '';
    for (const code in gameRooms) {
      if (gameRooms[code].players.some(p => p.id === socket.id)) { roomCode = code; break; }
    }
    console.log(`[${roomCode}] 엔지니어가 비상탈출을 선택했습니다.`);
  });

  // server/index.js

  // 4. 이 함수로 교체해주세요.
  socket.on('endNightAndStartMeeting', (data) => {
    const { code } = data;
    const room = gameRooms[code];
    if (!room) return;

    const gameEnded = checkWinConditions(code);
    if (gameEnded) return;

    delete room.crewActionTriggered;
    delete room.alienActionTriggered; // ★★★ 추가
    delete room.rampageTriggered;   // ★★★ 추가
    room.selections = {};

    room.day++;
    room.phase = 'meeting';
    broadcastUpdates(code);
  });

  socket.on('disconnect', () => {
  });
});

server.listen(PORT, () => {
  console.log(`서버가 ${PORT}번 포트에서 실행 중입니다.`);
});