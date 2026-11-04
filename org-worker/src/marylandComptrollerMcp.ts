import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import {EventIntegrationError} from './eventPlatforms';
import {comptrollerImportSchema,importMarylandComptroller,marylandComptrollerStatus} from './marylandComptroller';
import type {OrganizationActor} from './organizationIam';
type Identity={userId:string;scopes:string[];isOperator:boolean};
const target=z.object({organizationId:z.string().min(1).max(200),previewId:z.string().uuid().optional()}).strict();
export function registerMarylandComptrollerTools(server:McpServer,db:D1Database,identity:Identity,tenantOrganizationId?:string){
 for(const operation of ['preview','apply','status'] as const){
  const writing=operation!=='status';
  const name=operation==='status'?'get_maryland_comptroller_import_status':`${operation}_maryland_comptroller_import`;
  server.registerTool(name,{
   description:operation==='status'?'Read imported Comptroller source counts/checksums or inspect a one-use operation receipt. Requires operator access.':`${operation==='preview'?'Preview':'Apply'} reviewed public Comptroller observations in the reusable financial source table. Requires operator access; apply requires confirm=true and the exact one-use previewId. No account balances change.`,
   inputSchema:writing?comptrollerImportSchema:target,
   annotations:{readOnlyHint:operation!=='apply',destructiveHint:false,openWorldHint:false},
   _meta:{securitySchemes:[{type:'oauth2',scopes:writing?['org:portal.read','org:portal.write']:['org:portal.read']}]},
  },async args=>{
   try{
    if(!identity.scopes.includes('org:portal.read')||(writing&&!identity.scopes.includes('org:portal.write')))
     throw new EventIntegrationError(403,'Missing portal scope');
    if(tenantOrganizationId&&args.organizationId!==tenantOrganizationId)
     throw new EventIntegrationError(403,'This MCP connection is limited to its own organization');
    if(operation==='apply'&&(!('confirm' in args)||args.confirm!==true))throw new EventIntegrationError(409,'Apply requires confirm=true and the reviewed previewId');
    const actor:OrganizationActor={id:identity.userId,name:identity.userId,email:null,isOperator:identity.isOperator};
    const data=operation==='status'?await marylandComptrollerStatus(db,actor,args.organizationId,args.previewId):
     await importMarylandComptroller(db,actor,{...args,confirm:operation==='apply'});
    return {content:[{type:'text' as const,text:JSON.stringify(data)}],structuredContent:data};
   }catch(error){
    const known=error instanceof EventIntegrationError;
    const data={error:{status:known?error.status:503,message:known?error.message:'Comptroller operation unavailable; inspect the saved receipt before retrying'}};
    return {isError:true,content:[{type:'text' as const,text:JSON.stringify(data)}],structuredContent:data};
   }
  });
 }
}
