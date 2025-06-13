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

app.use(express.static(path.join(__dirname, '../client/public')));
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, '../client/public', 'index.html')); });
app.get('/admin', (req, res) => { res.sendFile(path.join(__dirname, '../client/public', 'admin.html')); });

io.on('connection', (socket) => {
  socket.on('adminConnect', () => {
    socket.join(ADMIN_ROOM);
    socket.emit('updateAdmin', { rooms: gameRooms, presets: PRESETS });
  });

  socket.on('joinGame', (data) => {
    const { name, code } = data;
    socket.join(code);
    if (!gameRooms[code]) {
      gameRooms[code] = { players: [], status: 'waiting', day: 0, phase: 'lobby' };
    }
    const newPlayer = { id: socket.id, name: name };
    gameRooms[code].players.push(newPlayer);
    io.to(code).emit('updateRoom', gameRooms[code].players);
    io.to(ADMIN_ROOM).emit('updateAdmin', { rooms: gameRooms, presets: PRESETS });
  });

  socket.on('startGame', (data) => {
    const { code, settings, presetId } = data;
    const room = gameRooms[code];
    if (!room || room.status === 'playing') return;

    console.log(`[${code}] 방 게임 시작 요청`);
    console.log('역할 설정:', settings);
    console.log('선택된 프리셋:', presetId);

    if (PRESETS[presetId]) {
      room.missions = PRESETS[presetId].missions;
    }

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
    });

    room.status = 'playing';
    room.phase = 'role_reveal';

    io.to(ADMIN_ROOM).emit('updateAdmin', { rooms: gameRooms, presets: PRESETS });

    players.forEach(player => {
      io.to(player.id).emit('roleAssigned', { role: player.role, description: player.description });
    });
  });

  socket.on('nextPhase', (data) => {
    const { code, phase, day } = data;
    const room = gameRooms[code];
    if (!room) return;

    room.phase = phase;
    room.day = parseInt(day, 10);

    io.to(code).emit('phaseChange', { phase: room.phase, day: room.day });
    io.to(ADMIN_ROOM).emit('updateAdmin', { rooms: gameRooms, presets: PRESETS });
    console.log(`[${code}] 방, ${day}일차 ${phase} 시작을 관리자가 지시했습니다.`);
  });

  // --- 이 부분을 추가합니다 ---
  socket.on('startMeetingTimer', (roomCode) => {
    console.log(`[${roomCode}] 방의 회의 타이머를 시작합니다.`);
    // 모든 플레이어에게 120초 타이머 시작 신호를 보냅니다.
    io.to(roomCode).emit('startTimer', 120);
  });

  socket.on('disconnect', () => { /* ... */ });
});

server.listen(PORT, () => {
  console.log(`서버가 ${PORT}번 포트에서 실행 중입니다.`);
});