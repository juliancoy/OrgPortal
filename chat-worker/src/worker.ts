import { WorkerEntrypoint } from 'cloudflare:workers';
import app from './index';
import { ensureOrganizationRoom } from './organizationRooms';
export { ConversationDurableObject } from './index';

// RPC is available only through an explicit Worker service binding.
export class OrganizationRooms extends WorkerEntrypoint<Env> {
  async ensure(organizationId: string) {
    return ensureOrganizationRoom(this.env, organizationId);
  }
}

export default app;
