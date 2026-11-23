import {expect,it} from 'vitest'
import {organizationMapLayout,type MapPage} from './organizationMap'
const fixture=():MapPage=>{
 const ids=['root'],pairs:string[][]=[]
 for(let b=0;b<4;b++){const hub='hub'+b;ids.push(hub);pairs.push(['root',hub]);for(let i=0;i<7;i++){ids.push(hub+'leaf'+i);pairs.push([hub,hub+'leaf'+i])}}
 return {anchor:'root',version:'test',generatedAt:'2026-11-23',parentDepth:3,childDepth:3,organizations:ids.map(id=>({id,name:id,slug:null,category:'general',financialAmount:1e6})),relationships:pairs.map(([source,target],i)=>({id:String(i),source,target,kinds:['transfer'],recordCount:1})),total:ids.length-1,incoming:0,outgoing:ids.length-1,offset:0,nextOffset:null}
}
for(const mode of ['2d','3d'] as const)it(`${mode} separates secondary hubs and places children closer to their own hub`,()=>{
 const data=fixture(),layout=organizationMapLayout(data,mode,{layout:'hubs'}),byId=new Map(layout.map(n=>[n.id,n]))
 const distance=(a:string,b:string)=>{const x=byId.get(a)!,y=byId.get(b)!;return Math.hypot(x.x-y.x,x.y-y.y,x.z-y.z)}
 expect(layout[0]).toMatchObject({id:'root',x:0,y:0,z:0})
 expect(layout.slice(1,5).every(n=>n.id.startsWith('hub')&&!n.id.includes('leaf'))).toBe(true)
 for(let b=0;b<4;b++)for(let i=0;i<7;i++)for(let other=0;other<4;other++)if(other!==b)expect(distance('hub'+b+'leaf'+i,'hub'+b)).toBeLessThan(distance('hub'+b+'leaf'+i,'hub'+other)*.7)
 for(let i=0;i<layout.length;i++)for(let j=i+1;j<layout.length;j++)expect(distance(layout[i].id,layout[j].id)).toBeGreaterThan(layout[i].renderRadius+layout[j].renderRadius)
 expect(layout.every(n=>[n.x,n.y,n.z].every(Number.isFinite))).toBe(true)
 if(mode==='2d')expect(layout.every(n=>n.z===0)).toBe(true)
 else expect(layout.some(n=>Math.abs(n.z)>50)).toBe(true)
 expect(organizationMapLayout({...data,organizations:[...data.organizations].reverse(),relationships:[...data.relationships].reverse()},mode,{layout:'hubs'})).toEqual(layout)
 const spread=organizationMapLayout(data,mode,{layout:'hubs',hubSpacing:1.5}),compact=organizationMapLayout(data,mode,{layout:'hubs',hubSpacing:.8})
 const extent=(nodes:typeof layout)=>Math.max(...nodes.map(n=>Math.hypot(n.x,n.y,n.z)))
 expect(extent(spread)).toBeGreaterThan(extent(compact)*1.3)
 expect(data.organizations.every(n=>!('x' in n))).toBe(true)
})
it('retains shared children, reciprocal edges, cycles and disconnected nodes without changing evidence',()=>{
 const data=fixture();data.organizations.push({id:'isolated',name:'isolated',slug:null,category:'general',financialAmount:0})
 for(const [source,target] of [['hub1','hub0leaf0'],['hub0leaf0','hub0'],['hub2','root'],['hub0leaf1','hub0leaf1']])data.relationships.push({id:source+target,source,target,kinds:['transfer'],recordCount:3})
 const before=JSON.stringify(data),nodes=organizationMapLayout(data,'3d',{layout:'hubs'})
 expect(new Set(nodes.map(n=>n.id)).size).toBe(data.organizations.length);expect(nodes.every(n=>[n.x,n.y,n.z].every(Number.isFinite))).toBe(true);expect(JSON.stringify(data)).toBe(before)
 expect(nodes.find(n=>n.id==='hub2')?.direction).toBe('both')
 expect(organizationMapLayout({...data,organizations:[],relationships:[],anchor:null},'3d',{layout:'hubs'})).toEqual([])
})
