import {organizationImageSchema,prepareOrganizationBrandImage,type BrandImageEnvironment} from './organizationBrandImage';
import { normalizeOrganizationLinks, readOrganizationLinks, organizationLinkTypes } from '../../shared/organizationLinks';
import { z } from 'zod';
import { authorizeOrganization } from './organizationIam';
import { EventIntegrationError } from './eventPlatforms';
import { enforceEventRateLimit, prepareEventOperation, previewFingerprint, claimEventOperation, finishEventOperation, eventOperationStatus } from './eventOperationStore';

const target = z.object({ organizationId: z.string().trim().min(1).max(200).describe('Organization internal ID or public slug, such as palava-hut.') }).strict();
const publicImage = z.string().max(1000).url().refine(value => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password;
}, 'Image must be an HTTPS URL without credentials');
export const organizationProfileTargetSchema = target;
export const organizationProfileStatusSchema = target.extend({ previewId: z.string().uuid() });
export const organizationProfileUpdateSchema = target.extend({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().max(5000).nullable().optional(),
  image_url: publicImage.nullable().optional(),
  image_upload: organizationImageSchema.optional(),
  links: z.array(z.object({id:z.string().min(1).max(80),type:z.enum(organizationLinkTypes),url:z.string().max(2048),label:z.string().max(80).optional()}).strict()).max(30).optional().superRefine((value,ctx) => { if(value===undefined)return;try{normalizeOrganizationLinks(value)}catch(error){ctx.addIssue({code:'custom',message:error instanceof Error ? error.message : 'Invalid organization links'})} }),
  city: z.string().trim().min(1).max(80).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(40).optional(),
  previewId: z.string().uuid().optional(), confirm: z.boolean().optional(),
}).strict();
const columns = ['name', 'description', 'image_url', 'links_json', 'city', 'tags', 'updated_at', 'media_json'] as const;
type ProfileRow = { id: string; slug: string; name: string; description: string | null; image_url: string | null; links_json: string; city: string | null; tags: string; updated_at: string;media_json:string };
function profile(row: ProfileRow) { const {links_json,media_json:_media,...fields}=row; return {...fields,links:readOrganizationLinks(links_json),tags:JSON.parse(row.tags || '[]') as string[]}; }

export async function resolveOrganizationProfileId(db:D1Database,reference:string){
  const row=await db.prepare('SELECT id FROM organizations WHERE id=? OR slug=? ORDER BY CASE WHEN id=? THEN 0 ELSE 1 END LIMIT 1')
    .bind(reference,reference,reference).first<{id:string}>();
  if(!row)throw new EventIntegrationError(404,'Organization not found');
  return row.id;
}

export async function runOrganizationProfileOperation(db: D1Database, identity: { userId: string; scopes: string[]; isOperator?: boolean },
  operation: 'get' | 'update' | 'status', input: unknown, images?:BrandImageEnvironment) {
  if (!identity.scopes.includes('org:portal.read') || (operation === 'update' && !identity.scopes.includes('org:portal.write')))
    throw new EventIntegrationError(403, 'Missing portal scope');
  const parsed = operation === 'update' ? organizationProfileUpdateSchema.parse(input)
    : operation === 'status' ? organizationProfileStatusSchema.parse(input) : target.parse(input);
  const actor = { id: identity.userId, name: identity.userId, email: null, isOperator: identity.isOperator === true };
  await enforceEventRateLimit(db, actor.id);
  const args={...parsed,organizationId:await resolveOrganizationProfileId(db,parsed.organizationId)};
  await authorizeOrganization(db, actor, operation === 'get' ? 'read_members' : 'manage', args.organizationId);
  if (operation === 'status') return eventOperationStatus(db, actor.id, args.organizationId, (args as z.infer<typeof organizationProfileStatusSchema>).previewId);
  const before = await db.prepare(`SELECT id, slug, name, description, image_url, links_json, city, tags, updated_at, media_json FROM organizations WHERE id = ?`)
    .bind(args.organizationId).first<ProfileRow>();
  if (!before) throw new EventIntegrationError(404, 'Organization not found');
  if (operation === 'get') return { organization: profile(before) };
  const { organizationId, previewId, confirm, image_upload, ...changes } = args as z.infer<typeof organizationProfileUpdateSchema>;
  if (!Object.keys(changes).length&&!image_upload) throw new EventIntegrationError(400, 'Supply at least one profile field');
  if(image_upload&&changes.image_url!==undefined)throw new EventIntegrationError(400,'Choose either an image upload or an image URL');
  if(image_upload&&!images)throw new EventIntegrationError(503,'Organization image uploads are unavailable');
  const image=images?await prepareOrganizationBrandImage(images,before,changes.image_url,image_upload,previewId):null;
  if(image)changes.image_url=image.imageUrl;
  const after = { ...before, ...changes,media_json:image?.mediaJson||before.media_json, links_json: changes.links === undefined ? before.links_json : JSON.stringify(normalizeOrganizationLinks(changes.links)), tags: changes.tags === undefined ? before.tags : JSON.stringify(changes.tags) };
  const preview = { organizationId, operation: 'profile', before: profile(before), after: profile(after), changes,...(image?{image:image.summary}: {}) };
  const owner = { userId: actor.id, organizationId, eventId: 'organization:profile' };
  const fingerprint = await previewFingerprint(preview);
  if (!confirm) return { ...preview, ...await prepareEventOperation(db, owner, fingerprint) };
  if (!previewId) throw new EventIntegrationError(409, 'Request a preview first and supply its previewId');
  await claimEventOperation(db, owner, previewId, fingerprint);
  try {
    if(image)await image.publish();
    // Check profile state AND live management membership in the same atomic write.
    const result = await db.prepare(`UPDATE organizations SET name=?, description=?, image_url=?, links_json=?, city=?, tags=?, updated_at=?, media_json=?
      WHERE id=? AND ${columns.map(column => `${column} IS ?`).join(' AND ')}
      AND (? = 1 OR EXISTS (SELECT 1 FROM organization_memberships WHERE organization_id=? AND user_id=? AND status='active' AND role IN ('owner','administrator')))
      RETURNING id, slug, name, description, image_url, links_json, city, tags, updated_at, media_json`)
      .bind(after.name, after.description, after.image_url, after.links_json, after.city, after.tags, new Date().toISOString(), after.media_json, organizationId,
        ...columns.map(column => before[column]), actor.isOperator ? 1 : 0, organizationId, actor.id).first<ProfileRow>();
    if (!result) throw new EventIntegrationError(409, 'Profile or management permission changed; request a new preview');
    await finishEventOperation(db, previewId, true, ['profile']);
    return { organization: profile(result), previewId };
  } catch (error) {
    if(image?.ownsObject&&images?.SCAN_IMAGES){
      const referenced=await db.prepare("SELECT 1 FROM organizations WHERE id=? AND EXISTS(SELECT 1 FROM json_each(media_json) WHERE json_extract(value,'$.image_key')=?)").bind(organizationId,image.key).first();
      if(!referenced)await images.SCAN_IMAGES.delete(image.key).catch(()=>{});
    }
    await finishEventOperation(db, previewId, false, []);
    throw error;
  }
}
