import assert from 'node:assert/strict';
import { imp } from './helpers.mjs';
const { surfaceHeight, carSurfaceHeight, WATER_Y } = await imp('city/surfaceHeight.js');
const { seatWorld } = await imp('content/boatModels.js');
const layout = {
 roads:[{axis:'x',center:0,from:-10,to:10,gaps:[[-1.4,1.4]]},{axis:'z',center:0,from:-10,to:10,gaps:[[-1.4,1.4]]}],
 intersections:[{x:0,z:0,arms:{west:true,east:true,north:true,south:true}}],
 piers:[{x0:20,x1:24,z0:0,z1:1}],
 parks:[{center:{x:30,z:0},width:6,depth:6}],
 malls:[{x:40,z:0,w:8,d:10,yaw:Math.PI/2}],
 curvedRoads:[{start:{x:0,z:20,heading:Math.PI/2},segments:[{line:10}]}]
};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6, a+' != '+b);
near(surfaceHeight(layout,5,0),0.03);
near(surfaceHeight(layout,5,1.1),0.08);
near(surfaceHeight(layout,0,0),0.03);
near(surfaceHeight(layout,0,1.1),0.03);
near(surfaceHeight(layout,1.1,1.1),0.08);
near(surfaceHeight(layout,22,0.5),0.06);
near(surfaceHeight(layout,31,1),0.06);
near(surfaceHeight(layout,31,0),0.066);
near(surfaceHeight(layout,40,0),0.18);
near(surfaceHeight(layout,40,2),0.16);
near(surfaceHeight(layout,5,20),0.03);
near(surfaceHeight(layout,5,21.1),0.08);
near(surfaceHeight(layout,100,100),0.004);
near(carSurfaceHeight(layout,5,0.6),0.08);
near(carSurfaceHeight(layout,5,0),0.03);
for (const yaw of [0,Math.PI/2,Math.PI]) {
 const seat=seatWorld({x:2,z:3,yaw,boatKind:'fishing'});
 near(Math.hypot(seat.x-2,seat.z-3),0.78);
 near(WATER_Y+seat.y,0.386);
}
const plots=[{x:60,z:0,w:4,d:6,yaw:Math.PI/2,owner:'Owner'}, {x:70,z:0,w:3,d:3}];
near(surfaceHeight(layout,60,0,plots),0.1);
near(surfaceHeight(layout,62.5,0,plots),0.1);
near(surfaceHeight(layout,60,2.5,plots),0.004);
near(surfaceHeight(layout,70,0,plots),0.175);
near(surfaceHeight(layout,71.4,0,plots),0.1);
console.log('surface height regression checks pass');
