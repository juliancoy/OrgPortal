// Consume Node's structured test events, never raw stdout or failure payloads.
export default async function* reporter(events) {
 for await (const event of events) {
  if (!['test:pass', 'test:fail'].includes(event.type) || event.data.details?.type === 'suite') continue;
  yield JSON.stringify({ file: event.data.file, name: event.data.name, status: event.data.skip || event.data.todo ? 'not_run' : event.type === 'test:pass' ? 'passed' : 'failed', durationMs: event.data.details?.duration_ms }) + '\n';
 }
}
