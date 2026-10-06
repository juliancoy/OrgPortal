export function identityProfile<T extends {id: string | undefined}>(profile: T) {
  return {...profile, canonical_user_id: profile.id, account_id: profile.id, account_subject: `owner:${profile.id}`};
}
