import * as THREE from 'three';

import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import Player from './Player.js';
import Arena from './Arena.js';
import Stickman from './Stickman.js';
import ParkourElement from './ParkourElement.js';

const CONFIG = {
    total_stickmen: 8,
    powerup_initial_spawn_delay: 5.0,
    max_active_powerups: 3,
    powerup_spawn_interval: 10.0,
    tag_distance: 4.0,
    player_speed: 8,
    player_sprint_speed: 14,
    gravity: -20,
    jump_force: 9,
    player_max_stamina: 100,
    stamina_drain_rate: 25,
    stamina_regen_rate: 15,
    enemy_speed: 4,
    enemy_run_speed: 7,
    enemy_flee_distance: 14,
    powerup_speed_multiplier: 1.5,
    powerup_pickup_distance: 2.0,
    powerup_duration: 5.0,
    coins_per_enemy: 10,
    time_bonus_limit: 60,
};

const POWERUP_TYPES = {
    freeze: { emoji: '\u2744\uFE0F', label: 'FREEZE', color: 0x74b9ff, duration: 4 },
    trap:   { emoji: '\uD83E\uDEA4', label: 'TRAP', color: 0xfdcb6e, duration: 0 },
    speed:  { emoji: '\u26A1', label: 'SPEED', color: 0xff7675, duration: 6 },
    magnet: { emoji: '\uD83E\uDDF2', label: 'MAGNET', color: 0xa29bfe, duration: 5 },
};
const POWERUP_KEYS = Object.keys(POWERUP_TYPES);

// --- CHAPTERS ---
const CHAPTERS = [
    { name: 'The Park', levels: 5, reward: 50, desc: 'Easy start — learn the basics' },
    { name: 'The Streets', levels: 5, reward: 100, desc: 'Faster enemies, tighter spaces' },
    { name: 'The Factory', levels: 5, reward: 200, desc: 'Enemies dodge and group up' },
    { name: 'The Rooftops', levels: 5, reward: 500, desc: 'Maximum chaos — elite runners' },
];
const TOTAL_LEVELS = CHAPTERS.reduce((s, c) => s + c.levels, 0);

function getChapterForLevel(level) {
    let cumulative = 0;
    for (let i = 0; i < CHAPTERS.length; i++) {
        cumulative += CHAPTERS[i].levels;
        if (level <= cumulative) {
            return { chapter: i, levelInChapter: level - (cumulative - CHAPTERS[i].levels) };
        }
    }
    return { chapter: CHAPTERS.length - 1, levelInChapter: CHAPTERS[CHAPTERS.length - 1].levels };
}

// --- SHOP ITEMS ---
const SHOP_ITEMS = [
    { id: 'skin_blue', name: 'Cool Blue', icon: '🔵', price: 50, type: 'skin', color: 0x339af0 },
    { id: 'skin_gold', name: 'Golden', icon: '🟡', price: 100, type: 'skin', color: 0xfcc419 },
    { id: 'skin_purple', name: 'Grape', icon: '🟣', price: 100, type: 'skin', color: 0xcc5de8 },
    { id: 'skin_green', name: 'Emerald', icon: '🟢', price: 150, type: 'skin', color: 0x51cf66 },
    { id: 'extra_time', name: '+15s Timer', icon: '⏱️', price: 75, type: 'boost' },
    { id: 'start_speed', name: 'Start w/ Speed', icon: '⚡', price: 120, type: 'boost' },
];

// --- CURRENCY ---
class CurrencyManager {
    constructor() {
        this.coins = parseInt(localStorage.getItem('stickman_coins')) || 0;
        this.unlockedItems = JSON.parse(localStorage.getItem('stickman_items')) || [];
        this.activeSkin = localStorage.getItem('stickman_active_skin') || 'default';
    }
    addCoins(amount) {
        this.coins += amount;
        this.save();
    }
    spend(amount) {
        if (this.coins < amount) return false;
        this.coins -= amount;
        this.save();
        return true;
    }
    hasItem(id) { return this.unlockedItems.includes(id); }
    unlockItem(id) {
        if (!this.unlockedItems.includes(id)) {
            this.unlockedItems.push(id);
            this.save();
        }
    }
    save() {
        localStorage.setItem('stickman_coins', this.coins);
        localStorage.setItem('stickman_items', JSON.stringify(this.unlockedItems));
        localStorage.setItem('stickman_active_skin', this.activeSkin);
    }
    getSkinColor() {
        const item = SHOP_ITEMS.find(i => i.id === this.activeSkin);
        return item ? item.color : 0xff6b6b;
    }
}

// --- MOD MANAGER ---
class ModManager {
    constructor() {
        this.activeMods = new Set();
        this.locked = false;
        this.modEffects = {
            speed: { label: 'SPEED' },
            lowgrav: { label: 'LOW GRAV' },
            ghost: { label: 'GHOST' },
            bighead: { label: 'BIG HEAD' },
            chaos: { label: 'CHAOS' },
            mirror: { label: 'MIRROR' },
        };
        this.initUI();
    }
    initUI() {
        this.countEl = document.getElementById('mod-count');
        this.modBtns = document.querySelectorAll('.mod-btn');
        this.modBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.locked) return;
                const mod = btn.dataset.mod;
                if (this.activeMods.has(mod)) {
                    this.activeMods.delete(mod);
                    btn.classList.remove('active');
                } else {
                    this.activeMods.add(mod);
                    btn.classList.add('active');
                }
                this.updateCount();
            });
        });
        this.updateCount();
    }
    lock() { this.locked = true; this.modBtns.forEach(b => { b.style.opacity = '0.5'; b.style.pointerEvents = 'none'; }); }
    unlock() { this.locked = false; this.modBtns.forEach(b => { b.style.opacity = ''; b.style.pointerEvents = ''; }); }
    updateCount() {
        if (!this.countEl) return;
        const n = this.activeMods.size;
        this.countEl.textContent = n > 0 ? `${n} MOD${n > 1 ? 'S' : ''} ACTIVE` : '';
    }
    has(modName) { return this.activeMods.has(modName); }
    getSpeedMultiplier() { return this.has('speed') ? 1.5 : 1.0; }
    getGravityMultiplier() { return this.has('lowgrav') ? 0.4 : 1.0; }
    getJumpMultiplier() { return this.has('lowgrav') ? 1.3 : 1.0; }
    showActiveModsHUD() {
        const display = document.getElementById('active-mods-display');
        display.innerHTML = '';
        this.activeMods.forEach(mod => {
            const tag = document.createElement('span');
            tag.className = 'mod-tag';
            tag.textContent = this.modEffects[mod]?.label || mod;
            display.appendChild(tag);
        });
    }
}

// ============================================================
// MAIN GAME
// ============================================================
export default class Game {
    constructor() {
        this.clock = new THREE.Clock();
        this.isRunning = false;
        this.taggedCount = 0;
        this.totalStickmen = CONFIG.total_stickmen;
        this.gameTime = 0;

        // Mode: 'normal' or 'worldcup'
        this.gameMode = 'normal';

        // Level / chapter
        this.level = parseInt(localStorage.getItem('stickman_level')) || 1;
        if (this.level > TOTAL_LEVELS) this.level = TOTAL_LEVELS;

        // Timer for normal mode
        this.timeLimit = 60;
        this.timeRemaining = 60;

        // World Cup lives
        this.wcLives = 5;
        this.wcTeammates = []; // friendly AI stickmen
        this.wcEnemyRunners = [];

        this.allColliders = [];
        this.activePowerups = [];
        this.powerupSpawnTimer = CONFIG.powerup_initial_spawn_delay;
        this.dustParticles = [];
        this.trailParticles = [];
        this.gameObjectsCreated = false;
        this.gameEnded = false;
        this.activeTraps = [];
        this.arenaCoins = [];
        this.coinSpawnTimer = 0;
        this.sessionCoins = 0;

        this.mods = new ModManager();
        this.currency = new CurrencyManager();

        this.initThree();
        this.initUI();
        this.initMenuEvents();
        this.initMobileControls();
        this.showMainMenu();
        this.animate();
    }

    // ---- CHAPTER / LEVEL CONFIG ----
    getLevelConfig() {
        const lvl = this.level;
        const { chapter } = getChapterForLevel(lvl);
        const baseTime = 75;
        return {
            stickmen: Math.min(6 + Math.floor((lvl - 1) * 1.2), 20),
            enemySpeedBonus: Math.min((lvl - 1) * 0.4, 5),
            fleeDistanceBonus: Math.min((lvl - 1) * 0.8, 10),
            timeLimit: Math.max(30, baseTime - (lvl - 1) * 2),
            chapter,
        };
    }

    applyChapterTheme(chapterIndex) {
        const themes = [
            { bg: 0x87ceeb, fog: 0x87ceeb, fogDensity: 0.008 }, // Park - bright sky
            { bg: 0xc8d6e5, fog: 0xc8d6e5, fogDensity: 0.012 }, // Streets - overcast
            { bg: 0x636e72, fog: 0x636e72, fogDensity: 0.015 }, // Factory - hazy
            { bg: 0x2d3436, fog: 0x2d3436, fogDensity: 0.010 }, // Rooftops - dusk
        ];
        const t = themes[chapterIndex] || themes[0];
        this.scene.background.setHex(t.bg);
        this.scene.fog = new THREE.FogExp2(t.bg, t.fogDensity);
    }

    // ---- SCREENS ----
    hideAllScreens() {
        ['main-menu', 'normal-setup', 'worldcup-setup', 'roadmap-screen', 'shop-screen', 'hud'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
    }

    showMainMenu() {
        this.hideAllScreens();
        document.getElementById('main-menu').style.display = 'flex';
        document.getElementById('menu-coins').textContent = this.currency.coins;
        const { chapter, levelInChapter } = getChapterForLevel(this.level);
        document.getElementById('menu-level').textContent = `Ch.${chapter + 1} Lv.${levelInChapter}`;
    }

    showNormalSetup() {
        this.hideAllScreens();
        document.getElementById('normal-setup').style.display = 'flex';
        this.mods.unlock();
        const cfg = this.getLevelConfig();
        const { chapter, levelInChapter } = getChapterForLevel(this.level);
        document.getElementById('normal-level-info').textContent = `${CHAPTERS[chapter].name} \u2014 Level ${levelInChapter} of ${CHAPTERS[chapter].levels}`;
        document.getElementById('normal-timer-info').textContent = `Tag ${cfg.stickmen} players in ${cfg.timeLimit}s`;
    }

    showWorldCupSetup() {
        this.hideAllScreens();
        document.getElementById('worldcup-setup').style.display = 'flex';
    }

    showRoadmap() {
        this.hideAllScreens();
        document.getElementById('roadmap-screen').style.display = 'flex';
        this.renderRoadmap();
    }

    showShop() {
        this.hideAllScreens();
        document.getElementById('shop-screen').style.display = 'flex';
        this.renderShop();
    }

    renderRoadmap() {
        const container = document.getElementById('roadmap-chapters');
        container.innerHTML = '';
        let globalLevel = 0;

        for (let ci = 0; ci < CHAPTERS.length; ci++) {
            const ch = CHAPTERS[ci];
            const firstLevel = globalLevel + 1;
            const isCurrent = this.level >= firstLevel && this.level <= globalLevel + ch.levels;
            const isLocked = this.level < firstLevel;

            const card = document.createElement('div');
            card.className = 'chapter-card' + (isCurrent ? ' current' : '') + (isLocked ? ' locked' : '');

            const header = document.createElement('div');
            header.className = 'chapter-header';
            header.innerHTML = `<span class="chapter-name">Ch.${ci + 1}: ${ch.name}</span><span class="chapter-reward">\uD83E\uDE99 ${ch.reward}</span>`;
            card.appendChild(header);

            const dots = document.createElement('div');
            dots.className = 'level-dots';

            for (let li = 1; li <= ch.levels; li++) {
                globalLevel++;
                if (li > 1) {
                    const conn = document.createElement('div');
                    conn.className = 'level-connector' + (globalLevel <= this.level ? ' done' : '');
                    dots.appendChild(conn);
                }
                const dot = document.createElement('div');
                if (globalLevel < this.level) dot.className = 'level-dot completed';
                else if (globalLevel === this.level) dot.className = 'level-dot current';
                else dot.className = 'level-dot locked';
                dot.textContent = globalLevel;
                dots.appendChild(dot);
            }

            card.appendChild(dots);
            container.appendChild(card);
        }
    }

    renderShop() {
        document.getElementById('shop-coins').textContent = this.currency.coins;
        const container = document.getElementById('shop-items');
        container.innerHTML = '';

        SHOP_ITEMS.forEach(item => {
            const div = document.createElement('div');
            const owned = this.currency.hasItem(item.id);
            const equipped = this.currency.activeSkin === item.id;
            div.className = 'shop-item' + (equipped ? ' equipped' : owned ? ' owned' : '');

            div.innerHTML = `
                <div class="shop-item-icon">${item.icon}</div>
                <div class="shop-item-name">${item.name}</div>
                <div class="shop-item-price ${owned ? 'owned-label' : ''}">${owned ? (equipped ? 'EQUIPPED' : 'OWNED') : '\uD83E\uDE99 ' + item.price}</div>
            `;

            div.addEventListener('click', () => {
                if (owned) {
                    if (item.type === 'skin') {
                        this.currency.activeSkin = item.id;
                        this.currency.save();
                    }
                } else {
                    if (this.currency.spend(item.price)) {
                        this.currency.unlockItem(item.id);
                    }
                }
                this.renderShop();
            });

            container.appendChild(div);
        });
    }

    // ---- MENU EVENTS ----
    initMenuEvents() {
        document.getElementById('btn-normal-mode').addEventListener('click', () => this.showNormalSetup());
        document.getElementById('btn-worldcup-mode').addEventListener('click', () => this.showWorldCupSetup());
        document.getElementById('btn-roadmap').addEventListener('click', () => this.showRoadmap());
        document.getElementById('btn-shop').addEventListener('click', () => this.showShop());
        document.getElementById('normal-back').addEventListener('click', () => this.showMainMenu());
        document.getElementById('wc-back').addEventListener('click', () => this.showMainMenu());
        document.getElementById('roadmap-back').addEventListener('click', () => this.showMainMenu());
        document.getElementById('shop-back').addEventListener('click', () => this.showMainMenu());

        document.getElementById('play-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.gameMode = 'normal';
            if (window.innerWidth > 768) document.body.requestPointerLock();
            else this.startGame();
        });

        document.getElementById('play-wc-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.gameMode = 'worldcup';
            if (window.innerWidth > 768) document.body.requestPointerLock();
            else this.startGame();
        });

        document.addEventListener('pointerlockchange', () => {
            if (document.pointerLockElement === document.body) {
                this.startGame();
            } else if (this.isRunning && !this.gameEnded) {
                this.pauseGame();
            }
        });

        document.addEventListener('mousedown', (e) => {
            if (this.isRunning && e.button === 0 && window.innerWidth > 768) {
                if (document.pointerLockElement === document.body) {
                    this.attemptTag();
                }
            }
        });

        // Powerup slot keys
        document.addEventListener('keydown', (e) => {
            if (!this.isRunning || !this.player) return;
            if (e.key === '1') this.usePowerupSlot(0);
            else if (e.key === '2') this.usePowerupSlot(1);
            else if (e.key === '3') this.usePowerupSlot(2);
        });

        // Click powerup slots
        document.querySelectorAll('.powerup-slot').forEach((el, i) => {
            el.addEventListener('click', () => {
                if (this.isRunning && this.player) this.usePowerupSlot(i);
            });
        });
    }

    // ---- THREE.JS SETUP ----
    initThree() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb);
        this.scene.fog = new THREE.FogExp2(0x87ceeb, 0.008);

        this.camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 1000);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;
        document.body.appendChild(this.renderer.domElement);

        const renderScene = new RenderPass(this.scene, this.camera);
        const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.3, 0.4, 0.9);
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(renderScene);
        this.composer.addPass(bloomPass);

        this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));

        const dirLight = new THREE.DirectionalLight(0xfff5e6, 1.8);
        dirLight.position.set(30, 60, 25);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.set(2048, 2048);
        dirLight.shadow.camera.near = 1; dirLight.shadow.camera.far = 120;
        dirLight.shadow.camera.left = -50; dirLight.shadow.camera.right = 50;
        dirLight.shadow.camera.top = 50; dirLight.shadow.camera.bottom = -50;
        this.scene.add(dirLight);

        this.scene.add(new THREE.DirectionalLight(0xb3d9ff, 0.4).translateX(-20).translateY(15).translateZ(-20));
        const pl1 = new THREE.PointLight(0xffeaa7, 0.3, 50); pl1.position.set(20, 10, 20); this.scene.add(pl1);
        const pl2 = new THREE.PointLight(0x81ecec, 0.3, 50); pl2.position.set(-20, 10, -20); this.scene.add(pl2);
        this.scene.add(new THREE.HemisphereLight(0x87ceeb, 0x6abf4b, 0.3));

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.composer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    // ---- GAME OBJECTS ----
    initGameObjects() {
        if (this.gameObjectsCreated) return;
        this.gameObjectsCreated = true;

        this.player = new Player(this.scene, this.camera, CONFIG, this.mods);

        // Apply skin color
        const skinColor = this.currency.getSkinColor();
        this.player.material.color.setHex(skinColor);

        // Start with speed boost if purchased
        if (this.currency.hasItem('start_speed') && this.gameMode === 'normal') {
            this.player.collectPowerup('speed');
        }

        const chapterIndex = this.gameMode === 'worldcup' ? 0 : this.getLevelConfig().chapter;
        this.applyChapterTheme(chapterIndex);
        this.arena = new Arena(this.scene, chapterIndex);

        this.parkourElements = [
            new ParkourElement(this.scene, 'ramp', 0, 0, -10, 0),
            new ParkourElement(this.scene, 'platform_stairs', 15, 0, -15, Math.PI / 2),
            new ParkourElement(this.scene, 'ramp', -20, 0, 10, Math.PI),
            new ParkourElement(this.scene, 'platform_stairs', -10, 0, 25, 0),
            new ParkourElement(this.scene, 'ramp', 25, 0, -25, Math.PI / 2),
        ];

        this.allColliders = [];
        this.allColliders.push(...this.arena.colliders);
        this.parkourElements.forEach(p => this.allColliders.push(...p.colliders));

        this.stickmen = [];

        if (this.gameMode === 'worldcup') {
            this.initWorldCup();
        } else {
            const cfg = this.getLevelConfig();
            this.totalStickmen = cfg.stickmen;
            this.timeLimit = cfg.timeLimit + (this.currency.hasItem('extra_time') ? 15 : 0);
            this.timeRemaining = this.timeLimit;

            for (let i = 0; i < this.totalStickmen; i++) {
                const x = (Math.random() - 0.5) * 60;
                const z = (Math.random() - 0.5) * 60;
                const s = new Stickman(this.scene, x, z, CONFIG, this.mods);
                s.speed += cfg.enemySpeedBonus;
                s.runSpeed += cfg.enemySpeedBonus;
                s.fleeDistance += cfg.fleeDistanceBonus;
                this.stickmen.push(s);
            }
        }

        this.bindMobileJoystickToPlayer();
        this.spawnArenaCoins();
    }

    initWorldCup() {
        this.wcLives = 5;
        this.totalStickmen = 5;
        this.wcTeammates = [];
        this.wcEnemyRunners = [];

        // Spawn 5 enemy runners (flee from player)
        for (let i = 0; i < 5; i++) {
            const x = 15 + (Math.random() - 0.5) * 30;
            const z = 15 + (Math.random() - 0.5) * 30;
            const s = new Stickman(this.scene, x, z, CONFIG, this.mods);
            s.speed += 2;
            s.runSpeed += 2;
            this.stickmen.push(s);
            this.wcEnemyRunners.push(s);
        }

        // Spawn 5 friendly teammates (green, they wander — enemies can tag them)
        for (let i = 0; i < 5; i++) {
            const x = -15 + (Math.random() - 0.5) * 20;
            const z = -15 + (Math.random() - 0.5) * 20;
            const t = new Stickman(this.scene, x, z, CONFIG, this.mods);
            t.material.color.setHex(0x51cf66);
            t.material.emissive.setHex(0x2d7a3a);
            t.isTeammate = true;
            this.stickmen.push(t);
            this.wcTeammates.push(t);
        }

        this.updateLivesDisplay();
    }

    updateLivesDisplay() {
        const livesEl = document.getElementById('lives-display');
        if (livesEl) {
            livesEl.textContent = '\u2764\uFE0F'.repeat(this.wcLives) + '\uD83D\uDDA4'.repeat(5 - this.wcLives);
        }
    }

    // ---- UI ----
    initUI() {
        this.hud = document.getElementById('hud');
        this.timeDisplay = document.getElementById('timer');
        this.scoreDisplay = document.getElementById('score');
        this.levelDisplay = document.getElementById('level-display');
        this.staminaBar = document.getElementById('stamina-bar');
        this.speedLines = document.getElementById('speed-lines');
        this.doubleJumpIcon = document.getElementById('double-jump-icon');
        this.wallJumpIcon = document.getElementById('wall-jump-icon');
        this.slideIcon = document.getElementById('slide-icon');
        this.wcBanner = document.getElementById('worldcup-banner');
        this.wcPhaseLabel = document.getElementById('worldcup-phase');
        this.wcTimerLabel = document.getElementById('worldcup-timer');
        this.powerupActive = document.getElementById('powerup-active');
        this.powerupActiveName = document.getElementById('powerup-active-name');
        this.powerupTimerFill = document.getElementById('powerup-timer-fill');
        this.powerupSlotEls = [
            document.getElementById('powerup-slot-0'),
            document.getElementById('powerup-slot-1'),
            document.getElementById('powerup-slot-2'),
        ];
    }

    startGame() {
        this.initGameObjects();
        this.isRunning = true;
        this.mods.lock();

        this.hideAllScreens();
        this.hud.style.display = 'block';
        this.mods.showActiveModsHUD();

        const { chapter, levelInChapter } = getChapterForLevel(this.level);

        if (this.gameMode === 'worldcup') {
            this.levelDisplay.innerText = 'WORLD CUP';
            this.scoreDisplay.innerText = `Tagged: 0 / ${this.totalStickmen}`;
            document.getElementById('wc-lives').style.display = 'block';
            this.timeDisplay.innerText = '';
        } else {
            this.levelDisplay.innerText = `${CHAPTERS[chapter].name} ${levelInChapter}`;
            this.scoreDisplay.innerText = `Tagged: ${this.taggedCount} / ${this.totalStickmen}`;
            this.timeDisplay.innerText = `${this.timeRemaining}s`;
        }

        if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    pauseGame() {
        this.isRunning = false;
        if (this.gameMode === 'worldcup') {
            this.showWorldCupSetup();
        } else {
            this.showNormalSetup();
        }
    }

    // ---- POWERUP SYSTEM ----
    usePowerupSlot(index) {
        if (!this.player) return;
        const type = this.player.usePowerup(index);
        if (!type) return;
        this.playSynthSound('powerup');

        if (type === 'freeze') {
            const pos = this.player.mesh.position;
            this.stickmen.forEach(s => {
                if (!s.isTagged && !s.isFrozen && !s.isTeammate && pos.distanceTo(s.mesh.position) < 15) {
                    s.freeze(POWERUP_TYPES.freeze.duration);
                    this.createFreezeExplosion(s.mesh.position);
                }
            });
            this.createFreezeWave(pos);
        } else if (type === 'trap') {
            this.placeTrap(this.player.mesh.position.clone());
        } else if (type === 'magnet') {
            this.player.activePowerupType = 'magnet';
            this.player.powerupTimer = POWERUP_TYPES.magnet.duration;
            this.player.material.color.setHex(0xa29bfe);
            this.player.material.emissive.setHex(0x6c5ce7);
        }
        this.updatePowerupHUD();
    }

    placeTrap(position) {
        position.y = 0.05;
        const trapGroup = new THREE.Group();
        const disc = new THREE.Mesh(
            new THREE.CylinderGeometry(1.2, 1.2, 0.1, 16),
            new THREE.MeshStandardMaterial({ color: 0xfdcb6e, emissive: 0xf39c12, emissiveIntensity: 0.4, transparent: true, opacity: 0.7, roughness: 0.4 })
        );
        trapGroup.add(disc);
        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.8, 0.06, 8, 24),
            new THREE.MeshBasicMaterial({ color: 0xe17055, transparent: true, opacity: 0.6 })
        );
        ring.rotation.x = Math.PI / 2; ring.position.y = 0.06;
        trapGroup.add(ring);
        trapGroup.position.copy(position);
        this.scene.add(trapGroup);
        this.activeTraps.push({ mesh: trapGroup, position: position.clone(), lifetime: 20 });
    }

    updateTraps(dt) {
        for (let i = this.activeTraps.length - 1; i >= 0; i--) {
            const trap = this.activeTraps[i];
            trap.lifetime -= dt;
            if (trap.mesh.children[1]) trap.mesh.children[1].rotation.z += dt * 2;

            for (const s of this.stickmen) {
                if (!s.isTagged && !s.isFrozen && !s.isTeammate) {
                    if (trap.position.distanceTo(s.mesh.position) < 1.5) {
                        s.freeze(3);
                        this.createFreezeExplosion(s.mesh.position);
                        this.playSynthSound('trap');
                        this.scene.remove(trap.mesh);
                        this.activeTraps.splice(i, 1);
                        break;
                    }
                }
            }
            if (trap.lifetime <= 0) {
                this.scene.remove(trap.mesh);
                this.activeTraps.splice(i, 1);
            }
        }
    }

    updateMagnet(dt) {
        if (!this.player || this.player.activePowerupType !== 'magnet') return;
        const pos = this.player.mesh.position;
        this.stickmen.forEach(s => {
            if (!s.isTagged && !s.isFrozen && !s.isTeammate) {
                const dist = pos.distanceTo(s.mesh.position);
                if (dist < 18 && dist > 2) {
                    const dir = pos.clone().sub(s.mesh.position).normalize();
                    s.mesh.position.addScaledVector(dir, dt * 4);
                }
            }
        });
    }

    createFreezeWave(position) {
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.5, 1, 32),
            new THREE.MeshBasicMaterial({ color: 0x74b9ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
        );
        ring.position.copy(position); ring.position.y = 0.5; ring.rotation.x = -Math.PI / 2;
        this.scene.add(ring);
        const expand = () => {
            ring.scale.multiplyScalar(1.15); ring.material.opacity *= 0.92;
            if (ring.material.opacity < 0.01) { this.scene.remove(ring); return; }
            requestAnimationFrame(expand);
        };
        expand();
    }

    createFreezeExplosion(position) {
        const geo = new THREE.IcosahedronGeometry(0.1, 0);
        const mat = new THREE.MeshBasicMaterial({ color: 0x74b9ff });
        for (let i = 0; i < 12; i++) {
            const p = new THREE.Mesh(geo, mat.clone());
            p.position.copy(position); p.position.y += 1;
            const vel = new THREE.Vector3((Math.random() - 0.5) * 0.3, Math.random() * 0.3, (Math.random() - 0.5) * 0.3);
            this.scene.add(p);
            const anim = () => {
                p.position.add(vel); vel.y -= 0.008; p.scale.multiplyScalar(0.93);
                if (p.scale.x < 0.01) { this.scene.remove(p); return; }
                requestAnimationFrame(anim);
            };
            anim();
        }
    }

    // ---- COINS ----
    spawnCoinBurst(position, count) {
        for (let i = 0; i < count; i++) {
            const coin = new THREE.Mesh(
                new THREE.CylinderGeometry(0.25, 0.25, 0.08, 12),
                new THREE.MeshStandardMaterial({ color: 0xfcc419, emissive: 0xf59f00, emissiveIntensity: 0.5, metalness: 0.6, roughness: 0.2 })
            );
            coin.position.copy(position); coin.position.y += 1; coin.rotation.x = Math.PI / 2;
            this.scene.add(coin);
            const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
            this.arenaCoins.push({
                mesh: coin,
                vel: new THREE.Vector3(Math.cos(angle) * (1.5 + Math.random()), 3 + Math.random() * 2, Math.sin(angle) * (1.5 + Math.random())),
                life: 8, grounded: false, bobOffset: Math.random() * Math.PI * 2,
            });
        }
    }

    spawnArenaCoin(x, z) {
        const coin = new THREE.Mesh(
            new THREE.CylinderGeometry(0.3, 0.3, 0.1, 12),
            new THREE.MeshStandardMaterial({ color: 0xfcc419, emissive: 0xf59f00, emissiveIntensity: 0.4, metalness: 0.6, roughness: 0.2 })
        );
        coin.position.set(x, 1.2, z); coin.rotation.x = Math.PI / 2;
        this.scene.add(coin);
        this.arenaCoins.push({ mesh: coin, vel: new THREE.Vector3(), life: 999, grounded: true, bobOffset: Math.random() * Math.PI * 2 });
    }

    spawnArenaCoins() {
        for (let i = 0; i < 20; i++) this.spawnArenaCoin((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60);
    }

    updateArenaCoins(dt) {
        if (!this.player) return;
        this.coinSpawnTimer -= dt;
        if (this.coinSpawnTimer <= 0 && this.arenaCoins.length < 30) {
            this.spawnArenaCoin((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60);
            this.coinSpawnTimer = 3 + Math.random() * 4;
        }
        for (let i = this.arenaCoins.length - 1; i >= 0; i--) {
            const c = this.arenaCoins[i];
            c.life -= dt;
            if (!c.grounded) {
                c.vel.y -= 15 * dt;
                c.mesh.position.addScaledVector(c.vel, dt);
                c.vel.multiplyScalar(0.98);
                if (c.mesh.position.y <= 1.0) { c.mesh.position.y = 1.0; c.vel.set(0, 0, 0); c.grounded = true; }
            }
            c.mesh.rotation.z += dt * 3;
            if (c.grounded) c.mesh.position.y = 1.0 + Math.sin(this.gameTime * 2 + c.bobOffset) * 0.15;

            if (this.player.mesh.position.distanceTo(c.mesh.position) < 1.8) {
                this.sessionCoins++;
                this.currency.addCoins(1);
                this.playSynthSound('coin');
                this.scene.remove(c.mesh);
                this.arenaCoins.splice(i, 1);
                continue;
            }
            if (c.life <= 0) { this.scene.remove(c.mesh); this.arenaCoins.splice(i, 1); }
        }
    }

    updatePowerupHUD() {
        if (!this.player) return;
        for (let i = 0; i < 3; i++) {
            const el = this.powerupSlotEls[i];
            const type = this.player.powerupSlots[i];
            if (type) {
                el.classList.add('filled');
                el.childNodes[0].textContent = POWERUP_TYPES[type].emoji;
            } else {
                el.classList.remove('filled');
                el.childNodes[0].textContent = '';
            }
        }
        if (this.player.activePowerupType) {
            const def = POWERUP_TYPES[this.player.activePowerupType];
            this.powerupActive.style.display = 'flex';
            this.powerupActiveName.textContent = `${def.emoji} ${def.label}`;
            this.powerupTimerFill.style.width = `${(this.player.powerupTimer / def.duration) * 100}%`;
        } else {
            this.powerupActive.style.display = 'none';
        }
    }

    // ---- MOBILE ----
    initMobileControls() {
        if (window.nipplejs) {
            const moveZone = document.getElementById('mobile-move-zone');
            if (moveZone) {
                this.joystickManager = nipplejs.create({ zone: moveZone, mode: 'dynamic', color: 'rgba(18, 203, 196, 0.5)', size: 120, fadeTime: 100 });
                this._mobileMoveX = 0; this._mobileMoveY = 0;
                this.joystickManager.on('move', (_, data) => {
                    const d = Math.min(data.distance, 50) / 50;
                    this._mobileMoveX = Math.cos(data.angle.radian) * d;
                    this._mobileMoveY = Math.sin(data.angle.radian) * d;
                    if (this.player) { this.player.mobileMove.x = this._mobileMoveX; this.player.mobileMove.y = this._mobileMoveY; }
                });
                this.joystickManager.on('end', () => {
                    this._mobileMoveX = 0; this._mobileMoveY = 0;
                    if (this.player) this.player.mobileMove.set(0, 0);
                });
            }
        }

        let lastTouchX = 0, lastTouchY = 0, cameraTouchId = null;
        document.addEventListener('touchstart', (e) => {
            if (!this.isRunning) return;
            for (const t of e.changedTouches) {
                if (t.clientX > window.innerWidth * 0.5 && !e.target.closest('#action-buttons')) {
                    cameraTouchId = t.identifier; lastTouchX = t.clientX; lastTouchY = t.clientY; break;
                }
            }
        }, { passive: true });
        document.addEventListener('touchmove', (e) => {
            if (!this.isRunning || !this.player || cameraTouchId === null) return;
            for (const t of e.changedTouches) {
                if (t.identifier === cameraTouchId) {
                    this.player.yaw -= (t.clientX - lastTouchX) * 0.006;
                    this.player.pitch -= (t.clientY - lastTouchY) * 0.004;
                    this.player.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, this.player.pitch));
                    lastTouchX = t.clientX; lastTouchY = t.clientY; break;
                }
            }
        }, { passive: true });
        document.addEventListener('touchend', (e) => { for (const t of e.changedTouches) { if (t.identifier === cameraTouchId) { cameraTouchId = null; break; } } });

        document.getElementById('btn-jump')?.addEventListener('touchstart', (e) => { e.preventDefault(); if (this.player) this.player.mobileJumpTrigger = true; });
        const sprintBtn = document.getElementById('btn-sprint');
        sprintBtn?.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (this.player) { this.player.mobileSprintToggle = !this.player.mobileSprintToggle; sprintBtn.classList.toggle('active-sprint', this.player.mobileSprintToggle); }
        });
        document.getElementById('btn-tag')?.addEventListener('touchstart', (e) => { e.preventDefault(); this.attemptTag(); });
        document.getElementById('btn-slide')?.addEventListener('touchstart', (e) => { e.preventDefault(); if (this.player) this.player.mobileSlideTrigger = true; });
    }

    bindMobileJoystickToPlayer() {}

    // ---- PARTICLES ----
    spawnDust(position, color = 0xcccccc) {
        const geo = new THREE.SphereGeometry(0.08, 4, 4);
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 });
        for (let i = 0; i < 4; i++) {
            const p = new THREE.Mesh(geo, mat.clone());
            p.position.copy(position); p.position.y += 0.1;
            this.scene.add(p);
            this.dustParticles.push({ mesh: p, vel: new THREE.Vector3((Math.random() - 0.5) * 0.15, Math.random() * 0.1, (Math.random() - 0.5) * 0.15), life: 0.5 });
        }
    }

    spawnTrail(position, color = 0xff6b6b) {
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 4), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35 }));
        p.position.copy(position); p.position.y += 0.5;
        this.scene.add(p);
        this.trailParticles.push({ mesh: p, life: 0.3 });
    }

    updateParticles(dt) {
        for (let i = this.dustParticles.length - 1; i >= 0; i--) {
            const d = this.dustParticles[i];
            d.life -= dt; d.mesh.position.add(d.vel); d.vel.y -= 0.005;
            d.mesh.material.opacity = Math.max(0, d.life); d.mesh.scale.multiplyScalar(0.96);
            if (d.life <= 0) { this.scene.remove(d.mesh); this.dustParticles.splice(i, 1); }
        }
        for (let i = this.trailParticles.length - 1; i >= 0; i--) {
            const t = this.trailParticles[i];
            t.life -= dt; t.mesh.material.opacity = Math.max(0, t.life); t.mesh.scale.multiplyScalar(0.93);
            if (t.life <= 0) { this.scene.remove(t.mesh); this.trailParticles.splice(i, 1); }
        }
    }

    createTagExplosion(position, colorHex) {
        const geo = new THREE.IcosahedronGeometry(0.15, 0);
        const mat = new THREE.MeshStandardMaterial({ color: colorHex, emissive: colorHex, emissiveIntensity: 1.5 });
        this.renderer.domElement.classList.add('screen-shake');
        setTimeout(() => this.renderer.domElement.classList.remove('screen-shake'), 300);
        for (let i = 0; i < 30; i++) {
            const p = new THREE.Mesh(geo, mat);
            p.position.copy(position);
            const vel = new THREE.Vector3((Math.random() - 0.5) * 0.5, Math.random() * 0.5, (Math.random() - 0.5) * 0.5);
            this.scene.add(p);
            const anim = () => {
                p.position.add(vel); vel.y -= 0.012; p.scale.multiplyScalar(0.91);
                p.rotation.x += 0.1; p.rotation.y += 0.15;
                if (p.scale.x < 0.01) this.scene.remove(p); else requestAnimationFrame(anim);
            };
            anim();
        }
    }

    // ---- TAG ----
    attemptTag() {
        if (!this.player || this.gameEnded) return;

        const targets = this.gameMode === 'worldcup' ? this.wcEnemyRunners : this.stickmen;

        for (let s of targets) {
            if (!s.isTagged) {
                if (this.player.mesh.position.distanceTo(s.mesh.position) < CONFIG.tag_distance) {
                    const pos = s.mesh.position.clone();
                    s.tag();
                    this.taggedCount++;
                    this.scoreDisplay.innerText = `Tagged: ${this.taggedCount} / ${this.totalStickmen}`;
                    this.playSynthSound('tag');
                    this.createTagExplosion(pos, 0xfcc419);
                    this.spawnCoinBurst(pos, CONFIG.coins_per_enemy);
                    setTimeout(() => s.destroy(), 200);

                    if (this.taggedCount >= this.totalStickmen) this.endGame('win');
                    break;
                }
            }
        }
    }

    // ---- WORLD CUP UPDATE ----
    updateWorldCup(dt) {
        if (!this.player) return;

        // Enemy runners try to tag teammates
        for (const runner of this.wcEnemyRunners) {
            if (runner.isTagged) continue;
            for (let i = this.wcTeammates.length - 1; i >= 0; i--) {
                const tm = this.wcTeammates[i];
                if (tm.isTagged) continue;
                if (runner.mesh.position.distanceTo(tm.mesh.position) < 3.0) {
                    tm.tag();
                    this.wcLives--;
                    this.updateLivesDisplay();
                    this.createTagExplosion(tm.mesh.position, 0xff6b6b);
                    this.playSynthSound('tag');
                    setTimeout(() => tm.destroy(), 200);

                    if (this.wcLives <= 0) {
                        this.endGame('lose');
                        return;
                    }
                    break;
                }
            }
        }
    }

    // ---- END GAME ----
    endGame(type) {
        if (this.gameEnded) return;
        this.gameEnded = true;
        this.isRunning = false;

        if (type === 'win') this.showWinMenu();
        else this.showLoseMenu();

        setTimeout(() => { if (document.pointerLockElement) document.exitPointerLock(); }, 100);
    }

    createEndOverlay(html) {
        const overlay = document.createElement('div');
        overlay.id = 'win-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.45);backdrop-filter:blur(8px);display:flex;justify-content:center;align-items:center;z-index:9999;pointer-events:auto;flex-direction:column;text-align:center;';
        overlay.innerHTML = html;
        document.body.appendChild(overlay);
        document.getElementById('ea-retry')?.addEventListener('click', () => this.restartGame('retry'));
        document.getElementById('ea-menu')?.addEventListener('click', () => this.restartGame('menu'));
        document.getElementById('ea-next')?.addEventListener('click', () => this.nextLevel());
        return overlay;
    }

    showLoseMenu() {
        const info = this.gameMode === 'worldcup'
            ? 'Your team was eliminated!'
            : `Ran out of time — ${this.taggedCount}/${this.totalStickmen} tagged`;

        this.createEndOverlay(`
            <div class="win-card">
                <h2 class="neon-text lose-title">GAME OVER</h2>
                <p class="bonus-text">${info}</p>
                <div class="coin-display">\uD83E\uDE99 ${this.sessionCoins} collected</div>
                <div class="end-actions">
                    <button class="btn-play-again" id="ea-retry">TRY AGAIN</button>
                    <button class="btn-change-mods" id="ea-menu">MAIN MENU</button>
                </div>
            </div>
        `);
    }

    showWinMenu() {
        const timeBonus = this.gameMode === 'normal' ? Math.max(0, Math.floor(this.timeRemaining)) : 20;
        this.currency.addCoins(timeBonus);

        // Chapter completion reward
        let chapterReward = 0;
        if (this.gameMode === 'normal') {
            const { chapter, levelInChapter } = getChapterForLevel(this.level);
            if (levelInChapter === CHAPTERS[chapter].levels) {
                chapterReward = CHAPTERS[chapter].reward;
                this.currency.addCoins(chapterReward);
            }
        }

        const totalEarned = this.sessionCoins + timeBonus + chapterReward;
        const chapterLine = chapterReward > 0 ? `<div style="color:#667eea;font-size:1.1em;font-weight:800;margin:6px 0;">\uD83C\uDF89 Chapter Complete! +${chapterReward} bonus</div>` : '';

        const title = this.gameMode === 'worldcup' ? 'WORLD CUP WIN!' : `LEVEL ${this.level} CLEARED!`;

        this.createEndOverlay(`
            <div class="win-card">
                <h2 class="neon-text">${title}</h2>
                <div class="coin-display"><span id="counter">0</span></div>
                <p class="bonus-text">${this.sessionCoins} collected + ${timeBonus} time bonus | ${this.gameTime.toFixed(1)}s</p>
                ${chapterLine}
                <div class="end-actions">
                    ${this.gameMode === 'normal' && this.level < TOTAL_LEVELS ? '<button class="btn-play-again" id="ea-next" style="background:linear-gradient(135deg,#fcc419,#f59f00);box-shadow:0 4px 0 #e67e22;">NEXT LEVEL</button>' : ''}
                    <button class="btn-play-again" id="ea-retry">REPLAY</button>
                    <button class="btn-change-mods" id="ea-menu">MENU</button>
                </div>
            </div>
        `);

        let current = 0;
        const counter = document.getElementById('counter');
        const interval = setInterval(() => {
            current += Math.ceil(totalEarned / 20);
            if (current >= totalEarned) { current = totalEarned; clearInterval(interval); this.playSynthSound('powerup'); }
            if (counter) counter.innerText = `+${current} coins`;
        }, 30);
    }

    nextLevel() {
        if (this.level < TOTAL_LEVELS) {
            this.level++;
            localStorage.setItem('stickman_level', this.level);
        }
        this.restartGame('retry');
    }

    restartGame(action) {
        const overlay = document.getElementById('win-overlay');
        if (overlay) overlay.remove();

        // Cleanup
        if (this.player) { this.player.destroy(); this.player = null; }
        if (this.arena) { this.arena.destroy(); this.arena = null; }
        if (this.stickmen) { this.stickmen.forEach(s => s.destroy()); this.stickmen = []; }
        if (this.parkourElements) { this.parkourElements.forEach(p => p.destroy()); this.parkourElements = []; }
        this.activePowerups.forEach(p => this.scene.remove(p)); this.activePowerups = [];
        this.activeTraps.forEach(t => this.scene.remove(t.mesh)); this.activeTraps = [];
        this.arenaCoins.forEach(c => this.scene.remove(c.mesh)); this.arenaCoins = [];
        this.dustParticles.forEach(d => this.scene.remove(d.mesh)); this.dustParticles = [];
        this.trailParticles.forEach(t => this.scene.remove(t.mesh)); this.trailParticles = [];
        this.allColliders = [];
        this.wcTeammates = [];
        this.wcEnemyRunners = [];

        this.isRunning = false;
        this.taggedCount = 0;
        this.totalStickmen = CONFIG.total_stickmen;
        this.gameTime = 0;
        this.powerupSpawnTimer = CONFIG.powerup_initial_spawn_delay;
        this.gameObjectsCreated = false;
        this.gameEnded = false;
        this.sessionCoins = 0;
        this.coinSpawnTimer = 0;
        this.wcLives = 5;

        this.hud.style.display = 'none';
        this.wcBanner.style.display = 'none';
        this.powerupActive.style.display = 'none';
        document.getElementById('wc-lives').style.display = 'none';

        if (action === 'menu') {
            this.mods.unlock();
            this.showMainMenu();
        } else {
            // retry same level
            this.startGame();
            if (window.innerWidth > 768) document.body.requestPointerLock();
        }
    }

    // ---- POWERUP SPAWNING ----
    spawnPowerup() {
        const typeKey = POWERUP_KEYS[Math.floor(Math.random() * POWERUP_KEYS.length)];
        const def = POWERUP_TYPES[typeKey];
        const mesh = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.7),
            new THREE.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 0.6, roughness: 0.3 })
        );
        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(1.0, 0.04, 8, 24),
            new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.35 })
        );
        ring.rotation.x = Math.PI / 2;
        mesh.add(ring);
        mesh.position.set((Math.random() - 0.5) * 60, 1.5, (Math.random() - 0.5) * 60);
        mesh.userData.powerupType = typeKey;
        this.scene.add(mesh);
        this.activePowerups.push(mesh);
    }

    // ---- SOUNDS ----
    playSynthSound(type) {
        if (!this.audioCtx) return;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.connect(gain); gain.connect(this.audioCtx.destination);
        const t = this.audioCtx.currentTime;

        if (type === 'tag') {
            osc.frequency.setValueAtTime(400, t); osc.frequency.exponentialRampToValueAtTime(1200, t + 0.1);
            gain.gain.setValueAtTime(0.3, t); gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
            osc.start(); osc.stop(t + 0.2);
        } else if (type === 'powerup') {
            osc.type = 'sine'; osc.frequency.setValueAtTime(800, t); osc.frequency.exponentialRampToValueAtTime(1600, t + 0.3);
            gain.gain.setValueAtTime(0.35, t); gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
            osc.start(); osc.stop(t + 0.3);
        } else if (type === 'jump') {
            osc.type = 'sine'; osc.frequency.setValueAtTime(300, t); osc.frequency.exponentialRampToValueAtTime(600, t + 0.08);
            gain.gain.setValueAtTime(0.15, t); gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
            osc.start(); osc.stop(t + 0.1);
        } else if (type === 'slide') {
            osc.type = 'sawtooth'; osc.frequency.setValueAtTime(200, t); osc.frequency.exponentialRampToValueAtTime(100, t + 0.15);
            gain.gain.setValueAtTime(0.1, t); gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
            osc.start(); osc.stop(t + 0.2);
        } else if (type === 'walljump') {
            osc.type = 'square'; osc.frequency.setValueAtTime(500, t); osc.frequency.exponentialRampToValueAtTime(900, t + 0.1);
            gain.gain.setValueAtTime(0.15, t); gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
            osc.start(); osc.stop(t + 0.15);
        } else if (type === 'vault') {
            osc.type = 'sine'; osc.frequency.setValueAtTime(350, t); osc.frequency.exponentialRampToValueAtTime(700, t + 0.12);
            gain.gain.setValueAtTime(0.12, t); gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
            osc.start(); osc.stop(t + 0.15);
        } else if (type === 'trap') {
            osc.type = 'triangle'; osc.frequency.setValueAtTime(600, t); osc.frequency.exponentialRampToValueAtTime(200, t + 0.2);
            gain.gain.setValueAtTime(0.25, t); gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
            osc.start(); osc.stop(t + 0.25);
        } else if (type === 'freeze') {
            osc.type = 'sine'; osc.frequency.setValueAtTime(1200, t); osc.frequency.exponentialRampToValueAtTime(400, t + 0.3);
            gain.gain.setValueAtTime(0.3, t); gain.gain.exponentialRampToValueAtTime(0.01, t + 0.35);
            osc.start(); osc.stop(t + 0.35);
        } else if (type === 'coin') {
            osc.type = 'sine'; osc.frequency.setValueAtTime(1400, t); osc.frequency.exponentialRampToValueAtTime(1800, t + 0.06);
            gain.gain.setValueAtTime(0.2, t); gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
            osc.start(); osc.stop(t + 0.1);
        }
    }

    updateParkourHUD() {
        const p = this.player;
        this.doubleJumpIcon.className = 'parkour-icon ' + (p.canDoubleJump && !p.isGrounded ? 'ready' : (p.hasDoubleJumped ? 'used' : ''));
        this.wallJumpIcon.className = 'parkour-icon ' + (p.isNearWall && !p.isGrounded ? 'ready' : '');
        this.slideIcon.className = 'parkour-icon ' + (p.isSliding ? 'used' : (p.isGrounded ? 'ready' : ''));
    }

    // ---- MAIN LOOP ----
    animate() {
        requestAnimationFrame(() => this.animate());
        const dt = Math.min(this.clock.getDelta(), 0.1);

        if (this.isRunning && this.player) {
            this.gameTime += dt;

            // Normal mode timer
            if (this.gameMode === 'normal') {
                this.timeRemaining -= dt;
                this.timeDisplay.innerText = `${Math.max(0, Math.ceil(this.timeRemaining))}s`;
                if (this.timeRemaining <= 0 && !this.gameEnded) {
                    this.endGame('lose');
                    return;
                }
            }

            const prevGrounded = this.player.isGrounded;
            this.player.update(dt, this.allColliders);

            if (this.player.isGrounded && !prevGrounded && this.player.velocity.y <= 0)
                this.spawnDust(this.player.mesh.position, 0xbbbbbb);
            if (this.player.isSprinting && this.player.isGrounded) {
                if (Math.random() < 0.3) this.spawnTrail(this.player.mesh.position, 0xff6b6b);
                if (Math.random() < 0.15) this.spawnDust(this.player.mesh.position, 0x999999);
            }

            this.speedLines.classList.remove('active');

            if (this.player.justJumped) { this.playSynthSound('jump'); this.player.justJumped = false; }
            if (this.player.justWallJumped) { this.playSynthSound('walljump'); this.spawnDust(this.player.mesh.position, 0x339af0); this.player.justWallJumped = false; }
            if (this.player.justSlid) { this.playSynthSound('slide'); this.player.justSlid = false; }
            if (this.player.justVaulted) { this.playSynthSound('vault'); this.spawnDust(this.player.mesh.position, 0xfcc419); this.player.justVaulted = false; }
            if (this.player.justUsedPowerup) this.player.justUsedPowerup = null;

            // World Cup
            if (this.gameMode === 'worldcup') this.updateWorldCup(dt);

            // Powerups
            this.powerupSpawnTimer -= dt;
            const maxPU = this.mods.has('chaos') ? 8 : CONFIG.max_active_powerups;
            const spawnInt = this.mods.has('chaos') ? 3.0 : CONFIG.powerup_spawn_interval;
            if (this.powerupSpawnTimer <= 0 && this.activePowerups.length < maxPU) {
                this.spawnPowerup();
                this.powerupSpawnTimer = spawnInt + Math.random() * 3;
            }

            for (let i = this.activePowerups.length - 1; i >= 0; i--) {
                const p = this.activePowerups[i];
                p.rotation.y += dt * 2;
                p.position.y = 1.5 + Math.sin(this.gameTime * 3 + i) * 0.3;
                if (this.player.mesh.position.distanceTo(p.position) < CONFIG.powerup_pickup_distance) {
                    if (this.player.collectPowerup(p.userData.powerupType)) {
                        this.playSynthSound('powerup');
                        this.scene.remove(p);
                        this.activePowerups.splice(i, 1);
                        this.updatePowerupHUD();
                    }
                }
            }

            this.updateTraps(dt);
            this.updateMagnet(dt);
            this.updateArenaCoins(dt);
            this.updatePowerupHUD();

            // Stamina bar
            this.staminaBar.style.width = `${this.player.stamina}%`;
            if (this.player.activePowerupType === 'speed') this.staminaBar.style.background = 'linear-gradient(90deg, #fcc419, #ff922b)';
            else if (this.player.activePowerupType === 'magnet') this.staminaBar.style.background = 'linear-gradient(90deg, #a29bfe, #6c5ce7)';
            else if (this.player.stamina < 20) this.staminaBar.style.background = 'linear-gradient(90deg, #ff6b6b, #ee5a24)';
            else this.staminaBar.style.background = 'linear-gradient(90deg, #12CBC4, #0abde3)';

            // Ghost mod
            if (this.mods.has('ghost')) {
                this.stickmen.forEach(s => {
                    if (!s.isTagged && !s.isTeammate) s.bodyGroup.visible = (Math.sin(this.gameTime * 3 + s.mesh.id) * 0.5 + 0.5) > 0.3;
                });
            }

            this.stickmen.forEach(s => s.update(dt, this.allColliders, this.player.mesh));
            this.updateParticles(dt);
            this.updateParkourHUD();
        }

        this.composer.render();
    }
}

window.onload = () => new Game();
