const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const TOTAL_DISTANCE = 20000;
const LEVEL_LENGTH = 2000;
const START_X = 220;

const ui = {
  distance: document.getElementById("distance"),
  coins: document.getElementById("coins"),
  lives: document.getElementById("lives"),
  levelNumber: document.getElementById("levelNumber"),
  levelName: document.getElementById("levelName"),
  progress: document.getElementById("progressFill"),
  startOverlay: document.getElementById("startOverlay"),
  messageOverlay: document.getElementById("messageOverlay"),
  messageLabel: document.getElementById("messageLabel"),
  messageTitle: document.getElementById("messageTitle"),
  messageText: document.getElementById("messageText"),
  powerupTimer: document.getElementById("powerupTimer"),
  powerupTime: document.getElementById("powerupTime"),
  soundToggle: document.getElementById("soundToggle")
};

const levels = [
  { name: "屏科大椰林", sky: "#a9d3c8", haze: "#dce4c7", ground: "#71904f", road: "#d8c293", scene: "gate" },
  { name: "萬巒客庄", sky: "#acd1bd", haze: "#e5dfbc", ground: "#78934d", road: "#d1b47d", scene: "village" },
  { name: "東港漁港", sky: "#8fc7cb", haze: "#d1dfc9", ground: "#568064", road: "#cdb482", scene: "harbor" },
  { name: "大鵬灣環灣", sky: "#82bec8", haze: "#c6ded1", ground: "#4e8062", road: "#c5b17f", scene: "bay" },
  { name: "枋寮海岸", sky: "#8dc9cf", haze: "#e2dfbd", ground: "#759052", road: "#d2b378", scene: "coast" },
  { name: "車城福安宮", sky: "#9dc4bb", haze: "#e6d5b2", ground: "#69834c", road: "#cfa66d", scene: "temple" },
  { name: "海生館奇航", sky: "#7dbdc8", haze: "#beddd5", ground: "#477765", road: "#c0aa7b", scene: "aquarium" },
  { name: "恆春古城", sky: "#9ac5bd", haze: "#dddbb8", ground: "#6b824b", road: "#c9a66f", scene: "oldtown" },
  { name: "墾丁海岸線", sky: "#75becf", haze: "#d9e4c4", ground: "#588450", road: "#d4b174", scene: "kenting" },
  { name: "鵝鑾鼻終點", sky: "#71b5c9", haze: "#d8e1c5", ground: "#4e7a4e", road: "#cfa76d", scene: "lighthouse" }
];

const keys = { left: false, right: false, jump: false };
let audioContext = null;
let soundEnabled = true;
let running = false;
let finished = false;
let lastTime = 0;
let cameraX = 0;
let distanceM = 0;
let coinCount = 0;
let currentLevel = 0;
let checkpoint = 0;
let checkpointCoins = 0;
let invulnerableUntil = 0;
let turboUntil = 0;
let flyingUntil = 0;
let notice = "";
let noticeUntil = 0;

const car = {
  x: START_X, y: 420, vx: 0, vy: 0, width: 96, height: 52,
  grounded: true, angle: 0, wheelSpin: 0
};

const rampLocations = Array.from({ length: 24 }, (_, index) => 620 + index * 790);
const obstacleTypes = ["barrier", "rock", "log"];
const checkpoints = Array.from({ length: 9 }, (_, index) => (index + 1) * LEVEL_LENGTH);
const obstacleData = Array.from({ length: 46 }, (_, index) => [
  720 + index * 405 + (index % 4) * 38,
  obstacleTypes[index % obstacleTypes.length]
]).filter(([distance]) =>
  distance < TOTAL_DISTANCE - 450 &&
  !checkpoints.some((checkpointDistance) => Math.abs(distance - checkpointDistance) <= 100)
);
const obstacles = obstacleData.map(([distance, type]) => ({ distance, type, hit: false }));
const powerups = Array.from({ length: 10 }, (_, index) => ({
  distance: (index + 1) * LEVEL_LENGTH - 620 - Math.floor(Math.random() * 360),
  type: Math.random() < .5 ? "flight" : "turbo",
  collected: false,
  bob: Math.random() * Math.PI * 2
}));
const coins = [];

for (let distance = 300; distance < TOTAL_DISTANCE; distance += 125 + (Math.floor(distance / 125) % 3) * 22) {
  const nearObstacle = obstacles.some((item) => Math.abs(item.distance - distance) < 70);
  coins.push({
    distance,
    offsetY: nearObstacle || Math.sin(distance * .018) > .45 ? -92 : -38,
    collected: false,
    bob: Math.random() * Math.PI * 2
  });
}

function worldX(distance) {
  return START_X + distance;
}

function terrainHeight(x) {
  const base = 485;
  const rolling = Math.sin(x * .0052) * 24 + Math.sin(x * .013) * 9;
  let ramp = 0;
  for (const distance of rampLocations) {
    const d = x - worldX(distance);
    if (d > -115 && d < 0) ramp -= (d + 115) * .58;
    if (d >= 0 && d < 95) ramp -= (95 - d) * .7;
  }
  return base + rolling + ramp;
}

function resetGame() {
  running = true;
  finished = false;
  checkpoint = 0;
  checkpointCoins = 0;
  distanceM = 0;
  coinCount = 0;
  currentLevel = 0;
  cameraX = 0;
  invulnerableUntil = 0;
  turboUntil = 0;
  flyingUntil = 0;
  notice = "";
  coins.forEach((coin) => coin.collected = false);
  obstacles.forEach((obstacle) => obstacle.hit = false);
  powerups.forEach((powerup) => {
    powerup.collected = false;
    powerup.type = Math.random() < .5 ? "flight" : "turbo";
  });
  placeCarAt(0);
  ui.messageOverlay.hidden = true;
  ui.startOverlay.classList.add("hidden");
  lastTime = performance.now();
  updateUI();
  requestAnimationFrame(loop);
}

function placeCarAt(distance) {
  distanceM = distance;
  cameraX = Math.max(0, worldX(distance) - START_X);
  Object.assign(car, {
    x: START_X,
    y: terrainHeight(worldX(distance)) - 33,
    vx: 0,
    vy: 0,
    grounded: true,
    angle: 0
  });
}

function updateUI() {
  ui.distance.innerHTML = `${(distanceM / 1000).toFixed(2)} <i>km</i>`;
  ui.coins.textContent = coinCount;
  ui.lives.textContent = "∞ 無限";
  ui.levelNumber.textContent = String(currentLevel + 1).padStart(2, "0");
  ui.levelName.textContent = levels[currentLevel].name;
  ui.progress.style.width = `${Math.min(distanceM / TOTAL_DISTANCE * 100, 100)}%`;
  const turboRemaining = Math.max(0, turboUntil - performance.now());
  ui.powerupTimer.hidden = turboRemaining <= 0;
  ui.powerupTime.textContent = `${(turboRemaining / 1000).toFixed(1)} 秒`;
  document.querySelectorAll(".route-item").forEach((item, index) => {
    item.classList.toggle("active", index === currentLevel);
    item.classList.toggle("complete", index < currentLevel);
  });
}

function playTone(frequency, duration = .08, type = "sine", volume = .08) {
  if (!soundEnabled) return;
  audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(volume, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + duration);
}

function setNotice(text, duration = 1500) {
  notice = text;
  noticeUntil = performance.now() + duration;
}

function activateCheckpoint(value) {
  checkpoint = value;
  checkpointCoins = coinCount;
  obstacles.forEach((obstacle) => {
    if (obstacle.distance < checkpoint) obstacle.hit = true;
  });
  setNotice(`存檔點 ${(value / 1000).toFixed(0)} 已啟用`, 1900);
  playTone(520, .12, "triangle", .07);
  setTimeout(() => playTone(720, .2, "triangle", .06), 110);
}

function hitObstacle(obstacle) {
  if (performance.now() < invulnerableUntil || obstacle.hit) return;
  if (performance.now() < turboUntil) {
    obstacle.hit = true;
    car.vx = Math.max(car.vx, 650);
    setNotice("渦輪衝撞！障礙物已撞毀", 850);
    playTone(170, .1, "sawtooth", .07);
    return;
  }
  obstacle.hit = true;
  car.vx = -145;
  car.vy = -230;
  car.grounded = false;
  invulnerableUntil = performance.now() + 1300;
  playTone(95, .25, "sawtooth", .08);

  setNotice("撞到障礙！返回存檔點", 900);
  running = false;
  setTimeout(() => {
    coinCount = checkpointCoins;
    coins.forEach((coin) => {
      if (coin.distance > checkpoint) coin.collected = false;
    });
    obstacles.forEach((item) => {
      item.hit = item.distance < checkpoint;
    });
    powerups.forEach((powerup) => {
      if (powerup.distance > checkpoint) powerup.collected = false;
    });
    turboUntil = 0;
    flyingUntil = 0;
    placeCarAt(checkpoint);
    invulnerableUntil = performance.now() + 1800;
    setNotice(checkpoint ? "從最近存檔點重新出發" : "從起點重新出發", 1600);
    lastTime = performance.now();
    running = true;
    updateUI();
    requestAnimationFrame(loop);
  }, 650);
}

function collectPowerup(powerup) {
  powerup.collected = true;
  if (powerup.type === "flight") {
    const targetDistance = Math.min(TOTAL_DISTANCE, distanceM + 500);
    cameraX = Math.max(0, worldX(targetDistance) - car.x);
    distanceM = targetDistance;
    car.vy = -260;
    car.grounded = false;
    flyingUntil = performance.now() + 1800;
    invulnerableUntil = flyingUntil;
    setNotice("飛行翼啟動！向前飛越 0.5 公里", 1800);
    playTone(620, .18, "sine", .08);
    setTimeout(() => playTone(860, .25, "sine", .07), 130);
  } else {
    turboUntil = performance.now() + 1500;
    invulnerableUntil = performance.now() + 400;
    car.vx = Math.max(car.vx, 620);
    setNotice("渦輪啟動！1.5 秒高速衝撞", 1200);
    playTone(180, .18, "sawtooth", .07);
    setTimeout(() => playTone(330, .28, "sawtooth", .06), 130);
  }
}

function finishGame() {
  running = false;
  finished = true;
  ui.messageLabel.textContent = "RALLY COMPLETE";
  ui.messageTitle.textContent = "順利抵達鵝鑾鼻終點！";
  ui.messageText.textContent = `完成 20.00 公里屏東巡遊，共收集 ${coinCount} 枚金幣。`;
  document.getElementById("restartButton").textContent = "再跑一次";
  ui.messageOverlay.hidden = false;
  playTone(520, .18, "triangle", .08);
  setTimeout(() => playTone(660, .18, "triangle", .08), 160);
  setTimeout(() => playTone(820, .3, "triangle", .08), 320);
}

function update(dt) {
  const turboActive = performance.now() < turboUntil;
  const flightActive = performance.now() < flyingUntil;
  const acceleration = turboActive ? 900 : 540;
  if (keys.right) car.vx += acceleration * dt;
  if (keys.left) car.vx -= acceleration * .78 * dt;
  if (!keys.right && !keys.left) car.vx *= Math.pow(.94, dt * 60);
  car.vx = Math.max(-150, Math.min(turboActive ? 780 : 470, car.vx));

  const currentWorldX = cameraX + car.x;
  if (keys.jump && car.grounded) {
    car.vy = -590;
    car.grounded = false;
    playTone(220, .13, "square", .045);
  }

  car.vy += (flightActive ? 310 : 900) * dt;
  car.y += car.vy * dt;
  const nextWorldX = currentWorldX + car.vx * dt;
  const nextGround = terrainHeight(nextWorldX);

  if (car.y + car.height / 2 >= nextGround - 7 && car.vy >= 0) {
    const wasAirborne = !car.grounded;
    car.y = nextGround - car.height / 2 - 7;
    car.vy = 0;
    car.grounded = true;
    const slope = terrainHeight(nextWorldX + 8) - terrainHeight(nextWorldX - 8);
    car.angle += (Math.atan2(slope, 16) - car.angle) * Math.min(1, dt * 10);
    if (wasAirborne) playTone(95, .08, "triangle", .035);
  } else {
    car.grounded = false;
    car.angle += (car.vx > 0 ? .22 : -.22) * dt;
  }

  if (car.vx > 0 && car.x > canvas.width * .34) {
    const shift = car.vx * dt;
    cameraX += shift;
    car.x -= shift;
  } else {
    car.x += car.vx * dt;
  }

  cameraX = Math.max(0, cameraX);
  car.x = Math.max(52, car.x);
  distanceM = Math.max(checkpoint, cameraX + car.x - START_X);
  car.wheelSpin += car.vx * dt * .05;

  for (const coin of coins) {
    if (coin.collected) continue;
    const x = worldX(coin.distance) - cameraX;
    const y = terrainHeight(worldX(coin.distance)) + coin.offsetY;
    if (Math.abs(x - car.x) < 48 && Math.abs(y - car.y) < 55) {
      coin.collected = true;
      coinCount++;
      playTone(780 + (coinCount % 4) * 80, .11, "sine", .07);
    }
  }

  for (const powerup of powerups) {
    if (powerup.collected) continue;
    const x = worldX(powerup.distance) - cameraX;
    const y = terrainHeight(worldX(powerup.distance)) - 62;
    if (Math.abs(x - car.x) < 52 && Math.abs(y - car.y) < 68) {
      collectPowerup(powerup);
      break;
    }
  }

  for (const obstacle of obstacles) {
    const x = worldX(obstacle.distance) - cameraX;
    const y = terrainHeight(worldX(obstacle.distance));
    const width = obstacle.type === "log" ? 62 : 46;
    const height = obstacle.type === "rock" ? 38 : 45;
    if (Math.abs(x - car.x) < (car.width + width) * .38 &&
        car.y + car.height * .35 > y - height &&
        car.y - car.height * .35 < y + 4) {
      hitObstacle(obstacle);
      break;
    }
  }

  for (const value of checkpoints) {
    if (distanceM >= value && checkpoint < value) activateCheckpoint(value);
  }

  const nextLevel = Math.min(levels.length - 1, Math.floor(distanceM / LEVEL_LENGTH));
  if (nextLevel !== currentLevel) currentLevel = nextLevel;
  if (distanceM >= TOTAL_DISTANCE) finishGame();
  updateUI();
}

function drawMountainRange(parallax, baseline, color, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, baseline);
  for (let x = 0; x <= canvas.width + 100; x += 70) {
    const wx = x + cameraX * parallax;
    const peak = baseline - 70 - Math.sin(wx * .006) * 45 - Math.sin(wx * .015) * 20;
    ctx.lineTo(x + 35, peak);
    ctx.lineTo(x + 85, baseline + 10);
  }
  ctx.lineTo(canvas.width, 520);
  ctx.lineTo(0, 520);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawPalm(x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.strokeStyle = "#725638";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(0, 60);
  ctx.quadraticCurveTo(-8, 0, 5, -70);
  ctx.stroke();
  ctx.strokeStyle = "#356446";
  ctx.lineWidth = 12;
  ctx.lineCap = "round";
  for (let a = -2.7; a < .4; a += .52) {
    ctx.beginPath();
    ctx.moveTo(5, -70);
    ctx.quadraticCurveTo(Math.cos(a) * 38, -95 + Math.sin(a) * 20, Math.cos(a) * 72, -65 + Math.sin(a) * 50);
    ctx.stroke();
  }
  ctx.restore();
}

function drawScene(scene) {
  const localProgress = distanceM % LEVEL_LENGTH;
  const landmarkX = 800 - localProgress * .28;
  if (scene === "gate") {
    const x = 90 - cameraX * .25;
    ctx.fillStyle = "#f0e8ce";
    ctx.fillRect(x, 260, 165, 18);
    ctx.fillRect(x + 8, 278, 22, 105);
    ctx.fillRect(x + 135, 278, 22, 105);
    ctx.fillStyle = "#285441";
    ctx.font = "700 16px 'Noto Sans TC'";
    ctx.fillText("國立屏東科技大學", x + 15, 253);
    for (let i = 0; i < 9; i++) drawPalm(390 + i * 175 - cameraX * .65, 390 + (i % 2) * 20, .8);
  } else if (scene === "village") {
    for (let i = 0; i < 6; i++) {
      const x = i * 245 - ((cameraX * .4) % 1470);
      ctx.fillStyle = i % 2 ? "#e4d4b5" : "#eee3ca";
      ctx.fillRect(x, 330, 180, 80);
      ctx.fillStyle = "#9a5538";
      ctx.beginPath(); ctx.moveTo(x - 12, 335); ctx.lineTo(x + 90, 275); ctx.lineTo(x + 192, 335); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#5c724f"; ctx.fillRect(x + 70, 365, 38, 45);
    }
  } else if (scene === "harbor") {
    ctx.fillStyle = "rgba(66,139,153,.65)"; ctx.fillRect(0, 385, canvas.width, 100);
    for (let i = 0; i < 5; i++) {
      const x = i * 300 - ((cameraX * .35) % 1500);
      ctx.fillStyle = "#f1e8d4"; ctx.beginPath(); ctx.moveTo(x, 375); ctx.lineTo(x + 150, 375); ctx.lineTo(x + 120, 415); ctx.lineTo(x + 28, 415); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#584b3c"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x + 72, 375); ctx.lineTo(x + 72, 285); ctx.stroke();
      ctx.fillStyle = "#e46f3d"; ctx.beginPath(); ctx.moveTo(x + 76, 295); ctx.lineTo(x + 135, 350); ctx.lineTo(x + 76, 350); ctx.closePath(); ctx.fill();
    }
  } else if (scene === "bay") {
    ctx.fillStyle = "rgba(69,149,164,.65)"; ctx.fillRect(0, 380, canvas.width, 110);
    ctx.strokeStyle = "#e9e3ce"; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(-50, 365); ctx.quadraticCurveTo(canvas.width / 2, 255, canvas.width + 50, 365); ctx.stroke();
    ctx.strokeStyle = "#738077"; ctx.lineWidth = 4;
    for (let i = 0; i < 9; i++) { const x = i * 170; ctx.beginPath(); ctx.moveTo(x, 330); ctx.lineTo(x, 405); ctx.stroke(); }
  } else if (scene === "coast" || scene === "kenting") {
    ctx.fillStyle = "#58a8b9"; ctx.fillRect(0, 365, canvas.width, 120);
    ctx.fillStyle = "#f0d495"; ctx.fillRect(0, 430, canvas.width, 55);
    for (let i = 0; i < 7; i++) drawPalm(i * 210 - ((cameraX * .5) % 1470), 390, .72);
    if (scene === "kenting") {
      ctx.fillStyle = "#4f6c58"; ctx.beginPath(); ctx.moveTo(880, 370); ctx.lineTo(980, 260); ctx.lineTo(1100, 370); ctx.closePath(); ctx.fill();
    }
  } else if (scene === "temple") {
    const x = landmarkX;
    ctx.fillStyle = "#d9b44d"; ctx.fillRect(x, 315, 270, 100);
    ctx.fillStyle = "#b94532";
    ctx.beginPath(); ctx.moveTo(x - 20, 325); ctx.lineTo(x + 135, 245); ctx.lineTo(x + 290, 325); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#244f43"; ctx.fillRect(x + 105, 350, 60, 65);
    ctx.fillStyle = "#f1df9a"; ctx.font = "800 18px 'Noto Sans TC'"; ctx.fillText("福安宮", x + 103, 300);
  } else if (scene === "aquarium") {
    const x = landmarkX - 70;
    ctx.fillStyle = "#e3e2d5"; ctx.fillRect(x, 300, 330, 120);
    ctx.fillStyle = "#397e8d"; ctx.beginPath(); ctx.arc(x + 165, 370, 85, Math.PI, 0); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.ellipse(x + 155, 350, 35, 13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + 188, 350); ctx.lineTo(x + 215, 333); ctx.lineTo(x + 215, 367); ctx.closePath(); ctx.fill();
  } else if (scene === "oldtown") {
    const x = landmarkX;
    ctx.fillStyle = "#c49a64"; ctx.fillRect(x, 280, 280, 145);
    ctx.fillStyle = "#604d38"; ctx.beginPath(); ctx.arc(x + 140, 425, 58, Math.PI, 0); ctx.fill();
    for (let i = 0; i < 7; i++) { ctx.fillStyle = i % 2 ? "#b78653" : "#d0ab77"; ctx.fillRect(x + i * 40, 270, 32, 25); }
    ctx.fillStyle = "#f1dfb8"; ctx.font = "800 18px 'Noto Sans TC'"; ctx.fillText("恆春古城", x + 96, 330);
  } else if (scene === "lighthouse") {
    const x = landmarkX;
    ctx.fillStyle = "#f7f5e8"; ctx.beginPath(); ctx.moveTo(x + 70, 405); ctx.lineTo(x + 90, 220); ctx.lineTo(x + 140, 220); ctx.lineTo(x + 160, 405); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#2c594a"; ctx.fillRect(x + 75, 205, 80, 20); ctx.fillRect(x + 92, 180, 46, 26);
    ctx.fillStyle = "#f5d35c"; ctx.beginPath(); ctx.arc(x + 115, 193, 8, 0, Math.PI * 2); ctx.fill();
  }
}

function drawBackground(level) {
  const sky = ctx.createLinearGradient(0, 0, 0, 480);
  sky.addColorStop(0, level.sky);
  sky.addColorStop(1, level.haze);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(255,249,206,.62)";
  ctx.beginPath(); ctx.arc(1060, 110, 48, 0, Math.PI * 2); ctx.fill();
  drawMountainRange(.08, 305, "#66837a", .45);
  drawMountainRange(.16, 358, "#567364", .7);
  drawScene(level.scene);
}

function drawTerrain(level) {
  ctx.fillStyle = level.ground;
  ctx.beginPath();
  ctx.moveTo(0, canvas.height);
  for (let x = 0; x <= canvas.width + 10; x += 10) ctx.lineTo(x, terrainHeight(cameraX + x));
  ctx.lineTo(canvas.width, canvas.height);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = level.road;
  ctx.lineWidth = 54;
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (let x = -30; x <= canvas.width + 30; x += 12) {
    const y = terrainHeight(cameraX + x);
    if (x === -30) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,244,199,.5)";
  ctx.lineWidth = 2;
  ctx.setLineDash([18, 24]);
  ctx.beginPath();
  for (let x = -30; x <= canvas.width + 30; x += 12) {
    const y = terrainHeight(cameraX + x) - 1;
    if (x === -30) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawCoins(time) {
  for (const coin of coins) {
    if (coin.collected) continue;
    const x = worldX(coin.distance) - cameraX;
    if (x < -30 || x > canvas.width + 30) continue;
    const y = terrainHeight(worldX(coin.distance)) + coin.offsetY + Math.sin(time * .004 + coin.bob) * 5;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(.28 + Math.abs(Math.sin(time * .005 + coin.bob)) * .72, 1);
    ctx.fillStyle = "#f4bd3e"; ctx.strokeStyle = "#c47a17"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}

function drawCheckpoints() {
  for (const value of checkpoints) {
    const x = worldX(value) - cameraX;
    if (x < -60 || x > canvas.width + 60) continue;
    const y = terrainHeight(worldX(value));
    ctx.strokeStyle = checkpoint >= value ? "#dce94d" : "#f3efe0";
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x, y - 118); ctx.stroke();
    ctx.fillStyle = checkpoint >= value ? "#dce94d" : "#e97b39";
    ctx.beginPath(); ctx.moveTo(x + 3, y - 116); ctx.lineTo(x + 62, y - 95); ctx.lineTo(x + 3, y - 75); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#244f3d"; ctx.font = "800 12px 'Outfit'"; ctx.fillText("SAVE", x + 12, y - 92);
  }
}

function drawFinishLine() {
  const x = worldX(TOTAL_DISTANCE) - cameraX;
  if (x < -100 || x > canvas.width + 220) return;
  const y = terrainHeight(worldX(TOTAL_DISTANCE));
  ctx.save();
  ctx.strokeStyle = "#f6f1df";
  ctx.lineWidth = 10;
  ctx.beginPath(); ctx.moveTo(x - 80, y); ctx.lineTo(x - 80, y - 150); ctx.moveTo(x + 80, y); ctx.lineTo(x + 80, y - 150); ctx.stroke();
  ctx.fillStyle = "#244f3d"; ctx.fillRect(x - 85, y - 158, 170, 38);
  ctx.fillStyle = "#fff"; ctx.font = "900 21px 'Outfit'"; ctx.textAlign = "center"; ctx.fillText("FINISH", x, y - 132);
  const size = 16;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      ctx.fillStyle = (row + col) % 2 ? "#fff" : "#18221d";
      ctx.fillRect(x + 88 + col * size, y - 150 + row * size, size, size);
    }
  }
  ctx.strokeStyle = "#f6f1df"; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(x + 85, y - 158); ctx.lineTo(x + 85, y - 60); ctx.stroke();
  ctx.restore();
}

function drawObstacles() {
  for (const obstacle of obstacles) {
    const x = worldX(obstacle.distance) - cameraX;
    if (x < -80 || x > canvas.width + 80) continue;
    const y = terrainHeight(worldX(obstacle.distance));
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = obstacle.hit ? .28 : 1;
    if (obstacle.type === "barrier") {
      ctx.fillStyle = "#e96c37"; ctx.fillRect(-28, -42, 56, 28);
      ctx.fillStyle = "#f8e8c7"; ctx.fillRect(-20, -37, 14, 18); ctx.fillRect(8, -37, 14, 18);
      ctx.fillStyle = "#5a4c3b"; ctx.fillRect(-22, -14, 7, 17); ctx.fillRect(16, -14, 7, 17);
    } else if (obstacle.type === "rock") {
      ctx.fillStyle = "#6b746f";
      ctx.beginPath(); ctx.moveTo(-27, 0); ctx.lineTo(-22, -26); ctx.lineTo(-7, -40); ctx.lineTo(17, -34); ctx.lineTo(29, -12); ctx.lineTo(22, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#8d9690"; ctx.beginPath(); ctx.moveTo(-12, -26); ctx.lineTo(-5, -35); ctx.lineTo(8, -31); ctx.lineTo(1, -22); ctx.closePath(); ctx.fill();
    } else {
      ctx.strokeStyle = "#6c4930"; ctx.lineWidth = 18; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(-34, -8); ctx.lineTo(34, -8); ctx.stroke();
      ctx.strokeStyle = "#9c724a"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(-34, -8, 8, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
}

function drawPowerups(time) {
  for (const powerup of powerups) {
    if (powerup.collected) continue;
    const x = worldX(powerup.distance) - cameraX;
    if (x < -60 || x > canvas.width + 60) continue;
    const y = terrainHeight(worldX(powerup.distance)) - 62 + Math.sin(time * .004 + powerup.bob) * 7;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = powerup.type === "flight" ? "#3f9fce" : "#e4533f";
    ctx.shadowColor = powerup.type === "flight" ? "#8ee4ff" : "#ffb34f";
    ctx.shadowBlur = 20;
    ctx.beginPath(); ctx.arc(0, 0, 25, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff";
    if (powerup.type === "flight") {
      ctx.beginPath();
      ctx.moveTo(-5, -2); ctx.quadraticCurveTo(-28, -20, -24, 5); ctx.quadraticCurveTo(-18, 19, -3, 8);
      ctx.moveTo(5, -2); ctx.quadraticCurveTo(28, -20, 24, 5); ctx.quadraticCurveTo(18, 19, 3, 8);
      ctx.fill();
      ctx.fillRect(-3, -13, 6, 25);
    } else {
      ctx.beginPath();
      ctx.moveTo(5, -18); ctx.lineTo(-12, 2); ctx.lineTo(-2, 2); ctx.lineTo(-8, 19); ctx.lineTo(14, -5); ctx.lineTo(3, -5);
      ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

function drawCar(time) {
  ctx.save();
  ctx.globalAlpha = performance.now() < invulnerableUntil && Math.floor(time / 90) % 2 ? .35 : 1;
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.fillStyle = "rgba(18,31,25,.2)";
  ctx.beginPath(); ctx.ellipse(0, 30, 58, 10, 0, 0, Math.PI * 2); ctx.fill();
  [-32, 34].forEach((wx) => {
    ctx.save(); ctx.translate(wx, 22); ctx.rotate(car.wheelSpin);
    ctx.fillStyle = "#1d2822"; ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#869087"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  });
  ctx.fillStyle = "#e36d34";
  if (performance.now() < turboUntil) {
    ctx.fillStyle = "#ff9e32";
    ctx.beginPath(); ctx.moveTo(-46, 2); ctx.lineTo(-88 - Math.random() * 22, -7); ctx.lineTo(-82, 10); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = "#e36d34";
  ctx.beginPath();
  ctx.moveTo(-51, 14); ctx.lineTo(-43, -12); ctx.lineTo(-14, -21); ctx.lineTo(5, -40);
  ctx.lineTo(34, -37); ctx.lineTo(49, -14); ctx.lineTo(54, 13); ctx.lineTo(42, 22); ctx.lineTo(-42, 22); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#213f3c";
  ctx.beginPath(); ctx.moveTo(-8, -20); ctx.lineTo(7, -35); ctx.lineTo(27, -33); ctx.lineTo(37, -17); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#f5c548"; ctx.beginPath(); ctx.arc(49, -3, 5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawNotice(time) {
  if (!notice || time > noticeUntil) return;
  ctx.save();
  ctx.font = "800 19px 'Noto Sans TC'";
  const width = ctx.measureText(notice).width + 48;
  ctx.fillStyle = "rgba(25,61,47,.9)";
  ctx.beginPath();
  ctx.roundRect(canvas.width / 2 - width / 2, 55, width, 48, 12);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.fillText(notice, canvas.width / 2, 86);
  ctx.restore();
}

function draw(time = 0) {
  const level = levels[currentLevel];
  drawBackground(level);
  drawTerrain(level);
  drawCheckpoints();
  drawCoins(time);
  drawPowerups(time);
  drawObstacles();
  drawFinishLine();
  drawCar(time);
  drawNotice(time);
  ctx.fillStyle = "rgba(255,255,255,.78)";
  ctx.font = "700 13px 'Outfit'";
  ctx.fillText(`${Math.round(Math.abs(car.vx) * .22)} KM/H`, 28, 36);
  if (performance.now() < turboUntil) {
    ctx.fillStyle = "#fff2c1";
    ctx.fillText(`TURBO ${((turboUntil - performance.now()) / 1000).toFixed(1)}s`, 28, 58);
  }
}

function loop(time) {
  if (!running) return;
  const dt = Math.min((time - lastTime) / 1000, .032);
  lastTime = time;
  update(dt);
  draw(time);
  if (running) requestAnimationFrame(loop);
}

function setControl(control, pressed) {
  keys[control] = pressed;
  document.querySelector(`[data-control="${control}"]`)?.classList.toggle("active", pressed);
}

const keyMap = {
  ArrowLeft: "left", KeyA: "left",
  ArrowRight: "right", KeyD: "right",
  Space: "jump", ArrowUp: "jump", KeyW: "jump"
};

window.addEventListener("keydown", (event) => {
  const control = keyMap[event.code];
  if (!control) return;
  event.preventDefault();
  if (!running && !finished) resetGame();
  setControl(control, true);
});

window.addEventListener("keyup", (event) => {
  const control = keyMap[event.code];
  if (control) setControl(control, false);
});

document.querySelectorAll("[data-control]").forEach((button) => {
  const control = button.dataset.control;
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    if (!running && !finished) resetGame();
    button.setPointerCapture(event.pointerId);
    setControl(control, true);
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach((type) => {
    button.addEventListener(type, () => setControl(control, false));
  });
});

document.getElementById("startButton").addEventListener("click", resetGame);
document.getElementById("restartButton").addEventListener("click", resetGame);
ui.soundToggle.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  ui.soundToggle.classList.toggle("muted", !soundEnabled);
  document.querySelector(".sound-status").lastChild.textContent = soundEnabled ? " 遊戲音效" : " 音效已關閉";
  if (soundEnabled) playTone(520, .08);
});

draw(0);
