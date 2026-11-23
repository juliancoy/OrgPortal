import {expect,it} from 'vitest'
import {loadOrganizationMap,organizationMapLayout,organizationNodeRadius,type MapPage} from './organizationMap'
const node=(id:string)=>({id,name:id,slug:null,category:'general'})
const page=(offset=0):MapPage=>({version:'v1',generatedAt:'2026-11-21',anchor:'center',organizations:[node('center'),node(offset?'downstream':'upstream')],relationships:[offset?{id:'out',source:'center',target:'downstream',recordCount:20,kinds:['transfer']}:{id:'in',source:'upstream',target:'center',recordCount:2,kinds:['agency']}],total:2,incoming:1,outgoing:1,offset,nextOffset:offset?null:1})
for(const mixed of [false,true])it(`3D gravity survives dense ${mixed?'mixed-direction':'all-recipient'} neighborhoods and keeps spheres apart`,()=>{
 const organizations=[{...node('center'),financialAmount:2e10},...Array.from({length:90},(_,i)=>({...node('n'+String(i).padStart(3,'0')),financialAmount:i<6?1e10:1e5}))]
 const relationships=organizations.slice(1).map((n,i)=>({id:n.id,source:mixed&&i%2?n.id:'center',target:mixed&&i%2?'center':n.id,recordCount:1,kinds:['transfer']}))
 const data={...page(),organizations,relationships},spatial=organizationMapLayout(data,'3d'),planar=organizationMapLayout(data,'2d')
 const distance=(n:typeof spatial[number])=>Math.hypot(n.x,n.y,n.z)
 const large=spatial.slice(1,7),small=spatial.slice(7),mean=(nodes:typeof spatial)=>nodes.reduce((s,n)=>s+distance(n),0)/nodes.length
 expect(mean(large)).toBeLessThan(100)
 expect(mean(large)).toBeLessThan(mean(small)*.65)
 expect(mean(large)).toBeLessThan(mean(planar.slice(1,7))*.85)
 expect(spatial[0]).toMatchObject({x:0,y:0,z:0})
 expect(large.some(n=>Math.abs(n.z)>10)).toBe(true)
 for(let i=0;i<spatial.length;i++)for(let j=i+1;j<spatial.length;j++){
  const a=spatial[i],b=spatial[j]
  expect(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)).toBeGreaterThan(a.renderRadius+b.renderRadius)
 }
 expect(organizationMapLayout({...data,organizations:[...organizations].reverse(),relationships:[...relationships].reverse()},'3d')).toEqual(spatial)
})
for(const mode of ['2d','3d'] as const)it(`${mode} pulls larger financial volumes inward and allocates inner shells by money`,()=>{
 const organizations=[node('center'),{...node('z-largest'),financialAmount:1e10},{...node('a-small'),financialAmount:1e5},node('unknown'),{...node('invalid'),financialAmount:Infinity}]
 const data={...page(),organizations,relationships:[]}
 const layout=organizationMapLayout(data,mode),distance=(id:string)=>{const n=layout.find(n=>n.id===id)!;return Math.hypot(n.x,n.y,n.z)}
 expect(distance('z-largest')).toBeLessThan(distance('a-small'))
 expect(distance('a-small')).toBeLessThan(distance('unknown'))
 expect(distance('invalid')).toBe(distance('unknown'))
 expect(layout[0]).toMatchObject({x:0,y:0,z:0})
 const crowded=organizationMapLayout({...data,organizations:[...organizations,...Array.from({length:100},(_,i)=>({...node('b'+i),financialAmount:100}))]},mode)
 expect(crowded[1].id).toBe('z-largest')
 for(const n of crowded.slice(1))expect(Math.hypot(n.x,n.y,n.z)).toBeGreaterThan(n.renderRadius+crowded[0].renderRadius)
 expect(organizationMapLayout({...data,organizations:[...organizations].reverse()},mode)).toEqual(layout)
})
it('sizes nodes by money independently of focus, neighborhood, mode and color',()=>{
 const organizations=[{...node('cvs'),financialAmount:761764295.29},{...node('dbm'),financialAmount:15e9},{...node('equal'),financialAmount:761764295.29}]
 const data={...page(),anchor:'cvs',organizations,relationships:[]}
 for(const mode of ['2d','3d'] as const){
  const layout=organizationMapLayout(data,mode),radii=new Map(layout.map(n=>[n.id,n.renderRadius]))
  expect(radii.get('dbm')!).toBeGreaterThan(radii.get('cvs')!)
  expect(radii.get('equal')).toBe(radii.get('cvs'))
  const next=organizationMapLayout({...data,anchor:'dbm',organizations:[...organizations,{...node('huge'),financialAmount:1e15}]},mode)
  for(const node of next)if(radii.has(node.id))expect(node.renderRadius).toBe(radii.get(node.id))
 }
})
it('keeps missing, zero and invalid volumes finite, and preserves size ratios while zooming out',()=>{
 for(const value of [undefined,null,0,-1,NaN,Infinity])expect(organizationNodeRadius(value)).toBe(organizationNodeRadius(0))
 const amounts=[0,1,1e3,1e6,1e9,1e12,1e15,Number.MAX_VALUE]
 for(let i=1;i<amounts.length;i++)expect(organizationNodeRadius(amounts[i])).toBeGreaterThan(organizationNodeRadius(amounts[i-1]))
 for(const scale of [.001,.1,.5,1,10])expect(organizationNodeRadius(1e9,scale)/organizationNodeRadius(1e6,scale)).toBeCloseTo(organizationNodeRadius(1e9)/organizationNodeRadius(1e6),12)
})
it('loads every page once, pins the snapshot and preserves both directions',async()=>{
 const requests:{offset:number;version?:string}[]=[]
 const data=await loadOrganizationMap(async(offset,version)=>{requests.push({offset,version});return page(offset)})
 expect(requests).toEqual([{offset:0,version:undefined},{offset:1,version:'v1'}]);expect(data.organizations).toHaveLength(3);expect(data.relationships).toHaveLength(2)
 const layout=organizationMapLayout(data);expect(layout.find(n=>n.id==='center')).toMatchObject({x:0,y:0,direction:'focus'});expect(layout.find(n=>n.id==='upstream')?.direction).toBe('incoming');expect(layout.find(n=>n.id==='downstream')?.direction).toBe('outgoing')
})
it('refuses partial or mixed snapshots and repeating cursors',async()=>{
 await expect(loadOrganizationMap(async offset=>({...page(offset),version:offset?'v2':'v1'}))).rejects.toThrow(/snapshot/)
 await expect(loadOrganizationMap(async()=>({...page(),nextOffset:0}))).rejects.toThrow(/finish/)
 await expect(loadOrganizationMap(async()=>({...page(),nextOffset:null}))).rejects.toThrow(/missing/)
})
it('draws reciprocal neighbors once and keeps large neighborhoods complete',()=>{
 const data=page();data.organizations=[node('center'),...Array.from({length:700},(_,i)=>node('n'+i))];data.relationships=data.organizations.slice(1).map(n=>({id:n.id,source:'center',target:n.id,recordCount:1,kinds:['transfer']}));data.relationships.push({id:'back',source:'n0',target:'center',recordCount:1,kinds:['agency']})
 const layout=organizationMapLayout(data);expect(layout).toHaveLength(701);expect(new Set(layout.map(n=>n.id)).size).toBe(701);expect(layout.find(n=>n.id==='n0')?.direction).toBe('both');expect(layout.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y))).toBe(true)
})
it('supports an isolated organization and an absent source record',async()=>{
 const empty={...page(),organizations:[node('center')],relationships:[],total:0,incoming:0,outgoing:0,nextOffset:null}
 expect((await loadOrganizationMap(async()=>empty)).organizations).toHaveLength(1)
 expect((await loadOrganizationMap(async()=>({...empty,anchor:null,organizations:[]}))).organizations).toEqual([])
})

for(const mode of ['2d','3d'] as const)for(const direction of ['incoming','outgoing'] as const){
 it(`${mode} spreads an entirely ${direction} neighborhood around the anchor`,()=>{
  const data=page();data.organizations=[node('center'),...Array.from({length:80},(_,i)=>node('n'+i))]
  data.relationships=data.organizations.slice(1).map(n=>({id:n.id,source:direction==='outgoing'?'center':n.id,target:direction==='outgoing'?n.id:'center',recordCount:1,kinds:['agency']}))
  const layout=organizationMapLayout(data,mode),neighbors=layout.filter(n=>n.id!=='center')
  for(const axis of mode==='3d'?['x','y','z'] as const:['x','y'] as const){
   const positive=neighbors.filter(n=>n[axis]>0).length
   expect(positive).toBeGreaterThan(30);expect(positive).toBeLessThan(50)
   const meanDirection=neighbors.reduce((sum,n)=>sum+n[axis]/Math.hypot(n.x,n.y,n.z),0)/neighbors.length
   expect(Math.abs(meanDirection)).toBeLessThan(.04)
  }
  expect(neighbors.every(n=>n.direction===direction)).toBe(true)
  expect(new Set(neighbors.map(n=>[n.x,n.y,n.z].join(','))).size).toBe(80)
  expect(organizationMapLayout({...data,organizations:[...data.organizations].reverse(),relationships:[...data.relationships].reverse()},mode)).toEqual(layout)
 })
}
it('keeps small neighborhoods centered and coordinates finite in both modes',()=>{
 for(const mode of ['2d','3d'] as const)for(const count of [0,1,2,3,700]){
  const data={...page(),organizations:[node('center'),...Array.from({length:count},(_,i)=>node('n'+i))],relationships:[]}
  const layout=organizationMapLayout(data,mode)
  expect(layout).toHaveLength(count+1);expect(layout[0]).toMatchObject({x:0,y:0,z:0})
  expect(layout.every(n=>[n.x,n.y,n.z].every(Number.isFinite))).toBe(true)
  if(mode==='2d')expect(layout.every(n=>n.z===0)).toBe(true)
  if(count===2||count===3)for(const axis of ['x','y','z'] as const)expect(Math.abs(layout.reduce((sum,n)=>sum+n[axis],0))).toBeLessThan(1e-10)
 }
})

for(const mode of ['2d','3d'] as const)it(`${mode} attracts peers in each direction without moving the anchor or collapsing neighbors`,()=>{
 const data=page();data.organizations=[node('center'),...Array.from({length:80},(_,i)=>node('n'+String(i).padStart(3,'0')))]
 data.relationships=data.organizations.slice(1).map((n,i)=>({id:n.id,source:i%2?'center':n.id,target:i%2?n.id:'center',recordCount:1,kinds:['agency']}))
 data.relationships.push({id:'reciprocal',source:'center',target:'n000',recordCount:1,kinds:['agency']})
 const initial=organizationMapLayout(data,mode,{groupAttraction:0}),clustered=organizationMapLayout(data,mode)
 const spread=(layout:typeof initial,direction:'incoming'|'outgoing')=>{
  const group=layout.filter(n=>n.direction===direction);let total=0,count=0
  for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++){const a=group[i],b=group[j],ar=Math.hypot(a.x,a.y,a.z),br=Math.hypot(b.x,b.y,b.z);total+=Math.hypot(a.x/ar-b.x/br,a.y/ar-b.y/br,a.z/ar-b.z/br);count++}
  return total/count
 }
 for(const direction of ['incoming','outgoing'] as const)expect(spread(clustered,direction)).toBeLessThan(spread(initial,direction)*.8)
 expect(clustered[0]).toMatchObject({x:0,y:0,z:0});expect(clustered.find(n=>n.id==='n000')?.direction).toBe('both')
 clustered.forEach((n,i)=>expect(Math.abs(Math.hypot(n.x,n.y,n.z)-Math.hypot(initial[i].x,initial[i].y,initial[i].z))).toBeLessThan(100))
 const peers=clustered.slice(1)
 for(let i=0;i<peers.length;i++)for(let j=i+1;j<peers.length;j++)expect(Math.hypot(peers[i].x-peers[j].x,peers[i].y-peers[j].y,peers[i].z-peers[j].z)).toBeGreaterThan(14)
 expect(organizationMapLayout({...data,organizations:[...data.organizations].reverse(),relationships:[...data.relationships].reverse()},mode)).toEqual(clustered)
})

it('publishes one validated preview before later pages finish, without calling it complete',async()=>{
 const previews:MapPage[]=[]
 const result=await loadOrganizationMap(async offset=>{
  if(offset){expect(previews).toHaveLength(1);expect(previews[0].nextOffset).toBe(1);expect(previews[0].organizations).toHaveLength(2)}
  return page(offset)
 },()=>{},data=>previews.push(data))
 expect(result.nextOffset).toBeNull();expect(result.organizations).toHaveLength(3)
 expect(previews[0].organizations).toHaveLength(2)
})
it('never publishes an invalid preview or hides a subsequent page failure',async()=>{
 const previews:MapPage[]=[]
 await expect(loadOrganizationMap(async()=>({...page(),relationships:[{...page().relationships[0],target:'missing'}]}),()=>{},data=>previews.push(data))).rejects.toThrow(/Invalid direct/)
 expect(previews).toHaveLength(0)
 await expect(loadOrganizationMap(async offset=>{if(offset)throw Error('unavailable');return page()},()=>{},data=>previews.push(data))).rejects.toThrow('unavailable')
 expect(previews).toHaveLength(1);expect(previews[0].nextOffset).not.toBeNull()
})
