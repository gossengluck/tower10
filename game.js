// Tower Defense Game - 2 Spieler Modus
import { Camera } from './camera.js';
import { Minimap } from './minimap.js';
import { InputHandler } from './input.js';
import { drawShape as drawShapeUtil } from './utils.js';
import { createTowerButtons as createTowerButtonsFromUI, unlockTower as unlockTowerFromUI, getUnlockCost } from './ui.js';
import { Multiplayer } from './multiplayer.js';

document.addEventListener('DOMContentLoaded', async () => {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const canvasWrapper = document.getElementById('canvasWrapper');
  const pauseOverlay = document.getElementById('pauseOverlay');

  // ===== MULTIPLAYER =====
  const mp = new Multiplayer();

  // ===== WORLD CONFIGURATION =====
  const WORLD_SCALE = 3;

  let GRID_SIZE = 35;
  let WORLD_WIDTH, WORLD_HEIGHT;
  let GRID_WIDTH, GRID_HEIGHT;
  // Zwei separate Pfade - links und rechts
  let pathLeft = [];
  let pathRight = [];
  let path = []; // Aktiver Pfad des Spielers (wird je nach Seite gesetzt)
  let grid = [];

  // ===== CAMERA & MINIMAP & INPUT =====
  let camera = null;
  let minimap = null;
  let inputHandler = null;

  const gameState = {
    gold: 1200,
    lives: 20,
    wave: 0,
    maxWaves: Infinity,
    score: 0,
    selectedTower: null,
    selectedTowerObject: null,
    lastPlacedTowerType: null,
    copiedTower: null,
    unlockedTowers: ['Basis'],
    waveActive: false,
    waveStartLives: 20,
    waveSpawnCount: 0,
    enemies: [],
    towers: [],
    opponentTowers: [], // Gegner-Türme (nur Anzeige)
    projectiles: [],
    particles: [],
    towerImages: {},
    enemyImages: {},
    imagesLoaded: false,
    towerTypes: [],
    enemyPool: [],
    enemyConfigs: {},
    speed: 1,
    time: 0,
    pendingSpawns: [],
    paused: false,
    gameOver: false,
    // Multiplayer state
    attackQueue: [],  // [{type: enemyCfgName, count: 1}, ...]
    attackCost: 0,
    roundActive: false,  // Ob gerade eine Runde läuft
    myReady: false,
    opponentReady: false,
    playerSide: 'left', // 'left' oder 'right'
    halfWidth: 0, // Halbe Grid-Breite
  };

  // ===== UNIT SHOP CONFIG =====
  // Einheiten die man kaufen und dem Gegner schicken kann
  const UNIT_SHOP = [
    { name: 'Schwach',   shape: 'triangle', hue: 0,   baseHealth: 30,  baseSpeed: 1.2, cost: 15,  reward: 0 },
    { name: 'Normal',    shape: 'circle',   hue: 120, baseHealth: 50,  baseSpeed: 0.9, cost: 30,  reward: 0 },
    { name: 'Stark',     shape: 'square',   hue: 240, baseHealth: 100, baseSpeed: 0.5, cost: 60,  reward: 0 },
    { name: 'Schnell',   shape: 'diamond',  hue: 60,  baseHealth: 35,  baseSpeed: 1.5, cost: 40,  reward: 0 },
    { name: 'Tank',      shape: 'hexagon',  hue: 180, baseHealth: 200, baseSpeed: 0.35,cost: 100, reward: 0 },
    { name: 'Schwarm',   shape: 'triangle', hue: 300, baseHealth: 15,  baseSpeed: 1.4, cost: 8,   reward: 0, countMult: 3 },
    { name: 'Regen',     shape: 'pentagon',  hue: 90,  baseHealth: 80,  baseSpeed: 0.6, cost: 75,  reward: 0, regenPerSec: 5 },
    { name: 'Riese',     shape: 'octagon',  hue: 0,   baseHealth: 400, baseSpeed: 0.25,cost: 200, reward: 0 },
    { name: 'Boss',      shape: 'star',     hue: 45,  baseHealth: 800, baseSpeed: 0.3, cost: 400, reward: 0 },
  ];

  // --- Tower-Configs ---
   const towerConfigs = {
    "Basis": {cost: 100, damage: 15, range: 110, fireRate: 900, projectileColor: "#ffffff", type: "single"},
  "Sniper": {cost: 350, damage: 70, range: 220, fireRate: 1800, projectileColor: "#ffff00", type: "single"},
  "MG": {cost: 250, damage: 8, range: 90, fireRate: 180, projectileColor: "#ff8c00", type: "single"},
  "Laser": {cost: 500, damage: 5, range: 130, fireRate: 45, projectileColor: "#00ffff", type: "laser"},
  "Rakete": {cost: 700, damage: 60, range: 160, fireRate: 2300, projectileColor: "#ff4444", type: "splash", splashRadius: 55},
  "Feuer": {cost: 400, damage: 3, range: 70, fireRate: 90, projectileColor: "#ff6600", type: "cone", coneAngle: 45},
  "Eis": {cost: 350, damage: 8, range: 110, fireRate: 1400, projectileColor: "#add8e6", type: "slow", slowAmount: 0.5, slowDuration: 2000},
  "Gift": {cost: 450, damage: 12, range: 100, fireRate: 1100, projectileColor: "#ba55d3", type: "poison", poisonDamage: 3, poisonDuration: 5000},
  "Blitz": {cost: 650, damage: 35, range: 140, fireRate: 1600, projectileColor: "#fff700", type: "chain", chainCount: 3},
  "Erde": {cost: 550, damage: 40, range: 95, fireRate: 1500, projectileColor: "#a0826d", type: "stun", stunDuration: 800},
  "Mörser": {cost: 600, damage: 50, range: 190, fireRate: 2000, projectileColor: "#8b6914", type: "splash", splashRadius: 65},
  "Kanone": {cost: 750, damage: 60, range: 150, fireRate: 1800, projectileColor: "#556b2f", type: "single"},
  "Artillerie": {cost: 900, damage: 75, range: 210, fireRate: 2600, projectileColor: "#8b7355", type: "splash", splashRadius: 75},
  "Balista": {cost: 500, damage: 55, range: 170, fireRate: 1700, projectileColor: "#a0522d", type: "single"},
  "Trebuchet": {cost: 1000, damage: 80, range: 230, fireRate: 2800, projectileColor: "#8b4513", type: "splash", splashRadius: 85},
  "Tesla": {cost: 850, damage: 45, range: 130, fireRate: 900, projectileColor: "#4169e1", type: "chain", chainCount: 4},
  "Plasma": {cost: 1100, damage: 55, range: 140, fireRate: 700, projectileColor: "#ff00ff", type: "laser"},
  "Ion": {cost: 1250, damage: 70, range: 150, fireRate: 1300, projectileColor: "#7b68ee", type: "chain", chainCount: 5},
  "Photon": {cost: 1300, damage: 50, range: 160, fireRate: 550, projectileColor: "#ffd700", type: "laser"},
  "Quanten": {cost: 1500, damage: 65, range: 170, fireRate: 1100, projectileColor: "#00ced1", type: "single"},
  "Tornado": {cost: 700, damage: 30, range: 120, fireRate: 900, projectileColor: "#20b2aa", type: "slow", slowAmount: 0.6, slowDuration: 2500},
  "Klebstoff": {cost: 400, damage: 8, range: 100, fireRate: 1800, projectileColor: "#daa520", type: "slow", slowAmount: 0.7, slowDuration: 3000},
  "Schock": {cost: 1100, damage: 75, range: 135, fireRate: 1500, projectileColor: "#ff1493", type: "stun", stunDuration: 1000},
  "Vampir": {cost: 900, damage: 50, range: 110, fireRate: 1200, projectileColor: "#8b0000", type: "lifesteal", lifeStealAmount: 0.3},
  "Multishot": {cost: 650, damage: 22, range: 130, fireRate: 700, projectileColor: "#ff8c00", type: "multishot", projectileCount: 3},
  "Nuklear": {cost: 2500, damage: 140, range: 190, fireRate: 4500, projectileColor: "#32cd32", type: "splash", splashRadius: 130},
  "Schwarzloch": {cost: 3000, damage: 110, range: 160, fireRate: 3500, projectileColor: "#191970", type: "pull", splashRadius: 110, pullStrength: 0.5},
  "Supernova": {cost: 2800, damage: 125, range: 180, fireRate: 4000, projectileColor: "#ff6347", type: "splash", splashRadius: 120},
  "Meteor": {cost: 1600, damage: 95, range: 170, fireRate: 2700, projectileColor: "#cd5c5c", type: "splash", splashRadius: 90},
  "Komet": {cost: 1400, damage: 85, range: 160, fireRate: 2200, projectileColor: "#4682b4", type: "single"},
  "Heilung": {cost: 800, damage: 0, range: 130, fireRate: 1800, projectileColor: "#98fb98", type: "heal", healAmount: 15},
  "Verstärker": {cost: 750, damage: 0, range: 140, fireRate: 0, projectileColor: "#ffa07a", type: "buff", buffAmount: 1.5, buffType: "damage"},
  "Verlangsamung": {cost: 600, damage: 15, range: 120, fireRate: 1300, projectileColor: "#b0c4de", type: "slow", slowAmount: 0.5, slowDuration: 2000},
  "Scan": {cost: 500, damage: 0, range: 220, fireRate: 0, projectileColor: "#dda0dd", type: "detector", detectionBonus: 1.3},
  "Schild": {cost: 950, damage: 0, range: 110, fireRate: 0, projectileColor: "#4169e1", type: "shield", shieldAmount: 50, shieldDuration: 5000},
  "Drache": {cost: 2000, damage: 105, range: 150, fireRate: 1800, projectileColor: "#dc143c", type: "cone", coneAngle: 50},
  "Kristall": {cost: 1400, damage: 75, range: 140, fireRate: 1400, projectileColor: "#ba55d3", type: "laser"},
  "Schatten": {cost: 1700, damage: 90, range: 130, fireRate: 1200, projectileColor: "#2f4f4f", type: "pierce", pierceCount: 3},
  "Licht": {cost: 1600, damage: 85, range: 170, fireRate: 1100, projectileColor: "#fffacd", type: "laser"},
  "Omega": {cost: 4000, damage: 165, range: 210, fireRate: 2700, projectileColor: "#ff00ff", type: "splash", splashRadius: 160},
    "Titan": { cost: 4200, damage: 175, range: 215, fireRate: 2300, projectileColor: "#b8860b", type: "single" },
  "Golem": { cost: 4300, damage: 160, range: 185, fireRate: 2500, projectileColor: "#696969", type: "stun", stunDuration: 1300 },
  "Phoenix": { cost: 4400, damage: 55, range: 170, fireRate: 650, projectileColor: "#ff4500", type: "cone", coneAngle: 50, burnDamage: 10, burnDuration: 3500 },
  "Kraken": { cost: 4500, damage: 135, range: 210, fireRate: 2400, projectileColor: "#006994", type: "splash", splashRadius: 140 },
  "Hydra": { cost: 4600, damage: 70, range: 180, fireRate: 850, projectileColor: "#228b22", type: "multishot", projectileCount: 4 },
  "Greif": { cost: 4700, damage: 105, range: 240, fireRate: 900, projectileColor: "#daa520", type: "single" },
  "Basilisk": { cost: 4800, damage: 65, range: 175, fireRate: 1200, projectileColor: "#9acd32", type: "poison", poisonDamage: 6, poisonDuration: 5000 },
  "Chimara": { cost: 4900, damage: 95, range: 190, fireRate: 1100, projectileColor: "#8b008b", type: "chain", chainCount: 5 },
  "Wächter": { cost: 5000, damage: 0, range: 160, fireRate: 0, projectileColor: "#4682b4", type: "shield", shieldAmount: 90, shieldDuration: 6000 },
  "Sentinel": { cost: 5100, damage: 85, range: 200, fireRate: 1300, projectileColor: "#708090", type: "detector", detectionBonus: 1.5 },
  "Zermalmer": { cost: 5200, damage: 150, range: 160, fireRate: 2000, projectileColor: "#a52a2a", type: "single" },
  "Sturmbrecher": { cost: 5300, damage: 120, range: 190, fireRate: 1000, projectileColor: "#1e90ff", type: "chain", chainCount: 4 },
  "Lichtbringer": { cost: 5400, damage: 90, range: 210, fireRate: 900, projectileColor: "#fffacd", type: "laser" },
  "Schattenjäger": { cost: 5500, damage: 115, range: 185, fireRate: 950, projectileColor: "#36454f", type: "pierce", pierceCount: 4 },
  "Zeitverzehrer": { cost: 5600, damage: 40, range: 180, fireRate: 1000, projectileColor: "#800080", type: "slow", slowAmount: 0.65, slowDuration: 3500 },
  "Dimensionsriss": { cost: 5700, damage: 130, range: 200, fireRate: 1800, projectileColor: "#4b0082", type: "pull", splashRadius: 130, pullStrength: 0.6 },
  "Graviton": { cost: 5800, damage: 140, range: 205, fireRate: 1600, projectileColor: "#663399", type: "splash", splashRadius: 140 },
  "Antimaterie": { cost: 5900, damage: 150, range: 215, fireRate: 2100, projectileColor: "#00ffff", type: "splash", splashRadius: 150 },
  "Singularität": { cost: 6000, damage: 0, range: 220, fireRate: 0, projectileColor: "#000000", type: "pull", splashRadius: 140, pullStrength: 0.85 },
  "Apokalypse": { cost: 6500, damage: 210, range: 230, fireRate: 3500, projectileColor: "#8b0000", type: "splash", splashRadius: 180 }
  };

  // ------------------ HILFSFUNKTIONEN ----------------
  function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
  function effectScaleForCost(cost){
    return clamp(0.5 + Math.log10(Math.max(10, cost)) * 1.1, 0.65, 2.4);
  }

  // Seeded random
  function makeSeededRandom(seed) {
    let s = seed;
    return function() {
      s = (s * 1664525 + 1013904223) & 0xFFFFFFFF;
      return (s >>> 0) / 0xFFFFFFFF;
    };
  }

  // -------------------------- MANIFEST LADEN ----------------------------
  async function loadManifest() {
    try {
      const res = await fetch('manifest.json');
      const manifest = await res.json();

      gameState.towerTypes = manifest.towers.map(t => ({
        name: t.name, file: t.file, shape: t.shape, color: t.color,
        ...(towerConfigs[t.name] || {cost:100,damage:20,range:120,fireRate:1000,projectileColor:"#fff",type:"single"})
      }));

      await Promise.allSettled(manifest.towers.map(t => new Promise((res) => {
        const img = new Image(); img.src = t.file;
        img.onload = () => { gameState.towerImages[t.name] = img; res(); };
        img.onerror = () => res();
        setTimeout(res, 800);
      })));

      gameState.enemyPool = [];
      gameState.enemyConfigs = {};
      if (Array.isArray(manifest.enemies)) {
        await Promise.allSettled(manifest.enemies.map(e => new Promise((res)=>{
          const key = `${e.shape}_${e.hue}`;
          const img = new Image(); img.src = e.file;
          img.onload = () => { gameState.enemyImages[key] = img; res(); };
          img.onerror = () => res();
          setTimeout(res, 800);
        })));

        manifest.enemies.forEach((e, idx) => {
          const name = e.name || `${e.shape}_${e.hue}`;
          const cfg = {
            name, shape: e.shape, hue: e.hue ?? 0,
            baseHealth: e.baseHealth ?? (e.shape==='octagon' ? 400 : e.shape==='square' ? 90 : e.shape==='pentagon' ? 65 : e.shape==='hexagon' ? 50 : e.shape==='star' ? 60 : e.shape==='triangle' ? 25 : 18),
            baseSpeed:  e.baseSpeed  ?? (e.shape==='triangle' ? 1.2 : e.shape==='circle' ? 0.95 : e.shape==='square' ? 0.45 : 0.65),
            reward:     e.reward     ?? (e.shape==='octagon' ? 360 : e.shape==='square' ? 12 : e.shape==='pentagon' ? 10 : e.shape==='hexagon' ? 9 : e.shape==='star' ? 11 : e.shape==='triangle' ? 5 : 2),
            regenPerSec: e.regenPerSec || 0,
            immune: e.immune || {},
            resist: e.resist || {},
            countMult: e.countMult || 1
          };
          gameState.enemyConfigs[name] = cfg;
          gameState.enemyPool.push(cfg);
        });
      }

      gameState.imagesLoaded = true;
    } catch (e) {
      console.error('manifest.json konnte nicht geladen werden', e);
    }
  }

  // ===================== PFAD-GENERIERUNG (GETEILTE KARTE) =====================

  function buildRandomPathSeeded(cols, rows, startX, endX, rng, opts={}) {
    // Generiert einen Pfad von startX nach endX
    const startY = Math.floor(rows/2);
    const marginX = 1, marginY = 2;
    const maxStraight = opts.maxStraight || 6;

    // Richtungs-Bias basierend auf Start/End
    const goingRight = endX > startX;
    const biasForward = 0.6;
    const biasBack = 0.10;

    const visited = new Set();
    const enc = (x,y) => `${x},${y}`;
    const inBounds = (x,y) => {
      const minX = Math.min(startX, endX);
      const maxX = Math.max(startX, endX);
      return x >= Math.max(marginX, minX) && x <= Math.min(cols-1-marginX, maxX) && y >= marginY && y <= rows-1-marginY;
    };

    let x = startX, y = Math.min(Math.max(startY, marginY), rows-1-marginY);
    const pathResult = [{x,y}];
    visited.add(enc(x,y));

    let dir = {dx: goingRight ? 1 : -1, dy: 0};
    let straightLen = 0;

    function neighbors(cx,cy){
      const forwardDx = goingRight ? 1 : -1;
      const backDx = goingRight ? -1 : 1;

      const moves = [
        {dx: forwardDx, dy: 0, w: biasForward},
        {dx: backDx, dy: 0, w: biasBack},
        {dx: 0, dy:-1, w: 0.25},
        {dx: 0, dy: 1, w: 0.25}
      ];
      const filtered = moves.filter(m=>{
        const nx = cx + m.dx, ny = cy + m.dy;
        if(!inBounds(nx,ny)) return false;
        if(visited.has(enc(nx,ny))) return false;
        if(dir.dx===m.dx && dir.dy===m.dy && straightLen >= maxStraight) return false;
        return true;
      });
      const sum = filtered.reduce((a,m)=>a+(m.w||1),0);
      let r = rng()*sum, pick=null;
      for(const m of filtered){ r -= (m.w||1); if(r<=0){ pick=m; break; } }
      return pick;
    }

    let attempts = 0;
    const targetReached = () => goingRight ? x >= endX : x <= endX;

    while(!targetReached() && attempts < cols*rows*4){
      attempts++;
      const move = neighbors(x,y);
      if(!move){
        if(pathResult.length>1){
          const last = pathResult.pop(); visited.delete(enc(last.x,last.y));
          const prev = pathResult[pathResult.length-1];
          x = prev.x; y = prev.y; straightLen = 0; dir = {dx: goingRight ? 1 : -1, dy:0};
          continue;
        } else break;
      }
      x += move.dx; y += move.dy;
      pathResult.push({x,y}); visited.add(enc(x,y));
      if(move.dx===dir.dx && move.dy===dir.dy) straightLen++;
      else { dir = {dx:move.dx,dy:move.dy}; straightLen = 1; }
    }

    // Auffüllen bis zum Rand
    while(!targetReached()){
      x += goingRight ? 1 : -1;
      if(!inBounds(x,y) || visited.has(enc(x,y))) break;
      pathResult.push({x,y}); visited.add(enc(x,y));
    }
    return pathResult;
  }

  function initializeGrid(){
    grid = Array(GRID_HEIGHT).fill().map(()=>Array(GRID_WIDTH).fill(0));

    // Linken Pfad eintragen
    markPathOnGrid(pathLeft);
    // Rechten Pfad eintragen
    markPathOnGrid(pathRight);
  }

  function markPathOnGrid(p) {
    for(let i=0;i<p.length-1;i++){
      const s=p[i], e=p[i+1];
      const dx=Math.sign(e.x-s.x), dy=Math.sign(e.y-s.y);
      let x=s.x,y=s.y;
      while(x!==e.x||y!==e.y){
        if(y>=0&&y<GRID_HEIGHT&&x>=0&&x<GRID_WIDTH) grid[y][x]=1;
        if(x!==e.x) x+=dx; if(y!==e.y) y+=dy;
      }
    }
    const last=p[p.length-1];
    if(last && last.y>=0&&last.y<GRID_HEIGHT&&last.x>=0&&last.x<GRID_WIDTH) grid[last.y][last.x]=1;
  }

  function regenerateMap(seed){
    const rng = makeSeededRandom(seed || Math.floor(Math.random() * 999999));
    const halfGrid = Math.floor(GRID_WIDTH / 2);
    gameState.halfWidth = halfGrid;

    // Linker Pfad: von ganz links (1) zur Mitte (halfGrid - 1)
    pathLeft = buildRandomPathSeeded(GRID_WIDTH, GRID_HEIGHT, 1, halfGrid - 1, rng, {maxStraight: 5 + Math.floor(rng()*3)});

    // Rechter Pfad: von ganz rechts (GRID_WIDTH-2) zur Mitte (halfGrid + 1)
    // Wir bauen von rechts nach Mitte
    const rng2 = makeSeededRandom(seed ? seed + 12345 : Math.floor(Math.random() * 999999));
    pathRight = buildRandomPathSeeded(GRID_WIDTH, GRID_HEIGHT, GRID_WIDTH - 2, halfGrid + 1, rng2, {maxStraight: 5 + Math.floor(rng2()*3)});

    // Setze den aktiven Pfad basierend auf Spielerseite
    path = gameState.playerSide === 'left' ? pathLeft : pathRight;

    initializeGrid();

    // Reset Entities
    gameState.towers = [];
    gameState.opponentTowers = [];
    gameState.selectedTower = null;
    gameState.selectedTowerObject = null;
    gameState.enemies = [];
    gameState.projectiles = [];
    gameState.particles = [];
    gameState.pendingSpawns = [];
    gameState.waveActive = false;
    gameState.attackQueue = [];
    gameState.attackCost = 0;
    updateUI();
  }

  function drawShape(context, shape, x, y, size){
    context.beginPath();
    switch(shape){
      case 'circle': context.arc(x,y,size,0,Math.PI*2); break;
      case 'square': context.rect(x-size,y-size,size*2,size*2); break;
      case 'triangle':
        context.moveTo(x, y-size); context.lineTo(x+size,y+size); context.lineTo(x-size,y+size); break;
      case 'diamond':
        context.moveTo(x,y-size); context.lineTo(x+size,y); context.lineTo(x,y+size); context.lineTo(x-size,y); break;
      case 'pentagon':
        for(let i=0;i<5;i++){const a=(i*2*Math.PI/5)-Math.PI/2; const px=x+Math.cos(a)*size; const py=y+Math.sin(a)*size; if(i===0)context.moveTo(px,py); else context.lineTo(px,py);} break;
      case 'hexagon':
        for(let i=0;i<6;i++){const a=i*2*Math.PI/6; const px=x+Math.cos(a)*size; const py=y+Math.sin(a)*size; if(i===0)context.moveTo(px,py); else context.lineTo(px,py);} break;
      case 'star':
        for(let i=0;i<10;i++){const a=(i*Math.PI/5)-Math.PI/2; const r=(i%2===0)?size:size/2; const px=x+Math.cos(a)*r; const py=y+Math.sin(a)*r; if(i===0)context.moveTo(px,py); else context.lineTo(px,py);} break;
      case 'octagon':
        for(let i=0;i<8;i++){const a=i*2*Math.PI/8; const px=x+Math.cos(a)*size; const py=y+Math.sin(a)*size; if(i===0)context.moveTo(px,py); else context.lineTo(px,py);} break;
    }
    context.closePath();
  }

  // ===================== PROJECTILE (unverändert) =====================
  class Projectile{
    constructor(tower, target, baseDamage, color, type, splashRadius=0, meta={}){
      this.tower = tower;
      this.towerName = tower.type.name;
      this.x=tower.x; this.y=tower.y; this.target=target; this.damage=baseDamage;
      this.color=color; this.type=type;
      this.splashRadius=splashRadius;
      this.meta=meta;
      this.rotation = 0;
      this.age = 0;
      const s = effectScaleForCost(tower.type.cost);
      this.scale = s;
      this.setupVisuals();
      this.trail = [];
      this.maxTrail = this.trailLength;
      this.particles = [];
    }

    setupVisuals(){
      const config = this.getProjectileConfig(this.towerName);
      this.speed = Math.max(0.1, config.speed * (1 + this.scale * 0.1));
      this.size = Math.max(0.1, config.size * this.scale);
      this.shape = config.shape;
      this.glowIntensity = Math.max(0, config.glow);
      this.trailLength = Math.max(0, Math.round(config.trailLength * this.scale));
      this.particleFreq = Math.max(0, config.particleFreq);
      this.rotationSpeed = config.rotationSpeed;
    }

    getProjectileConfig(name){
      const configs = {
        'Basis': {speed: 9, size: 6, shape: 'circle', glow: 10, trailLength: 6, particleFreq: 0, rotationSpeed: 0},
        'Sniper': {speed: 18, size: 4, shape: 'arrow', glow: 15, trailLength: 12, particleFreq: 0, rotationSpeed: 0},
        'MG': {speed: 14, size: 4, shape: 'bullet', glow: 8, trailLength: 4, particleFreq: 0.1, rotationSpeed: 0},
        'Laser': {speed: 0, size: 0, shape: 'none', glow: 0, trailLength: 0, particleFreq: 0, rotationSpeed: 0},
        'Rakete': {speed: 8, size: 10, shape: 'rocket', glow: 20, trailLength: 15, particleFreq: 0.4, rotationSpeed: 0},
        'Feuer': {speed: 0, size: 0, shape: 'none', glow: 0, trailLength: 0, particleFreq: 0, rotationSpeed: 0},
        'Eis': {speed: 7, size: 8, shape: 'ice', glow: 18, trailLength: 10, particleFreq: 0.3, rotationSpeed: 0.1},
        'Gift': {speed: 6, size: 7, shape: 'poison', glow: 16, trailLength: 12, particleFreq: 0.5, rotationSpeed: 0.05},
        'Blitz': {speed: 20, size: 6, shape: 'lightning', glow: 25, trailLength: 8, particleFreq: 0.6, rotationSpeed: 0},
        'Erde': {speed: 7, size: 9, shape: 'rock', glow: 12, trailLength: 8, particleFreq: 0.2, rotationSpeed: 0.15},
        'Mörser': {speed: 6, size: 12, shape: 'mortar', glow: 15, trailLength: 10, particleFreq: 0.3, rotationSpeed: 0.2},
        'Kanone': {speed: 12, size: 10, shape: 'cannonball', glow: 14, trailLength: 8, particleFreq: 0.1, rotationSpeed: 0.3},
        'Artillerie': {speed: 8, size: 13, shape: 'shell', glow: 16, trailLength: 12, particleFreq: 0.3, rotationSpeed: 0.15},
        'Balista': {speed: 16, size: 12, shape: 'bolt', glow: 12, trailLength: 14, particleFreq: 0, rotationSpeed: 0},
        'Trebuchet': {speed: 7, size: 14, shape: 'boulder', glow: 10, trailLength: 10, particleFreq: 0.2, rotationSpeed: 0.25},
        'Tesla': {speed: 22, size: 7, shape: 'electric', glow: 30, trailLength: 6, particleFreq: 0.8, rotationSpeed: 0},
        'Plasma': {speed: 0, size: 0, shape: 'none', glow: 0, trailLength: 0, particleFreq: 0, rotationSpeed: 0},
        'Ion': {speed: 20, size: 8, shape: 'ion', glow: 28, trailLength: 10, particleFreq: 0.7, rotationSpeed: 0.3},
        'Photon': {speed: 0, size: 0, shape: 'none', glow: 0, trailLength: 0, particleFreq: 0, rotationSpeed: 0},
        'Quanten': {speed: 16, size: 9, shape: 'quantum', glow: 35, trailLength: 14, particleFreq: 0.9, rotationSpeed: 0.4},
        'Tornado': {speed: 8, size: 10, shape: 'tornado', glow: 20, trailLength: 15, particleFreq: 0.6, rotationSpeed: 0.5},
        'Klebstoff': {speed: 5, size: 8, shape: 'glue', glow: 14, trailLength: 12, particleFreq: 0.4, rotationSpeed: 0.1},
        'Schock': {speed: 18, size: 9, shape: 'shock', glow: 25, trailLength: 10, particleFreq: 0.7, rotationSpeed: 0},
        'Vampir': {speed: 11, size: 8, shape: 'vampire', glow: 22, trailLength: 12, particleFreq: 0.5, rotationSpeed: 0.2},
        'Multishot': {speed: 13, size: 5, shape: 'arrow', glow: 12, trailLength: 8, particleFreq: 0.2, rotationSpeed: 0},
        'Nuklear': {speed: 5, size: 16, shape: 'nuke', glow: 40, trailLength: 18, particleFreq: 0.9, rotationSpeed: 0.1},
        'Schwarzloch': {speed: 6, size: 15, shape: 'blackhole', glow: 50, trailLength: 20, particleFreq: 1.0, rotationSpeed: 0.6},
        'Supernova': {speed: 7, size: 14, shape: 'star', glow: 45, trailLength: 16, particleFreq: 0.9, rotationSpeed: 0.4},
        'Meteor': {speed: 9, size: 12, shape: 'meteor', glow: 30, trailLength: 14, particleFreq: 0.7, rotationSpeed: 0.3},
        'Komet': {speed: 14, size: 10, shape: 'comet', glow: 28, trailLength: 18, particleFreq: 0.8, rotationSpeed: 0.2},
        'Heilung': {speed: 10, size: 8, shape: 'heal', glow: 24, trailLength: 12, particleFreq: 0.5, rotationSpeed: 0.15},
        'Verstärker': {speed: 0, size: 0, shape: 'none', glow: 0, trailLength: 0, particleFreq: 0, rotationSpeed: 0},
        'Verlangsamung': {speed: 6, size: 8, shape: 'slow', glow: 18, trailLength: 10, particleFreq: 0.4, rotationSpeed: 0.1},
        'Scan': {speed: 0, size: 0, shape: 'none', glow: 0, trailLength: 0, particleFreq: 0, rotationSpeed: 0},
        'Schild': {speed: 0, size: 0, shape: 'none', glow: 0, trailLength: 0, particleFreq: 0, rotationSpeed: 0},
        'Drache': {speed: 0, size: 0, shape: 'none', glow: 0, trailLength: 0, particleFreq: 0, rotationSpeed: 0},
        'Kristall': {speed: 0, size: 0, shape: 'none', glow: 0, trailLength: 0, particleFreq: 0, rotationSpeed: 0},
        'Schatten': {speed: 15, size: 9, shape: 'shadow', glow: 20, trailLength: 16, particleFreq: 0.6, rotationSpeed: 0.2},
        'Licht': {speed: 0, size: 0, shape: 'none', glow: 0, trailLength: 0, particleFreq: 0, rotationSpeed: 0},
        'Omega': {speed: 8, size: 18, shape: 'omega', glow: 55, trailLength: 22, particleFreq: 1.2, rotationSpeed: 0.3}
      };
      return configs[name] || configs['Basis'];
    }

    update(dt){
      if(!this.target || this.target.health<=0) return true;
      this.age += dt;
      const step = this.speed * (dt/16.67);
      const dx=this.target.x-this.x, dy=this.target.y-this.y;
      const dist=Math.hypot(dx,dy);
      if(dist < step){ this.hit(this.target); return true; }
      this.trail.push({x:this.x,y:this.y,age:this.age});
      if(this.trail.length>this.maxTrail) this.trail.shift();
      this.x += (dx/dist)*step; this.y += (dy/dist)*step;
      this.rotation += this.rotationSpeed;
      if(this.particleFreq > 0 && Math.random() < this.particleFreq * (dt/16.67)){
        this.spawnParticle();
      }
      return false;
    }

    spawnParticle(){
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 2 + 1;
      gameState.particles.push({
        type: 'trail_particle', x: this.x, y: this.y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        size: Math.max(0.1, Math.random() * 3 + 2), color: this.color,
        life: Math.random() * 15 + 10, maxLife: 25
      });
    }

    hit(target){
      target.applyDamage(this.damage, {type:this.type});
      if(this.type==='slow'){ target.applySlow(this.meta.slowAmount||0.5, this.meta.slowDuration||1500); }
      else if(this.type==='poison'){ target.applyPoison(this.meta.poisonDamage||2, this.meta.poisonDuration||4000); }
      else if(this.type==='stun'){ target.applyStun(this.meta.stunDuration||600); }
      else if(this.type==='chain'){ target.chainHit(this.damage*0.7, this.meta.chainCount||2); }
      else if(this.type==='splash' && this.splashRadius>0){ target.splashHit(this.damage*0.5, this.splashRadius); }

      const impactSize = this.splashRadius ? this.splashRadius*0.6 : this.size * 3;
      gameState.particles.push({
        type:'impact', x:this.x, y:this.y, r:Math.max(0.1, this.size*0.5),
        max: Math.max(0.1, impactSize), life:Math.round(15*this.scale), color:this.color
      });
      for(let i=0; i<Math.round(8*this.scale); i++){
        const angle = (Math.PI*2/8)*i + Math.random()*0.3;
        const speed = Math.random()*4 + 3;
        gameState.particles.push({
          type: 'explosion_particle', x: this.x, y: this.y,
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          size: Math.max(0.1, Math.random() * 4 + 2), color: this.color,
          life: Math.random() * 20 + 15, maxLife: 35
        });
      }
    }

    draw(){
      if(this.trail.length>1){
        ctx.save();
        for(let i=0; i<this.trail.length-1; i++){
          const alpha = (i / this.trail.length) * 0.6;
          const width = (i / this.trail.length) * this.size * 0.8;
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = this.color;
          ctx.lineWidth = Math.max(1, width);
          ctx.beginPath();
          ctx.moveTo(this.trail[i].x, this.trail[i].y);
          ctx.lineTo(this.trail[i+1].x, this.trail[i+1].y);
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.save();
      ctx.translate(this.x, this.y);
      if(this.glowIntensity > 0){ ctx.shadowBlur = this.glowIntensity * this.scale; ctx.shadowColor = this.color; }
      if(this.rotationSpeed !== 0){ ctx.rotate(this.rotation); }
      else if(this.target && this.target.health > 0){
        const dx = this.target.x - this.x;
        const dy = this.target.y - this.y;
        ctx.rotate(Math.atan2(dy, dx));
      }
      this.drawShape();
      ctx.restore();
    }

    drawShape(){
      const s = Math.max(0.1, this.size);
      ctx.fillStyle = this.color;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = Math.max(1, s * 0.15);

      switch(this.shape){
        case 'circle': ctx.beginPath(); ctx.arc(0,0,s,0,Math.PI*2); ctx.fill(); ctx.stroke(); break;
        case 'arrow': case 'bolt':
          ctx.beginPath(); ctx.moveTo(s*1.2,0); ctx.lineTo(-s*0.5,-s*0.4); ctx.lineTo(-s*0.3,0); ctx.lineTo(-s*0.5,s*0.4); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
        case 'bullet': ctx.beginPath(); ctx.ellipse(0,0,s*1.3,s*0.6,0,0,Math.PI*2); ctx.fill(); ctx.stroke(); break;
        case 'rocket':
          ctx.fillStyle=this.color; ctx.beginPath(); ctx.moveTo(s*1.2,0); ctx.lineTo(-s*0.6,-s*0.5); ctx.lineTo(-s*0.8,0); ctx.lineTo(-s*0.6,s*0.5); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle='#ff6600'; ctx.beginPath(); ctx.moveTo(-s*0.8,0); ctx.lineTo(-s*1.5,-s*0.3); ctx.lineTo(-s*1.5,s*0.3); ctx.closePath(); ctx.fill(); break;
        default: ctx.beginPath(); ctx.arc(0,0,s,0,Math.PI*2); ctx.fill(); ctx.stroke();
      }
    }
  }

  // ===================== ENEMY =====================
  class Enemy{
    constructor(conf, usePath){
      this.typeName = conf.name;
      this.shape = conf.shape;
      this.hue = conf.hue || 0;
      this.isBoss = conf.isBoss || false;
      this.maxHealth = conf.baseHealth;
      this.health = this.maxHealth;
      this.baseSpeed = conf.baseSpeed;
      this.reward = conf.reward || 0;
      this.regenPerSec = conf.regenPerSec || 0;
      this.immune = conf.immune || {};
      this.resist = conf.resist || {};

      // Verwende den übergebenen Pfad
      this.enemyPath = usePath || path;

      this.pathIndex = 0; this.progress = 0;
      this.x = this.enemyPath[0].x*GRID_SIZE + GRID_SIZE/2;
      this.y = this.enemyPath[0].y*GRID_SIZE + GRID_SIZE/2;

      this.slowMult = 1; this.slowUntil = 0;
      this.stunUntil = 0;
      this.poisons = [];
      this.prevDir = {dx:0,dy:0};
      this.straightStreak = 0;
      this.cornerSlowUntil = 0;
    }

    segmentDir(){
      const i=this.pathIndex;
      const p = this.enemyPath;
      const c=p[i], n=p[Math.min(i+1, p.length-1)];
      return {dx: Math.sign(n.x - c.x), dy: Math.sign(n.y - c.y)};
    }

    effectiveSpeed(){
      if (gameState.time < this.stunUntil) return 0;
      const slowActive = (gameState.time < this.slowUntil) ? this.slowMult : 1;
      let speed = this.baseSpeed * slowActive;
      if (gameState.time < this.cornerSlowUntil) speed *= 0.7;
      if (this.straightStreak >= 4) speed *= 0.88;
      return speed;
    }

    applyDamage(amount, src={}){
      if (src.type && this.resist[src.type]) amount *= this.resist[src.type];
      this.health -= amount;
    }
    applySlow(amount, duration){
      if (this.immune.slow) return;
      const mult = Math.max(0.1, 1-amount);
      if (mult < this.slowMult) this.slowMult = mult;
      this.slowUntil = Math.max(this.slowUntil, gameState.time + duration);
    }
    applyPoison(dps, duration){
      if (this.immune.poison) return;
      this.poisons.push({dps, until: gameState.time + duration});
    }
    applyStun(duration){
      if (this.immune.stun) return;
      this.stunUntil = Math.max(this.stunUntil, gameState.time + duration);
    }
    chainHit(dmg, count){
      if(count<=0) return;
      const others = gameState.enemies
        .filter(e=>e!==this && e.health>0)
        .sort((a,b)=> (a.x-this.x)**2+(a.y-this.y)**2 - ((b.x-this.x)**2+(b.y-this.y)**2));
      for (const e of others.slice(0,count)) e.applyDamage(dmg,{type:'chain'});
    }
    splashHit(dmg, radius){
      for(const e of gameState.enemies){
        if (e===this || e.health<=0) continue;
        const dx=e.x-this.x, dy=e.y-this.y;
        if (Math.hypot(dx,dy) <= radius) e.applyDamage(dmg,{type:'splash'});
      }
    }

    update(delta){
      const now = gameState.time;
      this.poisons = this.poisons.filter(p=>{
        if (p.until <= now) return false;
        this.applyDamage(p.dps * (delta/1000), {type:'poison'});
        return true;
      });
      if(this.regenPerSec>0 && this.health>0 && this.health<this.maxHealth){
        this.health = Math.min(this.maxHealth, this.health + this.regenPerSec*(delta/1000));
      }

      const dir = this.segmentDir();
      if (dir.dx !== this.prevDir.dx || dir.dy !== this.prevDir.dy){
        this.cornerSlowUntil = now + 200;
        this.straightStreak = 1;
        this.prevDir = dir;
      } else {
        this.straightStreak++;
      }

      const p = this.enemyPath;
      const moveDist = (this.effectiveSpeed()*delta)/20;
      this.progress += moveDist;
      while(this.progress>=GRID_SIZE && this.pathIndex<p.length-1){
        this.progress -= GRID_SIZE; this.pathIndex++;
      }
      if(this.pathIndex<p.length){
        const c=p[this.pathIndex], n=p[Math.min(this.pathIndex+1,p.length-1)];
        const t=this.progress/GRID_SIZE;
        this.x = (c.x+(n.x-c.x)*t)*GRID_SIZE + GRID_SIZE/2;
        this.y = (c.y+(n.y-c.y)*t)*GRID_SIZE + GRID_SIZE/2;
      }
    }

    draw(){
      const key = `${this.shape}_${this.hue}`;
      const img = gameState.enemyImages[key];
      const sizeMultiplier = this.isBoss ? 1.8 : 1;
      if (img){
        const s = 22 * sizeMultiplier;
        ctx.drawImage(img, this.x - s, this.y - s, s*2, s*2);
      } else {
        const size = 16 * sizeMultiplier;
        ctx.fillStyle = `hsl(${this.hue},70%,50%)`;
        ctx.strokeStyle = "#000"; ctx.lineWidth=2;
        ctx.save(); ctx.translate(this.x,this.y);
        drawShape(ctx,this.shape,0,0,size);
        ctx.fill(); ctx.stroke(); ctx.restore();
      }

      const barWidth = this.isBoss ? 60 : 44;
      const barHeight = this.isBoss ? 8 : 6;
      const barY = this.isBoss ? -35 : -30;
      const hp = Math.max(0, this.health) / this.maxHealth;
      ctx.fillStyle='#000'; ctx.fillRect(this.x-barWidth/2-1,this.y+barY,barWidth+2,barHeight);
      ctx.fillStyle= hp>0.5 ? '#0f0' : hp>0.25 ? '#ff0' : '#f00';
      ctx.fillRect(this.x-barWidth/2,this.y+barY+1,barWidth*hp,barHeight-2);

      if(this.isBoss){
        ctx.fillStyle='#ffd700'; ctx.font='bold 14px Arial'; ctx.textAlign='center';
        ctx.strokeStyle='#000'; ctx.lineWidth=3;
        ctx.strokeText('BOSS',this.x,this.y+barY-8);
        ctx.fillText('BOSS',this.x,this.y+barY-8);
      }
    }
    reachedEnd(){
      return this.pathIndex >= this.enemyPath.length-1 && this.progress >= GRID_SIZE;
    }
  }

  // --- Buff-Berechnung ---
  function getBuffMultiplierFor(tower){
    let bonus = 0;
    for(const t of gameState.towers){
      if(t.type.type !== 'buff') continue;
      const dx=t.x - tower.x, dy=t.y - tower.y;
      const d = Math.hypot(dx,dy);
      if (d <= t.type.range) bonus += 0.2;
    }
    return 1 + bonus;
  }

  // ===================== TOWER =====================
  class Tower{
    constructor(type, gx, gy, targetLevel = 1){
      this.type = {...type};
      this.gridX=gx; this.gridY=gy;
      this.x=gx*GRID_SIZE+GRID_SIZE/2; this.y=gy*GRID_SIZE+GRID_SIZE/2;
      this.lastShot=0; this.level=1; this.totalCost=this.type.cost;
      this.sizeScale = effectScaleForCost(this.type.cost);

      if(targetLevel > 1){
        for(let i = 1; i < targetLevel; i++){
          this.performUpgrade();
        }
      }
    }

    performUpgrade(){
      if(this.level >= 20) return;
      const cost = Math.floor(this.type.cost * 1.0 * Math.pow(1.25, this.level - 1));
      this.totalCost += cost;
      this.level++;
      this.type.damage = Math.floor(this.type.damage * 1.15);
      this.type.range = Math.floor(this.type.range * 1.08);
      this.type.fireRate = Math.floor(this.type.fireRate * 0.95);
      this.sizeScale = Math.min(3.0, this.sizeScale * 1.03);
    }

    upgrade(){
      if(this.level>=20) return;
      const cost=Math.floor(this.type.cost * 1.0 * Math.pow(1.25, this.level - 1));
      if(gameState.gold>=cost){
        gameState.gold-=cost;
        this.performUpgrade();
        updateUI(); showTowerInfo(this);
      }
    }
    sell(){
      const val=Math.floor(this.totalCost*0.5);
      gameState.gold+=val;
      const i=gameState.towers.indexOf(this);
      gameState.towers.splice(i,1);
      grid[this.gridY][this.gridX]=0;
      document.getElementById('towerInfoPanel').classList.remove('active');
      gameState.selectedTowerObject=null; updateUI();

      // Sync
      mp.syncTowerSold(this.gridX, this.gridY);
    }
    update(enemies){
      const now = gameState.time;
      if(this.type.type!=='buff' && now - this.lastShot < this.type.fireRate) return;

      let target=null, min=Infinity;
      for(const e of enemies){
        const d=Math.hypot(e.x-this.x, e.y-this.y);
        if(d<this.type.range && d<min){min=d; target=e;}
      }
      if(!target){
        if(this.type.type==='heal'){
          const hasEnemy = enemies.some(e=>Math.hypot(e.x-this.x, e.y-this.y)<=this.type.range);
          if(hasEnemy && now - this.lastShot >= this.type.fireRate){
            this.lastShot = now;
            gameState.lives = Math.min(20, gameState.lives + 1);
            updateUI();
          }
        }
        return;
      }

      if(this.type.type==='buff'){ return; }
      if(now - this.lastShot < this.type.fireRate) return;
      this.lastShot = now;

      const dmg = (this.type.damage||0) * getBuffMultiplierFor(this);
      const s = this.sizeScale;

      if(this.type.type==='laser'){
        target.applyDamage(dmg,{type:'laser'});
        gameState.particles.push({type:'beam',x1:this.x,y1:this.y,x2:target.x,y2:target.y,color:this.type.projectileColor,life:Math.round(10*s),width:Math.max(4, 5*s)});
      }
      else if(this.type.type==='cone'){
        const angleToTarget = Math.atan2(target.y - this.y, target.x - this.x);
        const half = (this.type.coneAngle || 45) * Math.PI/180 / 2;
        for(const e of enemies){
          const dx=e.x-this.x, dy=e.y-this.y;
          const dist = Math.hypot(dx,dy);
          if(dist>this.type.range) continue;
          const ang = Math.atan2(dy,dx);
          let diff = Math.atan2(Math.sin(ang-angleToTarget), Math.cos(ang-angleToTarget));
          if(Math.abs(diff) <= half){ e.applyDamage(dmg,{type:'cone'}); }
        }
        gameState.particles.push({type:'beam',x1:this.x,y1:this.y,x2:target.x,y2:target.y,color:this.type.projectileColor,life:Math.round(8*s),width:Math.max(3, 4*s)});
      }
      else if(this.type.type==='splash'){
        gameState.projectiles.push(new Projectile(this, target, dmg, this.type.projectileColor,'splash', this.type.splashRadius||50, {}));
      }
      else if(this.type.type==='slow'){
        gameState.projectiles.push(new Projectile(this, target, dmg, this.type.projectileColor,'slow',0,{slowAmount:this.type.slowAmount||0.5, slowDuration:this.type.slowDuration||1500}));
      }
      else if(this.type.type==='poison'){
        gameState.projectiles.push(new Projectile(this, target, dmg, this.type.projectileColor,'poison',0,{poisonDamage:this.type.poisonDamage||2, poisonDuration:this.type.poisonDuration||4000}));
      }
      else if(this.type.type==='stun'){
        gameState.projectiles.push(new Projectile(this, target, dmg, this.type.projectileColor,'stun',0,{stunDuration:this.type.stunDuration||600}));
      }
      else if(this.type.type==='chain'){
        gameState.projectiles.push(new Projectile(this, target, dmg, this.type.projectileColor,'chain',0,{chainCount:this.type.chainCount||3}));
      }
      else if(this.type.type==='heal'){
        gameState.lives = Math.min(20, gameState.lives + 1);
        updateUI();
      }
      else{
        gameState.projectiles.push(new Projectile(this, target, dmg, this.type.projectileColor,'single',0,{}));
      }
    }
    draw(){
      const base = GRID_SIZE/3;
      const size = base * this.sizeScale;
      const img = gameState.towerImages[this.type.name];
      if (img){
        const s = size*1.2;
        ctx.drawImage(img, this.x - s, this.y - s, s*2, s*2);
      } else {
        ctx.fillStyle=this.type.color; ctx.strokeStyle="#000"; ctx.lineWidth=2;
        ctx.save(); ctx.translate(this.x,this.y);
        drawShape(ctx,this.type.shape,0,0,size);
        ctx.fill(); ctx.stroke(); ctx.restore();
      }
      if(this.level>1){
        ctx.fillStyle='#ffd700'; ctx.font='bold 11px Arial'; ctx.textAlign='center';
        ctx.fillText(this.level,this.x,this.y-size-6);
      }
    }
  }

  // ===================== UI =====================
  function updateUI(){
    document.getElementById('lives').textContent = Math.max(0, Math.floor(gameState.lives));
    document.getElementById('gold').textContent = Math.floor(gameState.gold);
    document.getElementById('wave').textContent = gameState.wave;
    document.getElementById('score').textContent = gameState.score;
    document.getElementById('roundDisplay').textContent = `Runde ${gameState.wave}`;

    const startBtn = document.getElementById('startWaveBtn');
    startBtn.disabled = gameState.myReady || gameState.roundActive;
    if(gameState.myReady) {
      startBtn.classList.add('ready');
      startBtn.querySelector('.wave-btn-text').textContent = 'Warte auf Gegner...';
    } else {
      startBtn.classList.remove('ready');
      startBtn.querySelector('.wave-btn-text').textContent = 'Nächste Runde';
    }

    // Ready dots
    document.getElementById('myReadyStatus').classList.toggle('active', gameState.myReady);
    document.getElementById('opponentReadyStatus').classList.toggle('active', gameState.opponentReady);

    // Tower-Buttons aktualisieren
    document.querySelectorAll('.tower-btn').forEach((btn,i)=>{
      const t=gameState.towerTypes[i];
      if(t && gameState.gold<t.cost) btn.classList.add('disabled');
      else btn.classList.remove('disabled');
    });

    document.querySelectorAll('.unlock-btn').forEach((btn) => {
      const costText = btn.textContent.match(/\d+/);
      if(costText){
        const cost = parseInt(costText[0]);
        btn.classList.toggle('can-afford', gameState.gold >= cost);
      }
    });

    pauseOverlay.classList.toggle('active', gameState.paused);

    if(gameState.selectedTowerObject){
      const tower = gameState.selectedTowerObject;
      const upCost = Math.floor(tower.type.cost * 1.0 * Math.pow(1.25, tower.level - 1));
      const upBtn = document.getElementById('upgradeBtn');
      upBtn.disabled = tower.level >= 20 || gameState.gold < upCost;
    }

    // Unit shop buttons
    updateUnitShopButtons();
    updateAttackQueueUI();
  }

  // ===================== UNIT SHOP =====================
  function createUnitShopButtons() {
    const gridEl = document.getElementById('unitGrid');
    gridEl.innerHTML = '';

    UNIT_SHOP.forEach((unit, i) => {
      const btn = document.createElement('div');
      btn.className = 'unit-btn';
      btn.dataset.index = i;
      btn.innerHTML = `
        <div class="unit-btn-name">${unit.name}</div>
        <div class="unit-btn-cost">${unit.cost} 💰</div>
        <div class="unit-btn-stats">HP:${unit.baseHealth} SPD:${unit.baseSpeed}</div>
      `;
      btn.addEventListener('click', () => addToAttackQueue(i));
      gridEl.appendChild(btn);
    });
  }

  function updateUnitShopButtons() {
    document.querySelectorAll('.unit-btn').forEach((btn) => {
      const i = parseInt(btn.dataset.index);
      const unit = UNIT_SHOP[i];
      btn.classList.toggle('disabled', gameState.gold < unit.cost + gameState.attackCost);
    });

    document.getElementById('sendAttackBtn').disabled = gameState.attackQueue.length === 0;
  }

  function addToAttackQueue(unitIndex) {
    const unit = UNIT_SHOP[unitIndex];
    const count = unit.countMult || 1;

    if (gameState.gold < unit.cost + gameState.attackCost) return;

    gameState.attackQueue.push({
      unitIndex: unitIndex,
      name: unit.name,
      cost: unit.cost,
      count: count
    });
    gameState.attackCost += unit.cost;

    updateUI();
  }

  function removeFromAttackQueue(queueIndex) {
    const item = gameState.attackQueue[queueIndex];
    if (!item) return;
    gameState.attackCost -= item.cost;
    gameState.attackQueue.splice(queueIndex, 1);
    updateUI();
  }

  function updateAttackQueueUI() {
    const queueEl = document.getElementById('attackQueue');

    if (gameState.attackQueue.length === 0) {
      queueEl.innerHTML = '<div class="queue-empty">Keine Einheiten gewählt</div>';
    } else {
      queueEl.innerHTML = '';
      gameState.attackQueue.forEach((item, i) => {
        const el = document.createElement('div');
        el.className = 'queue-item';
        el.innerHTML = `${item.name} ×${item.count} <span class="remove">✕</span>`;
        el.addEventListener('click', () => removeFromAttackQueue(i));
        queueEl.appendChild(el);
      });
    }

    document.getElementById('attackCost').textContent = `${gameState.attackCost} 💰`;
  }

  function sendAttack() {
    if (gameState.attackQueue.length === 0) return;

    // Gold abziehen
    gameState.gold -= gameState.attackCost;

    // Einheiten an Gegner senden
    const units = gameState.attackQueue.map(item => ({
      unitIndex: item.unitIndex,
      count: item.count
    }));

    mp.sendAttack(units);

    // Queue leeren
    gameState.attackQueue = [];
    gameState.attackCost = 0;
    updateUI();
  }

  // Eingehender Angriff - Einheiten auf eigenem Pfad spawnen
  function handleIncomingAttack(units) {
    // Skalierung basierend auf Runde
    const wave = gameState.wave;
    const hpScale = wave <= 50 ? 0.20 * Math.pow(1.06, Math.max(0, wave-1)) : 0.20 * Math.pow(1.06, 49) * Math.pow(1.03, wave-50);
    const spdScale = wave <= 50 ? 0.75 * Math.pow(1.01, Math.max(0, wave-1)) : 0.75 * Math.pow(1.01, 49) * Math.pow(1.005, wave-50);

    let spawnDelay = 0;
    const spawnInterval = Math.max(400, 1500 - wave * 20);

    units.forEach(u => {
      const unitCfg = UNIT_SHOP[u.unitIndex];
      if (!unitCfg) return;

      for (let i = 0; i < u.count; i++) {
        const conf = {
          name: unitCfg.name,
          shape: unitCfg.shape,
          hue: unitCfg.hue,
          baseHealth: Math.floor(unitCfg.baseHealth * hpScale * (1 + wave * 0.05)),
          baseSpeed: unitCfg.baseSpeed * spdScale,
          reward: Math.floor(10 + wave * 2), // Belohnung für Verteidigung
          regenPerSec: unitCfg.regenPerSec || 0,
          immune: {},
          resist: {},
          isBoss: unitCfg.name === 'Boss'
        };

        gameState.pendingSpawns.push({
          cfg: conf,
          at: gameState.time + spawnDelay,
          isBoss: conf.isBoss
        });
        spawnDelay += spawnInterval;
      }
    });

    gameState.waveActive = true;

    // Notification
    showAttackNotification(units);
  }

  function showAttackNotification(units) {
    const totalCount = units.reduce((s, u) => s + u.count, 0);
    const notif = document.createElement('div');
    notif.className = 'attack-notification';
    notif.textContent = `⚔️ Angriff! ${totalCount} Einheiten kommen!`;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 3000);
  }

  function showTowerInfo(tower){
    gameState.selectedTowerObject=tower; gameState.selectedTower=null;
    document.querySelectorAll('.tower-btn').forEach(b=>b.classList.remove('selected'));
    document.getElementById('towerInfoPanel').classList.add('active');

    const iconCanvas=document.getElementById('infoIcon');
    const iconCtx=iconCanvas.getContext('2d');
    iconCtx.clearRect(0,0,60,60);
    const img=gameState.towerImages[tower.type.name];
    if(img && gameState.imagesLoaded){ iconCtx.drawImage(img,0,0,60,60); }
    else{
      iconCtx.fillStyle=tower.type.color; iconCtx.strokeStyle="#000"; iconCtx.lineWidth=3;
      iconCtx.save(); iconCtx.translate(30,30); drawShape(iconCtx,tower.type.shape,0,0,22); iconCtx.fill(); iconCtx.stroke(); iconCtx.restore();
    }
    document.getElementById('infoName').textContent=tower.type.name;
    document.getElementById('infoLevel').textContent=`Level ${tower.level}/20`;
    document.getElementById('infoStats').innerHTML = `
      <div class="info-stat-item"><span class="info-stat-label">Schaden</span><br><span class="info-stat-value">${Math.floor(tower.type.damage)}</span></div>
      <div class="info-stat-item"><span class="info-stat-label">Reichweite</span><br><span class="info-stat-value">${Math.floor(tower.type.range)}</span></div>
      <div class="info-stat-item"><span class="info-stat-label">Feuerrate</span><br><span class="info-stat-value">${Math.floor(tower.type.fireRate)}ms</span></div>
      <div class="info-stat-item"><span class="info-stat-label">Typ</span><br><span class="info-stat-value">${tower.type.type}</span></div>
    `;
    const upCost=Math.floor(tower.type.cost * 1.0 * Math.pow(1.25, tower.level - 1));
    const upBtn=document.getElementById('upgradeBtn');
    upBtn.textContent = tower.level>=20 ? 'Max Level!' : `⬆ Upgrade (💰 ${upCost})`;
    upBtn.disabled = tower.level>=20 || gameState.gold<upCost;
    const sellVal=Math.floor(tower.totalCost*0.5);
    document.getElementById('sellBtn').textContent=`💰 Verkaufen (${sellVal} Gold)`;
  }

  function unlockTower(towerName){
    unlockTowerFromUI(towerName, gameState, createTowerButtons, () => updateUI());
  }

  function createTowerButtons(){
    createTowerButtonsFromUI(gameState);
  }

  // ===================== BUILD ZONE CHECK =====================
  function isInBuildZone(gx) {
    const half = gameState.halfWidth;
    if (gameState.playerSide === 'left') {
      return gx < half;
    } else {
      return gx >= half;
    }
  }

  // ===================== INPUT =====================
  let hoverGridX=-1, hoverGridY=-1;
  let shiftPressed = false;

  document.addEventListener('keydown', e=>{
    if(e.key === 'Shift') shiftPressed = true;
  });

  document.addEventListener('keyup', e=>{
    if(e.key === 'Shift') shiftPressed = false;
  });

  canvas.addEventListener('click', e=>{
    if (!camera) return;
    const r=canvas.getBoundingClientRect();
    const screenX=e.clientX-r.left, screenY=e.clientY-r.top;
    const worldX=camera.screenToWorldX(screenX);
    const worldY=camera.screenToWorldY(screenY);
    const gx=Math.floor(worldX/GRID_SIZE), gy=Math.floor(worldY/GRID_SIZE);
    if(gx<0||gx>=GRID_WIDTH||gy<0||gy>=GRID_HEIGHT) return;

    // Check Build Zone
    if(!isInBuildZone(gx)){
      // Kann nicht auf der gegnerischen Seite bauen
      return;
    }

    const clicked=gameState.towers.find(t=>t.gridX===gx&&t.gridY===gy);
    if(clicked){ showTowerInfo(clicked); return; }

    let towerToBuild = gameState.selectedTower;
    if(e.shiftKey && gameState.lastPlacedTowerType){
      towerToBuild = gameState.lastPlacedTowerType;
    }

    if(towerToBuild && grid[gy][gx]===0){
      const isCopiedTower = towerToBuild.level && towerToBuild.level > 1;
      const towerName = isCopiedTower ? towerToBuild.type.name : towerToBuild.name;
      if(!gameState.unlockedTowers.includes(towerName)) return;
      const costToPay = isCopiedTower ? towerToBuild.totalCost : towerToBuild.cost;

      if(gameState.gold >= costToPay){
        let newTower;
        if(isCopiedTower){
          const originalType = gameState.towerTypes.find(t => t.name === towerName);
          if(!originalType) return;
          newTower = new Tower(originalType, gx, gy, towerToBuild.level);
        } else {
          newTower = new Tower(towerToBuild, gx, gy);
        }
        gameState.towers.push(newTower);
        gameState.gold -= costToPay;
        gameState.lastPlacedTowerType = towerToBuild;
        grid[gy][gx] = 2; // 2 = tower besetzt
        updateUI();

        // Sync tower placement
        mp.syncTowerPlaced(newTower.type.name, gx, gy, newTower.level);
      }
    }
  });

  canvas.addEventListener('mousemove', e=>{
    if (!camera) return;
    const r=canvas.getBoundingClientRect();
    const screenX=e.clientX-r.left, screenY=e.clientY-r.top;
    const worldX=camera.screenToWorldX(screenX);
    const worldY=camera.screenToWorldY(screenY);
    hoverGridX=Math.floor(worldX/GRID_SIZE);
    hoverGridY=Math.floor(worldY/GRID_SIZE);
    if(hoverGridX<0||hoverGridX>=GRID_WIDTH||hoverGridY<0||hoverGridY>=GRID_HEIGHT){hoverGridX=hoverGridY=-1;}
  });

  canvas.addEventListener('contextmenu', e=>{
    e.preventDefault();
    if(gameState.selectedTowerObject){
      gameState.selectedTowerObject = null;
      document.getElementById('towerInfoPanel').classList.remove('active');
    }
    if(gameState.selectedTower){
      gameState.selectedTower=null;
      document.querySelectorAll('.tower-btn').forEach(b=>b.classList.remove('selected'));
      hoverGridX=hoverGridY=-1;
    }
  });

  document.addEventListener('keydown', e=>{
    if(e.key==='Escape' && gameState.selectedTower){
      gameState.selectedTower=null; document.querySelectorAll('.tower-btn').forEach(b=>b.classList.remove('selected'));
      hoverGridX=hoverGridY=-1;
    }

    if(e.key.toLowerCase()==='q'){
      if(speedIndex > 0){
        speedIndex--;
        gameState.speed = SPEED_STEPS[speedIndex];
        rewindBtn.textContent = `⏪ ${gameState.speed}×`;
        ffBtn.textContent = `⏩ ${gameState.speed}×`;
      }
    }

    if(e.key.toLowerCase()==='e'){
      if(speedIndex < SPEED_STEPS.length - 1){
        speedIndex++;
        gameState.speed = SPEED_STEPS[speedIndex];
        rewindBtn.textContent = `⏪ ${gameState.speed}×`;
        ffBtn.textContent = `⏩ ${gameState.speed}×`;
      }
    }

    // R = Nächste Runde (Ready)
    if(e.key.toLowerCase()==='r'){
      if(!gameState.myReady && !gameState.roundActive){
        readyNextRound();
      }
    }

    if(e.code === 'Space'){ e.preventDefault(); togglePause(); }

    if(e.key.toLowerCase() === 'c' && gameState.selectedTowerObject){
      const tower = gameState.selectedTowerObject;
      gameState.copiedTower = {
        type: {...tower.type},
        level: tower.level,
        totalCost: tower.totalCost,
        baseCost: gameState.towerTypes.find(t => t.name === tower.type.name).cost
      };
      const panel = document.getElementById('towerInfoPanel');
      const originalBorder = panel.style.borderColor;
      panel.style.borderColor = '#00ff00';
      setTimeout(() => { panel.style.borderColor = originalBorder; }, 200);
    }

    if(e.key.toLowerCase() === 'v' && gameState.copiedTower){
      gameState.selectedTower = gameState.copiedTower;
      gameState.selectedTowerObject = null;
      document.getElementById('towerInfoPanel').classList.remove('active');
      document.querySelectorAll('.tower-btn').forEach(b=>b.classList.remove('selected'));
    }
  });

  // ===================== MULTIPLAYER ROUND SYSTEM =====================
  function readyNextRound() {
    if (gameState.myReady || gameState.roundActive) return;

    // Erst Angriff senden wenn Einheiten ausgewählt
    if (gameState.attackQueue.length > 0) {
      sendAttack();
    }

    gameState.myReady = true;
    mp.readyNextRound();
    updateUI();
  }

  function onRoundStart(round) {
    gameState.wave = round;
    gameState.myReady = false;
    gameState.opponentReady = false;
    gameState.roundActive = true;

    // Gold-Bonus pro Runde
    const roundBonus = 50 + round * 10;
    gameState.gold += roundBonus;

    updateUI();

    // Zeige Runden-Info
    const notif = document.createElement('div');
    notif.className = 'attack-notification';
    notif.style.background = 'linear-gradient(135deg, rgba(74, 158, 255, 0.95), rgba(60, 130, 220, 0.95))';
    notif.style.borderColor = '#5aafff';
    notif.textContent = `🌊 Runde ${round} startet! +${roundBonus} Gold`;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 3000);
  }

  // ===================== MULTIPLAYER CALLBACKS =====================
  mp.onError = (msg) => {
    const status = document.getElementById('lobbyStatus');
    status.textContent = msg;
    status.className = 'lobby-status error';
  };

  mp.onLobbyCreated = (msg) => {
    const status = document.getElementById('lobbyStatus');
    status.textContent = `Lobby "${msg.lobbyName}" erstellt. Warte auf Mitspieler...`;
    status.className = 'lobby-status waiting';
  };

  mp.onGameStart = (msg) => {
    gameState.playerSide = msg.role === 'host' ? 'left' : 'right';

    // Lobby verstecken, Spiel zeigen
    document.getElementById('lobbyScreen').style.display = 'none';
    document.getElementById('gameContainer').style.display = 'flex';

    // Player Tags setzen
    const leftTag = document.getElementById('leftPlayerTag');
    const rightTag = document.getElementById('rightPlayerTag');

    if (msg.role === 'host') {
      leftTag.textContent = mp.playerName;
      leftTag.classList.add('me');
      rightTag.textContent = msg.opponentName;
    } else {
      leftTag.textContent = msg.opponentName;
      rightTag.textContent = mp.playerName;
      rightTag.classList.add('me');
    }

    document.getElementById('opponentNameDisplay').textContent = msg.opponentName;
    document.getElementById('mapDivider').style.display = 'block';

    // Spiel initialisieren mit Seed
    initGame(msg.seed);
  };

  mp.onOpponentReady = () => {
    gameState.opponentReady = true;
    updateUI();
  };

  mp.onRoundStart = (round) => {
    onRoundStart(round);
  };

  mp.onIncomingAttack = (units, senderName) => {
    handleIncomingAttack(units);
  };

  mp.onOpponentTower = (msg) => {
    // Gegner-Turm als Anzeige hinzufügen
    const towerType = gameState.towerTypes.find(t => t.name === msg.towerName);
    if (towerType) {
      const opTower = new Tower(towerType, msg.gridX, msg.gridY, msg.level || 1);
      opTower.isOpponent = true;
      gameState.opponentTowers.push(opTower);
    }
  };

  mp.onOpponentTowerSold = (msg) => {
    gameState.opponentTowers = gameState.opponentTowers.filter(
      t => !(t.gridX === msg.gridX && t.gridY === msg.gridY)
    );
  };

  mp.onYouWin = (opponentName) => {
    gameState.paused = true;
    showEndScreen(true, opponentName);
  };

  mp.onYouLose = () => {
    gameState.paused = true;
    showEndScreen(false);
  };

  mp.onPlayerLeft = () => {
    if (!gameState.gameOver) {
      showEndScreen(true, 'Gegner hat verlassen');
    }
  };

  mp.onOpponentLives = (lives) => {
    document.getElementById('opponentLives').textContent = lives;
  };

  // ===================== GAME INIT =====================
  function initGame(seed) {
    resizeCanvas(seed);
    loadManifest().then(() => {
      createTowerButtons();
      createUnitShopButtons();
      updateUI();
      gameLoop();
    });
  }

  // Buttons
  document.getElementById('startWaveBtn').addEventListener('click', () => readyNextRound());
  document.getElementById('sendAttackBtn').addEventListener('click', () => sendAttack());

  document.getElementById('newGameBtn').addEventListener('click', () => {
    location.reload();
  });

  // Speed
  const rewindBtn = document.getElementById('rewindBtn');
  const ffBtn = document.getElementById('ffBtn');
  const SPEED_STEPS = [0.125, 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128];
  let speedIndex = 3;
  gameState.speed = SPEED_STEPS[speedIndex];
  rewindBtn.textContent = `⏪ ${gameState.speed}×`;
  ffBtn.textContent = `⏩ ${gameState.speed}×`;

  rewindBtn.addEventListener('click', () => {
    if(speedIndex > 0){ speedIndex--; gameState.speed = SPEED_STEPS[speedIndex]; rewindBtn.textContent = `⏪ ${gameState.speed}×`; ffBtn.textContent = `⏩ ${gameState.speed}×`; }
  });

  ffBtn.addEventListener('click', () => {
    if(speedIndex < SPEED_STEPS.length - 1){ speedIndex++; gameState.speed = SPEED_STEPS[speedIndex]; rewindBtn.textContent = `⏪ ${gameState.speed}×`; ffBtn.textContent = `⏩ ${gameState.speed}×`; }
  });

  const pauseBtn = document.getElementById('pauseBtn');
  function togglePause(){
    gameState.paused = !gameState.paused;
    pauseBtn.textContent = gameState.paused ? '▶ Fortsetzen' : '⏸ Pause';
    updateUI();
  }
  pauseBtn.addEventListener('click', togglePause);

  document.getElementById('upgradeBtn').addEventListener('click', ()=>{
    if(gameState.selectedTowerObject) gameState.selectedTowerObject.upgrade();
  });

  document.getElementById('sellBtn').addEventListener('click', ()=>{
    if(gameState.selectedTowerObject) gameState.selectedTowerObject.sell();
  });

  document.getElementById('closeInfo').addEventListener('click', ()=>{
    document.getElementById('towerInfoPanel').classList.remove('active');
    gameState.selectedTowerObject = null;
  });

  // ===================== CANVAS & MAP =====================
  function resizeCanvas(seed){
    const rect = canvasWrapper.getBoundingClientRect();
    canvas.width = rect.width; canvas.height = rect.height;
    WORLD_WIDTH = canvas.width * WORLD_SCALE;
    WORLD_HEIGHT = canvas.height * WORLD_SCALE;
    GRID_WIDTH = Math.floor(WORLD_WIDTH/GRID_SIZE);
    GRID_HEIGHT = Math.floor(WORLD_HEIGHT/GRID_SIZE);
    regenerateMap(seed || mp.seed);

    if (!camera) {
      camera = new Camera(WORLD_WIDTH, WORLD_HEIGHT, canvas.width, canvas.height);
      minimap = new Minimap(WORLD_WIDTH, WORLD_HEIGHT, 200);
      minimap.updatePosition(canvas.height);
      inputHandler = new InputHandler(canvas, camera, minimap);

      // Kamera auf eigene Seite zentrieren
      if (gameState.playerSide === 'left') {
        camera.jumpTo(WORLD_WIDTH / 4, WORLD_HEIGHT / 2);
      } else {
        camera.jumpTo(WORLD_WIDTH * 3 / 4, WORLD_HEIGHT / 2);
      }
    } else {
      camera.updateViewport(canvas.width, canvas.height);
      minimap.updatePosition(canvas.height);
    }
  }
  window.addEventListener('resize', () => resizeCanvas(mp.seed));

  function spawnEnemyFromConfig(cfg, wave, isBoss = false){
    const conf = {
      name: cfg.name,
      shape: cfg.shape,
      hue: cfg.hue ?? 0,
      baseHealth: cfg.baseHealth,
      baseSpeed: cfg.baseSpeed,
      reward: cfg.reward || 0,
      regenPerSec: cfg.regenPerSec || 0,
      immune: cfg.immune || {},
      resist: cfg.resist || {},
      isBoss: isBoss
    };
    // Feindliche Einheiten laufen auf UNSEREM Pfad
    const enemy = new Enemy(conf, path);
    gameState.enemies.push(enemy);
  }

  // ===================== END SCREEN =====================
  function showEndScreen(won, info) {
    gameState.gameOver = true;

    const overlay = document.createElement('div');
    overlay.id = 'gameOverScreen';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(10, 14, 39, 0.95); display: flex; align-items: center;
      justify-content: center; z-index: 10000; font-family: 'Segoe UI', sans-serif;
    `;

    const title = won ? 'GEWONNEN!' : 'VERLOREN!';
    const color = won ? '#4aff4a' : '#e94560';
    const subtitle = won ? (info || '') : 'Deine Basis wurde zerstört';

    overlay.innerHTML = `
      <div style="text-align:center; padding:50px;">
        <h1 style="font-size:72px; color:${color}; margin-bottom:20px;">${title}</h1>
        <p style="font-size:24px; color:#ccc; margin-bottom:10px;">${subtitle}</p>
        <p style="font-size:20px; color:#ffd700;">Runde: ${gameState.wave} | Punkte: ${gameState.score}</p>
        <button onclick="location.reload()" style="
          margin-top:30px; padding:15px 40px; font-size:18px; font-weight:bold;
          background:linear-gradient(135deg,#4a9eff,#3a7edf); border:2px solid #5aafff;
          border-radius:12px; color:#fff; cursor:pointer;
        ">Zurück zur Lobby</button>
      </div>
    `;

    document.body.appendChild(overlay);
  }

  // ===================== GAME LOOP =====================
  let lastTime = Date.now();
  function gameLoop(){
    const now=Date.now(); const dtReal=now-lastTime; lastTime=now;
    const dtScaled = gameState.paused ? 0 : dtReal * (gameState.speed || 1);
    if(!gameState.paused) gameState.time += dtScaled;

    if (camera) {
      camera.update();
      if (inputHandler) inputHandler.update();
    }

    ctx.fillStyle='#080c1a'; ctx.fillRect(0,0,canvas.width,canvas.height);

    if (camera) {
      camera.applyTransform(ctx);
    }

    // Grid zeichnen — subtile Linien
    ctx.strokeStyle='rgba(0, 240, 255, 0.04)'; ctx.lineWidth=1;
    for(let x=0;x<=GRID_WIDTH;x++){ ctx.beginPath(); ctx.moveTo(x*GRID_SIZE,0); ctx.lineTo(x*GRID_SIZE,WORLD_HEIGHT); ctx.stroke(); }
    for(let y=0;y<=GRID_HEIGHT;y++){ ctx.beginPath(); ctx.moveTo(0,y*GRID_SIZE); ctx.lineTo(WORLD_WIDTH,y*GRID_SIZE); ctx.stroke(); }

    // ===== TRENNLINIE IN DER MITTE =====
    const midX = gameState.halfWidth * GRID_SIZE;
    ctx.save();
    // Glow-Effekt
    ctx.shadowBlur = 15;
    ctx.shadowColor = 'rgba(168, 85, 247, 0.6)';
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([15, 8]);
    ctx.beginPath();
    ctx.moveTo(midX, 0);
    ctx.lineTo(midX, WORLD_HEIGHT);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
    ctx.restore();

    // Build-Zonen einfärben
    ctx.save();
    if (gameState.playerSide === 'left') {
      ctx.fillStyle = 'rgba(0, 240, 255, 0.02)';
      ctx.fillRect(0, 0, midX, WORLD_HEIGHT);
      ctx.fillStyle = 'rgba(255, 45, 117, 0.02)';
      ctx.fillRect(midX, 0, WORLD_WIDTH - midX, WORLD_HEIGHT);
    } else {
      ctx.fillStyle = 'rgba(255, 45, 117, 0.02)';
      ctx.fillRect(0, 0, midX, WORLD_HEIGHT);
      ctx.fillStyle = 'rgba(0, 240, 255, 0.02)';
      ctx.fillRect(midX, 0, WORLD_WIDTH - midX, WORLD_HEIGHT);
    }
    ctx.restore();

    // Pfade zeichnen
    function drawPathLine(p, color, startColor, endColor) {
      if(p.length>0){
        ctx.strokeStyle=color; ctx.lineWidth=GRID_SIZE*0.8; ctx.lineCap='round'; ctx.lineJoin='round';
        ctx.beginPath();
        p.forEach((pt,i)=>{ const x=pt.x*GRID_SIZE+GRID_SIZE/2, y=pt.y*GRID_SIZE+GRID_SIZE/2; if(i===0)ctx.moveTo(x,y); else ctx.lineTo(x,y); });
        ctx.stroke();
        // Start
        ctx.fillStyle=startColor; ctx.fillRect(p[0].x*GRID_SIZE,p[0].y*GRID_SIZE,GRID_SIZE,GRID_SIZE);
        // Ende
        const last=p[p.length-1]; ctx.fillStyle=endColor; ctx.fillRect(last.x*GRID_SIZE,last.y*GRID_SIZE,GRID_SIZE,GRID_SIZE);
      }
    }

    // Linker Pfad — Cyan-Ton
    drawPathLine(pathLeft, 'rgba(0, 240, 255, 0.18)', 'rgba(0, 255, 136, 0.6)', 'rgba(255, 45, 117, 0.6)');
    // Rechter Pfad — Pink-Ton
    drawPathLine(pathRight, 'rgba(255, 45, 117, 0.18)', 'rgba(255, 45, 117, 0.6)', 'rgba(0, 255, 136, 0.6)');

    // Spawns
    if(!gameState.paused){
      while (gameState.pendingSpawns.length && gameState.pendingSpawns[0].at <= gameState.time) {
        const { cfg, isBoss } = gameState.pendingSpawns.shift();
        spawnEnemyFromConfig(cfg, gameState.wave, isBoss);
      }
    }

    // Platzierungs-Vorschau
    let previewTower = gameState.selectedTower;
    if(shiftPressed && !gameState.selectedTower && gameState.lastPlacedTowerType){
      previewTower = gameState.lastPlacedTowerType;
    }

    if(previewTower && hoverGridX>=0 && hoverGridY>=0){
      const cx=hoverGridX*GRID_SIZE+GRID_SIZE/2, cy=hoverGridY*GRID_SIZE+GRID_SIZE/2;
      const isCopiedTower = previewTower.level && previewTower.level > 1;
      const displayRange = isCopiedTower ? previewTower.type.range : previewTower.range;
      const costToPay = isCopiedTower ? previewTower.totalCost : previewTower.cost;

      ctx.fillStyle='rgba(255,255,0,.06)'; ctx.strokeStyle='rgba(255,255,0,.5)'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(cx,cy,displayRange,0,Math.PI*2); ctx.fill(); ctx.stroke();

      const canPlace = grid[hoverGridY][hoverGridX]===0 && gameState.gold>=costToPay && isInBuildZone(hoverGridX);
      if(canPlace){
        ctx.fillStyle='rgba(0,255,0,.3)'; ctx.strokeStyle='rgba(0,255,0,.8)';
      } else { ctx.fillStyle='rgba(255,0,0,.3)'; ctx.strokeStyle='rgba(255,0,0,.8)'; }
      ctx.lineWidth=3; ctx.fillRect(hoverGridX*GRID_SIZE,hoverGridY*GRID_SIZE,GRID_SIZE,GRID_SIZE);
      ctx.strokeRect(hoverGridX*GRID_SIZE,hoverGridY*GRID_SIZE,GRID_SIZE,GRID_SIZE);

      if(grid[hoverGridY][hoverGridX]===0 && isInBuildZone(hoverGridX)){
        ctx.globalAlpha=.6;
        const towerName = isCopiedTower ? previewTower.type.name : previewTower.name;
        const img = gameState.towerImages[towerName];
        const baseCost = isCopiedTower ? previewTower.baseCost : previewTower.cost;
        const s = (GRID_SIZE/3*1.2) * effectScaleForCost(baseCost);
        if(img){ ctx.drawImage(img, cx-s, cy-s, s*2, s*2); }
        ctx.globalAlpha=1;
      }
    }

    // Eigene Türme
    gameState.towers.forEach(t=>{ if(!gameState.paused) t.update(gameState.enemies); t.draw(); });

    // Gegner-Türme (nur zeichnen, nicht updaten)
    ctx.globalAlpha = 0.6;
    gameState.opponentTowers.forEach(t => t.draw());
    ctx.globalAlpha = 1;

    // Range für ausgewählten Turm
    if (gameState.selectedTowerObject){
      const t = gameState.selectedTowerObject;
      ctx.fillStyle='rgba(0,255,255,.06)';
      ctx.strokeStyle='rgba(0,255,255,.7)';
      ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(t.x, t.y, t.type.range, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    }

    // Projektile
    gameState.projectiles = gameState.projectiles.filter(p=>{
      const rm = gameState.paused ? false : p.update(dtScaled);
      p.draw();
      return !rm;
    });

    // Partikel
    gameState.particles = gameState.particles.filter(p=>{
      if(!gameState.paused && p.type !== 'beam' && p.type !== 'impact'){
        p.life--;
        if(p.vx !== undefined){ p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.vx *= 0.98; p.vy *= 0.98; }
      } else { p.life--; }

      if(p.type==='beam'){
        const alpha = Math.max(0,p.life)/12;
        ctx.save(); ctx.globalAlpha = alpha;
        ctx.shadowBlur = 16; ctx.shadowColor = p.color;
        ctx.strokeStyle = p.color; ctx.lineWidth = p.width || 5;
        ctx.beginPath(); ctx.moveTo(p.x1,p.y1); ctx.lineTo(p.x2,p.y2); ctx.stroke();
        ctx.restore();
      } else if(p.type==='impact'){
        const k = 1 - (p.life / Math.max(1,p.life+1));
        ctx.save(); ctx.globalAlpha = 0.6 * (1 - k);
        ctx.strokeStyle = p.color; ctx.lineWidth = 3;
        const radius = Math.max(0.1, p.r + (p.max - p.r) * k);
        ctx.beginPath(); ctx.arc(p.x,p.y, radius, 0, Math.PI*2); ctx.stroke();
        ctx.restore();
      } else if(p.type==='trail_particle' || p.type==='explosion_particle'){
        const alpha = Math.max(0, p.life / (p.maxLife||25));
        if(alpha > 0){
          ctx.save(); ctx.globalAlpha = alpha * 0.8;
          ctx.fillStyle = p.color; ctx.shadowBlur = 6; ctx.shadowColor = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.1, p.size * alpha), 0, Math.PI*2);
          ctx.fill(); ctx.restore();
        }
      }
      return p.life>0;
    });

    // Gegner
    gameState.enemies = gameState.enemies.filter(enemy=>{
      if(!gameState.paused) enemy.update(dtScaled);
      enemy.draw();
      if(enemy.reachedEnd() && enemy.health>0){
        gameState.lives -= 1;
        mp.syncLives(gameState.lives);
        updateUI();
        return false;
      }
      if(enemy.health<=0){
        gameState.gold += (enemy.reward||0);
        const points = Math.floor((enemy.reward||5) * Math.max(1, gameState.wave) * 0.5);
        gameState.score += points;
        updateUI();
        return false;
      }
      return true;
    });

    if (camera) {
      camera.resetTransform(ctx);
    }

    // Wellenende
    if(gameState.waveActive && gameState.enemies.length===0 && gameState.pendingSpawns.length===0){
      gameState.waveActive = false;
      gameState.roundActive = false;
      updateUI();
    }

    // Draw minimap
    if (minimap && camera) {
      minimap.draw(ctx, camera, {
        path: pathLeft,
        GRID_SIZE: GRID_SIZE,
        towers: gameState.towers,
        enemies: gameState.enemies
      });
    }

    // Game Over
    if(gameState.lives <= 0 && !gameState.gameOver){
      gameState.gameOver = true;
      gameState.paused = true;
      mp.sendDefeated();
      showEndScreen(false);
    }

    requestAnimationFrame(gameLoop);
  }

  // ===================== LOBBY UI =====================
  document.getElementById('createLobbyBtn').addEventListener('click', async () => {
    const playerName = document.getElementById('playerNameInput').value.trim();
    const lobbyName = document.getElementById('lobbyNameInput').value.trim();
    if (!playerName || !lobbyName) {
      const status = document.getElementById('lobbyStatus');
      status.textContent = 'Bitte Name und Lobby Name eingeben!';
      status.className = 'lobby-status error';
      return;
    }

    mp.createLobby(lobbyName, playerName);
  });

  document.getElementById('joinLobbyBtn').addEventListener('click', async () => {
    const playerName = document.getElementById('playerNameInput').value.trim();
    const lobbyName = document.getElementById('lobbyNameInput').value.trim();

    if (!playerName || !lobbyName) {
      const status = document.getElementById('lobbyStatus');
      status.textContent = 'Bitte Name und Lobby Name eingeben!';
      status.className = 'lobby-status error';
      return;
    }

    mp.joinLobby(lobbyName, playerName);
  });
});
