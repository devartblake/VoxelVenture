A server-bound day/night cycle requires making the server authoritative over world time so all connected players experience sunsets, streetlamp activations, and neon glows simultaneously.

The architecture relies on an authoritative server clock with deterministic client interpolation:

```
┌──────────────────────────────────────────────────────────────┐
│                    FASTAPI SERVER (AUTHORITATIVE)            │
│  - Fixed Cycle Duration (e.g., 24 min real = 24 hrs in-game) │
│  - Broadcasts timestamp & cycle parameters over WebSocket    │
└──────────────────────────────┬───────────────────────────────┘
                               │ WebSocket push (or HTTP sync)
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                 REACT THREE FIBER (THREE.JS CLIENT)          │
│  - Computes sun/moon orbital vectors from normalized t ∈ [0,1]│
│  - Lerps ambient / directional light color & intensity       │
│  - Toggles building emissive textures & neon signs at dusk   │
└──────────────────────────────────────────────────────────────┘

```

---

### 1. Server Implementation (FastAPI WebSocket Clock)

The server avoids streaming 60 updates a second. Instead, it tracks the epoch reference and period length. Clients can calculate the exact current time locally, while the server periodically broadcasts heartbeats to maintain synchronization.

```python
# server/time_service.py
import time
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from typing import Set

app = FastAPI()

# 1 real-world second = 1 game minute -> 1,440 seconds (24 real minutes) = full in-game day
CYCLE_DURATION_SECONDS = 1440  

class WorldTimeServer:
    def __init__(self, cycle_duration: float):
        self.cycle_duration = cycle_duration
        self.active_sockets: Set[WebSocket] = set()
        # Fixed epoch start so every server restart/replica syncs identically
        self.epoch_start = 0.0

    def get_normalized_time(self) -> float:
        """Returns time of day as a float between 0.000 and 1.000 (0=Midnight, 0.5=Noon)"""
        now = time.time()
        elapsed = now - self.epoch_start
        return (elapsed % self.cycle_duration) / self.cycle_duration

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active_sockets.add(ws)
        # Send initial sync payload on connection
        await ws.send_json({
            "type": "TIME_SYNC",
            "cycleDuration": self.cycle_duration,
            "normalizedTime": self.get_normalized_time(),
            "serverTimestamp": time.time()
        })

    def disconnect(self, ws: WebSocket):
        self.active_sockets.discard(ws)

    async def broadcast_loop(self):
        """Broadcasts authoritative sync tick every 10 seconds to correct client drift"""
        while True:
            await asyncio.sleep(10)
            if self.active_sockets:
                payload = {
                    "type": "TIME_SYNC",
                    "cycleDuration": self.cycle_duration,
                    "normalizedTime": self.get_normalized_time(),
                    "serverTimestamp": time.time()
                }
                dead_sockets = set()
                for ws in self.active_sockets:
                    try:
                        await ws.send_json(payload)
                    except Exception:
                        dead_sockets.add(ws)
                self.active_sockets -= dead_sockets

time_server = WorldTimeServer(CYCLE_DURATION_SECONDS)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(time_server.broadcast_loop())

@app.websocket("/ws/world-time")
async def time_ws_endpoint(websocket: WebSocket):
    await time_server.connect(websocket)
    try:
        while True:
            # Keep socket open and receive any ping/pong
            await websocket.receive_text()
    except WebSocketDisconnect:
        time_server.disconnect(websocket)

```

---

### 2. Client-Side Time Hook (`useServerTime.js`)

This hook connects to the FastAPI WebSocket, corrects clock drift, and ticks locally every frame using standard delta accumulation.

```javascript
// lib/useServerTime.js
import { useEffect, useRef, useState } from 'react';

export function useServerTime(wsUrl = "ws://localhost:8000/ws/world-time") {
  const [timeOfDay, setTimeOfDay] = useState(0.25); // Default to morning (0.25)
  const timeRef = useRef(0.25);
  const cycleDurationRef = useRef(1440);

  useEffect(() => {
    let ws;
    try {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'TIME_SYNC') {
          cycleDurationRef.current = data.cycleDuration;
          timeRef.current = data.normalizedTime;
          setTimeOfDay(data.normalizedTime);
        }
      };
    } catch (e) {
      console.warn("WebSocket unavailable, running standalone clock");
    }

    // Local interpolation loop running at 60 FPS
    let lastTick = performance.now();
    const interval = setInterval(() => {
      const now = performance.now();
      const deltaSec = (now - lastTick) / 1000;
      lastTick = now;

      // Advance normalized time
      timeRef.current = (timeRef.current + (deltaSec / cycleDurationRef.current)) % 1.0;
      setTimeOfDay(timeRef.current);
    }, 100);

    return () => {
      clearInterval(interval);
      if (ws) ws.close();
    };
  }, [wsUrl]);

  return timeOfDay;
}

```

---

### 3. R3F Dynamic Lighting & Atmosphere (`WorldEnvironment.jsx`)

This component mounts inside your `<Canvas>` to drive sun angle, directional light color lerping, ambient intensity, and streetlamp/neon emissive toggles.

```jsx
// components/city/WorldEnvironment.jsx
"use client";

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const sunWarm = new THREE.Color(0xfff1cf); // Midday sun
const sunsetGold = new THREE.Color(0xfd5e53); // Dawn / Dusk
const moonBlue = new THREE.Color(0x385587); // Night moonlight

const daySky = new THREE.Color(0x1e293b);
const nightSky = new THREE.Color(0x020617);

export default function WorldEnvironment({ timeOfDay }) {
  const sunLightRef = useRef();
  const ambientLightRef = useRef();

  useFrame(({ scene }) => {
    // timeOfDay: 0.0 = Midnight, 0.25 = 6 AM, 0.5 = Noon, 0.75 = 6 PM
    const theta = timeOfDay * Math.PI * 2;
    
    // Orbital path: Sun rises in -X, hits zenith at Y, sets in +X
    const sunX = Math.cos(theta) * 40;
    const sunY = Math.sin(theta) * 40;
    const isDay = sunY > 0;

    if (sunLightRef.current) {
      sunLightRef.current.position.set(sunX, Math.abs(sunY) + 5, 20);

      if (isDay) {
        // Sunrise / Sunset elevation blend
        const elevation = Math.max(0, sunY / 40);
        sunLightRef.current.color.copy(sunsetGold).lerp(sunWarm, elevation);
        sunLightRef.current.intensity = 0.4 + elevation * 1.6;
      } else {
        // Night / Moonlight
        sunLightRef.current.color.copy(moonBlue);
        sunLightRef.current.intensity = 0.3;
      }
    }

    if (ambientLightRef.current) {
      const dayFactor = Math.max(0, Math.sin(theta));
      ambientLightRef.current.intensity = 0.15 + dayFactor * 0.55;
    }

    // Blend scene background
    const skyFactor = Math.max(0, Math.sin(theta));
    scene.background = nightSky.clone().lerp(daySky, skyFactor);
  });

  return (
    <>
      <ambientLight ref={ambientLightRef} intensity={0.5} />
      <directionalLight
        ref={sunLightRef}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-25}
        shadow-camera-right={25}
        shadow-camera-top={25}
        shadow-camera-bottom={-25}
      />
    </>
  );
}

```

---

### 4. Hooking Buildings into Night Illumination

When `timeOfDay < 0.22` or `timeOfDay > 0.72` (nighttime), buildings automatically activate their warm interior window materials and neon signage using Three.js emissive materials:

```jsx
// Inside PlotMesh.jsx:
const isNight = timeOfDay < 0.22 || timeOfDay > 0.72;

<meshStandardMaterial
  color={plot.color}
  emissive={isNight ? new THREE.Color(plot.color) : new THREE.Color(0x000000)}
  emissiveIntensity={isNight ? 0.6 : 0.0}
  roughness={0.4}
/>

```

This guarantees that whenever a creator or visitor checks the city, everyone sees synchronized real-time dusk transitions, shadow elongations, and illuminated nightlife across the grid.

Neither—the day/night cycle proposed above is **not** tied to the user's local clock, nor is it tied to the physical timezone where the server host machine sits.

Instead, it is an **abstract, shared world clock** (like an in-game clock in *Minecraft*, *Animal Crossing*, or *World of Warcraft*).

### 1. How It Actually Works: Virtual World Clock

The server uses Unix epoch time (`time.time()`, which is pure UTC seconds elapsed since 1970 everywhere on Earth) solely as a shared mathematical ruler.

* It calculates: `(Current UTC Time) % (Cycle Duration)`
* If your cycle duration is set to **24 real minutes**, the in-game clock completes a full 24-hour day every 24 minutes.
* Whether a visitor is opening the site from **Tokyo, London, or New York**, and whether your server is hosted in **Frankfurt or California**, everyone receives the exact same normalized value (e.g., `0.75` for sunset).
* Every user across the globe sees the sun dip below the horizon and neon signs switch on at the exact same second.

---

### 2. Can You Tie It to Real-World Time Instead?

If your goal is for the virtual city to reflect actual real-world daylight rather than an accelerated in-game cycle, you have two choices:

#### Option A: Synced to a "Canonical City Timezone" (Recommended for a Unified World)

If your virtual avenue is themed around a specific destination (e.g., Tokyo or New York):

* The server maps the cycle to that city's local timezone (e.g., `America/New_York` or `Asia/Tokyo`).
* When it is 9:00 PM in New York, the virtual city enters night mode for **all** visitors worldwide.
* A visitor opening the page at 11:00 AM in Tokyo will see the city lit up in night mode with illuminated neon, creating the feeling of looking into a live, remote skyline across the world.

#### Option B: Client-Local Time (Individual Experience)

If you base it on the user's machine clock:

* The user in Tokyo sees morning sunlight (`11:00 AM`), while the user in New York simultaneously sees nighttime shadows (`10:00 PM`).
* **The Trade-off:** The experience ceases to be shared. If two people look at the same building or stream the site, they see completely different lighting, destroying the feeling of a synchronized, live multiplayer space.

---

### The Recommendation

Stick with **Canonical World Time** (either a fast 20–30 minute accelerated cycle or locked to a specific city's timezone like UTC/EST). This ensures every connected user shares the exact same atmospheric lighting, shadows, and nightlife transitions simultaneously.