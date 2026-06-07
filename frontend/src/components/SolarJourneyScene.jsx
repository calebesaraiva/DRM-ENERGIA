import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

const makeBox = (width, height, depth, color, roughness = 0.65) => {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.08 }),
  );
  mesh.castShadow = true;
  return mesh;
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getRouteProgress = ({ startDate, deadline, delivered }) => {
  if (delivered) return 1;
  const start = new Date(startDate).getTime();
  const end = new Date(deadline).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0.18;
  return clamp((Date.now() - start) / (end - start), 0.05, 0.94);
};

const getJourneyStage = (progress, delivered, connected) => {
  if (connected) return { title: 'Seu sistema está conectado.', status: 'Gerando energia', detail: 'O equipamento concluiu a jornada e a energia já percorre o sistema até sua casa.' };
  if (delivered) return { title: 'Seu equipamento chegou ao destino.', status: 'Entrega confirmada', detail: 'O kit está no imóvel e a equipe segue com instalação e ligação.' };
  if (progress < 0.22) return { title: 'Seu kit saiu da transportadora.', status: 'Saindo do centro DRM', detail: 'Conferência concluída. O equipamento iniciou a viagem até sua cidade.' };
  if (progress < 0.58) return { title: 'Seu kit está percorrendo a estrada.', status: 'Em trânsito rodoviário', detail: 'O caminhão avança pelo trajeto principal e segue dentro do prazo previsto.' };
  if (progress < 0.82) return { title: 'Seu kit está chegando à região de destino.', status: 'Próximo da cidade', detail: 'A maior parte da rota foi concluída. A equipe acompanha os últimos trechos.' };
  return { title: 'Seu kit está perto do seu imóvel.', status: 'Rota final de entrega', detail: 'O caminhão já está na cidade de destino e se aproxima do endereço.' };
};

function SolarJourneyScene({
  delivered = false,
  installationDone = false,
  connected = false,
  startDate,
  deadline,
  destination = 'Sua cidade',
}) {
  const mountRef = useRef(null);
  const routeProgress = useMemo(
    () => getRouteProgress({ startDate, deadline, delivered: delivered || connected }),
    [connected, deadline, delivered, startDate],
  );
  const stage = getJourneyStage(routeProgress, delivered, connected);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#d9eaf7');
    scene.fog = new THREE.Fog('#d9eaf7', 24, 48);

    const camera = new THREE.OrthographicCamera(-24, 24, 14, -14, 0.1, 100);
    camera.position.set(0, 22, 23);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight('#ffffff', '#78926f', 2.35));
    const daylight = new THREE.DirectionalLight('#fff3d1', 3);
    daylight.position.set(-8, 14, 8);
    daylight.castShadow = true;
    scene.add(daylight);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(48, 22),
      new THREE.MeshStandardMaterial({ color: '#a9cf91', roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const river = new THREE.Mesh(
      new THREE.PlaneGeometry(5.2, 22),
      new THREE.MeshStandardMaterial({ color: '#4ba3cf', roughness: 0.28, metalness: 0.12 }),
    );
    river.rotation.x = -Math.PI / 2;
    river.position.set(0, 0.025, 0);
    scene.add(river);

    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(38, 3.1),
      new THREE.MeshStandardMaterial({ color: '#48515e', roughness: 0.92 }),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.1;
    road.receiveShadow = true;
    scene.add(road);

    const bridge = makeBox(5.8, 0.32, 3.7, '#6b7280');
    bridge.position.set(0, 0.16, 0);
    scene.add(bridge);
    for (const z of [-1.72, 1.72]) {
      const rail = makeBox(5.8, 0.22, 0.12, '#e5e7eb');
      rail.position.set(0, 0.62, z);
      scene.add(rail);
    }

    for (let x = -17; x <= 17; x += 2.25) {
      const stripe = makeBox(1.05, 0.035, 0.12, '#f8fafc');
      stripe.position.set(x, 0.31, 0);
      scene.add(stripe);
    }

    const warehouse = new THREE.Group();
    const warehouseBody = makeBox(5, 3, 3.8, '#f8fafc');
    warehouseBody.position.y = 1.5;
    warehouse.add(warehouseBody);
    const warehouseDoor = makeBox(2.1, 2, 0.1, '#263241');
    warehouseDoor.position.set(0.7, 1, 1.95);
    warehouse.add(warehouseDoor);
    const brand = makeBox(2.8, 0.48, 0.12, '#f97316');
    brand.position.set(0, 2.45, 1.98);
    warehouse.add(brand);
    warehouse.position.set(-18.5, 0, -4.2);
    scene.add(warehouse);

    const city = new THREE.Group();
    const buildingColors = ['#f8fafc', '#dbe5f1', '#ffe4c7', '#c8d7e8'];
    for (let index = 0; index < 9; index += 1) {
      const height = 1.6 + (index % 4) * 0.55;
      const building = makeBox(1.25, height, 1.2, buildingColors[index % buildingColors.length]);
      building.position.set((index % 5) * 1.55, height / 2, Math.floor(index / 5) * 1.7);
      city.add(building);
    }
    city.position.set(8.6, 0, -6.2);
    scene.add(city);

    const home = new THREE.Group();
    const homeBody = makeBox(3.5, 2.3, 3, '#fffaf0');
    homeBody.position.y = 1.15;
    home.add(homeBody);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(2.7, 1.45, 4),
      new THREE.MeshStandardMaterial({ color: '#243145', roughness: 0.75 }),
    );
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 2.85;
    home.add(roof);
    const panelMaterial = new THREE.MeshStandardMaterial({
      color: installationDone ? '#1366a3' : '#2a425c',
      metalness: 0.55,
      roughness: 0.28,
    });
    for (let x = -1; x <= 1; x += 0.68) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.06, 0.9), panelMaterial);
      panel.rotation.x = -0.5;
      panel.position.set(x, 3.35, -0.25);
      home.add(panel);
    }
    home.position.set(18.5, 0, -4);
    scene.add(home);

    const truck = new THREE.Group();
    const wheels = [];
    const truckBase = makeBox(2.6, 0.48, 1.25, '#111827');
    truckBase.position.y = 0.62;
    truck.add(truckBase);
    const cabin = makeBox(0.95, 1.16, 1.2, '#f97316');
    cabin.position.set(0.85, 1.25, 0);
    truck.add(cabin);
    const cargo = makeBox(1.52, 1.35, 1.18, '#f8fafc');
    cargo.position.set(-0.48, 1.32, 0);
    truck.add(cargo);
    for (const x of [-0.72, 0.78]) {
      for (const z of [-0.62, 0.62]) {
        const pivot = new THREE.Group();
        const wheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.3, 0.3, 0.2, 18),
          new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.8 }),
        );
        wheel.rotation.x = Math.PI / 2;
        pivot.position.set(x, 0.42, z);
        pivot.add(wheel);
        truck.add(pivot);
        wheels.push(wheel);
      }
    }
    scene.add(truck);

    const progressX = -16.2 + routeProgress * 32.4;
    truck.position.set(progressX, 0, 0);

    const routeMarkers = [
      { x: -16.2, color: '#f97316' },
      { x: 0, color: '#1677b8' },
      { x: 10.5, color: '#8b5cf6' },
      { x: 16.2, color: '#16a34a' },
    ];
    routeMarkers.forEach(({ x, color }) => {
      const marker = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 0.55, 20),
        new THREE.MeshStandardMaterial({ color, roughness: 0.5 }),
      );
      marker.position.set(x, 0.48, -2);
      scene.add(marker);
    });

    const clouds = [];
    for (let index = 0; index < 4; index += 1) {
      const cloud = new THREE.Group();
      for (let puff = 0; puff < 4; puff += 1) {
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.4 + (puff % 2) * 0.1, 14, 14),
          new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 }),
        );
        mesh.position.set(puff * 0.48, Math.sin(puff) * 0.16, 0);
        cloud.add(mesh);
      }
      cloud.position.set(-18 + index * 11, 7 + index * 0.35, -8);
      clouds.push(cloud);
      scene.add(cloud);
    }

    const resize = () => {
      const width = Math.max(mount.clientWidth, 280);
      const height = Math.max(mount.clientHeight, 300);
      renderer.setSize(width, height, false);
      const aspect = width / height;
      const halfWidth = 24;
      const halfHeight = halfWidth / aspect;
      camera.left = -halfWidth;
      camera.right = halfWidth;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    let frame;
    const clock = new THREE.Clock();
    const animate = () => {
      const elapsed = clock.getElapsedTime();
      const drift = delivered ? 0 : Math.sin(elapsed * 0.75) * 0.22;
      truck.position.x = progressX + drift;
      truck.position.y = 0.04 + Math.sin(elapsed * 6) * 0.018;
      wheels.forEach(wheel => { wheel.rotation.y = -elapsed * 2.2; });
      clouds.forEach((cloud, index) => {
        cloud.position.x = -23 + ((elapsed * (0.24 + index * 0.035) + index * 11) % 52);
      });
      river.material.color.offsetHSL(0, 0, Math.sin(elapsed * 1.2) * 0.001);
      camera.lookAt(0, 0.3, 0);
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
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [connected, delivered, installationDone, routeProgress]);

  return (
    <section className="solar-journey" aria-label="Mapa animado da rota do equipamento até o cliente">
      <div className="journey-copy">
        <span>Rastreamento visual da entrega</span>
        <h2>{stage.title}</h2>
        <p>{stage.detail}</p>
      </div>
      <div className="journey-progress" aria-label={`${Math.round(routeProgress * 100)}% da rota estimada concluída`}>
        <span><b style={{ width: `${routeProgress * 100}%` }}></b></span>
        <strong>{Math.round(routeProgress * 100)}% da rota estimada</strong>
      </div>
      <div className="journey-canvas" ref={mountRef} />
      <div className="journey-route-labels" aria-hidden="true">
        <span>Transportadora DRM</span>
        <span>Ponte e trajeto</span>
        <span>{destination}</span>
        <span>Seu imóvel</span>
      </div>
      <div className="journey-status">{stage.status}</div>
    </section>
  );
}

export default SolarJourneyScene;
