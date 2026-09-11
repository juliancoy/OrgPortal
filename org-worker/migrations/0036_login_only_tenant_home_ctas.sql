UPDATE portal_tenants
SET home_primary_href = '/users/login'
WHERE home_primary_href = '/users/register';
