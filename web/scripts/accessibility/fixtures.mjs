// Synthetic browser fixtures. Every API request is intercepted; no account,
// profile, registration, message, or timebank mutation reaches a server.
export const user = {
  id: 'a11y-member', email: 'member@example.test', full_name: 'Accessibility Tester',
  identity_data: { display_name: 'Accessibility Tester', birth_date: '1990-04-15' },
};
const contact = {
  user_id: user.id, user_name: user.full_name, slug: 'accessibility-tester', enabled: true,
  headline: 'Accessibility testing', bio: 'Synthetic profile', photo_url: '',
  email_public: user.email, phone_public: '', website_url: '', linkedin_url: '',
  github_url: '', x_url: '', links: [], public_url: '/users/accessibility-tester',
};
const community = {
  id: 'code-collective', hostname: 'codecollective.us', name: 'Code Collective',
  tagline: 'Community timebank', accent_color: '#18745b',
};
const conversation = {
  id: 'a11y-dm', kind: 'dm', title: null, unread_count: 0,
  updated_at: '2026-09-09T12:00:00Z', last_message_at: '2026-09-09T12:00:00Z',
  members: [
    { user_id: user.id, user_name: user.full_name, role: 'member', state: 'active' },
    { user_id: 'a11y-peer', user_name: 'Test Neighbor', role: 'member', state: 'active' },
  ],
};
const message = {
  id: 'a11y-message', conversation_id: conversation.id, sender_user_id: 'a11y-peer',
  sender_name: 'Test Neighbor', client_message_id: 'a11y-seed', body: 'Existing test message',
  message_type: 'text', created_at: '2026-09-09T12:00:00Z', sequence: 1,
};

export async function installFixtures(context, { member = false } = {}) {
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const isApi = path.startsWith('/api/') || path.startsWith('/pidp/') || path.startsWith('/auth/');
    if (!isApi) {
      if (url.hostname !== '127.0.0.1') return route.abort();
      return ['GET', 'HEAD'].includes(request.method()) ? route.continue() : route.abort();
    }
    if (path.endsWith('/auth/register')) return json({ detail: 'Account already exists' }, 409);
    if (path.endsWith('/auth/session-token')) return member ? json({ access_token: 'header.payload.signature' }) : json({}, 401);
    if (path.endsWith('/auth/me')) return member ? json(user) : json({}, 401);
    if (path.endsWith('/api/timebank/community')) return json(community);
    if (path.endsWith('/admin/me')) return json({ is_sysadmin: false });
    if (path.endsWith('/auth/google-calendar')) return json({ connected: false, google_email: null, calendar_id: null, sync_busy: false });
    if (path.endsWith('/auth/microsoft-calendar')) return json({ connected: false, microsoft_email: null, calendar_id: null, sync_busy: false });
    if (path.endsWith('/api/network/contact/me')) return json(contact);
    if (path.endsWith('/api/timebank/notifications')) return json({ items: [], unread_count: 0, next_cursor: null });
    if (path.endsWith('/api/timebank')) return json({
      account: { user_id: user.id, balance_minutes: 0, earned_minutes: 0, spent_minutes: 0 },
      listings: [], exchanges: [], community, can_manage_community: false,
    });
    if (path.includes('/api/network/chat/')) {
      if (path.endsWith('/conversations')) return json({ conversations: [conversation] });
      if (path.endsWith('/messages')) {
        if (request.method() === 'POST') return json({ detail: 'Message service unavailable' }, 503);
        return json({ latest_sequence: 1, messages: [message] });
      }
      if (path.endsWith('/sync')) return json({ conversation_id: conversation.id, latest_sequence: 1, messages: [], receipts: [] });
      if (path.endsWith('/read')) return json({ ok: true });
      if (path.endsWith('/presence')) return json({ users: [] });
      return json({}, 404);
    }
    if (path.includes('/api/network/orgs') || path.includes('/api/network/users') || path.includes('/api/network/events')) return json([]);
    return json({}, 404);
  });
}
