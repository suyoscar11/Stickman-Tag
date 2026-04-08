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

// Powerup type definitions
const POWERUP_TYPES = {
    freeze: { emoji: '\u2744\uFE0F', label: 'FREEZE', color: 0x74b9ff, duration: 4, desc: 'Freeze nearby enemies' },
    trap:   { emoji: '\uD83E\uDEA4', label: 'TRAP', color: 0xfdcb6e, duration: 0, desc: 'Place a trap on the ground' },
    speed:  { emoji: '\u26A1', label: 'SPEED', color: 0xff7675, duration: 6, desc: 'Burst of speed' },
    magnet: { emoji: '\uD83E\uDDF2', label: 'MAGNET', color: 0xa29bfe, duration: 5, desc: 'Pull enemies closer' },
};

const POWERUP_KEYS = Object.keys(POWERUP_TYPES);

// --- CURRENCY ---
class CurrencyManager {
    constructor() {
        this.coins = parseInt(localStorage.getItem('stickman_coins')) || 0;
        this.unlockedSkins = JSON.parse(localStorage.getItem('stickman_skins')) || ['default'];
        this.activeSkin = localStorage.getItem('stickman_active_skin') || 'default';
        this.updateHUD();
    }
    addCoins(amount) {
        this.coins += amount;
        this.save();
        this.updateHUD();
    }
    save() {
        localStorage.setItem('stickman_coins', this.coins);
        localStorage.setItem('stickman_skins', JSON.stringify(this.unlockedSkins));
        localStorage.setItem('stickman_active_skin', this.activeSkin);
    }
    updateHUD() {
        let el = document.getElementById('coin-hud');
        if (!el) {
            el = document.createElement('div');
            el.id = 'coin-hud';
            el.style.cssText = 'position:absolute;top:16px;right:16px;background:rgba(255,255,255,0.92);color:#f59f00;font-size:16px;font-weight:800;padding:8px 14px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.1);z-index:100;';
            document.body.appendChild(el);
        }
        el.innerText = `\uD83E\uDE99 ${this.coins}`;
    }
}

// --- MOD MANAGER ---
class ModManager {
    constructor() {
        this.activeMods = new Set();
        this.locked = false; // When true, mods cannot be changed
        this.modEffects = {
            speed: { label: 'SPEED' },
            lowgrav: { label: 'LOW GRAV' },
            ghost: { label: 'GHOST' },
            bighead: { label: 'BIG HEAD' },
            chaos: { label: 'CHAOS' },
            mirror: { label: 'MIRROR' },
            worldcup: { label: 'WORLD CUP' },
        };
        this.initUI();
    }
    initUI() {
        this.countEl = document.getElementById('mod-count');
        this.modBtns = document.querySelectorAll('.mod-btn');
        this.modBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.locked) return; // Prevent changes during gameplay
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
    lock() {
        this.locked = true;
        this.modBtns.forEach(btn => btn.style.opacity = '0.5');
        this.modBtns.forEach(btn => btn.style.pointerEvents = 'none');
    }
    unlock() {
        this.locked = false;
        this.modBtns.forEach(btn => btn.style.opacity = '');
        this.modBtns.forEach(btn => btn.style.pointerEvents = '');
    }
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
            tag.textContent = this.modEffects[mod].label;
            display.appendChild(tag);
        });
    }
}

// --- MAIN GAME ---
export default class Game {
    constructor() {
        this.clock = new THREE.Clock();
        this.isRunning = false;
        this.taggedCount = 0;
        this.totalStickmen = CONFIG.total_stickmen;
        this.gameTime = 0;

        // Level progression
        this.level = parseInt(localStorage.getItem('stickman_level')) || 1;
        this.allColliders = [];
        this.activePowerups = [];
        this.powerupSpawnTimer = CONFIG.powerup_initial_spawn_delay;
        this.dustParticles = [];
        this.trailParticles = [];
        this.gameObjectsCreated = false;
        this.gameEnded = false;

        // Traps placed in world
        this.activeTraps = [];

        // Floating collectible coins in arena
        this.arenaCoins = [];
        this.coinSpawnTimer = 0;
        this.sessionCoins = 0; // Coins earned this round

        // World Cup state
        this.wcPhase = 'evade';
        this.wcTimer = 60;
        this.wcChaser = null;
        this.wcPlayerTagged = false;

        this.mods = new ModManager();
        this.currency = new CurrencyManager();

        this.initThree();
        this.initUI();
        this.updateStartSubtitle();
        this.bindEvents();
        this.initMobileControls();
        this.animate();
    }

    initThree() {
        this.scene = new THREE.Scene();
        // Bright sky blue background for day mode
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
        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            0.3, 0.4, 0.9
        );
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(renderScene);
        this.composer.addPass(bloomPass);

        // Bright ambient light for day mode
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));

        // Sun-like directional light
        const dirLight = new THREE.DirectionalLight(0xfff5e6, 1.8);
        dirLight.position.set(30, 60, 25);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.near = 1;
        dirLight.shadow.camera.far = 120;
        dirLight.shadow.camera.left = -50;
        dirLight.shadow.camera.right = 50;
        dirLight.shadow.camera.top = 50;
        dirLight.shadow.camera.bottom = -50;
        this.scene.add(dirLight);

        // Soft fill light from opposite side
        const fillLight = new THREE.DirectionalLight(0xb3d9ff, 0.4);
        fillLight.position.set(-20, 15, -20);
        this.scene.add(fillLight);

        // Warm accent lights
        const pl1 = new THREE.PointLight(0xffeaa7, 0.3, 50);
        pl1.position.set(20, 10, 20);
        this.scene.add(pl1);
        const pl2 = new THREE.PointLight(0x81ecec, 0.3, 50);
        pl2.position.set(-20, 10, -20);
        this.scene.add(pl2);

        // Hemisphere light for natural sky/ground ambient
        const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x6abf4b, 0.3);
        this.scene.add(hemiLight);
    }

    getLevelConfig() {
        const lvl = this.level;
        return {
            stickmen: Math.min(CONFIG.total_stickmen + Math.floor((lvl - 1) * 1.5), 20),
            enemySpeedBonus: Math.min((lvl - 1) * 0.5, 4),
            fleeDistanceBonus: Math.min((lvl - 1) * 1, 8),
        };
    }

    initGameObjects() {
        if (this.gameObjectsCreated) return;
        this.gameObjectsCreated = true;

        const lvlCfg = this.getLevelConfig();

        this.player = new Player(this.scene, this.camera, CONFIG, this.mods);
        this.arena = new Arena(this.scene);

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

        if (this.mods.has('worldcup')) {
            this.wcChaser = new Stickman(this.scene, 30, 30, CONFIG, this.mods);
            this.wcChaser.setChaseMode(true);
            this.stickmen.push(this.wcChaser);
            this.totalStickmen = 1;
            this.wcPhase = 'evade';
            this.wcTimer = 60;
            this.wcPlayerTagged = false;
        } else {
            this.totalStickmen = lvlCfg.stickmen;
            for (let i = 0; i < this.totalStickmen; i++) {
                const x = (Math.random() - 0.5) * 60;
                const z = (Math.random() - 0.5) * 60;
                const s = new Stickman(this.scene, x, z, CONFIG, this.mods);
                // Apply level scaling
                s.speed += lvlCfg.enemySpeedBonus;
                s.runSpeed += lvlCfg.enemySpeedBonus;
                s.fleeDistance += lvlCfg.fleeDistanceBonus;
                this.stickmen.push(s);
            }
        }

        this.bindMobileJoystickToPlayer();

        // Scatter initial coins around the arena
        this.spawnArenaCoins();
    }

    updateStartSubtitle() {
        const subtitle = document.getElementById('start-subtitle');
        if (subtitle) subtitle.textContent = `Level ${this.level} \u2014 Tag ${this.getLevelConfig().stickmen} Players`;
    }

    initUI() {
        this.startScreen = document.getElementById('start-screen');
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

    bindEvents() {
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.composer.setSize(window.innerWidth, window.innerHeight);
        });

        const playBtn = document.getElementById('play-btn');
        if (playBtn) {
            playBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (window.innerWidth > 768) document.body.requestPointerLock();
                else this.startGame();
            });
        }

        this.startScreen.addEventListener('click', (e) => {
            if (e.target.id === 'play-btn' || e.target.classList.contains('mod-btn')) return;
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

        // Powerup slot keys (1, 2, 3)
        document.addEventListener('keydown', (e) => {
            if (!this.isRunning || !this.player) return;
            if (e.key === '1') this.usePowerupSlot(0);
            else if (e.key === '2') this.usePowerupSlot(1);
            else if (e.key === '3') this.usePowerupSlot(2);
        });

        // Click powerup slots
        this.powerupSlotEls.forEach((el, i) => {
            el.addEventListener('click', () => {
                if (this.isRunning && this.player) this.usePowerupSlot(i);
            });
        });
    }

    startGame() {
        this.initGameObjects();

        this.isRunning = true;
        this.mods.lock();
        this.startScreen.style.display = 'none';
        this.hud.style.display = 'block';
        this.mods.showActiveModsHUD();

        this.levelDisplay.innerText = `Lv. ${this.level}`;

        if (this.mods.has('worldcup')) {
            this.wcBanner.style.display = 'flex';
            this.scoreDisplay.innerText = 'SURVIVE!';
        } else {
            this.scoreDisplay.innerText = `Tagged: ${this.taggedCount} / ${this.totalStickmen}`;
        }

        if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    pauseGame() {
        this.isRunning = false;
        this.startScreen.style.display = 'flex';
    }

    // --- POWERUP SYSTEM ---
    usePowerupSlot(index) {
        if (!this.player) return;
        const type = this.player.usePowerup(index);
        if (!type) return;

        this.playSynthSound('powerup');

        if (type === 'freeze') {
            // Freeze all enemies within 15 units
            const pos = this.player.mesh.position;
            let frozenCount = 0;
            this.stickmen.forEach(s => {
                if (!s.isTagged && !s.isFrozen && pos.distanceTo(s.mesh.position) < 15) {
                    s.freeze(POWERUP_TYPES.freeze.duration);
                    frozenCount++;
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
        // speed is handled in Player.usePowerup

        this.updatePowerupHUD();
    }

    placeTrap(position) {
        position.y = 0.05;
        // Trap visual: flat disc on the ground
        const trapGroup = new THREE.Group();

        const discGeo = new THREE.CylinderGeometry(1.2, 1.2, 0.1, 16);
        const discMat = new THREE.MeshStandardMaterial({
            color: 0xfdcb6e,
            emissive: 0xf39c12,
            emissiveIntensity: 0.4,
            transparent: true,
            opacity: 0.7,
            roughness: 0.4,
        });
        const disc = new THREE.Mesh(discGeo, discMat);
        trapGroup.add(disc);

        // Warning pattern
        const ringGeo = new THREE.TorusGeometry(0.8, 0.06, 8, 24);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xe17055, transparent: true, opacity: 0.6 });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.06;
        trapGroup.add(ring);

        trapGroup.position.copy(position);
        this.scene.add(trapGroup);
        this.activeTraps.push({ mesh: trapGroup, position: position.clone(), lifetime: 20 });
    }

    updateTraps(dt) {
        for (let i = this.activeTraps.length - 1; i >= 0; i--) {
            const trap = this.activeTraps[i];
            trap.lifetime -= dt;

            // Rotate ring
            if (trap.mesh.children[1]) {
                trap.mesh.children[1].rotation.z += dt * 2;
            }

            // Check if enemy stepped on trap
            for (const s of this.stickmen) {
                if (!s.isTagged && !s.isFrozen) {
                    const dist = trap.position.distanceTo(s.mesh.position);
                    if (dist < 1.5) {
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
            if (!s.isTagged && !s.isFrozen) {
                const dist = pos.distanceTo(s.mesh.position);
                if (dist < 18 && dist > 2) {
                    const dir = pos.clone().sub(s.mesh.position).normalize();
                    s.mesh.position.addScaledVector(dir, dt * 4);
                }
            }
        });
    }

    createFreezeWave(position) {
        const ringGeo = new THREE.RingGeometry(0.5, 1, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x74b9ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.copy(position);
        ring.position.y = 0.5;
        ring.rotation.x = -Math.PI / 2;
        this.scene.add(ring);

        const expand = () => {
            ring.scale.multiplyScalar(1.15);
            ring.material.opacity *= 0.92;
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
            p.position.copy(position);
            p.position.y += 1;
            const vel = new THREE.Vector3((Math.random() - 0.5) * 0.3, Math.random() * 0.3, (Math.random() - 0.5) * 0.3);
            this.scene.add(p);
            const anim = () => {
                p.position.add(vel);
                vel.y -= 0.008;
                p.scale.multiplyScalar(0.93);
                p.material.opacity *= 0.95;
                if (p.scale.x < 0.01) { this.scene.remove(p); return; }
                requestAnimationFrame(anim);
            };
            anim();
        }
    }

    // --- COIN SYSTEM ---
    spawnCoinBurst(position, count) {
        for (let i = 0; i < count; i++) {
            const coinGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.08, 12);
            const coinMat = new THREE.MeshStandardMaterial({
                color: 0xfcc419, emissive: 0xf59f00, emissiveIntensity: 0.5,
                metalness: 0.6, roughness: 0.2,
            });
            const coin = new THREE.Mesh(coinGeo, coinMat);
            coin.position.copy(position);
            coin.position.y += 1;
            coin.rotation.x = Math.PI / 2;
            this.scene.add(coin);

            // Burst outward then float
            const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
            const vel = new THREE.Vector3(
                Math.cos(angle) * (1.5 + Math.random()),
                3 + Math.random() * 2,
                Math.sin(angle) * (1.5 + Math.random())
            );

            this.arenaCoins.push({
                mesh: coin,
                vel: vel,
                life: 8,
                grounded: false,
                bobOffset: Math.random() * Math.PI * 2,
            });
        }
    }

    spawnArenaCoin(x, z) {
        const coinGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.1, 12);
        const coinMat = new THREE.MeshStandardMaterial({
            color: 0xfcc419, emissive: 0xf59f00, emissiveIntensity: 0.4,
            metalness: 0.6, roughness: 0.2,
        });
        const coin = new THREE.Mesh(coinGeo, coinMat);
        coin.position.set(x, 1.2, z);
        coin.rotation.x = Math.PI / 2;
        this.scene.add(coin);

        this.arenaCoins.push({
            mesh: coin,
            vel: new THREE.Vector3(0, 0, 0),
            life: 999,
            grounded: true,
            bobOffset: Math.random() * Math.PI * 2,
        });
    }

    spawnArenaCoins() {
        // Scatter coins around the arena
        for (let i = 0; i < 20; i++) {
            const x = (Math.random() - 0.5) * 60;
            const z = (Math.random() - 0.5) * 60;
            this.spawnArenaCoin(x, z);
        }
    }

    updateArenaCoins(dt) {
        if (!this.player) return;

        // Spawn more coins periodically
        this.coinSpawnTimer -= dt;
        if (this.coinSpawnTimer <= 0 && this.arenaCoins.length < 30) {
            const x = (Math.random() - 0.5) * 60;
            const z = (Math.random() - 0.5) * 60;
            this.spawnArenaCoin(x, z);
            this.coinSpawnTimer = 3 + Math.random() * 4;
        }

        for (let i = this.arenaCoins.length - 1; i >= 0; i--) {
            const c = this.arenaCoins[i];
            c.life -= dt;

            // Physics for burst coins
            if (!c.grounded) {
                c.vel.y -= 15 * dt;
                c.mesh.position.addScaledVector(c.vel, dt);
                c.vel.multiplyScalar(0.98);
                if (c.mesh.position.y <= 1.0) {
                    c.mesh.position.y = 1.0;
                    c.vel.set(0, 0, 0);
                    c.grounded = true;
                }
            }

            // Spin and bob
            c.mesh.rotation.z += dt * 3;
            if (c.grounded) {
                c.mesh.position.y = 1.0 + Math.sin(this.gameTime * 2 + c.bobOffset) * 0.15;
            }

            // Pickup check
            const dist = this.player.mesh.position.distanceTo(c.mesh.position);
            if (dist < 1.8) {
                this.sessionCoins++;
                this.currency.addCoins(1);
                this.playSynthSound('coin');
                this.scene.remove(c.mesh);
                this.arenaCoins.splice(i, 1);
                continue;
            }

            // Expire
            if (c.life <= 0) {
                this.scene.remove(c.mesh);
                this.arenaCoins.splice(i, 1);
            }
        }
    }

    updatePowerupHUD() {
        if (!this.player) return;

        // Update slots
        for (let i = 0; i < 3; i++) {
            const el = this.powerupSlotEls[i];
            const type = this.player.powerupSlots[i];
            if (type) {
                const def = POWERUP_TYPES[type];
                el.classList.add('filled');
                // Set emoji — use first child text node, keep the key label
                el.childNodes[0].textContent = def.emoji;
            } else {
                el.classList.remove('filled');
                el.childNodes[0].textContent = '';
            }
        }

        // Active powerup indicator
        if (this.player.activePowerupType) {
            const def = POWERUP_TYPES[this.player.activePowerupType];
            this.powerupActive.style.display = 'flex';
            this.powerupActiveName.textContent = `${def.emoji} ${def.label}`;
            const pct = (this.player.powerupTimer / def.duration) * 100;
            this.powerupTimerFill.style.width = `${pct}%`;
        } else {
            this.powerupActive.style.display = 'none';
        }
    }

    // --- PUBG-STYLE MOBILE CONTROLS ---
    initMobileControls() {
        if (window.nipplejs) {
            const moveZone = document.getElementById('mobile-move-zone');
            if (moveZone) {
                this.joystickManager = nipplejs.create({
                    zone: moveZone,
                    mode: 'dynamic',
                    color: 'rgba(18, 203, 196, 0.5)',
                    size: 120,
                    fadeTime: 100,
                });
                this._mobileMoveX = 0;
                this._mobileMoveY = 0;

                this.joystickManager.on('move', (evt, data) => {
                    const distance = Math.min(data.distance, 50) / 50;
                    this._mobileMoveX = Math.cos(data.angle.radian) * distance;
                    this._mobileMoveY = Math.sin(data.angle.radian) * distance;
                    if (this.player) {
                        this.player.mobileMove.x = this._mobileMoveX;
                        this.player.mobileMove.y = this._mobileMoveY;
                    }
                });

                this.joystickManager.on('end', () => {
                    this._mobileMoveX = 0;
                    this._mobileMoveY = 0;
                    if (this.player) {
                        this.player.mobileMove.set(0, 0);
                    }
                });
            }
        }

        let lastTouchX = 0, lastTouchY = 0;
        let cameraTouchId = null;

        document.addEventListener('touchstart', (e) => {
            if (!this.isRunning) return;
            for (const touch of e.changedTouches) {
                if (touch.clientX > window.innerWidth * 0.5 && !e.target.closest('#action-buttons')) {
                    cameraTouchId = touch.identifier;
                    lastTouchX = touch.clientX;
                    lastTouchY = touch.clientY;
                    break;
                }
            }
        }, { passive: true });

        document.addEventListener('touchmove', (e) => {
            if (!this.isRunning || !this.player || cameraTouchId === null) return;
            for (const touch of e.changedTouches) {
                if (touch.identifier === cameraTouchId) {
                    const dx = touch.clientX - lastTouchX;
                    const dy = touch.clientY - lastTouchY;
                    this.player.yaw -= dx * 0.006;
                    this.player.pitch -= dy * 0.004;
                    this.player.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, this.player.pitch));
                    lastTouchX = touch.clientX;
                    lastTouchY = touch.clientY;
                    break;
                }
            }
        }, { passive: true });

        document.addEventListener('touchend', (e) => {
            for (const touch of e.changedTouches) {
                if (touch.identifier === cameraTouchId) {
                    cameraTouchId = null;
                    break;
                }
            }
        });

        // Buttons
        document.getElementById('btn-jump')?.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (this.player) this.player.mobileJumpTrigger = true;
        });

        const sprintBtn = document.getElementById('btn-sprint');
        sprintBtn?.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (this.player) {
                this.player.mobileSprintToggle = !this.player.mobileSprintToggle;
                sprintBtn.classList.toggle('active-sprint', this.player.mobileSprintToggle);
            }
        });

        document.getElementById('btn-tag')?.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.attemptTag();
        });

        document.getElementById('btn-slide')?.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (this.player) this.player.mobileSlideTrigger = true;
        });
    }

    bindMobileJoystickToPlayer() {
        // No-op: joystick events already check this.player
    }

    // --- PARTICLES ---
    spawnDust(position, color = 0xcccccc) {
        const geo = new THREE.SphereGeometry(0.08, 4, 4);
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 });
        for (let i = 0; i < 4; i++) {
            const p = new THREE.Mesh(geo, mat.clone());
            p.position.copy(position);
            p.position.y += 0.1;
            const vel = new THREE.Vector3((Math.random() - 0.5) * 0.15, Math.random() * 0.1, (Math.random() - 0.5) * 0.15);
            this.scene.add(p);
            this.dustParticles.push({ mesh: p, vel, life: 0.5 });
        }
    }

    spawnTrail(position, color = 0xff6b6b) {
        const geo = new THREE.SphereGeometry(0.06, 4, 4);
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35 });
        const p = new THREE.Mesh(geo, mat);
        p.position.copy(position);
        p.position.y += 0.5;
        this.scene.add(p);
        this.trailParticles.push({ mesh: p, life: 0.3 });
    }

    updateParticles(dt) {
        for (let i = this.dustParticles.length - 1; i >= 0; i--) {
            const d = this.dustParticles[i];
            d.life -= dt;
            d.mesh.position.add(d.vel);
            d.vel.y -= 0.005;
            d.mesh.material.opacity = Math.max(0, d.life * 1.0);
            d.mesh.scale.multiplyScalar(0.96);
            if (d.life <= 0) { this.scene.remove(d.mesh); this.dustParticles.splice(i, 1); }
        }
        for (let i = this.trailParticles.length - 1; i >= 0; i--) {
            const t = this.trailParticles[i];
            t.life -= dt;
            t.mesh.material.opacity = Math.max(0, t.life);
            t.mesh.scale.multiplyScalar(0.93);
            if (t.life <= 0) { this.scene.remove(t.mesh); this.trailParticles.splice(i, 1); }
        }
    }

    createTagExplosion(position, colorHex) {
        const geometry = new THREE.IcosahedronGeometry(0.15, 0);
        const material = new THREE.MeshStandardMaterial({ color: colorHex, emissive: colorHex, emissiveIntensity: 1.5 });

        const canvas = this.renderer.domElement;
        canvas.classList.add('screen-shake');
        setTimeout(() => canvas.classList.remove('screen-shake'), 300);

        for (let i = 0; i < 30; i++) {
            const particle = new THREE.Mesh(geometry, material);
            particle.position.copy(position);
            const vel = new THREE.Vector3((Math.random() - 0.5) * 0.5, Math.random() * 0.5, (Math.random() - 0.5) * 0.5);
            this.scene.add(particle);
            const anim = () => {
                particle.position.add(vel);
                vel.y -= 0.012;
                particle.scale.multiplyScalar(0.91);
                particle.rotation.x += 0.1;
                particle.rotation.y += 0.15;
                if (particle.scale.x < 0.01) this.scene.remove(particle);
                else requestAnimationFrame(anim);
            };
            anim();
        }
    }

    endGame(type) {
        if (this.gameEnded) return;
        this.gameEnded = true;
        this.isRunning = false;

        if (type === 'win') this.showWinMenu();
        else this.showLoseMenu();

        setTimeout(() => {
            if (document.pointerLockElement) document.exitPointerLock();
        }, 100);
    }

    // --- TAG LOGIC ---
    attemptTag() {
        if (!this.player || this.gameEnded) return;

        if (this.mods.has('worldcup')) {
            if (this.wcPhase !== 'chase') return;
            if (this.wcChaser && !this.wcChaser.isTagged) {
                if (this.player.mesh.position.distanceTo(this.wcChaser.mesh.position) < CONFIG.tag_distance) {
                    this.wcChaser.tag();
                    this.playSynthSound('tag');
                    this.createTagExplosion(this.wcChaser.mesh.position, 0x51cf66);
                    this.endGame('win');
                }
            }
            return;
        }

        for (let stickman of this.stickmen) {
            if (!stickman.isTagged) {
                if (this.player.mesh.position.distanceTo(stickman.mesh.position) < CONFIG.tag_distance) {
                    const pos = stickman.mesh.position.clone();
                    stickman.tag();
                    this.taggedCount++;
                    this.scoreDisplay.innerText = `Tagged: ${this.taggedCount} / ${this.totalStickmen}`;
                    this.playSynthSound('tag');
                    this.createTagExplosion(pos, 0xfcc419);

                    // Spawn coin burst where the enemy was
                    this.spawnCoinBurst(pos, CONFIG.coins_per_enemy);

                    // Fade out and remove the stickman after a short delay
                    setTimeout(() => {
                        stickman.destroy();
                    }, 200);

                    if (this.taggedCount >= this.totalStickmen) {
                        this.endGame('win');
                    }
                    break;
                }
            }
        }
    }

    // --- WORLD CUP LOGIC ---
    updateWorldCup(dt) {
        this.wcTimer -= dt;

        if (this.wcPhase === 'evade') {
            this.wcPhaseLabel.textContent = 'EVADE!';
            this.wcTimerLabel.textContent = `${Math.max(0, Math.ceil(this.wcTimer))}s`;
            this.wcBanner.classList.remove('chase-phase');

            if (this.wcChaser && !this.wcChaser.isTagged) {
                const dist = this.player.mesh.position.distanceTo(this.wcChaser.mesh.position);
                if (dist < 2.5) {
                    this.playSynthSound('tag');
                    this.createTagExplosion(this.player.mesh.position, 0xff6b6b);
                    this.endGame('lose');
                    return;
                }
            }

            if (this.wcTimer <= 0) {
                this.wcPhase = 'chase';
                this.wcTimer = 60;
                if (this.wcChaser) {
                    this.wcChaser.setChaseMode(false);
                }
                this.scoreDisplay.innerText = 'TAG THEM!';
                this.playSynthSound('powerup');
            }
        } else if (this.wcPhase === 'chase') {
            this.wcPhaseLabel.textContent = 'CHASE!';
            this.wcTimerLabel.textContent = `${Math.max(0, Math.ceil(this.wcTimer))}s`;
            this.wcBanner.classList.add('chase-phase');

            if (this.wcTimer <= 0 && !this.wcChaser.isTagged) {
                this.endGame('lose');
            }
        }
    }

    createEndOverlay(html) {
        const overlay = document.createElement('div');
        overlay.id = 'win-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.45);backdrop-filter:blur(8px);display:flex;justify-content:center;align-items:center;z-index:9999;pointer-events:auto;flex-direction:column;text-align:center;';
        overlay.innerHTML = html;
        document.body.appendChild(overlay);
        document.getElementById('ea-retry')?.addEventListener('click', () => this.restartGame(false));
        document.getElementById('ea-mods')?.addEventListener('click', () => this.restartGame(true));
        document.getElementById('ea-next')?.addEventListener('click', () => this.nextLevel());
        return overlay;
    }

    showLoseMenu() {
        this.createEndOverlay(`
            <div class="win-card">
                <h2 class="neon-text lose-title">GAME OVER</h2>
                <p class="bonus-text">Level ${this.level} — Better luck next time!</p>
                <div class="end-actions">
                    <button class="btn-play-again" id="ea-retry">TRY AGAIN</button>
                    <button class="btn-change-mods" id="ea-mods">CHANGE MODS</button>
                </div>
            </div>
        `);
    }

    showWinMenu() {
        const timeBonus = Math.max(0, CONFIG.time_bonus_limit - Math.floor(this.gameTime));
        const totalEarned = this.sessionCoins + timeBonus;
        this.currency.addCoins(timeBonus);

        this.createEndOverlay(`
            <div class="win-card">
                <h2 class="neon-text">${this.mods.has('worldcup') ? 'WORLD CUP WIN!' : `LEVEL ${this.level} CLEARED!`}</h2>
                <div class="coin-display"><span id="counter">0</span></div>
                <p class="bonus-text">${this.sessionCoins} collected + ${timeBonus} time bonus | ${this.gameTime.toFixed(1)}s</p>
                <div class="end-actions">
                    <button class="btn-play-again" id="ea-next" style="background:linear-gradient(135deg,#fcc419,#f59f00);color:#fff;box-shadow:0 4px 0 #e67e22,0 6px 20px rgba(245,159,0,0.3);">NEXT LEVEL</button>
                    <button class="btn-play-again" id="ea-retry">REPLAY</button>
                    <button class="btn-change-mods" id="ea-mods">MODS</button>
                </div>
            </div>
        `);

        let current = 0;
        const counter = document.getElementById('counter');
        const interval = setInterval(() => {
            current += Math.ceil(totalEarned / 20);
            if (current >= totalEarned) { current = totalEarned; clearInterval(interval); this.playSynthSound('powerup'); }
            counter.innerText = `+${current} coins`;
        }, 30);
    }

    nextLevel() {
        this.level++;
        localStorage.setItem('stickman_level', this.level);
        this.restartGame(false);
    }

    restartGame(changeMods) {
        const overlay = document.getElementById('win-overlay');
        if (overlay) overlay.remove();

        if (this.player) { this.player.destroy(); this.player = null; }
        if (this.arena) { this.arena.destroy(); this.arena = null; }
        if (this.stickmen) { this.stickmen.forEach(s => s.destroy()); this.stickmen = []; }
        if (this.parkourElements) { this.parkourElements.forEach(p => p.destroy()); this.parkourElements = []; }
        this.activePowerups.forEach(p => this.scene.remove(p));
        this.activePowerups = [];
        this.activeTraps.forEach(t => this.scene.remove(t.mesh));
        this.activeTraps = [];
        this.arenaCoins.forEach(c => this.scene.remove(c.mesh));
        this.arenaCoins = [];
        this.sessionCoins = 0;
        this.coinSpawnTimer = 0;
        this.dustParticles.forEach(d => this.scene.remove(d.mesh));
        this.dustParticles = [];
        this.trailParticles.forEach(t => this.scene.remove(t.mesh));
        this.trailParticles = [];
        this.allColliders = [];

        this.isRunning = false;
        this.taggedCount = 0;
        this.totalStickmen = CONFIG.total_stickmen;
        this.gameTime = 0;
        this.powerupSpawnTimer = CONFIG.powerup_initial_spawn_delay;
        this.gameObjectsCreated = false;
        this.gameEnded = false;
        this.wcPhase = 'evade';
        this.wcTimer = 60;
        this.wcChaser = null;
        this.wcPlayerTagged = false;

        this.hud.style.display = 'none';
        this.wcBanner.style.display = 'none';
        this.powerupActive.style.display = 'none';

        if (changeMods) {
            this.mods.unlock();
            this.updateStartSubtitle();
            this.startScreen.style.display = 'flex';
        } else {
            this.startGame();
            if (window.innerWidth > 768) document.body.requestPointerLock();
        }
    }

    spawnPowerup() {
        // Pick a random powerup type
        const typeKey = POWERUP_KEYS[Math.floor(Math.random() * POWERUP_KEYS.length)];
        const def = POWERUP_TYPES[typeKey];

        const geo = new THREE.OctahedronGeometry(0.7);
        const mat = new THREE.MeshStandardMaterial({
            color: def.color,
            emissive: def.color,
            emissiveIntensity: 0.6,
            roughness: 0.3,
        });
        const mesh = new THREE.Mesh(geo, mat);

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

    playSynthSound(type) {
        if (!this.audioCtx) return;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        const t = this.audioCtx.currentTime;

        if (type === 'tag') {
            osc.frequency.setValueAtTime(400, t);
            osc.frequency.exponentialRampToValueAtTime(1200, t + 0.1);
            gain.gain.setValueAtTime(0.3, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
            osc.start(); osc.stop(t + 0.2);
        } else if (type === 'powerup') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, t);
            osc.frequency.exponentialRampToValueAtTime(1600, t + 0.3);
            gain.gain.setValueAtTime(0.35, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
            osc.start(); osc.stop(t + 0.3);
        } else if (type === 'jump') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(300, t);
            osc.frequency.exponentialRampToValueAtTime(600, t + 0.08);
            gain.gain.setValueAtTime(0.15, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
            osc.start(); osc.stop(t + 0.1);
        } else if (type === 'slide') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(200, t);
            osc.frequency.exponentialRampToValueAtTime(100, t + 0.15);
            gain.gain.setValueAtTime(0.1, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
            osc.start(); osc.stop(t + 0.2);
        } else if (type === 'walljump') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(500, t);
            osc.frequency.exponentialRampToValueAtTime(900, t + 0.1);
            gain.gain.setValueAtTime(0.15, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
            osc.start(); osc.stop(t + 0.15);
        } else if (type === 'vault') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(350, t);
            osc.frequency.exponentialRampToValueAtTime(700, t + 0.12);
            gain.gain.setValueAtTime(0.12, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
            osc.start(); osc.stop(t + 0.15);
        } else if (type === 'trap') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(600, t);
            osc.frequency.exponentialRampToValueAtTime(200, t + 0.2);
            gain.gain.setValueAtTime(0.25, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
            osc.start(); osc.stop(t + 0.25);
        } else if (type === 'freeze') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1200, t);
            osc.frequency.exponentialRampToValueAtTime(400, t + 0.3);
            gain.gain.setValueAtTime(0.3, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.35);
            osc.start(); osc.stop(t + 0.35);
        } else if (type === 'coin') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1400, t);
            osc.frequency.exponentialRampToValueAtTime(1800, t + 0.06);
            gain.gain.setValueAtTime(0.2, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
            osc.start(); osc.stop(t + 0.1);
        }
    }

    updateParkourHUD() {
        const p = this.player;
        this.doubleJumpIcon.className = 'parkour-icon ' + (p.canDoubleJump && !p.isGrounded ? 'ready' : (p.hasDoubleJumped ? 'used' : ''));
        this.wallJumpIcon.className = 'parkour-icon ' + (p.isNearWall && !p.isGrounded ? 'ready' : '');
        this.slideIcon.className = 'parkour-icon ' + (p.isSliding ? 'used' : (p.isGrounded ? 'ready' : ''));
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        const dt = Math.min(this.clock.getDelta(), 0.1);

        if (this.isRunning && this.player) {
            this.gameTime += dt;
            this.timeDisplay.innerText = `${this.gameTime.toFixed(1)}s`;

            const prevGrounded = this.player.isGrounded;
            this.player.update(dt, this.allColliders);

            // Landing dust
            if (this.player.isGrounded && !prevGrounded && this.player.velocity.y <= 0) {
                this.spawnDust(this.player.mesh.position, 0xbbbbbb);
            }
            // Sprint trail + dust
            if (this.player.isSprinting && this.player.isGrounded) {
                if (Math.random() < 0.3) this.spawnTrail(this.player.mesh.position, 0xff6b6b);
                if (Math.random() < 0.15) this.spawnDust(this.player.mesh.position, 0x999999);
            }

            this.speedLines.classList.remove('active');

            // Parkour sound events
            if (this.player.justJumped) { this.playSynthSound('jump'); this.player.justJumped = false; }
            if (this.player.justWallJumped) { this.playSynthSound('walljump'); this.spawnDust(this.player.mesh.position, 0x339af0); this.player.justWallJumped = false; }
            if (this.player.justSlid) { this.playSynthSound('slide'); this.player.justSlid = false; }
            if (this.player.justVaulted) { this.playSynthSound('vault'); this.spawnDust(this.player.mesh.position, 0xfcc419); this.player.justVaulted = false; }
            if (this.player.justUsedPowerup) { this.player.justUsedPowerup = null; }

            // World Cup mode
            if (this.mods.has('worldcup')) {
                this.updateWorldCup(dt);
            }

            // Powerup spawning
            this.powerupSpawnTimer -= dt;
            const maxPU = this.mods.has('chaos') ? 8 : CONFIG.max_active_powerups;
            const spawnInt = this.mods.has('chaos') ? 3.0 : CONFIG.powerup_spawn_interval;
            if (this.powerupSpawnTimer <= 0 && this.activePowerups.length < maxPU) {
                this.spawnPowerup();
                this.powerupSpawnTimer = spawnInt + Math.random() * 3;
            }

            // Powerup pickup
            for (let i = this.activePowerups.length - 1; i >= 0; i--) {
                const p = this.activePowerups[i];
                p.rotation.y += dt * 2;
                p.position.y = 1.5 + Math.sin(this.gameTime * 3 + i) * 0.3;
                if (this.player.mesh.position.distanceTo(p.position) < CONFIG.powerup_pickup_distance) {
                    const typeKey = p.userData.powerupType;
                    if (this.player.collectPowerup(typeKey)) {
                        this.playSynthSound('powerup');
                        this.scene.remove(p);
                        this.activePowerups.splice(i, 1);
                        this.updatePowerupHUD();
                    }
                }
            }

            // Traps
            this.updateTraps(dt);

            // Magnet effect
            this.updateMagnet(dt);

            // Arena coins
            this.updateArenaCoins(dt);

            // Update powerup HUD timer
            this.updatePowerupHUD();

            // Stamina bar
            this.staminaBar.style.width = `${this.player.stamina}%`;
            if (this.player.activePowerupType === 'speed') {
                this.staminaBar.style.background = 'linear-gradient(90deg, #fcc419, #ff922b)';
                this.staminaBar.style.boxShadow = 'none';
            } else if (this.player.activePowerupType === 'magnet') {
                this.staminaBar.style.background = 'linear-gradient(90deg, #a29bfe, #6c5ce7)';
                this.staminaBar.style.boxShadow = 'none';
            } else if (this.player.stamina < 20) {
                this.staminaBar.style.background = 'linear-gradient(90deg, #ff6b6b, #ee5a24)';
                this.staminaBar.style.boxShadow = 'none';
            } else {
                this.staminaBar.style.background = 'linear-gradient(90deg, #12CBC4, #0abde3)';
                this.staminaBar.style.boxShadow = 'none';
            }

            // Ghost mod
            if (this.mods.has('ghost')) {
                this.stickmen.forEach(s => {
                    if (!s.isTagged) {
                        s.bodyGroup.visible = (Math.sin(this.gameTime * 3 + s.mesh.id) * 0.5 + 0.5) > 0.3;
                    }
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
