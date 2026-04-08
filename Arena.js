import * as THREE from 'three';
import GameObject3D from './GameObject3D.js';

export default class Arena extends GameObject3D {
    constructor(scene) {
        super(scene);

        // 1. Bright grass-like floor
        const floorGeo = new THREE.PlaneGeometry(80, 80);
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0x6abf4b,
            roughness: 0.9,
            metalness: 0.0,
        });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        this.mesh.add(floor);

        // Subtle lighter grid lines
        const gridHelper = new THREE.GridHelper(80, 40, 0x80d468, 0x5ea83e);
        gridHelper.material.opacity = 0.3;
        gridHelper.material.transparent = true;
        gridHelper.position.y = 0.01;
        this.mesh.add(gridHelper);

        // Soft white boundary lines
        const edgeGeo = new THREE.PlaneGeometry(80, 0.4);
        const edgeMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.5,
        });

        const edges = [
            { pos: [0, 0.02, -40], rot: [-Math.PI / 2, 0, 0] },
            { pos: [0, 0.02, 40], rot: [-Math.PI / 2, 0, 0] },
            { pos: [-40, 0.02, 0], rot: [-Math.PI / 2, 0, Math.PI / 2] },
            { pos: [40, 0.02, 0], rot: [-Math.PI / 2, 0, Math.PI / 2] },
        ];

        edges.forEach(e => {
            const line = new THREE.Mesh(edgeGeo, edgeMat);
            line.position.set(...e.pos);
            line.rotation.set(...e.rot);
            this.mesh.add(line);
        });

        // 2. Clean semi-transparent walls with soft blue tint
        const wallMat = new THREE.MeshStandardMaterial({
            color: 0x88bbee,
            transparent: true,
            opacity: 0.18,
            emissive: 0x4488cc,
            emissiveIntensity: 0.1,
            roughness: 0.3,
        });

        const buildWall = (w, h, d, x, y, z) => {
            const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
            wall.position.set(x, y, z);
            this.mesh.add(wall);
            this.addBoxCollider(x, 0, z, w, h, d);
        };

        buildWall(80, 8, 4, 0, 4, -42);
        buildWall(80, 8, 4, 0, 4, 42);
        buildWall(4, 8, 80, -42, 4, 0);
        buildWall(4, 8, 80, 42, 4, 0);

        // --- OBSTACLE COURSE ELEMENTS ---
        this.buildObstacleCourse();
    }

    buildObstacleCourse() {
        // Material palette for obstacle course
        const pipeMat = new THREE.MeshStandardMaterial({ color: 0xff922b, roughness: 0.4, metalness: 0.3 });
        const platformMat = new THREE.MeshStandardMaterial({ color: 0x339af0, roughness: 0.5, metalness: 0.1 });
        const bridgeMat = new THREE.MeshStandardMaterial({ color: 0xb2bec3, roughness: 0.6, metalness: 0.2 });
        const archMat = new THREE.MeshStandardMaterial({ color: 0xcc5de8, roughness: 0.4, metalness: 0.15 });
        const crateMat = new THREE.MeshStandardMaterial({ color: 0xfcc419, roughness: 0.7, metalness: 0.05 });
        const tunnelMat = new THREE.MeshStandardMaterial({ color: 0x51cf66, roughness: 0.5, metalness: 0.2 });
        const barrelMat = new THREE.MeshStandardMaterial({ color: 0xff6b6b, roughness: 0.5, metalness: 0.15 });
        const beamMat = new THREE.MeshStandardMaterial({ color: 0x22b8cf, roughness: 0.3, metalness: 0.4 });

        // --- HORIZONTAL PIPES (jump over or slide under) ---
        this.buildPipe(10, 1.0, 0, 0, pipeMat);        // Low pipe - slide under or jump
        this.buildPipe(8, 2.5, -18, 8, pipeMat);        // Mid pipe
        this.buildPipe(12, 0.8, 15, -20, pipeMat);      // Low pipe
        this.buildPipe(6, 3.5, 25, 15, pipeMat);        // High pipe - run under

        // --- FLOATING PLATFORMS (jump between) ---
        this.buildPlatform(5, 3, 3, 0, 12, platformMat);
        this.buildPlatform(4, 2, 4, -8, 18, platformMat);
        this.buildPlatform(3, 2, 3, 5, 25, platformMat);
        this.buildPlatform(6, 1.5, 6, -25, -10, platformMat);
        this.buildPlatform(4, 4, 4, 20, -25, platformMat);

        // --- BRIDGES (narrow walkways) ---
        this.buildBridge(16, -12, 5, 0, bridgeMat);    // Long bridge
        this.buildBridge(10, 22, -8, Math.PI / 2, bridgeMat);

        // --- ARCHWAYS (run through) ---
        this.buildArch(-10, -18, 0, archMat);
        this.buildArch(18, 10, Math.PI / 2, archMat);
        this.buildArch(0, -30, Math.PI / 4, archMat);

        // --- CRATE STACKS (climbing obstacles) ---
        this.buildCrateStack(-20, 20, 3, crateMat);
        this.buildCrateStack(28, -10, 2, crateMat);
        this.buildCrateStack(-30, -25, 4, crateMat);

        // --- TUNNELS (run through) ---
        this.buildTunnel(10, 30, 0, tunnelMat);
        this.buildTunnel(-15, -5, Math.PI / 2, tunnelMat);

        // --- BARREL CLUSTERS ---
        this.buildBarrelCluster(25, 25, barrelMat);
        this.buildBarrelCluster(-32, 5, barrelMat);
        this.buildBarrelCluster(5, -15, barrelMat);

        // --- BALANCE BEAMS ---
        this.buildBalanceBeam(-5, 32, 0, beamMat);
        this.buildBalanceBeam(30, 0, Math.PI / 3, beamMat);
    }

    // Horizontal pipe at a certain height
    buildPipe(length, height, x, z, mat) {
        const pipeRadius = 0.4;
        const pipeGeo = new THREE.CylinderGeometry(pipeRadius, pipeRadius, length, 12);
        const pipe = new THREE.Mesh(pipeGeo, mat);
        pipe.rotation.z = Math.PI / 2;
        pipe.position.set(x, height + pipeRadius, z);
        pipe.castShadow = true;
        pipe.receiveShadow = true;
        this.mesh.add(pipe);

        // Support pillars at each end
        const supportGeo = new THREE.CylinderGeometry(0.15, 0.2, height + pipeRadius, 8);
        const supportMat = mat.clone();
        supportMat.color.offsetHSL(0, -0.2, -0.1);

        const s1 = new THREE.Mesh(supportGeo, supportMat);
        s1.position.set(x - length / 2, (height + pipeRadius) / 2, z);
        s1.castShadow = true;
        this.mesh.add(s1);

        const s2 = new THREE.Mesh(supportGeo, supportMat);
        s2.position.set(x + length / 2, (height + pipeRadius) / 2, z);
        s2.castShadow = true;
        this.mesh.add(s2);

        // Colliders: supports as thin boxes, pipe as long thin box
        this.addBoxCollider(x - length / 2, 0, z, 0.5, height + pipeRadius * 2, 0.5);
        this.addBoxCollider(x + length / 2, 0, z, 0.5, height + pipeRadius * 2, 0.5);
        this.addBoxCollider(x, height, z, length, pipeRadius * 2, pipeRadius * 2);
    }

    // Raised platform
    buildPlatform(w, h, d, x, z, mat) {
        const platform = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        platform.position.set(x, h / 2, z);
        platform.castShadow = true;
        platform.receiveShadow = true;
        this.mesh.add(platform);

        // Top highlight stripe
        const stripe = new THREE.Mesh(
            new THREE.BoxGeometry(w + 0.1, 0.08, d + 0.1),
            new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.15 })
        );
        stripe.position.set(x, h + 0.04, z);
        this.mesh.add(stripe);

        this.addBoxCollider(x, 0, z, w, h, d);
    }

    // Narrow bridge walkway
    buildBridge(length, x, z, rotY, mat) {
        const bridgeWidth = 1.8;
        const bridgeHeight = 2.5;
        const plankThickness = 0.2;

        const group = new THREE.Group();
        group.rotation.y = rotY;

        // Walkway plank
        const plank = new THREE.Mesh(new THREE.BoxGeometry(length, plankThickness, bridgeWidth), mat);
        plank.position.set(0, bridgeHeight, 0);
        plank.castShadow = true;
        plank.receiveShadow = true;
        group.add(plank);

        // Railings
        const railGeo = new THREE.CylinderGeometry(0.06, 0.06, length, 6);
        const railMat = mat.clone();
        railMat.color.offsetHSL(0, 0, 0.15);

        const railL = new THREE.Mesh(railGeo, railMat);
        railL.rotation.z = Math.PI / 2;
        railL.position.set(0, bridgeHeight + 0.8, -bridgeWidth / 2 + 0.1);
        group.add(railL);

        const railR = new THREE.Mesh(railGeo, railMat);
        railR.rotation.z = Math.PI / 2;
        railR.position.set(0, bridgeHeight + 0.8, bridgeWidth / 2 - 0.1);
        group.add(railR);

        // Support legs
        const legGeo = new THREE.BoxGeometry(0.3, bridgeHeight, 0.3);
        const positions = [
            [-length / 2 + 0.3, bridgeHeight / 2, 0],
            [length / 2 - 0.3, bridgeHeight / 2, 0],
        ];
        positions.forEach(p => {
            const leg = new THREE.Mesh(legGeo, mat);
            leg.position.set(...p);
            leg.castShadow = true;
            group.add(leg);
        });

        group.position.set(x, 0, z);
        this.mesh.add(group);

        // Colliders (approximate with rotated box)
        const cos = Math.cos(rotY);
        const sin = Math.sin(rotY);
        // Walkway collider
        const hw = length / 2;
        const hd = bridgeWidth / 2;
        this.addBoxCollider(
            x + 0 * cos, 0, z + 0 * sin,
            Math.abs(length * cos) + Math.abs(bridgeWidth * sin),
            bridgeHeight + plankThickness,
            Math.abs(length * sin) + Math.abs(bridgeWidth * cos)
        );
    }

    // Archway to run through
    buildArch(x, z, rotY, mat) {
        const group = new THREE.Group();
        group.rotation.y = rotY;

        const pillarGeo = new THREE.BoxGeometry(0.8, 5, 0.8);
        const pillarL = new THREE.Mesh(pillarGeo, mat);
        pillarL.position.set(-2, 2.5, 0);
        pillarL.castShadow = true;
        group.add(pillarL);

        const pillarR = new THREE.Mesh(pillarGeo, mat);
        pillarR.position.set(2, 2.5, 0);
        pillarR.castShadow = true;
        group.add(pillarR);

        // Top beam
        const topGeo = new THREE.BoxGeometry(4.8, 0.8, 1.0);
        const top = new THREE.Mesh(topGeo, mat);
        top.position.set(0, 5.2, 0);
        top.castShadow = true;
        group.add(top);

        // Decorative stripe
        const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2 });
        const stripeGeo = new THREE.BoxGeometry(4.9, 0.1, 1.1);
        const stripe = new THREE.Mesh(stripeGeo, stripeMat);
        stripe.position.set(0, 5.65, 0);
        group.add(stripe);

        group.position.set(x, 0, z);
        this.mesh.add(group);

        // Colliders for pillars only (archway is open in middle)
        const cos = Math.cos(rotY);
        const sin = Math.sin(rotY);
        this.addBoxCollider(x + (-2) * cos, 0, z + (-2) * sin, 0.8, 5.6, 0.8);
        this.addBoxCollider(x + (2) * cos, 0, z + (2) * sin, 0.8, 5.6, 0.8);
    }

    // Stacked crates for climbing
    buildCrateStack(x, z, count, mat) {
        for (let i = 0; i < count; i++) {
            const size = 2.0 - i * 0.2;
            const ox = (Math.random() - 0.5) * 0.4;
            const oz = (Math.random() - 0.5) * 0.4;
            const crate = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), mat);
            const yPos = i * 2.0 + size / 2;
            crate.position.set(x + ox, yPos, z + oz);
            crate.rotation.y = Math.random() * 0.3;
            crate.castShadow = true;
            crate.receiveShadow = true;
            this.mesh.add(crate);

            // Edge lines
            const edgesGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(size + 0.02, size + 0.02, size + 0.02));
            const edgesMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.12 });
            const edges = new THREE.LineSegments(edgesGeo, edgesMat);
            edges.position.copy(crate.position);
            edges.rotation.copy(crate.rotation);
            this.mesh.add(edges);

            this.addBoxCollider(x + ox, i * 2.0, z + oz, size, size, size);
        }
    }

    // Short tunnel to run through
    buildTunnel(x, z, rotY, mat) {
        const group = new THREE.Group();
        group.rotation.y = rotY;

        const tunnelLength = 8;
        const tunnelHeight = 3;
        const tunnelWidth = 4;
        const wallThickness = 0.5;

        // Left wall
        const wallL = new THREE.Mesh(new THREE.BoxGeometry(tunnelLength, tunnelHeight, wallThickness), mat);
        wallL.position.set(0, tunnelHeight / 2, -tunnelWidth / 2);
        wallL.castShadow = true;
        group.add(wallL);

        // Right wall
        const wallR = new THREE.Mesh(new THREE.BoxGeometry(tunnelLength, tunnelHeight, wallThickness), mat);
        wallR.position.set(0, tunnelHeight / 2, tunnelWidth / 2);
        wallR.castShadow = true;
        group.add(wallR);

        // Roof
        const roof = new THREE.Mesh(new THREE.BoxGeometry(tunnelLength, wallThickness, tunnelWidth + wallThickness), mat);
        roof.position.set(0, tunnelHeight + wallThickness / 2, 0);
        roof.castShadow = true;
        roof.receiveShadow = true;
        group.add(roof);

        group.position.set(x, 0, z);
        this.mesh.add(group);

        // Colliders
        const cos = Math.cos(rotY);
        const sin = Math.sin(rotY);
        // Left wall
        const lx = x + (-tunnelWidth / 2) * -sin;
        const lz = z + (-tunnelWidth / 2) * cos;
        this.addBoxCollider(lx, 0, lz,
            Math.abs(tunnelLength * cos) + wallThickness * Math.abs(sin),
            tunnelHeight,
            Math.abs(tunnelLength * sin) + wallThickness * Math.abs(cos)
        );
        // Right wall
        const rx = x + (tunnelWidth / 2) * -sin;
        const rz = z + (tunnelWidth / 2) * cos;
        this.addBoxCollider(rx, 0, rz,
            Math.abs(tunnelLength * cos) + wallThickness * Math.abs(sin),
            tunnelHeight,
            Math.abs(tunnelLength * sin) + wallThickness * Math.abs(cos)
        );
    }

    // Barrel cluster (cylindrical obstacles)
    buildBarrelCluster(x, z, mat) {
        const count = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) {
            const bx = x + (Math.random() - 0.5) * 5;
            const bz = z + (Math.random() - 0.5) * 5;
            const height = 1.5 + Math.random() * 1.0;
            const radius = 0.6 + Math.random() * 0.3;

            const barrel = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 10), mat);
            barrel.position.set(bx, height / 2, bz);
            barrel.castShadow = true;
            barrel.receiveShadow = true;
            this.mesh.add(barrel);

            // Top ring accent
            const ringGeo = new THREE.TorusGeometry(radius, 0.05, 6, 16);
            const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2 });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.rotation.x = Math.PI / 2;
            ring.position.set(bx, height + 0.01, bz);
            this.mesh.add(ring);

            // Approximate barrel as box collider
            this.addBoxCollider(bx, 0, bz, radius * 2, height, radius * 2);
        }
    }

    // Narrow balance beam
    buildBalanceBeam(x, z, rotY, mat) {
        const length = 12;
        const beamWidth = 0.5;
        const beamHeight = 1.5;

        const group = new THREE.Group();
        group.rotation.y = rotY;

        const beam = new THREE.Mesh(new THREE.BoxGeometry(length, 0.2, beamWidth), mat);
        beam.position.set(0, beamHeight, 0);
        beam.castShadow = true;
        group.add(beam);

        // Support legs
        const legGeo = new THREE.BoxGeometry(0.3, beamHeight, 0.3);
        const legMat = mat.clone();
        legMat.color.offsetHSL(0, -0.1, -0.1);

        [-length / 2 + 0.5, 0, length / 2 - 0.5].forEach(lx => {
            const leg = new THREE.Mesh(legGeo, legMat);
            leg.position.set(lx, beamHeight / 2, 0);
            leg.castShadow = true;
            group.add(leg);
        });

        group.position.set(x, 0, z);
        this.mesh.add(group);

        // Collider
        const cos = Math.cos(rotY);
        const sin = Math.sin(rotY);
        this.addBoxCollider(x, 0, z,
            Math.abs(length * cos) + Math.abs(beamWidth * sin),
            beamHeight + 0.2,
            Math.abs(length * sin) + Math.abs(beamWidth * cos)
        );
    }
}
