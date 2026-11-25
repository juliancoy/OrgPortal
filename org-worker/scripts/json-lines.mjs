import {createReadStream} from 'node:fs';
// JSON Lines is delimited by LF. readline also splits U+2028/U+2029 in
// recent Node versions, although these are legal characters inside JSON strings.
export async function* readJsonLines(path){
 let pending='';
 for await(const chunk of createReadStream(path,{encoding:'utf8'})){
  pending+=chunk;let start=0,end;
  while((end=pending.indexOf('\n',start))!==-1){const line=pending.slice(start,end);if(line.trim())yield JSON.parse(line);start=end+1;}
  pending=pending.slice(start);
 }
 if(pending.trim())yield JSON.parse(pending);
}
