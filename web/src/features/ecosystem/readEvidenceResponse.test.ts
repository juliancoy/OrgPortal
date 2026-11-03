import {it,expect} from 'vitest'
import {readEvidenceResponse} from './readEvidenceResponse.js'
it('reports empty gateway errors and truncated JSON without exposing parser exceptions',async()=>{
 await expect(readEvidenceResponse(new Response(null,{status:404}),'Network')).rejects.toThrow('Network request failed (HTTP 404): the server returned an empty response')
 await expect(readEvidenceResponse(new Response('{"organizations":'))).rejects.toThrow('the server returned an invalid response')
 await expect(readEvidenceResponse(new Response('null'))).rejects.toThrow('invalid response')
})
it('preserves API errors and valid evidence objects',async()=>{
 await expect(readEvidenceResponse(Response.json({error:'Snapshot changed'},{status:409}))).rejects.toThrow('Snapshot changed')
 await expect(readEvidenceResponse(Response.json({records:[],version:'fixture'}))).resolves.toEqual({records:[],version:'fixture'})
})
