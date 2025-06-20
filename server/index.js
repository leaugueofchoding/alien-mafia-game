// server/index.js

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

// presets.json 로드 로직 (만약 파일이 없다면 기본값 사용)
let PRESETS = {};
try {
  const presetsPath = path.join(__dirname, 'presets.json');
  if (fs.existsSync(presetsPath)) {
    const presetsData = fs.readFileSync(presetsPath, 'utf8');
    PRESETS = JSON.parse(presetsData);
  } else {
    console.log('presets.json 파일이 없어 기본값으로 시작합니다.');
  }
} catch (error) {
  console.error('presets.json 파일을 읽거나 파싱하는 데 실패했습니다:', error);
}


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
};

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function broadcastUpdates(roomCode, fullUpdate = true) {
  if (gameRooms[roomCode]) {
    const room = gameRooms[roomCode];
    io.to(ADMIN_ROOM).emit('updateAdmin', { rooms: gameRooms, presets: PRESETS });
    io.to(roomCode).emit('boardUpdate', room);

    if (fullUpdate) {
      io.to(roomCode).emit('updateRoom', room);
    }
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
    broadcastUpdates(roomCode);
    return true;
  }

  return false;
}

function eliminatePlayer(roomCode, playerId, cause = 'unknown') {
  const room = gameRooms[roomCode];
  if (!room) return false;
  const player = room.players.find(p => p.id === playerId);

  if (player && player.status !== 'dead') {
    player.status = 'dead';
    player.causeOfDeath = cause;
    io.to(playerId).emit('youAreDead');

    if (player.role === '함장') {
      const engineer = room.players.find(p => p.role === '엔지니어' && p.status === 'alive');
      if (engineer) {
        room.players.forEach(p => {
          if (p.status === 'alive') {
            io.to(p.id).emit('captainDiedChoice', { isEngineer: p.id === engineer.id });
          }
        });
      }
    }
    return true;
  }
  return false;
}

// ======================================================
// ★★★ 경로 수정 부분 ★★★
// 모든 파일 경로에 '/public'을 다시 추가했습니다.
// ======================================================
app.use(express.static(path.join(__dirname, '..', 'client', 'public')));
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, '..', 'client', 'public', 'index.html')); });
app.get('/admin', (req, res) => { res.sendFile(path.join(__dirname, '..', 'client', 'public', 'admin.html')); });
app.get('/situation-board.html', (req, res) => { res.sendFile(path.join(__dirname, '..', 'client', 'public', 'situation-board.html')); });


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
    if (!code) return;
    socket.join(code);

    if (!gameRooms[code]) {
      gameRooms[code] = {
        players: [],
        status: 'waiting',
        day: 0,
        phase: 'lobby',
        selections: {},
        groupCount: 4
      };
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
    if (roles.length !== players.length) {
      console.error("역할 수와 플레이어 수가 다릅니다.");
      return;
    }

    const shuffledRoles = shuffle(roles);
    players.forEach((player, index) => {
      player.role = shuffledRoles[index];
      player.description = ROLE_DESCRIPTIONS[player.role] || '';
      player.abilityUsed = false;

      if (player.role === '함장') player.bullets = 2;
      else if (player.role === '군인') player.bullets = 1;
    });

    room.status = 'playing';
    room.day = 0;
    room.phase = 'role_reveal';
    broadcastUpdates(code);
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
    const allAlienRoles = livingPlayers.filter(p => p.role.includes('에일리언'));
    const allAlienIds = allAlienRoles.map(p => p.id);
    const targets = livingPlayers.filter(p => !allAlienIds.includes(p.id));

    allAlienRoles.forEach(alien => {
      const otherAliens = allAlienRoles.filter(a => a.id !== alien.id).map(a => a.name);
      if (alien.role === '에일리언 여왕' && !alien.abilityUsed) {
        io.to(alien.id).emit('queenHuntAction', { otherAliens, targets });
      } else {
        io.to(alien.id).emit('alienAction', { otherAliens, targets });
      }
    });

    broadcastUpdates(code, false);
  });

  function handleNightSelection(socket, targetIds) {
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
      room.selections = room.selections || {};

      const finalTargetIds = Array.isArray(targetIds) ? targetIds : [targetIds];

      if (finalTargetIds.length > 0 && finalTargetIds[0] !== null) {
        room.selections[selectorId] = finalTargetIds;
      } else {
        delete room.selections[selectorId];
      }

      const allAliens = room.players.filter(p => p.role.includes('에일리언') && p.status === 'alive');
      allAliens.forEach(alienPlayer => {
        io.to(alienPlayer.id).emit('nightSelectionUpdate', { selections: room.selections });
      });

      io.to(selectorId).emit('actionConfirmed');
      broadcastUpdates(roomCode, false);
    }
  }

  socket.on('nightAction', (data) => handleNightSelection(socket, data.targetId ? [data.targetId] : []));
  socket.on('useQueenHunt', (data) => handleNightSelection(socket, data.targetIds));
  socket.on('useQueenRampage', (data) => handleNightSelection(socket, data.targetIds));

  socket.on('resolveNightActions', (data) => {
    const { code } = data;
    const room = gameRooms[code];
    if (!room || !room.selections) return;

    const targetsToEliminate = [...new Set(Object.values(room.selections).flat())];

    targetsToEliminate.forEach(targetId => {
      const player = room.players.find(p => p.id === targetId);
      const selector = room.players.find(p => room.selections[p.id]?.includes(targetId));

      let cause = 'alien_kill';
      if (selector) {
        if (selector.role === '에일리언 여왕' && room.pendingAction === 'queen_rampage') {
          cause = 'queen_rampage';
        } else if (selector.role === '에일리언 여왕') {
          cause = 'queen_hunt';
          selector.abilityUsed = true;
        }
      }
      eliminatePlayer(code, targetId, cause);
    });

    room.selections = {};
    if (room.pendingAction === 'queen_rampage') {
      delete room.pendingAction;
    }

    if (checkWinConditions(code)) return;

    room.phase = 'night_crew_action';
    broadcastUpdates(code, true);
  });

  socket.on('triggerCrewAction', (data) => {
    const { code } = data;
    const room = gameRooms[code];
    if (!room) return;

    room.players.forEach(p => {
      if (p.status === 'alive') {
        io.to(p.id).emit('crewActionPhaseStarted', room);
      }
    });

    broadcastUpdates(code, false);
  });

  socket.on('endNightAndStartMeeting', (data) => {
    const { code } = data;
    const room = gameRooms[code];
    if (!room) return;

    if (checkWinConditions(code)) return;

    room.day++;
    room.phase = 'meeting';
    broadcastUpdates(code);
  });

  socket.on('engineerChoseToFight', () => {
    let roomCode = '';
    for (const code in gameRooms) {
      if (gameRooms[code].players.some(p => p.id === socket.id)) { roomCode = code; break; }
    }
    if (!roomCode) return;

    const room = gameRooms[roomCode];
    room.pendingAction = 'queen_rampage';
    room.phase = 'night_alien_action';
    io.to(roomCode).emit('feastAnnounced');
    broadcastUpdates(roomCode);
  });

  socket.on('engineerChoseEscape', () => {
    // 비상탈출 로직 (추후 구현)
  });

  socket.on('triggerQueenRampage', (data) => {
    const { code } = data;
    const room = gameRooms[code];
    if (!room || room.pendingAction !== 'queen_rampage') return;

    const queen = room.players.find(p => p.role === '에일리언 여왕' && p.status === 'alive');
    if (queen) {
      const allAlienIds = room.players.filter(p => p.role.includes('에일리언')).map(p => p.id);
      const targets = room.players.filter(p => p.status === 'alive' && !allAlienIds.includes(p.id));
      io.to(queen.id).emit('queenRampageAction', { targets });
      broadcastUpdates(code, false);
    }
  });

  socket.on('startMeetingTimer', (roomCode) => {
    if (!gameRooms[roomCode] || timerIntervals[roomCode]) return;
    const room = gameRooms[roomCode];
    let timeLeft = 120;
    room.timeLeft = timeLeft;

    timerIntervals[roomCode] = setInterval(() => {
      io.to(roomCode).emit('timerUpdate', { timeLeft: timeLeft });
      timeLeft--;

      if (timeLeft < 0) {
        clearInterval(timerIntervals[roomCode]);
        delete timerIntervals[roomCode];
      }
    }, 1000);
  });

  socket.on('eliminatePlayer', (data) => {
    const { roomCode, playerId } = data;
    if (eliminatePlayer(roomCode, playerId, 'ejected')) {
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

  socket.on('useSoldierAbility', (data) => {
    const { targetId } = data;
    let roomCode = '';
    for (const code in gameRooms) { if (gameRooms[code].players.some(p => p.id === socket.id)) { roomCode = code; break; } }
    if (!roomCode) return;

    const room = gameRooms[roomCode];
    const soldier = room.players.find(p => p.id === socket.id);
    if (room && soldier && soldier.role === '군인' && soldier.bullets > 0 && soldier.status === 'alive') {
      soldier.bullets--;
      if (eliminatePlayer(roomCode, targetId, 'soldier_shot')) {
        io.to(soldier.id).emit('actionConfirmed', '사격 완료! 남은 총알: ' + soldier.bullets + '발');
        if (!checkWinConditions(roomCode)) {
          broadcastUpdates(roomCode);
        }
      }
    }
  });

  socket.on('useCaptainAbility', (data) => {
    const { targetId } = data;
    let roomCode = '';
    for (const code in gameRooms) { if (gameRooms[code].players.some(p => p.id === socket.id)) { roomCode = code; break; } }
    if (!roomCode) return;

    const room = gameRooms[roomCode];
    const captain = room.players.find(p => p.id === socket.id);
    if (room && captain && captain.role === '함장' && captain.bullets > 0 && captain.status === 'alive') {
      captain.bullets--;
      if (eliminatePlayer(roomCode, targetId, 'captain_shot')) {
        io.to(captain.id).emit('actionConfirmed', '즉결처분 완료! 남은 총알: ' + captain.bullets + '발');
        if (!checkWinConditions(roomCode)) {
          broadcastUpdates(roomCode);
        }
      }
    }
  });

  socket.on('disconnect', () => {
    for (const code in gameRooms) {
      const room = gameRooms[code];
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex > -1) {
        room.players.splice(playerIndex, 1);
        if (room.players.length === 0) {
          delete gameRooms[code];
        }
        broadcastUpdates(code);
        break;
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`서버가 ${PORT}번 포트에서 실행 중입니다.`);
});