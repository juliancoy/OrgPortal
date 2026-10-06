// Give local workerd the same trusted public CAs as the Node Docker runtime.
// NODE_EXTRA_CA_CERTS is supported by Miniflare; TLS verification stays enabled.
const { writeFileSync } = require('node:fs');
const { rootCertificates } = require('node:tls');
writeFileSync('/tmp/orgportal-ca.pem', rootCertificates.join('\n'), {mode:0o644});
