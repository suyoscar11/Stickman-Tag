import * as THREE from 'three';
import GameObject3D from './GameObject3D.js';

export default class Player extends GameObject3D {
    constructor(scene, camera, config, mods) {
        super(scene);
        this.camera = camera;
        this.config = config;
        this.mods = mods;
        this.velocity = new THREE.Vector3();
        this.radius = 0.4;
        this.height = 1.8;

        const speedMult = mods.getSpeedMultiplier();
        this.baseSpeed = config.player_speed * speedMult;
        this.baseSprintSpeed = config.player_sprint_speed * speedMult;
        this.speed = this.baseSpeed;
        this.sprintSpeed = this.baseSprintSpeed;

        this.stamina = config.player_max_stamina;
        this.gravity = config.gravity * mods.getGravityMultiplier();
        this.jumpForce = config.jump_force * mods.getJumpMultiplier();
        this.isGrounded = false;
        this.isSprinting = false;

        // Powerup inventory (up to 3 slots)
        this.powerupSlots = [null, null, null];
        this.activePowerupType = null;
        this.powerupTimer = 0;

        // Parkour
        this.canDoubleJump = true;
        this.hasDoubleJumped = false;
        this.isNearWall = false;
        this.wallNormal = new THREE.Vector3();
        this.isWallSliding = false;
        this.wallSlideSpeed = -3;
        this.isSliding = false;
        this.slideTimer = 0;
        this.slideDuration = 0.6;
        this.slideSpeed = 18 * speedMult;
        this.slideDir = new THREE.Vector3();

        // Auto-vault
        this.isVaulting = false;
        this.vaultTimer = 0;
        this.vaultDuration = 0.25;
        this.vaultTargetY = 0;
        this.vaultStartY = 0;


        // Sound flags
        this.justJumped = false;
        this.justWallJumped = false;
        this.justSlid = false;
        this.justVaulted = false;
        this.justUsedPowerup = null;

        // Input
        this.keys = { w: false, a: false, s: false, d: false, shift: false, space: false, control: false };
        this.yaw = 0;
        this.pitch = 0;
        this.animTime = 0;
        this.headBobTime = 0;

        // Mobile
        this.mobileMove = new THREE.Vector2(0, 0);
        this.mobileSprintToggle = false;
        this.mobileJumpTrigger = false;
        this.mobileSlideTrigger = false;

        // Edge-triggered jump (prevents auto-jump when holding space)
        this.jumpRequested = false;

        // Animation smoothing
        this.smoothSpeed = 0;
        this.smoothLean = 0;
        this.lastMoveDir = new THREE.Vector3(0, 0, -1);

        // Squash & stretch
        this.squashTimer = 0;
        this.wasAirborne = false;
        this.baseFOV = 68;
        this.targetFOV = 68;

        // --- Visual ---
        this.bodyGroup = new THREE.Group();
        this.mesh.add(this.bodyGroup);

        this.material = new THREE.MeshStandardMaterial({
            color: 0xff6b6b, roughness: 0.3,
            emissive: 0x993333, emissiveIntensity: 0.2,
        });

        this.head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 16), this.material);
        this.head.position.y = 1.3;
        this.head.castShadow = true;
        this.bodyGroup.add(this.head);

        if (mods.has('bighead')) this.head.scale.setScalar(1.8);

        this.torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.4, 8, 8), this.material);
        this.torso.position.y = 0.85;
        this.torso.castShadow = true;
        this.bodyGroup.add(this.torso);

        const limbGeo = new THREE.CapsuleGeometry(0.05, 0.5, 4, 8);

        this.shoulderL = new THREE.Group();
        this.shoulderL.position.set(-0.25, 1.05, 0);
        this.bodyGroup.add(this.shoulderL);
        this.armL = new THREE.Mesh(limbGeo, this.material);
        this.armL.position.y = -0.25;
        this.shoulderL.add(this.armL);

        this.shoulderR = new THREE.Group();
        this.shoulderR.position.set(0.25, 1.05, 0);
        this.bodyGroup.add(this.shoulderR);
        this.armR = new THREE.Mesh(limbGeo, this.material);
        this.armR.position.y = -0.25;
        this.shoulderR.add(this.armR);

        this.hipL = new THREE.Group();
        this.hipL.position.set(-0.12, 0.55, 0);
        this.bodyGroup.add(this.hipL);
        this.legL = new THREE.Mesh(limbGeo, this.material);
        this.legL.position.y = -0.25;
        this.hipL.add(this.legL);

        this.hipR = new THREE.Group();
        this.hipR.position.set(0.12, 0.55, 0);
        this.bodyGroup.add(this.hipR);
        this.legR = new THREE.Mesh(limbGeo, this.material);
        this.legR.position.y = -0.25;
        this.hipR.add(this.legR);

        this.setupInputs();
    }

    setupInputs() {
        document.addEventListener('keydown', (e) => {
            let key = e.key.toLowerCase();
            if (key === ' ') key = 'space';
            // Edge-trigger jump only on fresh press (not when held)
            if (key === 'space' && !this.keys.space) {
                this.jumpRequested = true;
            }
            this.keys[key] = true;
        });
        document.addEventListener('keyup', (e) => {
            let key = e.key.toLowerCase();
            if (key === ' ') key = 'space';
            this.keys[key] = false;
        });
        document.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement) {
                const m = this.mods.has('mirror') ? 1 : -1;
                this.yaw += e.movementX * 0.002 * m;
                this.pitch -= e.movementY * 0.002;
                this.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, this.pitch));
            }
        });
    }

    collectPowerup(type) {
        // Find first empty slot
        for (let i = 0; i < this.powerupSlots.length; i++) {
            if (this.powerupSlots[i] === null) {
                this.powerupSlots[i] = type;
                return true;
            }
        }
        return false; // All slots full
    }

    usePowerup(slotIndex) {
        if (slotIndex < 0 || slotIndex >= this.powerupSlots.length) return null;
        const type = this.powerupSlots[slotIndex];
        if (!type) return null;
        this.powerupSlots[slotIndex] = null;
        this.justUsedPowerup = type;

        if (type === 'speed') {
            this.activePowerupType = 'speed';
            this.powerupTimer = 6;
            this.speed = this.baseSpeed * 1.6;
            this.sprintSpeed = this.baseSprintSpeed * 1.6;
            this.stamina = 100;
            this.material.color.setHex(0xfcc419);
            this.material.emissive.setHex(0x997a10);
        }

        return type;
    }

    checkWallProximity(colliders) {
        this.isNearWall = false;
        const pos = this.mesh.position;
        const r = this.radius + 0.3;

        for (const col of colliders) {
            if (col.type !== 'box') continue;
            if ((col.max.y - col.min.y) < 1.5) continue;

            if (pos.y > col.min.y && pos.y + this.height * 0.5 < col.max.y) {
                if (pos.x + r > col.min.x && pos.x - r < col.max.x &&
                    pos.z + r > col.min.z && pos.z - r < col.max.z) {
                    const dxMin = Math.abs(pos.x - col.min.x);
                    const dxMax = Math.abs(pos.x - col.max.x);
                    const dzMin = Math.abs(pos.z - col.min.z);
                    const dzMax = Math.abs(pos.z - col.max.z);
                    const minDist = Math.min(dxMin, dxMax, dzMin, dzMax);
                    if (minDist < r) {
                        this.isNearWall = true;
                        if (minDist === dxMin) this.wallNormal.set(-1, 0, 0);
                        else if (minDist === dxMax) this.wallNormal.set(1, 0, 0);
                        else if (minDist === dzMin) this.wallNormal.set(0, 0, -1);
                        else this.wallNormal.set(0, 0, 1);
                        break;
                    }
                }
            }
        }
    }

    checkAutoVault(colliders, moveDir, isMoving) {
        if (!isMoving || !this.isGrounded || this.isSliding || this.isVaulting) return;

        const pos = this.mesh.position;
        const r = this.radius;
        const lookAhead = pos.clone().add(moveDir.clone().multiplyScalar(0.8));

        for (const col of colliders) {
            if (col.type !== 'box') continue;
            const obstacleHeight = col.max.y - pos.y;

            if (obstacleHeight > 0.3 && obstacleHeight < 2.0) {
                if (lookAhead.x + r > col.min.x && lookAhead.x - r < col.max.x &&
                    lookAhead.z + r > col.min.z && lookAhead.z - r < col.max.z) {
                    this.isVaulting = true;
                    this.vaultTimer = this.vaultDuration;
                    this.vaultStartY = pos.y;
                    this.vaultTargetY = col.max.y + 0.1;
                    this.justVaulted = true;
                    this.velocity.x = moveDir.x * this.speed * 1.2;
                    this.velocity.z = moveDir.z * this.speed * 1.2;
                    this.velocity.y = 3;
                    return;
                }
            }
        }
    }

    update(dt, allColliders) {
        // Active powerup timer
        if (this.activePowerupType) {
            this.powerupTimer -= dt;
            if (this.activePowerupType === 'speed') this.stamina = 100;
            if (this.powerupTimer <= 0) {
                this.activePowerupType = null;
                this.speed = this.baseSpeed;
                this.sprintSpeed = this.baseSprintSpeed;
                this.material.color.setHex(0xff6b6b);
                this.material.emissive.setHex(0x993333);
            }
        }

        // Vault animation
        if (this.isVaulting) {
            this.vaultTimer -= dt;
            const t = 1 - (this.vaultTimer / this.vaultDuration);
            this.mesh.position.y = this.vaultStartY + (this.vaultTargetY - this.vaultStartY) * Math.sin(t * Math.PI * 0.5);
            if (this.vaultTimer <= 0) {
                this.isVaulting = false;
                this.mesh.position.y = this.vaultTargetY;
                this.velocity.y = 0;
            }
            this.animateLimbs(dt, this.speed, true, this.lastMoveDir);
            this.updateCamera(dt, true);
            return;
        }

        // 1. Input
        const moveInput = new THREE.Vector3();
        const mirrorMult = this.mods.has('mirror') ? -1 : 1;

        if (this.keys.w) moveInput.z -= 1 * mirrorMult;
        if (this.keys.s) moveInput.z += 1 * mirrorMult;
        if (this.keys.a) moveInput.x -= 1 * mirrorMult;
        if (this.keys.d) moveInput.x += 1 * mirrorMult;

        if (this.mobileMove.lengthSq() > 0) {
            moveInput.x = this.mobileMove.x * mirrorMult;
            moveInput.z = -this.mobileMove.y * mirrorMult;
        }

        let isMoving = moveInput.lengthSq() > 0;
        if (isMoving) moveInput.normalize();

        const moveDir = moveInput.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
        if (isMoving) this.lastMoveDir.copy(moveDir);

        // 2. Sprint
        const wantSprint = (this.keys.shift || this.mobileSprintToggle) && isMoving;
        this.isSprinting = wantSprint && this.stamina > 1;
        let currentSpeed = this.speed;

        if (this.isSprinting) {
            currentSpeed = this.sprintSpeed;
            if (!this.activePowerupType) this.stamina = Math.max(0, this.stamina - this.config.stamina_drain_rate * dt);
        } else {
            if (!this.activePowerupType) {
                this.stamina = Math.min(this.config.player_max_stamina, this.stamina + this.config.stamina_regen_rate * dt);
            }
            if (this.stamina <= 1) this.mobileSprintToggle = false;
        }

        // 3. Slide
        if ((this.keys.control || this.mobileSlideTrigger) && this.isGrounded && isMoving && !this.isSliding) {
            this.isSliding = true;
            this.slideTimer = this.slideDuration;
            this.slideDir.copy(moveDir);
            this.justSlid = true;
            this.mobileSlideTrigger = false;
        }

        if (this.isSliding) {
            this.slideTimer -= dt;
            const f = this.slideTimer / this.slideDuration;
            this.velocity.x = this.slideDir.x * this.slideSpeed * f;
            this.velocity.z = this.slideDir.z * this.slideSpeed * f;
            if (this.slideTimer <= 0) this.isSliding = false;
        } else {
            // Smooth speed transitions to prevent camera jitter
            this.smoothSpeed += (currentSpeed - this.smoothSpeed) * Math.min(1, 6 * dt);
            this.velocity.x = moveDir.x * this.smoothSpeed;
            this.velocity.z = moveDir.z * this.smoothSpeed;
        }

        // 4. Wall check
        this.checkWallProximity(allColliders);

        // 5. Auto-vault check
        this.checkAutoVault(allColliders, moveDir, isMoving);

        // 6. Jump (edge-triggered - only fires once per press)
        const wantJump = this.jumpRequested || this.mobileJumpTrigger;
        this.jumpRequested = false;

        if (wantJump && !this.isVaulting) {
            if (this.isSliding) {
                this.isSliding = false;
                this.velocity.y = this.jumpForce * 1.1;
                this.isGrounded = false;
                this.justJumped = true;
            } else if (this.isGrounded) {
                this.velocity.y = this.jumpForce;
                this.isGrounded = false;
                this.canDoubleJump = true;
                this.hasDoubleJumped = false;
                this.justJumped = true;
            } else if (this.isNearWall && !this.isGrounded) {
                this.velocity.y = this.jumpForce * 0.9;
                this.velocity.x += this.wallNormal.x * 8;
                this.velocity.z += this.wallNormal.z * 8;
                this.canDoubleJump = true;
                this.hasDoubleJumped = false;
                this.justWallJumped = true;
            } else if (this.canDoubleJump && !this.hasDoubleJumped) {
                this.velocity.y = this.jumpForce * 0.75;
                this.hasDoubleJumped = true;
                this.canDoubleJump = false;
                this.justJumped = true;
            }
            this.mobileJumpTrigger = false;
        }

        // Wall slide
        if (this.isNearWall && !this.isGrounded && this.velocity.y < 0) {
            this.isWallSliding = true;
            this.velocity.y = Math.max(this.velocity.y, this.wallSlideSpeed);
        } else {
            this.isWallSliding = false;
        }

        this.velocity.y += this.gravity * dt;
        this.mesh.position.addScaledVector(this.velocity, dt);
        this.resolveCollisions(allColliders);

        // Landing squash
        if (this.isGrounded && this.wasAirborne) {
            this.squashTimer = 0.15;
        }
        this.wasAirborne = !this.isGrounded;

        if (this.isGrounded) {
            this.canDoubleJump = true;
            this.hasDoubleJumped = false;
        }

        // Squash/stretch visual
        if (this.squashTimer > 0) {
            this.squashTimer -= dt;
            const t = this.squashTimer / 0.15;
            const squash = 1 - t * 0.3; // scaleY compresses
            const spread = 1 + t * 0.2;  // scaleXZ expands
            this.bodyGroup.scale.set(spread, squash, spread);
        } else if (!this.isGrounded && this.velocity.y < -3) {
            // Stretch while falling fast
            const stretch = Math.min(1.25, 1 + Math.abs(this.velocity.y) * 0.01);
            this.bodyGroup.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));
        } else {
            this.bodyGroup.scale.set(1, 1, 1);
        }

        // FOV boost when sprinting
        this.targetFOV = this.isSprinting ? 76 : 68;
        const currentFOV = this.camera.fov;
        const newFOV = currentFOV + (this.targetFOV - currentFOV) * Math.min(1, 4 * dt);
        if (Math.abs(newFOV - currentFOV) > 0.1) {
            this.camera.fov = newFOV;
            this.camera.updateProjectionMatrix();
        }

        this.animateLimbs(dt, this.smoothSpeed, isMoving, moveDir);
        this.updateCamera(dt, isMoving);
    }

    resolveCollisions(colliders) {
        this.isGrounded = false;
        const pos = this.mesh.position;
        const r = this.radius;
        const h = this.isSliding ? this.height * 0.5 : this.height;

        for (const col of colliders) {
            if (col.type === 'box') {
                if (pos.x + r > col.min.x && pos.x - r < col.max.x &&
                    pos.z + r > col.min.z && pos.z - r < col.max.z &&
                    pos.y + h > col.min.y && pos.y < col.max.y) {

                    const oXMin = (pos.x + r) - col.min.x;
                    const oXMax = col.max.x - (pos.x - r);
                    const oZMin = (pos.z + r) - col.min.z;
                    const oZMax = col.max.z - (pos.z - r);
                    const oYMax = col.max.y - pos.y;
                    const min = Math.min(oXMin, oXMax, oZMin, oZMax, oYMax);

                    if (min === oYMax && this.velocity.y <= 0) {
                        pos.y = col.max.y; this.velocity.y = 0; this.isGrounded = true;
                    } else if (min === oXMin) pos.x -= oXMin;
                    else if (min === oXMax) pos.x += oXMax;
                    else if (min === oZMin) pos.z -= oZMin;
                    else if (min === oZMax) pos.z += oZMax;
                }
            } else if (col.type === 'slope') {
                if (pos.x > col.minX && pos.x < col.maxX && pos.z > col.minZ && pos.z < col.maxZ) {
                    const nz = (pos.z - col.minZ) / (col.maxZ - col.minZ);
                    const sy = col.baseY + (nz * (col.topY - col.baseY));
                    if (pos.y <= sy) { pos.y = sy; this.velocity.y = 0; this.isGrounded = true; }
                }
            }
        }

        if (pos.y <= 0) { pos.y = 0; this.velocity.y = 0; this.isGrounded = true; }

        // Hard arena boundary clamp (arena is 80x80, walls inset by 1)
        const bound = 39;
        if (pos.x > bound) { pos.x = bound; this.velocity.x = 0; }
        if (pos.x < -bound) { pos.x = -bound; this.velocity.x = 0; }
        if (pos.z > bound) { pos.z = bound; this.velocity.z = 0; }
        if (pos.z < -bound) { pos.z = -bound; this.velocity.z = 0; }
    }

    animateLimbs(dt, speed, isMoving, moveDir) {
        if (isMoving && !this.isSliding) {
            const targetRot = Math.atan2(moveDir.x, moveDir.z);
            let diff = targetRot - this.bodyGroup.rotation.y;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            this.bodyGroup.rotation.y += diff * 12 * dt;
        } else if (!this.isSliding) {
            let diff = this.yaw - this.bodyGroup.rotation.y;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            this.bodyGroup.rotation.y += diff * 5 * dt;
        }

        this.bodyGroup.rotation.x = 0;

        if (this.isVaulting) {
            this.torso.rotation.x = 0.5;
            this.shoulderL.rotation.x = -Math.PI * 0.5;
            this.shoulderR.rotation.x = -Math.PI * 0.5;
            this.hipL.rotation.x = -0.8;
            this.hipR.rotation.x = -0.8;
            this.bodyGroup.position.y = 0;
            return;
        }

        if (this.isSliding) {
            this.torso.rotation.x = 0.6;
            this.bodyGroup.position.y = -0.4;
            this.shoulderL.rotation.x = -0.3;
            this.shoulderR.rotation.x = -0.3;
            this.hipL.rotation.x = -1.2;
            this.hipR.rotation.x = -0.6;
            return;
        }

        this.bodyGroup.position.y = 0;

        if (this.isWallSliding) {
            this.torso.rotation.x = 0;
            this.shoulderL.rotation.x = -Math.PI * 0.6;
            this.shoulderR.rotation.x = -Math.PI * 0.6;
            this.hipL.rotation.x = 0.2;
            this.hipR.rotation.x = -0.2;
            return;
        }

        if (this.isGrounded) {
            if (isMoving) {
                const speedRatio = speed / this.sprintSpeed;

                const leanTarget = 0.15 * speedRatio;
                this.smoothLean += (leanTarget - this.smoothLean) * 10 * dt;
                this.torso.rotation.x = this.smoothLean;

                this.head.position.y = 1.3;

                const animSpeed = dt * speed * 2.2;
                this.animTime += animSpeed;

                const legSwing = Math.sin(this.animTime) * (0.8 + speedRatio * 0.7);
                const legBend = Math.abs(Math.sin(this.animTime)) * 0.15;
                this.hipL.rotation.x = -legSwing;
                this.hipR.rotation.x = legSwing;
                this.legL.rotation.x = legBend;
                this.legR.rotation.x = legBend;

                const armSwing = Math.sin(this.animTime) * (0.6 + speedRatio * 0.8);
                const armBend = -0.3 - speedRatio * 0.2;
                this.shoulderL.rotation.x = armSwing;
                this.shoulderR.rotation.x = -armSwing;
                this.armL.rotation.x = armBend;
                this.armR.rotation.x = armBend;

                this.torso.rotation.y = Math.sin(this.animTime) * 0.06 * speedRatio;
                this.bodyGroup.rotation.z = Math.sin(this.animTime) * 0.02 * speedRatio;

            } else {
                this.torso.rotation.x = 0;
                this.torso.rotation.y = 0;
                this.bodyGroup.rotation.z = 0;
                this.smoothLean = 0;
                const breath = Math.sin(Date.now() * 0.003) * 0.04;
                this.shoulderL.rotation.x = breath;
                this.shoulderR.rotation.x = -breath;
                this.armL.rotation.x = 0;
                this.armR.rotation.x = 0;
                this.hipL.rotation.x = 0;
                this.hipR.rotation.x = 0;
                this.legL.rotation.x = 0;
                this.legR.rotation.x = 0;
                this.head.position.y = 1.3 + breath * 0.3;
                this.animTime = 0;
            }
        } else {
            // Airborne
            this.bodyGroup.rotation.z = 0;

            this.torso.rotation.x = 0;
            if (this.velocity.y > 0) {
                this.shoulderL.rotation.x = -Math.PI * 0.35;
                this.shoulderR.rotation.x = -Math.PI * 0.35;
                this.hipL.rotation.x = -0.3;
                this.hipR.rotation.x = 0.2;
            } else {
                this.shoulderL.rotation.x = -Math.PI * 0.5;
                this.shoulderR.rotation.x = -Math.PI * 0.5;
                this.hipL.rotation.x = -0.15;
                this.hipR.rotation.x = Math.PI / 5;
            }
            this.armL.rotation.x = -0.2;
            this.armR.rotation.x = -0.2;
        }
    }

    updateCamera(dt, isMoving) {
        const camDist = this.isSliding ? 5.0 : 4.0;
        const camHeight = this.isSliding ? 2.5 : 3.5;
        const camOffset = new THREE.Vector3(0, camHeight, camDist);
        camOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);

        const headBob = 0;

        const targetPos = this.mesh.position.clone().add(camOffset);
        targetPos.y += headBob;

        const smoothFactor = 1 - Math.pow(0.01, dt);
        this.camera.position.lerp(targetPos, smoothFactor);
        this.camera.lookAt(
            this.mesh.position.x,
            this.mesh.position.y + 1.4 + headBob * 0.3,
            this.mesh.position.z
        );
    }
}
