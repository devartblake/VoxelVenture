import { PLOT_TILE } from './cityGenerator';
import { buildGrid } from './spatialGrid';
import { sampleCurve, asphaltData, sidewalkData } from './curves';

// Heights of walkable surfaces, in city coordinates. Cache the spatial index per
// layout so animated characters do not scan the whole city or raycast buildings.
export const WATER_Y = 0.026;
const cache = new WeakMap();
const plotCache = new WeakMap();
const inside = (r, x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
function indexFor(layout) {
  if (cache.has(layout)) return cache.get(layout);
  const surfaces = [];
  const rect = (x0, x1, z0, z1, y) => surfaces.push({ x0, x1, z0, z1, height: () => y });
  const box = (x, z, w, d, y, yaw = 0) => {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const hx = (Math.abs(c) * w + Math.abs(s) * d) / 2;
    const hz = (Math.abs(s) * w + Math.abs(c) * d) / 2;
    surfaces.push({ x0: x-hx, x1: x+hx, z0: z-hz, z1: z+hz, height: (px,pz) => {
      const dx = px-x, dz = pz-z;
      return Math.abs(dx*c-dz*s) <= w/2 && Math.abs(dx*s+dz*c) <= d/2 ? y : 0;
    }});
  };
  for (const r of layout.lawns ?? []) rect(r.x0,r.x1,r.z0,r.z1,0.01);
  for (const r of layout.roads ?? []) {
    const alongX = r.axis === 'x';
    const section = (a,b,lo,hi,y) => alongX ? rect(a,b,r.center+lo,r.center+hi,y) : rect(r.center+lo,r.center+hi,a,b,y);
    section(r.from,r.to,-0.8,0.8,0.03);
    let start = r.from;
    for (const [a,b] of [...(r.gaps ?? []), [r.to,r.to]]) {
      const end = Math.min(a,r.to);
      if (end > start) { section(start,end,-1.4,-0.8,0.08); section(start,end,0.8,1.4,0.08); }
      start = Math.max(start,b);
    }
  }
  for (const j of layout.intersections ?? []) {
    if (j.circle) {
      const { ringOut, outer, ringIn } = j.circle;
      const legs = [...Object.entries({ west:[-1,0], east:[1,0], north:[0,-1], south:[0,1] }).filter(([k]) => j.arms?.[k]).map(([,v]) => v), ...(j.diag ?? []).map(l => l.dir)];
      surfaces.push({ x0:j.x-outer,x1:j.x+outer,z0:j.z-outer,z1:j.z+outer,height:(x,z) => {
        const dx=x-j.x,dz=z-j.z,r=Math.hypot(dx,dz);
        if (r <= ringIn) return 0.06;
        if (r <= ringOut) return 0.03;
        if (r > outer) return 0;
        // Gaps in the circular sidewalk are the mouths of incoming roads.
        return legs.some(([lx,lz]) => dx*lx+dz*lz > 0 && Math.abs(dx*lz-dz*lx) < 1.4) ? 0.03 : 0.08;
      }});
    } else {
      box(j.x,j.z,1.6,1.6,0.03);
      for (const sx of [-1,1]) for (const sz of [-1,1]) box(j.x+sx*1.1,j.z+sz*1.1,0.6,0.6,0.08);
      for (const [name,dx,dz,w,d] of [['west',-1.1,0,0.6,2.8],['east',1.1,0,0.6,2.8],['north',0,-1.1,2.8,0.6],['south',0,1.1,2.8,0.6]]) {
        if (j.arms && !j.arms[name]) box(j.x+dx,j.z+dz,w,d,0.08);
      }
    }
  }
  for (const r of layout.diagonals ?? []) {
    const yaw = Math.atan2(r.dir[0],r.dir[1]);
    const ends = (layout.intersections ?? []).filter(j => j.circle);
    const from = ends.find(j => Math.hypot(j.x-r.p0.x,j.z-r.p0.z) < 0.01)?.circle;
    const to = ends.find(j => Math.hypot(j.x-(r.p0.x+r.dir[0]*r.length),j.z-(r.p0.z+r.dir[1]*r.length)) < 0.01)?.circle;
    const strip = (a,b,side,width,y) => {
      if (b <= a) return;
      box(r.p0.x+r.dir[0]*(a+b)/2+Math.cos(yaw)*side,r.p0.z+r.dir[1]*(a+b)/2-Math.sin(yaw)*side,width,b-a,y,yaw);
    };
    strip((from?.ringOut ?? 0)-0.3,r.length-((to?.ringOut ?? 0)-0.3),0,1.6,0.03);
    for (const side of [-1.1,1.1]) strip((from?.outer ?? 0)-0.2,r.length-((to?.outer ?? 0)-0.2),side,0.6,0.08);
  }
  // Use the actual curved-road triangles, including their mitered corners.
  for (const spec of layout.curvedRoads ?? []) {
    const curve = sampleCurve(spec);
    for (const data of [asphaltData(curve), sidewalkData(curve,-1), sidewalkData(curve,1)]) {
      const { positions:p, indices:idx } = data;
      for (let i=0;i<idx.length;i+=3) {
        const a=idx[i]*3,b=idx[i+1]*3,c=idx[i+2]*3;
        const ax=p[a],az=p[a+2],bx=p[b],bz=p[b+2],cx=p[c],cz=p[c+2];
        const det=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);
        if (Math.abs(det)<1e-10) continue; // vertical kerbs
        const y=p[a+1];
        surfaces.push({ x0:Math.min(ax,bx,cx),x1:Math.max(ax,bx,cx),z0:Math.min(az,bz,cz),z1:Math.max(az,bz,cz),height:(x,z) => {
          const u=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/det;
          const v=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/det;
          return u>=-1e-8 && v>=-1e-8 && u+v<=1+1e-8 ? y : 0;
        }});
      }
    }
  }
  for (const a of layout.airports ?? []) {
    if (a.apron) rect(a.apron.x0,a.apron.x1,a.apron.z0,a.apron.z1,0.012);
    if (a.runway) rect(a.runway.x0,a.runway.x1,a.runway.z0,a.runway.z1,0.016);
  }
  for (const p of layout.piers ?? []) { rect(p.x0,p.x1,p.z0,p.z1,0.06); if (p.plaza) rect(p.plaza.x0,p.plaza.x1,p.plaza.z0,p.plaza.z1,0.018); }
  for (const w of layout.promenades ?? []) rect(w.rect.x0,w.rect.x1,w.rect.z0,w.rect.z1,0.02);
  for (const p of layout.parks ?? []) {
    box(p.center.x,p.center.z,p.width,p.depth,0.06);
    box(p.center.x,p.center.z,p.width,0.8,0.066);
    box(p.center.x,p.center.z,0.8,p.depth,0.066);
  }
  for (const m of layout.malls ?? []) {
    box(m.x,m.z,m.w-0.2,m.d-0.2,0.16,m.yaw ?? 0);
    box(m.x,m.z,3.2,m.d-1.2,0.18,m.yaw ?? 0);
  }
  const grid=buildGrid(surfaces,s=>s,8);
  cache.set(layout,grid);
  return grid;
}
function plotHeight(plots,x,z) {
  if (!plots?.length) return 0;
  let grid=plotCache.get(plots);
  if (!grid) {
    const entries=plots.map(p=>{
      const c=Math.cos(p.yaw ?? 0),s=Math.sin(p.yaw ?? 0),w=p.w ?? PLOT_TILE,d=p.d ?? PLOT_TILE;
      const hx=(Math.abs(c)*w+Math.abs(s)*d)/2,hz=(Math.abs(s)*w+Math.abs(c)*d)/2;
      return {x0:p.x-hx,x1:p.x+hx,z0:p.z-hz,z1:p.z+hz,p,c,s,w,d};
    });
    grid=buildGrid(entries,e=>e,8);
    plotCache.set(plots,grid);
  }
  let y=0;
  for (const i of grid.cells.get(Math.floor(x/grid.cell)+','+Math.floor(z/grid.cell)) ?? []) {
    const {p,c,s,w,d}=grid.items[i],dx=x-p.x,dz=z-p.z;
    const lx=Math.abs(dx*c-dz*s),lz=Math.abs(dx*s+dz*c);
    if (lx<=w/2 && lz<=d/2) {
      y=Math.max(y,!p.owner && lx<=w*0.4 && lz<=d*0.4 ? 0.175 : 0.1);
    }
  }
  return y;
}
export function surfaceHeight(layout,x,z,plots) {
  let y=0.004;
  if (layout.urban && inside(layout.urban,x,z)) y=0.007;
  const grid=indexFor(layout);
  for (const i of grid.cells.get(Math.floor(x/grid.cell)+','+Math.floor(z/grid.cell)) ?? []) {
    const s=grid.items[i];
    if (inside(s,x,z)) y=Math.max(y,s.height(x,z));
  }
  return Math.max(y,plotHeight(plots,x,z));
}
// The driven car remains level. Sample all four wheel contacts to avoid clipping
// a raised curb with a wheel while the car centre is still over the roadway.
export function carSurfaceHeight(layout,x,z,yaw=0,scale=2,plots) {
  let y=surfaceHeight(layout,x,z,plots);
  const c=Math.cos(yaw),s=Math.sin(yaw);
  for (const side of [-1,1]) for (const end of [-1,1]) {
    const dx=side*0.21*scale,dz=end*0.26*scale;
    y=Math.max(y,surfaceHeight(layout,x+dx*c+dz*s,z-dx*s+dz*c,plots));
  }
  return y;
}
