import { useEffect, useRef } from 'react';
import * as THREE from 'three';

const makeBox = (width, height, depth, color, roughness = 0.65) => {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const material = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.08 });
  return new THREE.Mesh(geometry, material);
};

function SolarJourneyScene({ delivered = false, installationDone = false, connected = false }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#dce9f7');
    scene.fog = new THREE.Fog('#dce9f7', 14, 30);

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 8.5, 15);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight('#ffffff', '#91a17a', 2.2));
    const sunLight = new THREE.DirectionalLight('#fff4d6', 3.2);
    sunLight.position.set(-5, 10, 7);
    sunLight.castShadow = true;
    scene.add(sunLight);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(34, 18),
      new THREE.MeshStandardMaterial({ color: '#9fc58e', roughness: 0.9 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.position.y = -0.05;
    scene.add(ground);

    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(22, 3.1),
      new THREE.MeshStandardMaterial({ color: '#48515e', roughness: 0.92 }),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.01;
    road.receiveShadow = true;
    scene.add(road);

    for (let x = -9; x <= 9; x += 2.6) {
      const stripe = makeBox(1.2, 0.025, 0.11, '#f8fafc');
      stripe.position.set(x, 0.04, 0);
      scene.add(stripe);
    }

    const warehouse = new THREE.Group();
    const warehouseBody = makeBox(4.2, 2.7, 3.2, '#f8fafc');
    warehouseBody.position.y = 1.35;
    warehouseBody.castShadow = true;
    warehouse.add(warehouseBody);
    const warehouseDoor = makeBox(1.8, 1.8, 0.1, '#263241');
    warehouseDoor.position.set(0.45, 0.9, 1.64);
    warehouse.add(warehouseDoor);
    const brand = makeBox(2.4, 0.42, 0.12, '#f97316');
    brand.position.set(0, 2.15, 1.66);
    warehouse.add(brand);
    warehouse.position.set(-8.2, 0, -3.4);
    scene.add(warehouse);

    const home = new THREE.Group();
    const homeBody = makeBox(4.3, 2.6, 3.6, '#fffaf0');
    homeBody.position.y = 1.3;
    homeBody.castShadow = true;
    home.add(homeBody);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(3.25, 1.65, 4),
      new THREE.MeshStandardMaterial({ color: '#243145', roughness: 0.75 }),
    );
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 3.15;
    roof.castShadow = true;
    home.add(roof);
    const door = makeBox(0.8, 1.65, 0.12, '#c56c2c');
    door.position.set(0.8, 0.83, 1.86);
    home.add(door);
    const panelMaterial = new THREE.MeshStandardMaterial({
      color: installationDone ? '#1366a3' : '#2a425c',
      metalness: 0.55,
      roughness: 0.28,
    });
    for (let x = -1.3; x <= 1.3; x += 0.86) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.06, 1.1), panelMaterial);
      panel.rotation.x = -0.48;
      panel.position.set(x, 3.78, -0.35);
      panel.castShadow = true;
      home.add(panel);
    }
    home.position.set(8.2, 0, -3.3);
    scene.add(home);

    const truck = new THREE.Group();
    const wheels = [];
    const truckBase = makeBox(3.1, 0.55, 1.5, '#111827');
    truckBase.position.y = 0.65;
    truck.add(truckBase);
    const cabin = makeBox(1.15, 1.35, 1.46, '#f97316');
    cabin.position.set(1, 1.35, 0);
    cabin.castShadow = true;
    truck.add(cabin);
    const cargo = makeBox(1.85, 1.55, 1.42, '#f8fafc');
    cargo.position.set(-0.55, 1.45, 0);
    cargo.castShadow = true;
    truck.add(cargo);
    const cargoMark = makeBox(1.15, 0.22, 0.04, '#f97316');
    cargoMark.position.set(-0.55, 1.48, 0.73);
    truck.add(cargoMark);
    for (const x of [-0.85, 0.95]) {
      for (const z of [-0.72, 0.72]) {
        const wheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.36, 0.36, 0.24, 18),
          new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.8 }),
        );
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(x, 0.42, z);
        truck.add(wheel);
        wheels.push(wheel);
      }
    }
    truck.position.set(delivered ? 7 : -7, 0, 0);
    scene.add(truck);

    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(0.8, 24, 24),
      new THREE.MeshBasicMaterial({ color: '#ffb21c' }),
    );
    sun.position.set(-7, 7, -5);
    scene.add(sun);

    const clouds = [];
    for (let index = 0; index < 3; index += 1) {
      const cloud = new THREE.Group();
      for (let puff = 0; puff < 4; puff += 1) {
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.45 + (puff % 2) * 0.12, 16, 16),
          new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 }),
        );
        mesh.position.set(puff * 0.55, Math.sin(puff) * 0.18, 0);
        cloud.add(mesh);
      }
      cloud.position.set(-10 + index * 8, 6.1 + index * 0.55, -6 - index);
      clouds.push(cloud);
      scene.add(cloud);
    }

    const trees = [];
    for (const x of [-5.8, -3.7, 4.7, 6.3]) {
      const tree = new THREE.Group();
      const trunk = makeBox(0.22, 1.1, 0.22, '#80522f');
      trunk.position.y = 0.55;
      tree.add(trunk);
      const crown = new THREE.Mesh(
        new THREE.ConeGeometry(0.72, 1.8, 7),
        new THREE.MeshStandardMaterial({ color: '#3c8a4f', roughness: 0.9 }),
      );
      crown.position.y = 1.75;
      crown.castShadow = true;
      tree.add(crown);
      tree.position.set(x, 0, 3.4 + (Math.abs(x) % 2));
      trees.push(tree);
      scene.add(tree);
    }

    const energyDots = [];
    if (installationDone) {
      for (let index = 0; index < 8; index += 1) {
        const dot = new THREE.Mesh(
          new THREE.SphereGeometry(0.08, 10, 10),
          new THREE.MeshBasicMaterial({ color: connected ? '#55d67a' : '#ffb21c' }),
        );
        dot.position.set(6.8, 4.5, -3.5);
        energyDots.push(dot);
        scene.add(dot);
      }
    }

    const resize = () => {
      const width = Math.max(mount.clientWidth, 280);
      const height = Math.max(mount.clientHeight, 300);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    let frame;
    const clock = new THREE.Clock();
    const animate = () => {
      const elapsed = clock.getElapsedTime();
      if (!delivered) truck.position.x = -7 + ((elapsed * 1.45) % 14);
      truck.position.y = 0.04 + Math.sin(elapsed * 6) * 0.025;
      wheels.forEach(wheel => { wheel.rotation.z = -elapsed * 4; });
      sun.position.y = 7 + Math.sin(elapsed * 0.65) * 0.2;
      home.rotation.y = Math.sin(elapsed * 0.32) * 0.015;
      clouds.forEach((cloud, index) => {
        cloud.position.x = -12 + ((elapsed * (0.3 + index * 0.06) + index * 8) % 26);
      });
      trees.forEach((tree, index) => {
        tree.rotation.z = Math.sin(elapsed * 1.1 + index) * 0.018;
      });
      energyDots.forEach((dot, index) => {
        const travel = (elapsed * 0.45 + index / energyDots.length) % 1;
        dot.position.set(6.7 + travel * 2.2, 4.6 - travel * 2.5, -3.45);
        dot.scale.setScalar(0.7 + Math.sin(elapsed * 4 + index) * 0.25);
      });
      camera.position.x = Math.sin(elapsed * 0.18) * 0.25;
      camera.lookAt(0, 0.5, 0);
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.dispose();
      scene.traverse(object => {
        object.geometry?.dispose();
        if (Array.isArray(object.material)) object.material.forEach(material => material.dispose());
        else object.material?.dispose();
      });
      mount.removeChild(renderer.domElement);
    };
  }, [connected, delivered, installationDone]);

  return (
    <section className="solar-journey" aria-label="Jornada animada do equipamento até o cliente">
      <div className="journey-copy">
        <span>Rota do seu sistema</span>
        <h2>{connected ? 'Seu sistema está conectado.' : delivered ? 'Seu equipamento chegou ao destino.' : 'Seu kit solar está a caminho.'}</h2>
        <p>{connected ? 'A energia já percorre o sistema até sua casa. Continue acompanhando a geração.' : delivered ? 'Entrega confirmada. Agora a equipe segue com instalação e ligação.' : 'Acompanhe a jornada visual da DRM até sua casa enquanto preparamos os próximos passos.'}</p>
      </div>
      <div className="journey-canvas" ref={mountRef} />
      <div className="journey-labels" aria-hidden="true">
        <span>Centro DRM</span>
        <strong>{connected ? 'Gerando energia' : delivered ? 'Entregue' : 'Em preparação e transporte'}</strong>
        <span>Seu imóvel</span>
      </div>
    </section>
  );
}

export default SolarJourneyScene;
