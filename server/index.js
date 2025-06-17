const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = 3001;
const gameRooms = {};
const ADMIN_ROOM = 'admin_room';

const PRESETS = {
  "preset1": {
    name: "초등 6학년: 분수의 나눗셈",
    missions: [
      { question: "1/2 ÷ 1/4 의 값은?", answer: "2" },
      { question: "3/5 ÷ 2/5 의 값은?", answer: "3/2" },
      { question: "7 ÷ 1/3 의 값은?", answer: "21" }
    ]
  },
  "preset2": {
    name: "한국사: 조선시대 왕",
    missions: [
      { question: "조선을 건국한 왕의 이름은?", answer: "이성계" },
      { question: "훈민정음을 창제한 왕의 이름은?", answer: "세종대왕" },
      { question: "수원 화성을 건설한 왕의 이름은?", answer: "정조" }
    ]
  }
};

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

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// 정적 파일 제공 및 라우팅 설정
app.use(express.static(path.join(__dirname, '../client/public')));
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, '../client/public', 'index.html')); });
app.get('/admin', (req, res) => { res.sendFile(path.join(__dirname, '../client/public', 'admin.html')); });

// Socket.IO 연결 처리
io.on('connection', (socket) => {

  // 관리자 페이지 연결
  socket.on('adminConnect', () => {
    socket.join(ADMIN_ROOM);
    socket.emit('updateAdmin', { rooms: gameRooms, presets: PRESETS });
  });

  // 게임방 참가
  socket.on('joinGame', (data) => {
    const { name, code } = data;
    socket.join(code);
    if (!gameRooms[code]) {
      gameRooms[code] = { players: [], status: 'waiting', day: 0, phase: 'lobby' };
    }
    const newPlayer = { id: socket.id, name: name, status: 'alive' };
    gameRooms[code].players.push(newPlayer);
    io.to(code).emit('updateRoom', gameRooms[code]);
    io.to(ADMIN_ROOM).emit('updateAdmin', { rooms: gameRooms, presets: PRESETS });
  });

  // 게임 시작
  /// 이 함수 전체를 찾아서 아래 코드로 교체해주세요.
  socket.on('startGame', (data) => {
    // admin.html에서 보낸 groupCount를 정상적으로 수신합니다.
    const { code, settings, groupCount } = data;
    const room = gameRooms[code];
    if (!room || room.status === 'playing') return;

    // '모둠 수'를 나중에 사용하기 위해 방 정보에 저장만 해둡니다.
    room.groupCount = groupCount;
    console.log(`[${code}] 방 게임 시작. 설정된 모둠 수: ${groupCount}`);

    // 역할 배정 로직은 그대로 유지합니다.
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
      // 1일차에는 player.group을 설정하지 않습니다.
    });

    // 게임 상태를 'playing'으로, 첫 단계를 'role_reveal'로 설정합니다.
    room.status = 'playing';
    room.phase = 'role_reveal';

    // 관리자 화면을 업데이트합니다.
    io.to(ADMIN_ROOM).emit('updateAdmin', { rooms: gameRooms, presets: PRESETS });

    // 각 플레이어에게 역할을 전송합니다.
    players.forEach(player => {
      io.to(player.id).emit('roleAssigned', { role: player.role, description: player.description });
    });
  });

  // 이 코드 블록 전체를 새로 추가하세요
  socket.on('selectGroup', (data) => {
    const { groupNumber } = data;
    let roomCode = '';
    let player = null;

    // 이 플레이어가 속한 방과 플레이어 객체를 찾습니다.
    for (const code in gameRooms) {
      const p = gameRooms[code].players.find(p => p.id === socket.id);
      if (p) {
        roomCode = code;
        player = p;
        break;
      }
    }

    if (player && roomCode) {
      // 플레이어 정보에 그룹 번호를 기록합니다.
      player.group = groupNumber;
      console.log(`[${roomCode}] 방의 ${player.name}님이 ${groupNumber}모둠을 선택했습니다.`);

      const room = gameRooms[roomCode];
      // 변경된 방 정보를 모든 사람에게 다시 전송합니다.
      io.to(roomCode).emit('updateRoom', room);
      io.to(ADMIN_ROOM).emit('updateAdmin', { rooms: gameRooms, presets: PRESETS });
    }
  });

  // 다음 단계 진행
  socket.on('nextPhase', (data) => {
    const { code, phase, day } = data;
    const room = gameRooms[code];
    if (!room) return;

    room.phase = phase;
    room.day = parseInt(day, 10);
    console.log(`[${code}] 방, ${day}일차 ${phase} 단계 시작.`);

    const livingPlayers = room.players.filter(p => p.status === 'alive');

    if (phase === 'night_alien_action') {
      const aliens = livingPlayers.filter(p => p.role === '에일리언 여왕' || p.role === '에일리언');
      const alienIds = aliens.map(p => p.id);

      livingPlayers.forEach(player => {
        io.to(player.id).emit('phaseChange', { phase: room.phase, day: room.day });
      });

      const targets = livingPlayers.filter(p => !alienIds.includes(p.id));
      aliens.forEach(alien => {
        const otherAliens = aliens.filter(a => a.id !== alien.id).map(a => a.name);
        io.to(alien.id).emit('alienAction', { otherAliens, targets });
      });

    } else {
      io.to(code).emit('phaseChange', { phase: room.phase, day: room.day });
    }

    io.to(ADMIN_ROOM).emit('updateAdmin', { rooms: gameRooms, presets: PRESETS });
  });

  // 회의 타이머 시작
  socket.on('startMeetingTimer', (roomCode) => {
    const room = gameRooms[roomCode];
    if (!room || room.timerInterval) return;

    console.log(`[${roomCode}] 방의 회의 타이머를 서버에서 시작합니다.`);
    room.timeLeft = 120;

    room.timerInterval = setInterval(() => {
      io.to(roomCode).emit('timerUpdate', { timeLeft: room.timeLeft });
      room.timeLeft--;

      if (room.timeLeft < 0) {
        clearInterval(room.timerInterval);
        room.timerInterval = null;
        console.log(`[${roomCode}] 방의 타이머가 종료되었습니다.`);
      }
    }, 1000);
  });

  // 플레이어 사망 처리
  socket.on('eliminatePlayer', (data) => {
    const { roomCode, playerId } = data;
    const room = gameRooms[roomCode];
    if (!room) return;

    const player = room.players.find(p => p.id === playerId);
    if (player) {
      player.status = 'dead';
      console.log(`[${roomCode}] 방의 ${player.name}님이 사망 처리되었습니다.`);

      io.to(playerId).emit('youAreDead');
      io.to(roomCode).emit('updateRoom', room.players);
      io.to(ADMIN_ROOM).emit('updateAdmin', { rooms: gameRooms, presets: PRESETS });
    }
  });

  // 에일리언의 밤 활동 결과 수신
  socket.on('nightAction', (data) => {
    const { targetId } = data;

    // 이 socket(에일리언)이 어느 방에 있는지 찾기
    let roomCode = '';
    for (const code in gameRooms) {
      if (gameRooms[code].players.some(p => p.id === socket.id)) {
        roomCode = code;
        break;
      }
    }

    if (roomCode) {
      const room = gameRooms[roomCode];
      const alien = room.players.find(p => p.id === socket.id);
      const target = room.players.find(p => p.id === targetId);

      // 아직 서버에서는 콘솔에 로그만 남깁니다.
      console.log(`[${roomCode}] 방의 에일리언(${alien.name})이 ${target.name}님을 사냥감으로 선택했습니다.`);

      // 여기에 나중에 실제 사망 처리 로직이 들어갑니다.
      room.nightlyTarget = targetId; // 일단 선택된 대상을 기록만 해둡니다.
    }
  });

  // 디버그용 게임 시작 (올바른 위치로 이동)
  socket.on('debugStartGame', () => {
    console.log(`'${socket.id}' 클라이언트로부터 디버그용 테스트 게임 시작 요청을 받았습니다.`);

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
    io.to(ADMIN_ROOM).emit('updateAdmin', { rooms: gameRooms, presets: PRESETS });
    console.log(`[${roomCode}] 테스트 방이 생성되고 게임이 시작되었습니다.`);
  });

  // 연결 종료 처리
  socket.on('disconnect', () => {
    console.log(`유저 접속이 끊어졌습니다: ${socket.id}`);
    // 여기에 접속 종료 시 플레이어를 방에서 제거하는 로직을 추가할 수 있습니다.
  });

}); // io.on('connection', ...) 블록의 끝

// 서버 실행
server.listen(PORT, () => {
  console.log(`서버가 ${PORT}번 포트에서 실행 중입니다.`);
});