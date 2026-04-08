import * as THREE from 'three';
import GameObject3D from './GameObject3D.js';

export default class Stickman extends GameObject3D {
    constructor(scene, x, z, config, mods) {
        super(scene);
        this.config = config;
        this.mods = mods;
        this.mesh.position.set(x, 4, z);
        this.isTagged = false;

        this.velocity = new THREE.Vector3(0, 0, 0);
        this.gravity = config.gravity * mods.getGravityMultiplier();
        this.jumpForce = config.jump_force * mods.getJumpMultiplier();
        this.isGrounded = false;
        this.radius = 0.4;
        this.height = 1.8;

        // Freeze support
        this.isFrozen = false;
        this.freezeTimer = 0;

        const speedMult = mods.getSpeedMultiplier();
        this.speed = (config.enemy_speed + Math.random() * 3) * speedMult;
        this.runSpeed = (config.enemy_run_speed + Math.random() * 3) * speedMult;
        this.fleeDistance = config.enemy_flee_distance;
        this.state = 'wander';
        this.isChaser = false;
        this.isTeammate = false; // If true, doesn't flee from player
        this.targetDir = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
        this.changeDirTimer = 0;
        this.animTime = 0;

        // --- Visuals ---
        this.bodyGroup = new THREE.Group();
        this.mesh.add(this.bodyGroup);

        const hue = Math.random();
        const color = new THREE.Color().setHSL(hue, 0.85, 0.55);
        const emissiveColor = new THREE.Color().setHSL(hue, 0.7, 0.25);

        this.material = new THREE.MeshStandardMaterial({
            color: color,
            emissive: emissiveColor,
            emissiveIntensity: 0.3,
            roughness: 0.5,
        });

        this.head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), this.material);
        this.head.position.y = 1.4;
        this.head.castShadow = true;
        this.bodyGroup.add(this.head);

        if (mods.has('bighead')) {
            this.head.scale.setScalar(2.0);
        }

        this.torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.5, 4, 8), this.material);
        this.torso.position.y = 0.9;
        this.torso.castShadow = true;
        this.bodyGroup.add(this.torso);

        const limbGeo = new THREE.CapsuleGeometry(0.06, 0.45, 4, 8);

        this.shoulderL = new THREE.Group();
        this.shoulderL.position.set(-0.22, 1.05, 0);
        this.bodyGroup.add(this.shoulderL);
        this.armL = new THREE.Mesh(limbGeo, this.material);
        this.armL.position.y = -0.22;
        this.shoulderL.add(this.armL);

        this.shoulderR = new THREE.Group();
        this.shoulderR.position.set(0.22, 1.05, 0);
        this.bodyGroup.add(this.shoulderR);
        this.armR = new THREE.Mesh(limbGeo, this.material);
        this.armR.position.y = -0.22;
        this.shoulderR.add(this.armR);

        this.hipL = new THREE.Group();
        this.hipL.position.set(-0.12, 0.4, 0);
        this.bodyGroup.add(this.hipL);
        this.legL = new THREE.Mesh(limbGeo, this.material);
        this.legL.position.y = -0.22;
        this.hipL.add(this.legL);

        this.hipR = new THREE.Group();
        this.hipR.position.set(0.12, 0.4, 0);
        this.bodyGroup.add(this.hipR);
        this.legR = new THREE.Mesh(limbGeo, this.material);
        this.legR.position.y = -0.22;
        this.hipR.add(this.legR);

        // Freeze visual (hidden by default)
        this.freezeRing = new THREE.Mesh(
            new THREE.TorusGeometry(0.6, 0.06, 8, 16),
            new THREE.MeshBasicMaterial({ color: 0x74b9ff, transparent: true, opacity: 0 })
        );
        this.freezeRing.rotation.x = Math.PI / 2;
        this.freezeRing.position.y = 1.0;
        this.mesh.add(this.freezeRing);
    }

    setChaseMode(isChasing) {
        this.isChaser = isChasing;
        if (isChasing) {
            this.material.color.setHex(0x00ff44);
            this.material.emissive.setHex(0x00aa22);
            this.runSpeed *= 1.3;
            this.speed = this.runSpeed;
        } else {
            this.material.color.setHex(0xff8800);
            this.material.emissive.setHex(0x884400);
            this.isChaser = false;
        }
    }

    freeze(duration) {
        this.isFrozen = true;
        this.freezeTimer = duration;
        this.freezeRing.material.opacity = 0.6;
        // Tint blue
        this.material.emissive.setHex(0x0984e3);
        this.material.emissiveIntensity = 0.8;
    }

    update(dt, colliders, playerMesh) {
        if (this.isTagged) {
            this.mesh.rotation.z = Math.sin(Date.now() * 0.005) * 0.05;
            this.bodyGroup.rotation.x = 0;
            return;
        }

        // Freeze logic
        if (this.isFrozen) {
            this.freezeTimer -= dt;
            this.freezeRing.rotation.z += dt * 3;
            if (this.freezeTimer <= 0) {
                this.isFrozen = false;
                this.freezeRing.material.opacity = 0;
                // Restore emissive
                const hue = this.material.color.getHSL({}).h;
                this.material.emissive.setHSL(hue, 0.7, 0.25);
                this.material.emissiveIntensity = 0.3;
            }
            // Still apply gravity when frozen
            this.velocity.x = 0;
            this.velocity.z = 0;
            this.velocity.y += this.gravity * dt;
            this.mesh.position.addScaledVector(this.velocity, dt);
            this.resolveCollisions(colliders);
            return;
        }

        const distToPlayer = this.mesh.position.distanceTo(playerMesh.position);
        let currentSpeed = this.speed;

        if (this.isChaser) {
            this.state = 'chase';
            currentSpeed = this.runSpeed;
            this.targetDir.subVectors(playerMesh.position, this.mesh.position);
            this.targetDir.y = 0;
            this.targetDir.normalize();
            this.targetDir.x += (Math.random() - 0.5) * 0.2;
            this.targetDir.z += (Math.random() - 0.5) * 0.2;
            this.targetDir.normalize();
        } else if (!this.isTeammate && distToPlayer < this.fleeDistance) {
            this.state = 'flee';
            currentSpeed = this.runSpeed;

            this.targetDir.subVectors(this.mesh.position, playerMesh.position);
            this.targetDir.y = 0;
            this.targetDir.normalize();
            this.targetDir.x += (Math.random() - 0.5) * 0.6;
            this.targetDir.z += (Math.random() - 0.5) * 0.6;
            this.targetDir.normalize();
        } else {
            this.state = 'wander';
            this.changeDirTimer -= dt;
            if (this.changeDirTimer <= 0) {
                this.targetDir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
                this.changeDirTimer = 1 + Math.random() * 3;
            }
        }

        // Look-ahead obstacle detection
        if (this.isGrounded) {
            const lookAhead = this.mesh.position.clone().add(this.targetDir.clone().multiplyScalar(1.5));
            for (const col of colliders) {
                if (col.type === 'box') {
                    if (lookAhead.x > col.min.x && lookAhead.x < col.max.x && lookAhead.z > col.min.z && lookAhead.z < col.max.z) {
                        if (col.top > this.mesh.position.y + 0.1 && col.top < this.mesh.position.y + 2.5) {
                            this.velocity.y = this.jumpForce;
                            this.isGrounded = false;
                            break;
                        } else if (col.top >= this.mesh.position.y + 2.5) {
                            this.targetDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
                            break;
                        }
                    }
                }
            }
        }

        this.velocity.x = this.targetDir.x * currentSpeed;
        this.velocity.z = this.targetDir.z * currentSpeed;
        this.velocity.y += this.gravity * dt;

        this.mesh.position.addScaledVector(this.velocity, dt);
        this.resolveCollisions(colliders);

        if (this.mesh.position.x > 38 || this.mesh.position.x < -38) this.targetDir.x *= -1;
        if (this.mesh.position.z > 38 || this.mesh.position.z < -38) this.targetDir.z *= -1;
        this.mesh.position.x = Math.max(-38, Math.min(38, this.mesh.position.x));
        this.mesh.position.z = Math.max(-38, Math.min(38, this.mesh.position.z));

        this.animateLimbs(dt, currentSpeed);
    }

    resolveCollisions(colliders) {
        this.isGrounded = false;
        const pos = this.mesh.position;
        const r = this.radius;

        for (const col of colliders) {
            if (col.type === 'box') {
                if (pos.x + r > col.min.x && pos.x - r < col.max.x &&
                    pos.z + r > col.min.z && pos.z - r < col.max.z &&
                    pos.y + this.height > col.min.y && pos.y < col.max.y) {

                    const overlapXMin = (pos.x + r) - col.min.x;
                    const overlapXMax = col.max.x - (pos.x - r);
                    const overlapZMin = (pos.z + r) - col.min.z;
                    const overlapZMax = col.max.z - (pos.z - r);
                    const overlapYMax = col.max.y - pos.y;

                    const minOverlap = Math.min(overlapXMin, overlapXMax, overlapZMin, overlapZMax, overlapYMax);

                    if (minOverlap === overlapYMax && this.velocity.y <= 0) {
                        pos.y = col.max.y;
                        this.velocity.y = 0;
                        this.isGrounded = true;
                    } else if (minOverlap === overlapXMin) pos.x -= overlapXMin;
                    else if (minOverlap === overlapXMax) pos.x += overlapXMax;
                    else if (minOverlap === overlapZMin) pos.z -= overlapZMin;
                    else if (minOverlap === overlapZMax) pos.z += overlapZMax;
                }
            } else if (col.type === 'slope') {
                if (pos.x > col.minX && pos.x < col.maxX && pos.z > col.minZ && pos.z < col.maxZ) {
                    const normalizedZ = (pos.z - col.minZ) / (col.maxZ - col.minZ);
                    const slopeHeight = col.baseY + (normalizedZ * (col.topY - col.baseY));
                    if (pos.y <= slopeHeight) {
                        pos.y = slopeHeight;
                        this.velocity.y = 0;
                        this.isGrounded = true;
                    }
                }
            }
        }

        if (pos.y <= 0) {
            pos.y = 0;
            this.velocity.y = 0;
            this.isGrounded = true;
        }
    }

    animateLimbs(dt, speed) {
        const targetRot = Math.atan2(this.targetDir.x, this.targetDir.z);
        let diff = targetRot - this.mesh.rotation.y;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        this.mesh.rotation.y += diff * 8 * dt;

        if (this.isGrounded) {
            const speedRatio = speed / this.runSpeed;
            this.bodyGroup.rotation.x = 0;
            this.torso.rotation.x = 0.15 * speedRatio;
            this.animTime += dt * speed * 1.8;

            const legSwing = Math.sin(this.animTime) * (0.6 + speedRatio * 0.5);
            this.hipL.rotation.x = -legSwing;
            this.hipR.rotation.x = legSwing;

            const armSwing = Math.sin(this.animTime) * (0.4 + speedRatio * 0.5);
            this.shoulderL.rotation.x = armSwing;
            this.shoulderR.rotation.x = -armSwing;

            this.torso.rotation.y = Math.sin(this.animTime) * 0.06 * speedRatio;
            this.bodyGroup.rotation.z = Math.sin(this.animTime) * 0.02 * speedRatio;
        } else {
            this.bodyGroup.rotation.x = 0;
            this.torso.rotation.x = 0.1;
            this.bodyGroup.rotation.z = 0;
            this.shoulderL.rotation.x = -Math.PI / 4;
            this.shoulderR.rotation.x = -Math.PI / 4;
            this.hipL.rotation.x = 0;
            this.hipR.rotation.x = Math.PI / 6;
        }
    }

    tag() {
        this.isTagged = true;
        // Make invisible — Game.js will handle coin spawn and removal
        this.bodyGroup.visible = false;
    }
}
