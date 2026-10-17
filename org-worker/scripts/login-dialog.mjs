import { spawn } from 'node:child_process';

function run(command, args, signal, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { signal, stdio: ['pipe', 'pipe', 'ignore'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, output: output.trim() }));
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

export async function loginDialog(url, signal, execute = run) {
  if (process.platform !== 'linux') throw Error('The login dialog requires a Linux desktop. Use --browser instead.');
  try {
    while (!signal.aborted) {
      const choice = await execute('zenity', ['--list', '--title=Connect OrgPortal',
        '--text=Sign in with your chosen account in your preferred browser. Keep the CLI running until access is approved.',
        '--column=Action', 'Open in browser', 'Copy sign-in link', 'Wait for sign-in',
        '--height=300', '--width=550'], signal);
      if (choice.code !== 0) throw Error('Sign-in cancelled.');
      if (choice.output === 'Wait for sign-in') return;
      if (choice.output === 'Open in browser') {
        const opened = await execute('xdg-open', [url], signal);
        if (opened.code !== 0) throw Error('Could not open the browser. Use the printed sign-in link.');
      } else if (choice.output === 'Copy sign-in link') {
        const copied = await execute(process.env.WAYLAND_DISPLAY ? 'wl-copy' : 'xclip',
          process.env.WAYLAND_DISPLAY ? [] : ['-selection', 'clipboard'], signal, url);
        if (copied.code !== 0) throw Error('Could not copy the link. Use the printed sign-in link.');
      }
    }
  } catch (error) {
    if (!signal.aborted) throw error;
  }
}
