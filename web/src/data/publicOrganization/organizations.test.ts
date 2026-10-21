import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, expect, it, vi } from 'vitest'
import { loadPublicOrganization, loadPublicOrganizationDirectory } from './organizations'
import { refreshPublicReport, invalidatePublicOrganizationData, readPublicReport } from './cache'

beforeEach(() => {
 vi.unstubAllGlobals(); vi.restoreAllMocks()
 vi.stubGlobal('indexedDB',new IDBFactory())
 vi.stubGlobal('location',{origin:'https://lifetech.fyi'})
})
it('shares directory pages with the network view, peers and recipient pickers, without truncating the directory',async()=>{
 const first=Array.from({length:500},(_,n)=>({id:`org-${n}`,name:`Organization ${n}`,slug:`org-${n}`}))
 const last=[{id:'last',name:'Last organization',slug:'last'}]
 const fetcher=vi.fn(async(url:string)=>Response.json(url.endsWith('offset=0')?first:last))
 vi.stubGlobal('fetch',fetcher)
 await refreshPublicReport('/api/org/api/network/orgs/public?limit=500&offset=0',{validate:v=>v})
 const [directory,peers]=await Promise.all([loadPublicOrganizationDirectory(),loadPublicOrganizationDirectory()])
 expect(directory).toHaveLength(501);expect(peers).toEqual(directory)
 expect(fetcher).toHaveBeenCalledTimes(2)
 directory[0].name='Renderer mutation'
 expect((await loadPublicOrganizationDirectory())[0].name).toBe('Organization 0')
 expect(fetcher).toHaveBeenCalledTimes(2)
 expect((await indexedDB.databases()).map(db=>db.name)).toEqual(['orgportal-public-organization-data-v1'])
})
it('shares profiles across a complete page reload and never caches credentials or membership responses',async()=>{
 const fetcher=vi.fn(async(_url: string, _options: RequestInit)=>Response.json({id:'rpm',name:'RPM Tech',slug:'rpm-tech'}))
 vi.stubGlobal('fetch',fetcher)
 await loadPublicOrganization('rpm-tech')
 vi.resetModules()
 const reloaded=await import('./organizations')
 expect(await reloaded.loadPublicOrganization('rpm-tech')).toEqual({id:'rpm',name:'RPM Tech',slug:'rpm-tech'})
 expect(fetcher).toHaveBeenCalledTimes(1)
 expect(fetcher.mock.calls[0][1]).toMatchObject({credentials:'omit'})
 expect(fetcher.mock.calls[0][1].headers.has('Authorization')).toBe(false)
 const {publicReportUrl}=await import('./cache')
 expect(()=>publicReportUrl('/api/org/api/network/orgs/rpm/membership')).toThrow()
 expect(()=>publicReportUrl('/api/org/api/network/orgs/public/rpm-tech?token=secret')).toThrow()
})
it('rejects malformed directory and profile records before persisting them',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json([{id:'broken'}])))
 await expect(loadPublicOrganizationDirectory()).rejects.toThrow('incomplete')
 await expect(loadPublicOrganization('broken')).rejects.toThrow('incomplete')
})

it('invalidates saved public data after edits without losing the last offline copy',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(Response.json({id:'rpm',name:'Before edit',slug:'rpm-tech'})).mockResolvedValueOnce(Response.json({id:'rpm',name:'After edit',slug:'rpm-tech'}))
 vi.stubGlobal('fetch',fetcher)
 await loadPublicOrganization('rpm-tech')
 await invalidatePublicOrganizationData()
 const saved=await readPublicReport<{name:string}>('/api/org/api/network/orgs/public/rpm-tech')
 expect(saved?.checkedAt).toBe(0)
 expect(saved?.data.name).toBe('Before edit')
 expect((await loadPublicOrganization('rpm-tech')).name).toBe('After edit')
 expect(fetcher).toHaveBeenCalledTimes(2)
})
