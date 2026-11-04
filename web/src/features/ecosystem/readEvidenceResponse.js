// Gateways can return empty error responses; never expose a JSON parser crash.
export async function readEvidenceResponse(response,label='Evidence'){
 const text=await response.text()
 let value
 try{value=JSON.parse(text)}catch{
  throw Error(`${label} request failed (HTTP ${response.status}): ${text.trim()?'the server returned an invalid response':'the server returned an empty response'}. Please retry.`)
 }
 if(!response.ok)throw Error(typeof value?.error==='string'?value.error:`${label} request failed (HTTP ${response.status}). Please retry.`)
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error(`${label} returned an invalid response. Please retry.`)
 return value
}
