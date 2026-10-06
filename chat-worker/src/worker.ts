import { WorkerEntrypoint } from 'cloudflare:workers';
import app from './index';
import { ensureOrganizationRoom, ensureEventRoom } from './organizationRooms';
export { ConversationDurableObject } from './index';

// RPC is available only through an explicit Worker service binding.
export class OrganizationRooms extends WorkerEntrypoint<Env> {
  async ensureEvent(eventId: string) {
    return ensureEventRoom(this.env, eventId);
  }

  async ensure(organizationId: string) {
    return ensureOrganizationRoom(this.env, organizationId);
  }
}

export default app;
