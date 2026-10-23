import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const publisher = new URL('../../scripts/test-status.mjs', import.meta.url);
if (existsSync(publisher)) {
 await import(new URL('../../scripts/build-test-catalog.mjs', import.meta.url).href);
 const { publish } = await import(publisher.href);
 publish();
} else {
 // A web-only Docker build has no local run records. Ship the inventory in gray.
 const catalog = JSON.parse(readFileSync(new URL('../src/data/test-status-catalog.json', import.meta.url), 'utf8'));
 const report = { version: 1, title: catalog.title, generatedAt: new Date().toISOString(), groups: catalog.groups.map(group => ({ id: group.id, label: group.label, category: group.category, cases: group.cases.map(check => ({ ...check, status: 'not_run' })) })) };
 mkdirSync(new URL('../public/', import.meta.url), { recursive: true });
 writeFileSync(new URL('../public/test-status.json', import.meta.url), JSON.stringify(report));
}
