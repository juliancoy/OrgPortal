type OrganizationActivity = {
  feedback_count?: unknown;
  upcoming_events_count?: unknown;
  membership_count?: unknown;
};

function counts(row: OrganizationActivity) {
  return [row.feedback_count,row.upcoming_events_count,row.membership_count].map(value => {
    const count = Number(value);
    return Number.isFinite(count) ? Math.max(0,count) : 0;
  });
}

// Public feedback, upcoming events and active members break relevance ties.
// Equal total activity falls back to engagement, events, then members.
export function compareOrganizationActivity(a: OrganizationActivity, b: OrganizationActivity) {
  const left = counts(a), right = counts(b);
  return right.reduce((total,count)=>total+count,0) - left.reduce((total,count)=>total+count,0)
    || right[0]-left[0] || right[1]-left[1] || right[2]-left[2];
}
