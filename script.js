/**
 * HERO OF THE SILENT TOWN - CORE ENGINE
 * Realistic 2D Simulation / Open-World City
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const mmCanvas = document.getElementById('minimap');
const mmCtx = mmCanvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// --- GAME STATE ---
const state = {
    player: {
        x: 2000, y: 3000,
        angle: 0,
        speed: 0,
        health: 100,
        stamina: 100,
        weapon: 0, 
        ammo: [12, 30, 5, 2],
        isRiding: false,
        vehicle: null,
        targetAngle: 0,
        isSprinting: false,
        lastHealTime: 0,
        muzzleFlash: 0, // Timer for muzzle flash visibility
        fireRate: 0 // Timer to limit fire rate
    },
    cam: { x: 0, y: 0, zoom: 1, minZoom: 0.3, maxZoom: 1.5 },
    keys: {},
    mouse: { x: 0, y: 0, down: false },
    entities: [],
    vehicles: [],
    zombies: [],
    projectiles: [],
    explosions: [],
    particles: [],
    trafficLights: [],
    police: [],
    people: [], // Pedestrians
    worldSize: 6000,
    active: false // Game starts paused on the intro screen
};

// --- WORLD DATA ---
const ROAD_WIDTH = 200;
const LANE_WIDTH = 80;
const roads = [
    { x1: 0, y1: 1500, x2: 6000, y2: 1500, type: 'h' },
    { x1: 0, y1: 3000, x2: 6000, y2: 3000, type: 'h' },
    { x1: 0, y1: 4500, x2: 6000, y2: 4500, type: 'h' },
    { x1: 1500, y1: 0, x2: 1500, y2: 6000, type: 'v' },
    { x1: 3000, y1: 0, x2: 3000, y2: 6000, type: 'v' },
    { x1: 4500, y1: 0, x2: 4500, y2: 6000, type: 'v' }
];

const intersections = [
    { x: 1500, y: 1500, state: 0, timer: 0 },
    { x: 3000, y: 1500, state: 0, timer: 0 },
    { x: 4500, y: 1500, state: 0, timer: 0 },
    { x: 1500, y: 3000, state: 1, timer: 0 },
    { x: 3000, y: 3000, state: 1, timer: 0 },
    { x: 4500, y: 3000, state: 1, timer: 0 },
    { x: 1500, y: 4500, state: 0, timer: 0 },
    { x: 3000, y: 4500, state: 0, timer: 0 },
    { x: 4500, y: 4500, state: 0, timer: 0 }
];

// --- CLASSES ---

class Particle {
    constructor(x, y, color, speed, angle, life) {
        this.x = x; this.y = y;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.color = color;
        this.life = life;
        this.maxLife = life;
    }
    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;
    }
    draw(ctx) {
        ctx.globalAlpha = this.life / this.maxLife;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

class Projectile {
    constructor(x, y, angle, type) {
        this.x = x; this.y = y;
        this.angle = angle;
        this.type = type; // 'bullet', 'grenade'
        this.speed = type === 'bullet' ? 1200 : 350;
        this.life = type === 'bullet' ? 1.2 : 2.5;
        this.radius = type === 'bullet' ? 3 : 8;
        this.vz = type === 'grenade' ? 120 : 0;
        this.z = type === 'grenade' ? 10 : 0;
        this.bounced = 0;
    }
    update(dt) {
        this.x += Math.cos(this.angle) * this.speed * dt;
        this.y += Math.sin(this.angle) * this.speed * dt;
        
        // Bullet tracer particles
        if (this.type === 'bullet' && Math.random() > 0.4) {
            state.particles.push(new Particle(this.x, this.y, '#FFD700', 15, this.angle + Math.PI + (Math.random()-0.5)*0.5, 0.15));
        }

        if (this.type === 'grenade') {
            this.speed *= 0.97;
            this.z += this.vz * dt;
            this.vz -= 300 * dt; // gravity
            if (this.z <= 0) {
                this.z = 0;
                this.bounced++;
                if (this.bounced >= 3 || this.speed < 20) {
                    // Explode on 3rd bounce or when stopped
                    explode(this.x, this.y, 200);
                    return false;
                }
                this.vz = Math.abs(this.vz) * 0.4;
                this.speed *= 0.6;
            }
            // Grenade trail smoke
            if (Math.random() > 0.3) {
                state.particles.push(new Particle(this.x, this.y, '#888', 20 + Math.random()*30, Math.random()*Math.PI*2, 0.4));
            }
        }
        this.life -= dt;
        if (this.life <= 0) {
            if (this.type === 'grenade') explode(this.x, this.y, 200);
            return false;
        }
        return true;
    }
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y - this.z);
        ctx.rotate(this.angle);
        
        if (this.type === 'bullet') {
            ctx.shadowBlur = 18;
            ctx.shadowColor = '#FFD700';
            ctx.fillStyle = '#FFF';
            ctx.fillRect(-8, -2, 16, 4);
        } else {
            // Grenade - visible green sphere with shadow
            ctx.shadowBlur = 8; ctx.shadowColor = '#ff4400';
            ctx.fillStyle = '#4b5320';
            ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI*2); ctx.fill();
            // Pin details
            ctx.fillStyle = '#888';
            ctx.fillRect(-2, -this.radius, 4, 4);
            // Ground shadow when airborne
            if (this.z > 0) {
                ctx.fillStyle = 'rgba(0,0,0,0.3)';
                ctx.beginPath(); ctx.ellipse(0, this.z, this.radius, 4, 0, 0, Math.PI*2); ctx.fill();
            }
        }
        ctx.restore();
    }
}

class Zombie {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.angle = Math.random() * Math.PI * 2;
        this.speed = 30 + Math.random() * 40; // SLOW CREEPY ZOMBIES
        this.health = 100;
        this.radius = 18;
        this.state = 'idle'; 
        this.target = null;
        this.animTimer = Math.random() * 10;
        this.color = `hsl(80, 10%, ${20 + Math.random() * 15}%)`;
    }

    update(dt) {
        if (this.health <= 0) return false;

        let dist = Math.hypot(state.player.x - this.x, state.player.y - this.y);
        
        if (dist < 1200) {
            this.state = 'chase';
            this.angle = Math.atan2(state.player.y - this.y, state.player.x - this.x);
            // Erratic lurching
            let lurch = 1 + Math.sin(this.animTimer * 2) * 0.5;
            this.x += Math.cos(this.angle) * this.speed * lurch * dt;
            this.y += Math.sin(this.angle) * this.speed * lurch * dt;

            if (dist < 40 && !state.player.isRiding) {
                state.player.health -= 12 * dt;
                state.player.lastHealTime = Date.now();
                state.player.x += Math.cos(this.angle) * 30 * dt;
                state.player.y += Math.sin(this.angle) * 30 * dt;
            }
        } else {
            this.state = 'idle';
            this.angle += Math.sin(this.animTimer) * dt;
            this.x += Math.cos(this.angle) * 20 * dt;
            this.y += Math.sin(this.angle) * 20 * dt;
        }

        this.animTimer += dt * 3;
        return true;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        const bob = Math.sin(this.animTimer) * 2;

        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(-2, 8, 18, 10, 0, 0, Math.PI*2); ctx.fill();

        // Arms reaching
        ctx.fillStyle = this.color;
        ctx.fillRect(12 + bob, -10, 18, 5);
        ctx.fillRect(12 + bob, 5, 18, 5);

        // Scary Body (Tatters)
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(-10, -14, 20, 28);

        // Decaying Head
        ctx.fillStyle = this.color;
        ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI*2); ctx.fill();

        // Glowing red eyes
        ctx.fillStyle = '#f00';
        ctx.shadowBlur = 8; ctx.shadowColor = 'red';
        ctx.beginPath(); ctx.arc(8, -4, 2.5, 0, Math.PI*2); ctx.arc(8, 4, 2.5, 0, Math.PI*2); ctx.fill();
        ctx.restore();
    }
}

class Vehicle {
    constructor(x, y, type, color, isVertical, dir) {
        this.x = x; this.y = y;
        this.type = type; // 'car', 'bike'
        this.color = color;
        this.isVertical = isVertical;
        this.dir = dir;
        this.angle = isVertical ? (dir === 1 ? Math.PI/2 : -Math.PI/2) : (dir === 1 ? 0 : Math.PI);
        this.speed = 0;
        // Medium realistic speeds
        this.maxSpeed = this.isHeroVehicle ? 200 : (type === 'bike' ? 100 : 70);
        this.cruiseSpeed = this.isHeroVehicle ? 0 : this.maxSpeed * (0.55 + Math.random() * 0.2);
        this.acceleration = this.isHeroVehicle ? 80 : 35;
        this.w = type === 'bike' ? 16 : 36;
        this.h = type === 'bike' ? 36 : 75;
        this.isPlayer = false;
        this.braking = false;
    }
    update(dt) {
        if (!this.isPlayer && !this.isHeroVehicle) {
            let target = this.cruiseSpeed;
            this.braking = false;

            // --- TRAFFIC LIGHTS: stop smoothly before red ---
            for (let tl of intersections) {
                let blocked = false;
                if (this.isVertical) {
                    if (tl.state === 1 && Math.abs(this.x - tl.x) < ROAD_WIDTH) {
                        let d = this.dir === 1 ? tl.y - this.y : this.y - tl.y;
                        if (d > 10 && d < 180) { blocked = true; }
                    }
                } else {
                    if (tl.state === 0 && Math.abs(this.y - tl.y) < ROAD_WIDTH) {
                        let d = this.dir === 1 ? tl.x - this.x : this.x - tl.x;
                        if (d > 10 && d < 180) { blocked = true; }
                    }
                }
                if (blocked) { target = 0; this.braking = true; break; }
            }

            // --- COLLISION CHAIN: brake behind slower vehicle ---
            if (!this.braking) {
                for (let other of state.vehicles) {
                    if (other === this || other.isVertical !== this.isVertical || other.dir !== this.dir) continue;
                    let dx = other.x - this.x, dy = other.y - this.y;
                    let d = Math.hypot(dx, dy);
                    let ahead = this.isVertical ? (Math.sign(dy) === this.dir) : (Math.sign(dx) === this.dir);
                    let sameL = this.isVertical ? Math.abs(dx) < 30 : Math.abs(dy) < 30;
                    if (d < 130 && ahead && sameL) {
                        target = Math.min(target, Math.max(0, other.speed - 5));
                        this.braking = true;
                    }
                }
            }

            // Smooth acceleration / braking
            if (this.speed < target) this.speed = Math.min(target, this.speed + this.acceleration * dt);
            else this.speed = Math.max(target, this.speed - this.acceleration * 3 * dt);
            this.speed = Math.max(0, this.speed);
        }

        this.x += Math.cos(this.angle) * this.speed * dt;
        this.y += Math.sin(this.angle) * this.speed * dt;

        // Loop world
        if (this.x < -200) this.x = state.worldSize + 200;
        if (this.x > state.worldSize + 200) this.x = -200;
        if (this.y < -200) this.y = state.worldSize + 200;
        if (this.y > state.worldSize + 200) this.y = -200;
    }
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        if (this.type === 'bike') {
            // Realistic Motorcycle
            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.beginPath(); ctx.ellipse(0, 3, 18, 6, 0, 0, Math.PI*2); ctx.fill();
            // Frame
            ctx.fillStyle = this.color;
            ctx.beginPath(); ctx.roundRect(-this.w/2, -this.h/2, this.w, this.h, 4); ctx.fill();
            // Wheels
            ctx.fillStyle = '#111';
            ctx.beginPath(); ctx.ellipse(0, -this.h/2+6, 6, 8, 0, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(0, this.h/2-6, 6, 8, 0, 0, Math.PI*2); ctx.fill();
            // Seat
            ctx.fillStyle = '#333';
            ctx.fillRect(-4, -3, 8, 8);
            // Headlight
            ctx.fillStyle = '#fffde0';
            ctx.shadowBlur = 10; ctx.shadowColor = '#ffff00';
            ctx.beginPath(); ctx.arc(0, this.h/2-4, 4, 0, Math.PI*2); ctx.fill();
            // Taillight
            ctx.fillStyle = '#e00';
            ctx.shadowBlur = 6; ctx.shadowColor = 'red';
            ctx.beginPath(); ctx.arc(0, -this.h/2+4, 3, 0, Math.PI*2); ctx.fill();
            // Brake light
            if (this.braking) {
                ctx.fillStyle = 'rgba(255,0,0,0.6)';
                ctx.beginPath(); ctx.arc(0, -this.h/2+4, 6, 0, Math.PI*2); ctx.fill();
            }
        } else {
            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.fillRect(-this.h/2+8, -this.w/2+8, this.h, this.w);
            // Body
            ctx.fillStyle = this.color;
            ctx.beginPath(); ctx.roundRect(-this.h/2, -this.w/2, this.h, this.w, 4); ctx.fill();
            // Roof
            ctx.fillStyle = 'rgba(255,255,255,0.18)';
            ctx.beginPath(); ctx.roundRect(-this.h/4, -this.w/2+4, this.h/2, this.w-8, 3); ctx.fill();
            // Windshield
            ctx.fillStyle = 'rgba(130,210,255,0.6)';
            ctx.fillRect(this.h/4, -this.w/2+6, 10, this.w-12);
            // Rear window
            ctx.fillStyle = 'rgba(130,210,255,0.4)';
            ctx.fillRect(-this.h/4-8, -this.w/2+6, 8, this.w-12);
            // Wheels (4)
            ctx.fillStyle = '#111';
            let wx = this.h/2-12, wy = this.w/2;
            [[-wx,-wy+3],[wx,-wy+3],[-wx,wy-3],[wx,wy-3]].forEach(([ex,ey]) => {
                ctx.beginPath(); ctx.ellipse(ex, ey, 7, 5, 0, 0, Math.PI*2); ctx.fill();
            });
            // Headlights
            ctx.fillStyle = '#fffde0';
            ctx.shadowBlur = 12; ctx.shadowColor = '#ffff00';
            ctx.beginPath(); ctx.arc(this.h/2-2, -this.w/4, 4, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(this.h/2-2, this.w/4, 4, 0, Math.PI*2); ctx.fill();
            // Taillights
            ctx.fillStyle = '#e00';
            ctx.shadowBlur = 6; ctx.shadowColor = 'red';
            ctx.beginPath(); ctx.arc(-this.h/2+3, -this.w/4, 3, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(-this.h/2+3, this.w/4, 3, 0, Math.PI*2); ctx.fill();
            // Brake lights
            if (this.braking) {
                ctx.fillStyle = 'rgba(255,0,0,0.5)';
                ctx.beginPath(); ctx.arc(-this.h/2+3, -this.w/4, 7, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.arc(-this.h/2+3, this.w/4, 7, 0, Math.PI*2); ctx.fill();
            }
        }
        ctx.shadowBlur = 0;
        ctx.restore();
    }
}

// --- INITIALIZATION ---

function init() {
    // 3D Buildings Generation
    for (let i = 0; i < 50; i++) {
        let bx, by;
        do {
            bx = 500 + Math.random() * 5000;
            by = 500 + Math.random() * 5000;
        } while (roads.some(r => r.type === 'h' ? Math.abs(by - r.y1) < 250 : Math.abs(bx - r.x1) < 250));
        
        state.entities.push({
            type: 'building',
            x: bx, y: by,
            w: 150 + Math.random() * 100,
            h: 150 + Math.random() * 100,
            color: `hsl(${Math.random()*360}, 10%, 40%)`,
            height: 100 + Math.random() * 200
        });
    }

    // Spawn Vehicles - mix of cars and bikes
    const carColors = ['#c0392b','#2980b9','#27ae60','#8e44ad','#f39c12','#1abc9c','#95a5a6','#e67e22','#bdc3c7','#d35400'];
    const bikeColors = ['#e74c3c','#3498db','#2ecc71','#9b59b6','#f39c12','#1abc9c'];
    // Cars (30)
    for (let i = 0; i < 30; i++) {
        let road = roads[Math.floor(Math.random() * roads.length)];
        let isV = road.type === 'v';
        let dir = Math.random() > 0.5 ? 1 : -1;
        let laneOffset = (dir === 1 ? LANE_WIDTH / 2 : -LANE_WIDTH / 2);
        let x = isV ? road.x1 + laneOffset : Math.random() * 6000;
        let y = isV ? Math.random() * 6000 : road.y1 + laneOffset;
        let col = carColors[Math.floor(Math.random() * carColors.length)];
        state.vehicles.push(new Vehicle(x, y, 'car', col, isV, dir));
    }
    // Bikes (20)
    for (let i = 0; i < 20; i++) {
        let road = roads[Math.floor(Math.random() * roads.length)];
        let isV = road.type === 'v';
        let dir = Math.random() > 0.5 ? 1 : -1;
        let laneOffset = (dir === 1 ? LANE_WIDTH / 2 : -LANE_WIDTH / 2); // Exact same path as cars
        let x = isV ? road.x1 + laneOffset : Math.random() * 6000;
        let y = isV ? Math.random() * 6000 : road.y1 + laneOffset;
        let col = bikeColors[Math.floor(Math.random() * bikeColors.length)];
        state.vehicles.push(new Vehicle(x, y, 'bike', col, isV, dir));
    }

    // Hero's Personal Vehicle (Special Black Sports Car)
    let heroCar = new Vehicle(2000, 3060, 'car', '#0f0f0f', false, 1);
    heroCar.isHeroVehicle = true; // Prevents AI from taking over
    state.vehicles.push(heroCar);

    // Spawn People (Footpaths)
    for (let i = 0; i < 50; i++) {
        let road = roads[Math.floor(Math.random() * roads.length)];
        let isV = road.type === 'v';
        let dir = Math.random() > 0.5 ? 1 : -1;
        // Footpath goes outside the road width
        let pathOffset = (Math.random() > 0.5 ? 1 : -1) * (ROAD_WIDTH / 2 + 15);
        let x = isV ? road.x1 + pathOffset : Math.random() * 6000;
        let y = isV ? Math.random() * 6000 : road.y1 + pathOffset;
        state.people.push({
            x, y, isV, dir, 
            speed: 30 + Math.random() * 20, 
            timer: Math.random() * 10,
            col: `hsl(${Math.random()*360}, 50%, 50%)`
        });
    }

    // Spawn Traffic Police (near every signal, all 4 corners)
    for (let inter of intersections) {
        state.police.push({ x: inter.x - ROAD_WIDTH/2 - 25, y: inter.y - ROAD_WIDTH/2 - 15, facing: Math.PI/4 });
        state.police.push({ x: inter.x + ROAD_WIDTH/2 + 25, y: inter.y + ROAD_WIDTH/2 + 15, facing: -Math.PI*3/4 });
    }

    // Spawn Zombies
    for (let i = 0; i < 60; i++) {
        let zx, zy;
        do {
            zx = Math.random() * 6000;
            zy = Math.random() * 6000;
        } while (Math.hypot(zx - state.player.x, zy - state.player.y) < 800);
        state.zombies.push(new Zombie(zx, zy));
    }

    // Input Listeners
    window.addEventListener('keydown', e => { 
        state.keys[e.key.toLowerCase()] = true; 
        if(e.key.toLowerCase() === 'r') reload();
    });
    window.addEventListener('keyup', e => { state.keys[e.key.toLowerCase()] = false; });
    window.addEventListener('mousemove', e => {
        state.mouse.x = e.clientX;
        state.mouse.y = e.clientY;
    });
    window.addEventListener('mousedown', () => { state.mouse.down = true; });
    window.addEventListener('mouseup', () => { state.mouse.down = false; });

    // JOYSTICK LOGIC
    const joyBase = document.getElementById('joystick-base');
    const joyKnob = document.getElementById('joystick-knob');
    let joyActive = false;
    let joyStart = { x: 0, y: 0 };
    let joyMove = { x: 0, y: 0 };

    joyBase.addEventListener('pointerdown', e => {
        joyActive = true;
        joyStart = { x: e.clientX, y: e.clientY };
        joyBase.setPointerCapture(e.pointerId);
    });
    joyBase.addEventListener('pointermove', e => {
        if (!joyActive) return;
        let dx = e.clientX - joyStart.x;
        let dy = e.clientY - joyStart.y;
        let dist = Math.hypot(dx, dy);
        let max = 50;
        if (dist > max) { dx = (dx / dist) * max; dy = (dy / dist) * max; }
        joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        state.player.joyX = dx / max;
        state.player.joyY = dy / max;
    });
    joyBase.addEventListener('pointerup', () => {
        joyActive = false;
        joyKnob.style.transform = `translate(-50%, -50%)`;
        state.player.joyX = 0;
        state.player.joyY = 0;
    });

    // Camera Zoom via Mouse Wheel
    canvas.addEventListener('wheel', function(ev) {
        ev.preventDefault();
        if (ev.deltaY < 0) state.cam.zoom = Math.min(state.cam.maxZoom, state.cam.zoom + 0.08);
        else state.cam.zoom = Math.max(state.cam.minZoom, state.cam.zoom - 0.08);
    }, { passive: false });

    requestAnimationFrame(loop);
}

function selectWeapon(i) {
    state.player.weapon = i;
    document.querySelectorAll('.ws').forEach((el, idx) => {
        el.classList.toggle('active', idx === i);
    });
}

function fire() {
    const p = state.player;
    if (p.isReloading) return;
    if (p.fireRate > 0) return;
    
    p.fireRate = p.weapon === 0 ? 0.22 : 0.07;
    p.muzzleFlash = 0.05;

    const dx = state.mouse.x - (canvas.width/2);
    const dy = state.mouse.y - (canvas.height/2);
    const fireAngle = Math.atan2(dy, dx);
    p.angle = fireAngle;

    const bx = p.x + Math.cos(fireAngle) * 35;
    const by = p.y + Math.sin(fireAngle) * 35;
    state.projectiles.push(new Projectile(bx, by, fireAngle, 'bullet'));
    updateUI();
}

function reload() {
    if (state.player.isReloading) return;
    state.player.isReloading = true;
    state.player.reloadProgress = 0;
    // Sound/Visual flavor here
}

function explode(x, y, radius) {
    state.explosions.push({ x, y, radius, life: 0.5, maxLife: 0.5 });
    for (let i = 0; i < 15; i++) {
        let a = Math.random() * Math.PI * 2;
        state.particles.push(new Particle(x, y, i%2===0 ? '#ff6600' : '#ffcc00', 80+Math.random()*120, a, 0.3+Math.random()*0.3));
    }
    state.vehicles.forEach(v => {
        let d = Math.hypot(v.x - x, v.y - y);
        if (d < radius) v.speed += (1 - d/radius) * 300;
    });
    state.zombies.forEach(z => {
        let d = Math.hypot(z.x - x, z.y - y);
        if (d < radius) {
            z.health -= 200 * (1 - d/radius);
            spawnBlood(z.x, z.y);
        }
    });
}

function detonateC4() {
    state.entities = state.entities.filter(e => {
        if (e.type === 'c4') {
            explode(e.x, e.y, 250);
            return false;
        }
        return true;
    });
}

function updateUI() {
    document.getElementById('health-fill').style.width = Math.max(0, state.player.health) + '%';
    document.getElementById('stamina-fill').style.width = state.player.stamina + '%';
    document.getElementById('health-val').textContent = Math.max(0, Math.floor(state.player.health));
    document.getElementById('stamina-val').textContent = Math.floor(state.player.stamina);
    
    let nearCount = state.zombies.filter(z => Math.hypot(z.x - state.player.x, z.y - state.player.y) < 600).length;
    document.getElementById('zombie-pill').textContent = `🧟 ${nearCount} NEAR`;

    for (let i = 0; i < 2; i++) {
        let el = document.getElementById(`wa-${i}`);
        if (el) el.textContent = "∞";
    }
}

function spawnBlood(x, y) {
    for(let i=0; i<5; i++) {
        state.particles.push(new Particle(x, y, '#800000', 50 + Math.random()*100, Math.random()*Math.PI*2, 0.5 + Math.random()*0.5));
    }
}

function tryInteract() {
    if (state.player.isRiding) {
        state.player.isRiding = false;
        state.player.vehicle.isPlayer = false;
        state.player.vehicle = null;
        document.getElementById('vehicle-pill').textContent = '🚶 ON FOOT';
    } else {
        for (let v of state.vehicles) {
            if (Math.hypot(v.x - state.player.x, v.y - state.player.y) < 100) {
                state.player.isRiding = true;
                state.player.vehicle = v;
                v.isPlayer = true;
                document.getElementById('vehicle-pill').textContent = '🚗 RIDING ' + v.type.toUpperCase();
                break;
            }
        }
    }
}

// --- LOOP ---

function update(dt) {
    if (!state.active) return;

    // Traffic Lights
    intersections.forEach(inter => {
        inter.timer += dt;
        if (inter.timer > 5) {
            inter.state = 1 - inter.state;
            inter.timer = 0;
        }
    });

    // Player Movement
    const p = state.player;
    if (p.isRiding) {
        const v = p.vehicle;

        // FAST hero driving — higher max speed
        const heroMaxSpeed = v.type === 'bike' ? 400 : 300;
        const heroAccel = v.type === 'bike' ? 250 : 180;

        if (state.keys['w'] || (p.joyY && p.joyY < 0)) v.speed += heroAccel * dt;
        if (state.keys['s'] || (p.joyY && p.joyY > 0)) v.speed -= heroAccel * dt;
        v.speed = Math.max(-heroMaxSpeed * 0.3, Math.min(heroMaxSpeed, v.speed));

        let turnRate = 2.5 * dt * Math.min(1, Math.abs(v.speed) / 100 + 0.15);
        if (state.keys['a'] || (p.joyX && p.joyX < 0)) v.angle -= turnRate;
        if (state.keys['d'] || (p.joyX && p.joyX > 0)) v.angle += turnRate;
        
        v.speed *= 0.995; // Minimal drag for high speed feel
        p.x = v.x; p.y = v.y; p.angle = v.angle;
    } else {
        // Perfect Mouse Aiming: Angle always follows mouse position relative to center
        const dx = state.mouse.x - (canvas.width / 2);
        const dy = state.mouse.y - (canvas.height / 2);
        p.angle = Math.atan2(dy, dx);

        let moveX = p.joyX || (state.keys['d'] ? 1 : (state.keys['a'] ? -1 : 0));
        let moveY = p.joyY || (state.keys['w'] ? -1 : (state.keys['s'] ? 1 : 0));
        
        let speed = p.isSprinting ? 300 : 150;
        if (state.keys['shift'] && p.stamina > 0) {
            p.isSprinting = true;
            p.stamina -= 20 * dt;
        } else {
            p.isSprinting = false;
            p.stamina = Math.min(100, p.stamina + 10 * dt);
        }

        if (moveX || moveY) {
            let angle = Math.atan2(moveY, moveX);
            p.x += Math.cos(angle) * speed * dt;
            p.y += Math.sin(angle) * speed * dt;
            p.angle = angle;
        }
    }

    // World Bounds
    p.x = Math.max(0, Math.min(6000, p.x));
    p.y = Math.max(0, Math.min(6000, p.y));

    // Projectiles
    state.projectiles = state.projectiles.filter(pj => {
        let alive = pj.update(dt);
        if (alive && pj.type === 'bullet') {
            for (let z of state.zombies) {
                if (z.health > 0 && Math.hypot(pj.x - z.x, pj.y - z.y) < z.radius) {
                    z.health -= 40;
                    spawnBlood(z.x, z.y);
                    return false;
                }
            }
        }
        return alive;
    });

    // Vehicles
    state.vehicles.forEach(v => v.update(dt));

    // Zombies
    state.zombies = state.zombies.filter(z => z.update(dt));

    // Fire rate cooldown & Muzzle flash reduction
    if (p.muzzleFlash > 0) p.muzzleFlash -= dt;
    if (p.fireRate > 0) p.fireRate -= dt;

    // People walking AI
    state.people.forEach(person => {
        let vx = person.isV ? 0 : person.dir * person.speed;
        let vy = person.isV ? person.dir * person.speed : 0;
        person.x += vx * dt;
        person.y += vy * dt;
        person.timer += dt * 8; // anim speed
        // Loop map
        if (person.x < 0) person.x += state.worldSize;
        if (person.x > state.worldSize) person.x -= state.worldSize;
        if (person.y < 0) person.y += state.worldSize;
        if (person.y > state.worldSize) person.y -= state.worldSize;
    });

    if (state.player.isReloading) {
        state.player.reloadProgress += dt * 1.5;
        if (state.player.reloadProgress >= 1) {
            state.player.isReloading = false;
        }
    }

    // Particles
    state.particles = state.particles.filter(p => {
        p.update(dt);
        return p.life > 0;
    });

    // Explosions
    state.explosions = state.explosions.filter(ex => {
        ex.life -= dt;
        return ex.life > 0;
    });

    // Health Regen (if safe for 5 seconds)
    if (Date.now() - state.player.lastHealTime > 5000) {
        state.player.health = Math.min(100, state.player.health + 5 * dt);
        document.getElementById('heal-pill').classList.remove('hidden');
    } else {
        document.getElementById('heal-pill').classList.add('hidden');
    }

    // Death check
    if (state.player.health <= 0 && state.active) {
        state.active = false;
        document.getElementById('gameover-screen').classList.remove('hidden');
    }

    // Camera
    state.cam.x += (p.x - state.cam.x) * 0.1;
    state.cam.y += (p.y - state.cam.y) * 0.1;

    // Weapon Keys
    if (state.keys['1']) selectWeapon(0);
    if (state.keys['2']) selectWeapon(1);
    if (state.keys['3']) selectWeapon(2);
    if (state.keys['4']) selectWeapon(3);
    if (state.keys['e']) detonateC4();

    if (state.mouse.down && p.weapon <= 1) fire(); // auto fire for AK/Pistol (simple)

    updateUI();
}

// ======== MOUNTAINS RENDERER ========
function drawMountains(ctx) {
    const W = 6000;
    const mColors = ['#5d4037', '#6d4c41', '#795548'];
    const snowColor = '#eceff1';

    // --- NORTH MOUNTAINS ---
    for (let layer = 0; layer < 3; layer++) {
        ctx.fillStyle = mColors[layer];
        ctx.beginPath();
        ctx.moveTo(-300, -200 + layer * 30);
        for (let x = -300; x <= W + 300; x += 80) {
            let peakH = 180 + Math.sin(x * 0.005 + layer * 2) * 80 + Math.cos(x * 0.012) * 60;
            ctx.lineTo(x, -peakH + layer * 80);
        }
        ctx.lineTo(W + 300, 200);
        ctx.lineTo(-300, 200);
        ctx.closePath();
        ctx.fill();
    }
    // Snow caps north
    ctx.fillStyle = snowColor;
    for (let x = -200; x <= W + 200; x += 80) {
        let peakH = 180 + Math.sin(x * 0.005) * 80 + Math.cos(x * 0.012) * 60;
        ctx.beginPath();
        ctx.moveTo(x, -peakH);
        ctx.lineTo(x - 20, -peakH + 35);
        ctx.lineTo(x + 20, -peakH + 35);
        ctx.closePath();
        ctx.fill();
    }

    // --- EAST MOUNTAINS ---
    for (let layer = 0; layer < 3; layer++) {
        ctx.fillStyle = mColors[layer];
        ctx.beginPath();
        ctx.moveTo(W + 200 - layer * 30, -300);
        for (let y = -300; y <= W + 300; y += 80) {
            let peakH = 150 + Math.sin(y * 0.006 + layer * 3) * 70 + Math.cos(y * 0.01) * 50;
            ctx.lineTo(W + peakH - layer * 70, y);
        }
        ctx.lineTo(W - 100, W + 300);
        ctx.lineTo(W - 100, -300);
        ctx.closePath();
        ctx.fill();
    }
    // Snow caps east
    ctx.fillStyle = snowColor;
    for (let y = -200; y <= W + 200; y += 90) {
        let peakH = 150 + Math.sin(y * 0.006) * 70 + Math.cos(y * 0.01) * 50;
        ctx.beginPath();
        ctx.moveTo(W + peakH, y);
        ctx.lineTo(W + peakH - 30, y - 18);
        ctx.lineTo(W + peakH - 30, y + 18);
        ctx.closePath();
        ctx.fill();
    }

    // --- SOUTH MOUNTAINS (behind beach) ---
    for (let layer = 0; layer < 2; layer++) {
        ctx.fillStyle = mColors[layer];
        ctx.beginPath();
        ctx.moveTo(-300, W + 200 - layer * 20);
        for (let x = -300; x <= W + 300; x += 90) {
            let peakH = 120 + Math.sin(x * 0.007 + layer) * 60;
            ctx.lineTo(x, W + peakH - layer * 50);
        }
        ctx.lineTo(W + 300, W - 100);
        ctx.lineTo(-300, W - 100);
        ctx.closePath();
        ctx.fill();
    }

    // --- WEST MOUNTAINS (behind river) ---
    for (let layer = 0; layer < 3; layer++) {
        ctx.fillStyle = mColors[layer];
        ctx.beginPath();
        ctx.moveTo(-200 + layer * 30, -300);
        for (let y = -300; y <= W + 300; y += 80) {
            let peakH = 160 + Math.sin(y * 0.005 + layer * 2) * 80;
            ctx.lineTo(-peakH + layer * 60, y);
        }
        ctx.lineTo(100, W + 300);
        ctx.lineTo(100, -300);
        ctx.closePath();
        ctx.fill();
    }
    // Snow caps west
    ctx.fillStyle = snowColor;
    for (let y = -200; y <= W + 200; y += 90) {
        let peakH = 160 + Math.sin(y * 0.005) * 80;
        ctx.beginPath();
        ctx.moveTo(-peakH, y);
        ctx.lineTo(-peakH + 30, y - 16);
        ctx.lineTo(-peakH + 30, y + 16);
        ctx.closePath();
        ctx.fill();
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    const z = state.cam.zoom;
    ctx.translate(canvas.width/2, canvas.height/2);
    ctx.scale(z, z);
    ctx.translate(-state.cam.x, -state.cam.y);

    // Ground
    ctx.fillStyle = '#567d46'; // Grass
    ctx.fillRect(0, 0, 6000, 6000);

    // ======== MOUNTAINS AROUND CITY ========
    drawMountains(ctx);

    // Beach (South)
    let waveOffset = Math.sin(Date.now() / 1000) * 20;
    ctx.fillStyle = '#f2d2a9'; // Sand
    ctx.fillRect(0, 5500, 6000, 500);
    ctx.fillStyle = '#1e90ff'; // Water
    ctx.fillRect(0, 5700 + waveOffset, 6000, 300);

    // River (West End)
    ctx.fillStyle = '#1565c0';
    ctx.fillRect(0, 0, 400, 6000);
    // River water detail
    ctx.fillStyle = '#1e88e5';
    ctx.fillRect(40, 0, 320, 6000);
    // River Waves
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for(let i=0; i<15; i++) {
        let x = 60 + Math.sin(Date.now()/600 + i*0.7)*25;
        ctx.fillRect(x, 0, 6, 6000);
    }
    // Riverbank edges
    ctx.fillStyle = '#8d6e63';
    ctx.fillRect(0, 0, 15, 6000);
    ctx.fillRect(385, 0, 15, 6000);

    // ======== BRIDGE OVER RIVER ========
    // Bridge at road y=1500 crossing the river
    ctx.fillStyle = '#555';
    ctx.fillRect(0, 1500 - ROAD_WIDTH/2 - 20, 430, ROAD_WIDTH + 40);
    // Bridge road surface
    ctx.fillStyle = '#444';
    ctx.fillRect(0, 1500 - ROAD_WIDTH/2, 430, ROAD_WIDTH);
    // Bridge rails
    ctx.fillStyle = '#888';
    ctx.fillRect(0, 1500 - ROAD_WIDTH/2 - 20, 430, 8);
    ctx.fillRect(0, 1500 + ROAD_WIDTH/2 + 12, 430, 8);
    // Bridge pillars
    ctx.fillStyle = '#666';
    for (let bp = 80; bp < 400; bp += 100) {
        ctx.fillRect(bp - 8, 1500 - ROAD_WIDTH/2 - 20, 16, ROAD_WIDTH + 40);
    }
    // Bridge lane dashes
    ctx.strokeStyle = '#f1c40f';
    ctx.lineWidth = 3;
    ctx.setLineDash([20, 18]);
    ctx.beginPath();
    ctx.moveTo(0, 1500);
    ctx.lineTo(430, 1500);
    ctx.stroke();
    ctx.setLineDash([]);

    // Second bridge at road y=3000
    ctx.fillStyle = '#555';
    ctx.fillRect(0, 3000 - ROAD_WIDTH/2 - 20, 430, ROAD_WIDTH + 40);
    ctx.fillStyle = '#444';
    ctx.fillRect(0, 3000 - ROAD_WIDTH/2, 430, ROAD_WIDTH);
    ctx.fillStyle = '#888';
    ctx.fillRect(0, 3000 - ROAD_WIDTH/2 - 20, 430, 8);
    ctx.fillRect(0, 3000 + ROAD_WIDTH/2 + 12, 430, 8);
    ctx.fillStyle = '#666';
    for (let bp = 80; bp < 400; bp += 100) {
        ctx.fillRect(bp - 8, 3000 - ROAD_WIDTH/2 - 20, 16, ROAD_WIDTH + 40);
    }


    // Footpaths
    ctx.fillStyle = '#b0bec5'; // Concrete grey
    const FP_W = ROAD_WIDTH + 40;
    roads.forEach(r => {
        if (r.type === 'h') ctx.fillRect(r.x1, r.y1 - FP_W/2, r.x2 - r.x1, FP_W);
        else ctx.fillRect(r.x1 - FP_W/2, r.y1, FP_W, r.y2 - r.y1);
    });

    // Roads
    ctx.fillStyle = '#333';
    roads.forEach(r => {
        if (r.type === 'h') ctx.fillRect(r.x1, r.y1 - ROAD_WIDTH/2, r.x2 - r.x1, ROAD_WIDTH);
        else ctx.fillRect(r.x1 - ROAD_WIDTH/2, r.y1, ROAD_WIDTH, r.y2 - r.y1);
    });

    // Markings
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.setLineDash([30, 30]);
    roads.forEach(r => {
        ctx.beginPath();
        if (r.type === 'h') { ctx.moveTo(r.x1, r.y1); ctx.lineTo(r.x2, r.y1); }
        else { ctx.moveTo(r.x1, r.y1); ctx.lineTo(r.x1, r.y2); }
        ctx.stroke();
    });
    ctx.setLineDash([]);

    // 3D BUILDINGS RENDER
    state.entities.forEach(e => {
        if (e.type === 'building') {
            const h = e.height;
            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(e.x - e.w/2 + 20, e.y - e.h/2 + 20, e.w, e.h);
            // Walls (3D look via offset rects)
            ctx.fillStyle = e.color;
            ctx.fillRect(e.x - e.w/2, e.y - e.h/2, e.w, e.h);
            // Roof (Offset)
            ctx.fillStyle = '#555';
            ctx.fillRect(e.x - e.w/2 - h/5, e.y - e.h/2 - h/5, e.w, e.h);
            // Highlight
            ctx.strokeStyle = '#777';
            ctx.strokeRect(e.x - e.w/2 - h/5, e.y - e.h/2 - h/5, e.w, e.h);
        }
    });

    // Environment: Trees (Pine & Palm)
    for (let i = 0; i < 200; i++) {
        let tx = (i * 7919) % 6000;
        let ty = (i * 3571) % 5500;
        // Don't draw on roads
        let onRoad = false;
        roads.forEach(r => {
            if (r.type === 'h' && Math.abs(ty - r.y1) < ROAD_WIDTH) onRoad = true;
            if (r.type === 'v' && Math.abs(tx - r.x1) < ROAD_WIDTH) onRoad = true;
        });
        if (!onRoad) drawTree(tx, ty, i % 2 === 0 ? 'pine' : 'palm');
    }

    // Traffic Lights
    intersections.forEach(tl => {
        ctx.fillStyle = tl.state === 0 ? '#00ff00' : '#ff0000';
        ctx.beginPath(); ctx.arc(tl.x - ROAD_WIDTH/2, tl.y - ROAD_WIDTH/2, 10, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = tl.state === 1 ? '#00ff00' : '#ff0000';
        ctx.beginPath(); ctx.arc(tl.x + ROAD_WIDTH/2, tl.y + ROAD_WIDTH/2, 10, 0, Math.PI*2); ctx.fill();
    });

    // Entities
    state.entities.forEach(e => {
        if (e.type === 'c4') {
            // C4 Box
            ctx.fillStyle = '#555';
            ctx.fillRect(e.x - 8, e.y - 6, 16, 12);
            ctx.fillStyle = '#333';
            ctx.fillRect(e.x - 6, e.y - 4, 12, 8);
            // Blinking Red LED
            if (Math.floor(Date.now() / 300) % 2 === 0) {
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.arc(e.x, e.y, 2, 0, Math.PI*2); ctx.fill();
            }
        }
    });

    // Optimized: only render vehicles visible near camera
    const camX = state.cam.x, camY = state.cam.y;
    const viewRange = 1200 / state.cam.zoom;
    state.vehicles.forEach(v => {
        if (Math.abs(v.x - camX) < viewRange && Math.abs(v.y - camY) < viewRange) {
            v.draw(ctx);
        }
    });

    // Draw Pedestrians
    state.people.forEach(person => {
        if (Math.abs(person.x - camX) < viewRange && Math.abs(person.y - camY) < viewRange) {
            ctx.save();
            ctx.translate(person.x, person.y);
            let angle = person.isV ? (person.dir === 1 ? Math.PI/2 : -Math.PI/2) : (person.dir === 1 ? 0 : Math.PI);
            ctx.rotate(angle);
            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.beginPath(); ctx.ellipse(-1, 3, 6, 8, 0, 0, Math.PI*2); ctx.fill();
            // Body
            ctx.fillStyle = person.col;
            ctx.fillRect(-4, -6, 8, 12);
            // Arms matching walk cycle
            let bob = Math.sin(person.timer) * 4;
            ctx.fillRect(bob-2, -8, 4, 4);
            ctx.fillRect(-bob-2, 4, 4, 4);
            // Head
            ctx.fillStyle = '#e0c097';
            ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI*2); ctx.fill();
            ctx.restore();
        }
    });

    state.zombies.forEach(z => z.draw(ctx));
    state.projectiles.forEach(pj => pj.draw(ctx));
    state.particles.forEach(p => p.draw(ctx));
    
    // Explosions - multi-layer
    state.explosions.forEach(ex => {
        let progress = 1 - (ex.life / ex.maxLife);
        let r = ex.radius * (0.3 + progress * 0.7);
        // Outer shockwave
        ctx.strokeStyle = `rgba(255, 200, 50, ${ex.life})`;
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(ex.x, ex.y, r * 1.3, 0, Math.PI*2); ctx.stroke();
        // Fire core
        ctx.fillStyle = `rgba(255, 100, 0, ${ex.life * 1.5})`;
        ctx.shadowBlur = 60; ctx.shadowColor = 'orange';
        ctx.beginPath(); ctx.arc(ex.x, ex.y, r, 0, Math.PI*2); ctx.fill();
        // Bright center
        ctx.fillStyle = `rgba(255, 255, 200, ${ex.life * 2})`;
        ctx.beginPath(); ctx.arc(ex.x, ex.y, r * 0.4, 0, Math.PI*2); ctx.fill();
        ctx.shadowBlur = 0;
    });
    
    // ======== PLAYER (Military Soldier Hero) ========
    if (!state.player.isRiding) {
        ctx.save();
        ctx.translate(state.player.x, state.player.y);
        ctx.rotate(state.player.angle);
        
        // Reload bar
        if (state.player.isReloading) {
            ctx.fillStyle = '#444'; ctx.fillRect(-20, -40, 40, 5);
            ctx.fillStyle = '#f1c40f'; ctx.fillRect(-20, -40, 40 * state.player.reloadProgress, 5);
        }

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(0, 6, 16, 8, 0, 0, Math.PI*2); ctx.fill();

        // Legs / Boots (dark camo pants + black boots)
        ctx.fillStyle = '#2e3d1f';
        ctx.fillRect(-6, 8, 5, 14);
        ctx.fillRect(1, 8, 5, 14);
        ctx.fillStyle = '#111';
        ctx.fillRect(-6, 18, 5, 4);
        ctx.fillRect(1, 18, 5, 4);

        // Torso (Camo military vest)
        ctx.fillStyle = '#4a5e3a';
        ctx.beginPath(); ctx.roundRect(-10, -12, 20, 22, 3); ctx.fill();
        // Vest detail
        ctx.fillStyle = '#3b4d2e';
        ctx.fillRect(-8, -8, 16, 4);
        ctx.fillRect(-8, 0, 16, 4);
        // Ammo belt
        ctx.fillStyle = '#5d4e37';
        ctx.fillRect(-10, -2, 20, 3);

        // Arms (Skin + Sleeves)
        ctx.fillStyle = '#4a5e3a';
        ctx.fillRect(-14, -8, 5, 14);
        ctx.fillRect(9, -8, 5, 14);
        ctx.fillStyle = '#d4a574';
        ctx.fillRect(-14, 4, 5, 5);
        ctx.fillRect(9, 4, 5, 5);

        // Head (skin)
        ctx.fillStyle = '#d4a574';
        ctx.beginPath(); ctx.arc(0, -16, 11, 0, Math.PI*2); ctx.fill();

        // Military Helmet (dark green)
        ctx.fillStyle = '#3a4a28';
        ctx.beginPath(); ctx.arc(0, -18, 12, Math.PI, 0); ctx.fill();
        ctx.fillRect(-12, -18, 24, 4);
        // Helmet strap
        ctx.fillStyle = '#2a3a1a';
        ctx.fillRect(-10, -13, 3, 6);
        ctx.fillRect(7, -13, 3, 6);

        // Face paint (soldier style)
        ctx.fillStyle = '#3d5a3a';
        ctx.fillRect(-5, -17, 10, 2);

        // GUN in hand
        ctx.save();
        ctx.translate(12, 2);
        ctx.fillStyle = '#222';
        if (state.player.weapon === 1) {
            // AK-47
            ctx.fillRect(0, -2, 34, 5);
            ctx.fillRect(6, 3, 6, 10);
            ctx.fillStyle = '#6d4c41';
            ctx.fillRect(-3, -1, 12, 3);
            ctx.fillRect(28, -3, 6, 3);
        } else {
            // Pistol
            ctx.fillRect(0, -2, 14, 4);
            ctx.fillRect(2, 2, 4, 7);
        }
        ctx.restore();

        // Muzzle Flash
        if (state.player.muzzleFlash > 0 && state.player.weapon <= 1) {
            ctx.save();
            ctx.translate(state.player.weapon === 1 ? 42 : 24, 2);
            ctx.fillStyle = 'rgba(255,220,50,0.9)';
            ctx.shadowBlur = 25; ctx.shadowColor = 'yellow';
            ctx.beginPath();
            ctx.moveTo(0, 0); ctx.lineTo(15, -8); ctx.lineTo(25, 0); ctx.lineTo(15, 8);
            ctx.fill();
            ctx.restore();
        }

        ctx.restore();
    } else {
        // Riding — draw soldier on top of vehicle
        ctx.save();
        ctx.translate(state.player.x, state.player.y);
        ctx.rotate(state.player.angle);
        // Soldier upper body on vehicle
        ctx.fillStyle = '#4a5e3a';
        ctx.beginPath(); ctx.roundRect(-7, -10, 14, 16, 2); ctx.fill();
        ctx.fillStyle = '#d4a574';
        ctx.beginPath(); ctx.arc(0, -14, 8, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#3a4a28';
        ctx.beginPath(); ctx.arc(0, -16, 9, Math.PI, 0); ctx.fill();
        ctx.fillRect(-9, -16, 18, 3);
        ctx.restore();
    }

    // ======== TRAFFIC POLICE (Detailed) ========
    state.police.forEach(cop => {
        ctx.save();
        ctx.translate(cop.x, cop.y);
        ctx.rotate(cop.facing || 0);

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.ellipse(0, 6, 10, 5, 0, 0, Math.PI*2); ctx.fill();

        // Legs
        ctx.fillStyle = '#1a237e';
        ctx.fillRect(-4, 5, 3, 10);
        ctx.fillRect(1, 5, 3, 10);
        // Shoes
        ctx.fillStyle = '#000';
        ctx.fillRect(-5, 13, 4, 3);
        ctx.fillRect(1, 13, 4, 3);

        // Body (Police uniform - navy blue)
        ctx.fillStyle = '#1a237e';
        ctx.beginPath(); ctx.roundRect(-8, -10, 16, 18, 2); ctx.fill();
        // Badge
        ctx.fillStyle = '#ffd700';
        ctx.beginPath(); ctx.arc(-3, -4, 2, 0, Math.PI*2); ctx.fill();
        // Belt
        ctx.fillStyle = '#333';
        ctx.fillRect(-8, 2, 16, 2);

        // Arms
        ctx.fillStyle = '#1a237e';
        ctx.fillRect(-12, -6, 5, 12);
        ctx.fillRect(7, -6, 5, 12);
        // Whistle hand
        ctx.fillStyle = '#d4a574';
        ctx.fillRect(7, 4, 5, 4);
        // Baton
        ctx.fillStyle = '#333';
        ctx.fillRect(9, -2, 3, 14);

        // Head
        ctx.fillStyle = '#d4a574';
        ctx.beginPath(); ctx.arc(0, -14, 8, 0, Math.PI*2); ctx.fill();

        // Police cap
        ctx.fillStyle = '#0d1a5c';
        ctx.beginPath(); ctx.arc(0, -16, 9, Math.PI, 0); ctx.fill();
        ctx.fillRect(-10, -16, 20, 3);
        // Cap brim
        ctx.fillStyle = '#000';
        ctx.fillRect(-8, -14, 16, 2);
        // Cap badge
        ctx.fillStyle = '#ffd700';
        ctx.beginPath(); ctx.arc(0, -18, 2.5, 0, Math.PI*2); ctx.fill();

        ctx.restore();
    });

    ctx.restore();
}

function drawTree(x, y, type) {
    if (type === 'pine') {
        ctx.fillStyle = '#3a5f0b';
        ctx.beginPath();
        ctx.moveTo(x, y - 40);
        ctx.lineTo(x - 20, y);
        ctx.lineTo(x + 20, y);
        ctx.closePath();
        ctx.fill();
    } else {
        ctx.fillStyle = '#8b4513';
        ctx.fillRect(x - 2, y - 20, 4, 20);
        ctx.fillStyle = '#228b22';
        for (let i = 0; i < 5; i++) {
            ctx.save();
            ctx.translate(x, y - 20);
            ctx.rotate(i * (Math.PI*2/5));
            ctx.fillRect(0, -2, 25, 4);
            ctx.restore();
        }
    }
}

function renderMinimap() {
    const mw = 190, mh = 190;
    const s = mw / 6000;
    mmCtx.clearRect(0, 0, mw, mh);

    // Background grass
    mmCtx.fillStyle = '#3a5e28';
    mmCtx.fillRect(0, 0, mw, mh);

    // River (West)
    mmCtx.fillStyle = '#1565c0';
    mmCtx.fillRect(0, 0, 400 * s, mh);

    // Beach (South)
    mmCtx.fillStyle = '#f2d2a9';
    mmCtx.fillRect(0, 5500 * s, mw, 500 * s);
    mmCtx.fillStyle = '#1e90ff';
    mmCtx.fillRect(0, 5700 * s, mw, 300 * s);

    // Roads
    mmCtx.fillStyle = '#555';
    roads.forEach(r => {
        if (r.type === 'h') mmCtx.fillRect(0, (r.y1 - ROAD_WIDTH/2) * s, mw, ROAD_WIDTH * s);
        else mmCtx.fillRect((r.x1 - ROAD_WIDTH/2) * s, 0, ROAD_WIDTH * s, mh);
    });

    // Buildings
    mmCtx.fillStyle = 'rgba(100,100,120,0.7)';
    state.entities.forEach(e => {
        if (e.type === 'building') {
            mmCtx.fillRect((e.x - e.w/2) * s, (e.y - e.h/2) * s, e.w * s, e.h * s);
        }
    });

    // Vehicles (yellow dots)
    mmCtx.fillStyle = '#f1c40f';
    state.vehicles.forEach(v => {
        mmCtx.fillRect(v.x * s - 1, v.y * s - 1, 2, 2);
    });

    // ENEMIES (RED DOTS) — clearly visible
    mmCtx.fillStyle = '#ff0000';
    state.zombies.forEach(z => {
        if (z.health <= 0) return;
        mmCtx.beginPath();
        mmCtx.arc(z.x * s, z.y * s, 2.5, 0, Math.PI * 2);
        mmCtx.fill();
    });

    // C4 placed (orange blink)
    if (Math.floor(Date.now() / 400) % 2 === 0) {
        mmCtx.fillStyle = '#ff6600';
        state.entities.forEach(e => {
            if (e.type === 'c4') {
                mmCtx.fillRect(e.x * s - 2, e.y * s - 2, 4, 4);
            }
        });
    }

    // Player (White arrow)
    const px = state.player.x * s;
    const py = state.player.y * s;
    mmCtx.save();
    mmCtx.translate(px, py);
    mmCtx.rotate(state.player.angle);
    mmCtx.fillStyle = '#fff';
    mmCtx.beginPath();
    mmCtx.moveTo(6, 0);
    mmCtx.lineTo(-4, -4);
    mmCtx.lineTo(-4, 4);
    mmCtx.closePath();
    mmCtx.fill();
    // Glow ring
    mmCtx.strokeStyle = 'rgba(255,255,255,0.6)';
    mmCtx.lineWidth = 1;
    mmCtx.beginPath(); mmCtx.arc(0, 0, 6, 0, Math.PI*2); mmCtx.stroke();
    mmCtx.restore();

    // Direction Labels
    mmCtx.fillStyle = 'rgba(255,255,255,0.6)';
    mmCtx.font = 'bold 8px Roboto, sans-serif';
    mmCtx.textAlign = 'center';
    mmCtx.fillText('N', mw/2, 10);
    mmCtx.fillText('S', mw/2, mh - 4);
    mmCtx.fillText('W', 8, mh/2 + 3);
    mmCtx.fillText('E', mw - 8, mh/2 + 3);

    // Camera viewport rectangle
    mmCtx.strokeStyle = 'rgba(255,255,255,0.4)';
    mmCtx.lineWidth = 1;
    const vw = (canvas.width / state.cam.zoom) * s;
    const vh = (canvas.height / state.cam.zoom) * s;
    mmCtx.strokeRect(state.cam.x * s - vw/2, state.cam.y * s - vh/2, vw, vh);

    // Border
    mmCtx.strokeStyle = 'rgba(255,255,255,0.25)';
    mmCtx.lineWidth = 1.5;
    mmCtx.strokeRect(0, 0, mw, mh);
}

function loop(ts) {
    let dt = Math.min((ts - (loop._last || ts)) / 1000, 0.05);
    loop._last = ts;
    update(dt || 1/60);
    draw();
    renderMinimap();
    requestAnimationFrame(loop);
}

document.addEventListener('DOMContentLoaded', init);
window.restartGame = () => location.reload();
window.detonateC4 = detonateC4;
window.selectWeapon = selectWeapon;
window.reload = reload;
window.fireBtnDown = () => { state.mouse.down = true; if(state.player.weapon > 1) fire(); };
window.fireBtnUp = () => state.mouse.down = false;
window.tryInteract = tryInteract;

window.startGame = () => {
    const intro = document.getElementById('intro-screen');
    intro.style.opacity = '0';
    intro.style.visibility = 'hidden';
    setTimeout(() => {
        intro.style.display = 'none';
        document.getElementById('ui-layer').style.display = 'block';
        state.active = true;
        // Lock pointer on desktop for better aiming
        if (window.innerWidth > 800) {
            canvas.requestPointerLock = canvas.requestPointerLock || canvas.mozRequestPointerLock;
            if (canvas.requestPointerLock) canvas.requestPointerLock();
        }
    }, 800);
};
