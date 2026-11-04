import {existsSync} from 'node:fs'

export function browserLaunch(options={}){
 const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||
  (existsSync('/usr/bin/google-chrome')?'/usr/bin/google-chrome':undefined)
 return {headless:true,...(executablePath?{executablePath}:{}),...options}
}
