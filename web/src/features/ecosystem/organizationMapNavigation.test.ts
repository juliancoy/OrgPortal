import {expect,it} from 'vitest'
import {largestOrganizationParent,organizationNodePath} from './organizationMapNavigation'
import type {MapNode,MapPage} from './organizationMap'
const node=(id:string,financialAmount?:number|null,slug:string|null=null):MapNode=>({id,name:id,financialAmount,slug,category:'general'})
const fixture=(organizations:MapNode[],pairs:string[][]):MapPage=>({version:'fixture',generatedAt:'2026-11-22',anchor:'selected',organizations,relationships:pairs.map(([source,target],i)=>({id:String(i),source,target,recordCount:1,kinds:['transfer']})),total:organizations.length-1,incoming:0,outgoing:0,offset:0,nextOffset:null})
it('opens the largest incoming parent, ignoring outgoing neighbors, self-links and missing endpoints',()=>{
 const data=fixture([node('selected',1e12),node('small',1e6),node('large',1e9,'large-parent'),node('child',1e15)],[['small','selected'],['large','selected'],['large','selected'],['selected','large'],['selected','child'],['selected','selected'],['missing','selected']])
 expect(largestOrganizationParent(data)?.id).toBe('large')
 expect(organizationNodePath(largestOrganizationParent(data)!)).toBe('/orgs/large-parent')
 expect(organizationNodePath(node('source:label'))).toBe('/ecosystem/organizations/source%3Alabel')
})
it('handles equal and undisclosed volumes deterministically and prefers known zero to unknown',()=>{
 const data=fixture([node('selected'),node('b',10),node('a',10),node('unknown',null),node('invalid',Infinity)],[['b','selected'],['a','selected'],['unknown','selected'],['invalid','selected']])
 expect(largestOrganizationParent(data)?.id).toBe('a')
 expect(largestOrganizationParent({...data,organizations:[...data.organizations].reverse(),relationships:[...data.relationships].reverse()})?.id).toBe('a')
 const unknown=fixture([node('selected'),node('b'),node('a',NaN),node('zero',0)],[['a','selected'],['b','selected'],['zero','selected']])
 expect(largestOrganizationParent(unknown)?.id).toBe('zero')
 expect(largestOrganizationParent({...unknown,organizations:unknown.organizations.filter(n=>n.id!=='zero')})?.id).toBe('a')
})
it('stays put when there is no incoming parent',()=>{
 expect(largestOrganizationParent(fixture([node('selected'),node('child',1e9)],[['selected','child'],['selected','selected']]))).toBeNull()
 expect(largestOrganizationParent({...fixture([],[]),anchor:null})).toBeNull()
})
it('uses an off-year parent when none is visible, without replacing visible parents or following itself',()=>{
 const data={...fixture([node('selected')],[]),hiddenParent:node('hidden',1e12,'hidden-parent')}
 expect(largestOrganizationParent(data)?.id).toBe('hidden')
 expect(organizationNodePath(largestOrganizationParent(data)!)).toBe('/orgs/hidden-parent')
 expect(largestOrganizationParent({...data,hiddenParent:node('selected',1e12)})).toBeNull()
 const visible={...fixture([node('selected'),node('visible',10)],[['visible','selected']]),hiddenParent:data.hiddenParent}
 expect(largestOrganizationParent(visible)?.id).toBe('visible')
})
