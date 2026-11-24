export type NodeSearchRecord={id:string;name:string;type?:string}
export type NodeSearchGroup=NodeSearchRecord&{members:NodeSearchRecord[]}
export function nodeSearchNameKey(name:string):string
export function groupNodeSearchResults(nodes:NodeSearchRecord[]):NodeSearchGroup[]
export function nodeSearchSource(node:NodeSearchRecord):string
