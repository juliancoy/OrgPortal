"""Descriptive local container names; storage namespaces remain independent."""
ROLES = {
    'portal': 'community-web-build', 'portal-dev': 'community-web',
    'org': 'community-api', 'chat': 'chat-api',
    'pidp': 'identity-api-build', 'pidp-dev': 'identity-api', 'pidpdb': 'identity-db',
    'local-gateway': 'nginx-gateway', 'org-replication': 'data-replication',
}


def service_name(prefix: str, role: str) -> str:
    tenant = prefix.rstrip('-') or 'local'
    if tenant == 'bmoremedtech':
        tenant = 'lifetech'
    return f'{tenant}-{ROLES.get(role, role)}'


RENAMES = {
    **{prefix + old: service_name(prefix, old) for prefix in ('bmoremedtech-', 'deism-') for old in ROLES},
    'bmoremedtech-site': 'medtech-website',
    'bmoremedtech-lifetech-test': 'lifetech-website-preview',
    'bmoremedtech-selenium': 'local-browser-automation',
    'codecollective-site': 'codecollective-website',
    'deism-site': 'deism-website',
    'orgportal-service-directory': 'local-service-directory',
}
