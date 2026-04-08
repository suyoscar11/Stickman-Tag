import * as THREE from 'three';
import GameObject3D from './GameObject3D.js';

export default class ParkourElement extends GameObject3D {
    constructor(scene, type, x, y, z, rotationY = 0) {
        super(scene);
        this.mesh.position.set(x, y, z);
        this.mesh.rotation.y = rotationY;

        const material = new THREE.MeshStandardMaterial({
            color: 0xb0bec5,
            roughness: 0.6,
            emissive: 0x546e7a,
            emissiveIntensity: 0.1,
        });

        const accentMat = new THREE.MeshStandardMaterial({
            color: 0xfcc419,
            emissive: 0xf59f00,
            emissiveIntensity: 0.3,
            transparent: true,
            opacity: 0.7,
        });

        if (type === 'ramp') {
            const rampGeo = new THREE.BoxGeometry(4, 0.25, 8);
            const rampMesh = new THREE.Mesh(rampGeo, material);
            rampMesh.position.set(0, 2, 0);
            rampMesh.rotation.x = -Math.PI / 6;
            rampMesh.castShadow = true;
            rampMesh.receiveShadow = true;
            this.mesh.add(rampMesh);

            const stripeGeo = new THREE.BoxGeometry(4.1, 0.05, 0.15);
            const stripe = new THREE.Mesh(stripeGeo, accentMat);
            stripe.position.set(0, 2.1, -3.9);
            stripe.rotation.x = -Math.PI / 6;
            this.mesh.add(stripe);

            this.colliders.push({
                type: 'slope',
                minX: x - 2, maxX: x + 2,
                minZ: z - 4, maxZ: z + 4,
                baseY: y, topY: y + 4,
                rotation: rotationY,
            });
        } else if (type === 'platform_stairs') {
            for (let i = 0; i < 4; i++) {
                const step = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 2), material);
                step.position.set(0, i, i * -2);
                step.castShadow = true;
                step.receiveShadow = true;
                this.mesh.add(step);

                const edge = new THREE.Mesh(
                    new THREE.BoxGeometry(4.05, 0.05, 0.1),
                    accentMat
                );
                edge.position.set(0, i + 0.5, i * -2 + 1);
                this.mesh.add(edge);

                this.addBoxCollider(x, y + i, z + (i * -2), 4, 1, 2);
            }
        }
    }
}
